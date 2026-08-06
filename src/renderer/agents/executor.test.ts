import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentExecutor } from './executor';
import { AgentBus } from './bus';
import type { AgentMessage } from './types';

/** Canned OpenAI-style completion with the given content (or a tool call). */
function jsonResponse(content: string, toolCalls?: any[]): string {
  return JSON.stringify({
    choices: [{
      message: { role: 'assistant', content, tool_calls: toolCalls },
      finish_reason: toolCalls ? 'tool_calls' : 'stop',
    }],
  });
}

/** A fetch mock that hangs until the abort signal fires, then rejects. */
function hangingFetch(): ReturnType<typeof vi.fn> {
  return vi.fn((_url: string, init?: { signal?: AbortSignal }) =>
    new Promise<Response>((_resolve, reject) => {
      const sig = init?.signal;
      const onAbort = () => {
        const e = new Error('Aborted');
        e.name = 'AbortError';
        reject(e);
      };
      if (sig?.aborted) { onAbort(); return; }
      sig?.addEventListener('abort', onAbort, { once: true });
    })
  );
}

describe('AgentExecutor', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(jsonResponse('task complete'), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('broadcast() attributes the sender when a peer calls it (room participants)', () => {
    const bus = new AgentBus();
    const ex = new AgentExecutor(bus);
    bus.registerMailbox('agent:reviewer');
    const seen: AgentMessage[] = [];
    bus.subscribe('*', (m) => seen.push(m));
    ex.broadcast('panel finding', 'room.findings', 'agent:reviewer');
    expect(seen.length).toBe(1);
    expect(seen[0].from).toBe('agent:reviewer');
    expect(seen[0].topic).toBe('room.findings');
    expect(seen[0].type).toBe('broadcast');
    // Default sender stays 'main' when no from is passed (orchestrator broadcasts).
    ex.broadcast('orchestrator note', 'orchestrator.note');
    expect(seen[1].from).toBe('main');
  });

  it('spawns an agent that responds on the bus; waitFor captures it', async () => {
    const ex = new AgentExecutor();
    ex.setConfigOverride({ endpoint: 'https://fake.local/v1', apiKey: 'k', model: 'm' });
    const res = ex.spawn({
      skill: 'implementer',
      context: 'Do the thing',
      expectedResult: 'thing done',
    });
    expect(res.agentId).toMatch(/^agent:/);
    expect(res.correlationId).toMatch(/^corr-/);

    // Non-blocking wait resolves with the respond payload.
    const wait = await ex.waitFor(res.correlationId, 2000);
    expect(wait.ok).toBe(true);
    expect(wait.message?.payload).toBe('task complete');
    expect(wait.message?.from).toBe(res.agentId);

    const statuses = ex.status();
    const st = statuses.find(s => s.id === res.agentId);
    expect(st?.state).toBe('done');
    expect(st?.resultPreview).toBe('task complete');
  });

  it('waitFor resolves instantly from the respond cache when the agent already finished before the wait', async () => {
    const ex = new AgentExecutor();
    ex.setConfigOverride({ endpoint: 'https://fake.local/v1', apiKey: 'k', model: 'm' });
    const bus = ex.getBus();
    // Simulate a fast agent that responded BEFORE main called agent_wait
    // (without the cache this would burn the full timeout).
    bus.publish({
      id: 'msg-pre',
      type: 'respond',
      from: 'agent:fast',
      to: 'main',
      correlationId: 'corr-fast',
      replyTo: 'main',
      expectsResponse: false,
      payload: 'fast done',
      ts: Date.now(),
    });
    const res = await ex.waitFor('corr-fast', 5000);
    expect(res.ok).toBe(true);
    expect(res.message?.payload).toBe('fast done');
    expect(res.message?.from).toBe('agent:fast');
  });

  it('waitFor resolves fast with the error payload when an agent fails (no 120s hang)', async () => {
    const ex = new AgentExecutor();
    ex.setConfigOverride({ endpoint: 'https://fake.local/v1', apiKey: 'k', model: 'm' });
    fetchMock.mockRejectedValue(new Error('boom'));
    const res = ex.spawn({ skill: 'implementer', context: 'do', expectedResult: 'it' });

    const wait = await ex.waitFor(res.correlationId, 5000);
    expect(wait.ok).toBe(true);
    expect(wait.message?.payload).toContain('[ERROR]');
    expect(wait.message?.payload).toContain('boom');

    const st = ex.status().find(s => s.id === res.agentId);
    expect(st?.state).toBe('error');
  });

  it('waitFor returns a timeout reason when nothing ever responds', async () => {
    const ex = new AgentExecutor();
    ex.setConfigOverride({ endpoint: 'https://fake.local/v1', apiKey: 'k', model: 'm' });
    const res = await ex.waitFor('corr-never', 30);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('timeout');
  });

  it('enforces the concurrency cap', async () => {
    const ex = new AgentExecutor();
    ex.setConfigOverride({ endpoint: 'https://fake.local/v1', apiKey: 'k', model: 'm' });
    ex.setMaxConcurrent(2);
    // Slow model: keep agents running while we spawn more.
    fetchMock.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve(new Response(jsonResponse('slow done'), { status: 200 })), 200))
    );
    ex.spawn({ skill: 'implementer', context: 'a', expectedResult: 'a' });
    ex.spawn({ skill: 'reviewer', context: 'b', expectedResult: 'b' });
    expect(() => ex.spawn({ skill: 'tester', context: 'c', expectedResult: 'c' })).toThrow(/cap reached/);
  });

  it('dispatch() sends a peer message to a running agent; unknown agent errors', () => {
    const ex = new AgentExecutor();
    ex.setConfigOverride({ endpoint: 'https://fake.local/v1', apiKey: 'k', model: 'm' });
    const res = ex.spawn({ skill: 'implementer', context: 'x', expectedResult: 'y' });
    const msgId = ex.dispatch(res.agentId, { payload: 'review me', topic: 'review.request' });
    expect(msgId).toBeTruthy();
    expect(() => ex.dispatch('agent:nope', { payload: 'hi' })).toThrow(/No running agent/);
  });

  it('kill() aborts a running agent (state becomes killed)', async () => {
    const ex = new AgentExecutor();
    ex.setConfigOverride({ endpoint: 'https://fake.local/v1', apiKey: 'k', model: 'm' });
    fetchMock.mockImplementation(hangingFetch());
    const res = ex.spawn({ skill: 'implementer', context: 'hang', expectedResult: 'never' });
    await new Promise(r => setTimeout(r, 20));
    expect(ex.kill(res.agentId)).toBe(true);
    await new Promise(r => setTimeout(r, 40));
    const st = ex.status().find(s => s.id === res.agentId);
    expect(st?.state).toBe('killed');
  });

  it('purgeFinished removes done agents from the roster', async () => {
    const ex = new AgentExecutor();
    ex.setConfigOverride({ endpoint: 'https://fake.local/v1', apiKey: 'k', model: 'm' });
    const res = ex.spawn({ skill: 'planner', context: 'plan', expectedResult: 'plan done' });
    await ex.waitFor(res.correlationId, 2000);
    expect(ex.status().length).toBe(1);
    const purged = ex.purgeFinished();
    expect(purged).toBe(1);
    expect(ex.status().length).toBe(0);
  });

  it('status() reports guardrails, mailbox depth, and tokens', async () => {
    const ex = new AgentExecutor();
    ex.setConfigOverride({ endpoint: 'https://fake.local/v1', apiKey: 'k', model: 'm' });
    const res = ex.spawn({
      skill: 'implementer',
      context: 'ctx',
      expectedResult: 'exp',
      guardrails: ['never delete files'],
    });
    await ex.waitFor(res.correlationId, 2000);
    const st = ex.status()[0];
    expect(st.guardrails).toEqual(['never delete files']);
    expect(st.contextTokens).toBeGreaterThan(0);
    expect(st.mailboxCount).toBe(0);
    expect(st.tokensUsed).toBeGreaterThanOrEqual(0);
  });

  it('spawns a custom definition by agent id; status reports definition + mode', async () => {
    const ex = new AgentExecutor();
    ex.setConfigOverride({ endpoint: 'https://fake.local/v1', apiKey: 'k', model: 'm' });
    const res = ex.spawn({
      agent: 'reviewer',
      context: 'review it',
      expectedResult: 'report',
      permissionMode: 'plan',
    });
    await ex.waitFor(res.correlationId, 2000);
    const st = ex.status().find(s => s.id === res.agentId);
    expect(st?.definition).toBe('reviewer');
    expect(st?.permissionMode).toBe('plan');
    expect(st?.isCustom).toBe(false);
  });

  it('unknown agent definition throws a readable error', () => {
    const ex = new AgentExecutor();
    expect(() => ex.spawn({ agent: 'nope', context: 'x', expectedResult: 'y' })).toThrow(/Unknown agent definition/);
  });

  it('resolves the model chain: spawn override > definition.model > provider', () => {
    const ex = new AgentExecutor();
    const provider = vi.fn(() => ({ endpoint: 'https://prov.local/v1', apiKey: 'kp', model: 'provider-model' }));
    ex.setConfigProvider(provider);
    // Custom definition with its own model.
    const sessionModel = (ex as any).resolveConfigFor({ name: 'custom', description: 'd', systemPrompt: 'sp', model: 'defn-model' }, { model: 'spawn-model' });
    expect(sessionModel.model).toBe('spawn-model');
    const defnModel = (ex as any).resolveConfigFor({ name: 'custom', description: 'd', systemPrompt: 'sp', model: 'defn-model' }, {});
    expect(defnModel.model).toBe('defn-model');
    const defaultModel = (ex as any).resolveConfigFor({ name: 'custom', description: 'd', systemPrompt: 'sp' }, {});
    expect(defaultModel.model).toBe('provider-model');
  });

  it('waitFor returns needs-approval for a parked ask-gated tool', async () => {
    const ex = new AgentExecutor();
    ex.setConfigOverride({ endpoint: 'https://fake.local/v1', apiKey: 'k', model: 'm' });
    // Create an agent and manually park an approval on its session.
    const res = ex.spawn({ skill: 'implementer', context: 'x', expectedResult: 'y' });
    const session = ex.getAgentSession(res.agentId)!;
    (session as any).pendingApproval = { toolName: 'write_file', rawArgs: '{}', toolCallId: 'corr-parked', permissionDecision: 'ask' };
    const wait = await ex.waitFor('corr-parked', 5000);
    expect(wait.ok).toBe(false);
    expect(wait.reason).toBe('needs-approval');
  });

  it('approve() resolves a parked approval; false denies', async () => {
    const ex = new AgentExecutor();
    ex.setConfigOverride({ endpoint: 'https://fake.local/v1', apiKey: 'k', model: 'm' });
    const res = ex.spawn({ skill: 'implementer', context: 'x', expectedResult: 'y' });
    const session = ex.getAgentSession(res.agentId)!;
    let resolved = false;
    (session as any).pendingApproval = { toolName: 'write_file', rawArgs: '{}', toolCallId: 'corr-approve', permissionDecision: 'ask' };
    (session as any).approvalWaiters = [{ corrId: 'corr-approve', resolve: (yes: boolean) => { resolved = yes; } }];
    expect(ex.approve('corr-approve', true)).toBe(true);
    expect(resolved).toBe(true);
    // Unknown correlation → no parked approval.
    expect(ex.approve('corr-missing', true)).toBe(false);
  });

  it('persona spawn → status() shows label/icon/color, isCustom: true, skill: null (T10)', async () => {
    const ex = new AgentExecutor();
    ex.setConfigOverride({ endpoint: 'https://fake.local/v1', apiKey: 'k', model: 'm' });
    const res = ex.spawn({
      persona: { name: 'Cache Skeptic', icon: 'CACHE', color: '#ffd54f', system_prompt: 'verify cache isolation' },
      context: 'review cache',
      expectedResult: 'brief',
    });
    await ex.waitFor(res.correlationId, 2000);
    const st = ex.status().find(s => s.id === res.agentId);
    expect(st?.skill).toBeNull();
    expect(st?.isCustom).toBe(true);
    expect(st?.label).toContain('Cache Skeptic');
    expect(st?.icon).toBe('CACH'); // text icon, truncated to 4 chars
    expect(st?.color).toBe('#ffd54f');
  });

  it('sanitizePersona clamps a 500-char name, rejects "red", strips emoji to text initials', () => {
    const ex = new AgentExecutor();
    const longName = 'A'.repeat(500);
    const { defn } = (ex as any).resolveDefinition({
      persona: { name: longName, icon: '👨👩👧👦', color: 'red', system_prompt: 'p' },
      context: 'c',
      expectedResult: 'e',
    });
    expect(defn.label).toHaveLength(32);
    expect(defn.icon).toBe('AA'); // emoji stripped → initials of the name
    expect(defn.color).toMatch(/^#[0-9a-f]{6}$/i); // palette fallback, not 'red'
  });

  it('adhoc persona definition names never collide with a built-in', () => {
    const ex = new AgentExecutor();
    const { name } = (ex as any).resolveDefinition({
      persona: { name: 'Implementer', system_prompt: 'p' },
      context: 'c',
      expectedResult: 'e',
    });
    expect(name.startsWith('adhoc-')).toBe(true);
    expect(name).not.toBe('implementer');
    expect((ex as any).resolveDefinition({ skill: 'implementer', context: 'c', expectedResult: 'e' }).name).toBe('implementer');
  });

  it('adhoc persona defs carry peer capability + room tools but never capabilities (T3)', () => {
    const ex = new AgentExecutor();
    const { defn } = (ex as any).resolveDefinition({
      persona: { name: 'Sneaky', system_prompt: 'p' },
      context: 'c',
      expectedResult: 'e',
    });
    expect(defn.capabilities).toEqual(['peer']);
    expect(defn.tools).toContain('agent_broadcast');
    expect(defn.tools).toContain('agent_status');
  });

  it('roomLog caps at 30 entries and the digest reaches a later spawn context', () => {
    const ex = new AgentExecutor();
    const roomLog = (ex as any).roomLog as Array<{ from: string; name: string; intent: string; text: string }>;
    for (let i = 0; i < 40; i++) {
      ex.emitSay('agent:a', { text: `note ${i}`, intent: 'note' });
    }
    expect(roomLog.length).toBe(30);
    expect(roomLog[0].text).toBe('note 10'); // oldest 10 evicted
    const digest = (ex as any).roomDigest();
    expect(digest).toContain('## Conversation so far');
    expect(digest).toContain('note 39');
    // A later spawn context includes the digest.
    const { defn } = (ex as any).resolveDefinition({ skill: 'planner', context: 'c', expectedResult: 'e' });
    expect(defn).toBeTruthy();
    const spawned = (ex as any).spawn({ skill: 'planner', context: 'fresh task', expectedResult: 'plan' });
    const runtime = ex.getAgentSession(spawned.agentId);
    expect(runtime?.brief.context).toContain('## Conversation so far');
    expect(runtime?.brief.context).toContain('note 39');
  });

  it('purgeAll clears the room log', () => {
    const ex = new AgentExecutor();
    ex.emitSay('agent:a', { text: 'hi', intent: 'note' });
    expect((ex as any).roomLog.length).toBeGreaterThan(0);
    ex.purgeAll();
    expect((ex as any).roomLog.length).toBe(0);
  });
});
