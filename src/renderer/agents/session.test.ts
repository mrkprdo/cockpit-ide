import { describe, it, expect, vi } from 'vitest';
import { AgentBus } from './bus';
import { ToolRegistry } from '../ai/tool-registry';
import { ALL_TOOLS } from '../ai/tool-definitions';
import { SubAgentSession } from './session';
import { BUILTIN_DEFINITIONS } from './definitions';
import { HookRunner } from './hooks';
import type { AgentBrief, AgentMessage, SubAgentDefinition } from './types';
import type { LLMMessage, LLMResponse } from '../ai/types';

interface FakeLLM {
  chatCompletion: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
}

function makeLLM(script: Array<{ content?: string; tool_calls?: any[] } | 'content-echo' | 'tool-loop'>): FakeLLM {
  let idx = 0;
  const chatCompletion = vi.fn(async (opts: { messages: LLMMessage[] }) => {
    const step = script[Math.min(idx, script.length - 1)];
    idx++;
    if (step === 'content-echo') {
      const lastUser = [...opts.messages].reverse().find(m => m.role === 'user');
      return { choices: [{ message: { role: 'assistant', content: `echo: ${lastUser?.content}` }, finish_reason: 'stop' }] } as LLMResponse;
    }
    if (step === 'tool-loop') {
      return { choices: [{ message: { role: 'assistant', content: 'looping', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'read_file', arguments: '{"path":"x"}' } }] }, finish_reason: 'tool_calls' }] } as LLMResponse;
    }
    const s = step as { content?: string; tool_calls?: any[] };
    return { choices: [{ message: { role: 'assistant', content: s.content ?? '', tool_calls: s.tool_calls }, finish_reason: s.tool_calls ? 'tool_calls' : 'stop' }] } as LLMResponse;
  });
  const complete = vi.fn(async () => 'compact summary');
  return { chatCompletion, complete };
}

function brief(overrides: Partial<AgentBrief> = {}): AgentBrief {
  return {
    skill: 'implementer',
    context: 'Implement foo in src/foo.ts',
    expectedResult: 'foo implemented',
    guardrails: [],
    ...overrides,
  };
}

function makeSession(definitionName: keyof typeof BUILTIN_DEFINITIONS | string, b: AgentBrief, llm: FakeLLM, bus: AgentBus, contextTokens?: number, defnOverride?: Partial<SubAgentDefinition>) {
  const defn: SubAgentDefinition = {
    ...BUILTIN_DEFINITIONS[definitionName as keyof typeof BUILTIN_DEFINITIONS],
    ...defnOverride,
    contextTokens: contextTokens ?? BUILTIN_DEFINITIONS[definitionName as keyof typeof BUILTIN_DEFINITIONS]?.contextTokens,
  };
  return new SubAgentSession(`agent:test`, defn, b, 'corr-test', {
    bus,
    registry: new ToolRegistry(ALL_TOOLS),
    llm: llm as any,
    ctx: () => null,
  });
}

describe('SubAgentSession', () => {
  it('completes a plain-text task and posts a respond with the correlationId', async () => {
    const bus = new AgentBus();
    bus.registerMailbox('main');
    const llm = makeLLM([{ content: 'done: foo implemented' }]);
    const s = makeSession('implementer', brief(), llm, bus);

    const result = await s.run();
    expect(result).toBe('done: foo implemented');
    expect(s.state).toBe('done');

    const mb = bus.getMailbox('main')!;
    const msgs = mb.drain();
    const respond = msgs.find(m => m.type === 'respond');
    expect(respond?.correlationId).toBe('corr-test');
    expect(respond?.payload).toBe('done: foo implemented');
    expect(respond?.to).toBe('main');
  });

  it('executes guarded tool calls and feeds results back into the loop', async () => {
    const bus = new AgentBus();
    const llm = makeLLM([
      { content: 'reading', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'read_file', arguments: '{"path":"/tmp/a.ts"}' } }] },
      { content: 'finished after tool' },
    ]);
    const s = makeSession('implementer', brief(), llm, bus);
    const result = await s.run();
    expect(result).toBe('finished after tool');
    expect(s.steps).toBe(2);
  });

  it('returns a Guardrail error for tools outside the skill allowlist', async () => {
    const bus = new AgentBus();
    bus.registerMailbox('main');
    const llm = makeLLM([
      { content: 'trying', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'write_file', arguments: '{"path":"/tmp/a.ts","content":"x"}' } }] },
      { content: 'recovered' },
    ]);
    const s = makeSession('reviewer', brief({ skill: 'reviewer' }), llm, bus);
    const result = await s.run();
    expect(result).toBe('recovered');
    // The guardrail denial was injected as a tool result.
    const toolMsg = s.transcriptSnapshot.find(m => m.role === 'tool');
    expect(toolMsg?.content).toContain('Guardrail');
  });

  it('stops at the step cap with a partial-result message', async () => {
    const bus = new AgentBus();
    const llm = makeLLM(['tool-loop']);
    const s = makeSession('implementer', brief(), llm, bus);
    const result = await s.run();
    expect(result).toContain('[step cap reached');
    expect(s.state).toBe('done');
  });

  it('compacts the transcript when the token budget is exceeded', async () => {
    const bus = new AgentBus();
    const llm = makeLLM(['tool-loop']); // keeps tool-calling → transcript grows
    const s = makeSession('implementer', brief(), llm, bus, 200); // tiny budget
    await s.run();
    expect(llm.complete).toHaveBeenCalled();
    expect(s.summary).toBeTruthy();
  });

  it('rollWindow retains folded tool outputs as real data (no dangling pointer)', async () => {
    const bus = new AgentBus();
    const llm = makeLLM(['tool-loop']); // 24 tool rounds → transcript rolls its window
    const s = makeSession('implementer', brief(), llm, bus);
    await s.run();
    const sys = s.transcriptSnapshot.find(m => m.role === 'system' && m.content?.includes('State so far'));
    expect(sys).toBeTruthy();
    // The folded tool outputs must survive as actual content, not a "see summary
    // below" pointer the model can only answer by inventing.
    expect(sys?.content).toContain('Retained results:');
    expect(sys?.content).toContain('ToolContext unavailable');
    expect(s.transcriptSnapshot.some(m => m.content?.includes('see summary below'))).toBe(false);
  });

  it('can be killed mid-run → state killed, throws', async () => {
    const bus = new AgentBus();
    bus.registerMailbox('main');
    const llm = makeLLM([
      { content: 'start', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'read_file', arguments: '{"path":"x"}' } }] },
      { content: 'never reached' },
    ]);
    const s = makeSession('implementer', brief(), llm, bus);
    // Second LLM call: abort the session and reject like a real AbortError.
    llm.chatCompletion.mockImplementationOnce(async (opts: { signal?: AbortSignal }) => {
      s.abort();
      if (opts.signal?.aborted) {
        const e = new Error('Aborted');
        e.name = 'AbortError';
        throw e;
      }
      return { choices: [{ message: { role: 'assistant', content: 'x' } }] } as LLMResponse;
    });
    await expect(s.run()).rejects.toThrow();
    expect(s.state).toBe('killed');
  });

  it('posts a respond with the error when the run fails, so agent_wait resolves fast', async () => {
    const bus = new AgentBus();
    bus.registerMailbox('main');
    const llm = makeLLM([{ content: 'never reached' }]);
    const s = makeSession('implementer', brief(), llm, bus);
    llm.chatCompletion.mockRejectedValueOnce(new Error('kaboom'));

    await expect(s.run()).rejects.toThrow('kaboom');
    expect(s.state).toBe('error');

    // A respond WITH the correlationId must be on the bus — the executor's
    // waitFor resolves on it instantly instead of hanging for the timeout.
    const respond = bus.getMailbox('main')!.drain().find(m => m.type === 'respond');
    expect(respond?.correlationId).toBe('corr-test');
    expect(respond?.payload).toContain('[ERROR]');
    expect(respond?.payload).toContain('kaboom');
    expect(respond?.topic).toContain('implementer.error');
  });

  it('replies to a peer request correlationId when it finishes (peer Q&A)', async () => {
    const bus = new AgentBus();
    bus.registerMailbox('main');
    bus.registerMailbox('agent:asker');
    bus.registerMailbox('agent:test'); // executor registers this on spawn
    const llm = makeLLM([{ content: 'answer: the loop drops the corrId' }]);
    const s = makeSession('implementer', brief(), llm, bus);
    // A peer asks a pointed question on ITS OWN correlationId.
    bus.publish({
      id: 'msg-q',
      type: 'request',
      from: 'agent:asker',
      to: 'agent:test',
      correlationId: 'corr-q1',
      expectsResponse: true,
      payload: 'is the bug in the collector?',
      ts: Date.now(),
    });
    // Register the collector waiter before the run finishes.
    const waited = bus.waitFor('corr-q1', { timeoutMs: 2000 });
    await s.run();

    const reply = await waited;
    expect(reply.correlationId).toBe('corr-q1');
    expect(reply.from).toBe('agent:test');
    expect(reply.payload).toBe('answer: the loop drops the corrId');

    // The asking peer's mailbox also receives the reply.
    const askerMsgs = bus.getMailbox('agent:asker')!.drain();
    const delivered = askerMsgs.find(m => m.type === 'respond' && m.correlationId === 'corr-q1');
    expect(delivered?.from).toBe('agent:test');
  });
});

describe('SubAgentSession permission + hooks', () => {
  it('denies a write tool under plan mode even when allowlisted', async () => {
    const bus = new AgentBus();
    const llm = makeLLM([
      { content: 'write attempt', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'write_file', arguments: '{"path":"/tmp/a.ts","content":"x"}' } }] },
      { content: 'recovered' },
    ]);
    const s = makeSession('implementer', brief(), llm, bus, undefined, { permissionMode: 'plan' });
    await s.run();
    const toolMsg = s.transcriptSnapshot.find(m => m.role === 'tool');
    expect(toolMsg?.content).toContain('Permission denied');
  });

  it('ask-gated tool parks the session; approve(true) re-runs the tool', async () => {
    const bus = new AgentBus();
    const llm = makeLLM([
      { content: 'ask', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'write_file', arguments: '{"path":"/tmp/a.ts","content":"x"}' } }] },
      { content: 'after approval' },
    ]);
    // Bash(npm *) allow + npm install ask → write_file uses Bash family args.
    const s = makeSession('implementer', brief(), llm, bus, undefined, {
      permissionMode: 'default',
      permissions: { allow: ['Write(/tmp/**)'], ask: ['Write(/tmp/*.ts)'] },
    });
    // Run in the background so parkForApproval can be resolved mid-loop.
    const runPromise = s.run();
    // Let the loop reach the ask gate.
    await new Promise(r => setTimeout(r, 30));
    expect(s.pendingApproval).not.toBeNull();
    // Approve via the session API.
    expect(s.approve('tc1', true)).toBe(true);
    const result = await runPromise;
    expect(result).toBe('after approval');
    const toolMsgs = s.transcriptSnapshot.filter(m => m.role === 'tool');
    expect(toolMsgs[toolMsgs.length - 1].content).toContain('APPROVED');
  });

  it('PreToolUse hook exit 2 blocks the tool with HOOK BLOCKED output', async () => {
    const bus = new AgentBus();
    const llm = makeLLM([
      { content: 'blocked', tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'write_file', arguments: '{"path":"/tmp/a.ts","content":"x"}' } }] },
      { content: 'recovered' },
    ]);
    const hookRunner = new HookRunner(vi.fn(() => Promise.resolve({ exitCode: 2, stdout: 'read-only policy', stderr: '' })) as never);
    const s = makeSession('implementer', brief(), llm, bus, undefined, { hooks: { PreToolUse: [{ matcher: 'Write', command: 'policy.sh' }] } });
    const deps = (s as any).deps;
    deps.hooks = hookRunner;
    await s.run();
    const toolMsg = s.transcriptSnapshot.find(m => m.role === 'tool');
    expect(toolMsg?.content).toContain('HOOK BLOCKED');
  });
});
