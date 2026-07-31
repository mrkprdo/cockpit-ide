import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentExecutor } from './executor';

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
});
