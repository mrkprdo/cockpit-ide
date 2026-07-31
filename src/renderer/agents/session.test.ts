import { describe, it, expect, vi } from 'vitest';
import { AgentBus } from './bus';
import { ToolRegistry } from '../ai/tool-registry';
import { ALL_TOOLS } from '../ai/tool-definitions';
import { SubAgentSession } from './session';
import { SKILLS } from './skills';
import type { AgentBrief, AgentMessage } from './types';
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

function makeSession(skillName: keyof typeof SKILLS, b: AgentBrief, llm: FakeLLM, bus: AgentBus, contextTokens?: number) {
  const skill = { ...SKILLS[skillName], contextTokens: contextTokens ?? SKILLS[skillName].contextTokens };
  return new SubAgentSession(`agent:test`, skill, b, 'corr-test', {
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
    const toolMsg = s.transcript.find(m => m.role === 'tool');
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
});
