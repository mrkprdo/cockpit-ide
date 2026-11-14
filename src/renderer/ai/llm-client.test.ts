import { describe, it, expect, vi } from 'vitest';
import { LLMClient } from './llm-client';
import type { LLMStreamEvent, OpenAIFunctionSchema } from './types';

function makeSSEStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + '\n\n'));
      }
      controller.close();
    },
  });
}

function collectStream(stream: AsyncGenerator<LLMStreamEvent>): Promise<LLMStreamEvent[]> {
  const out: LLMStreamEvent[] = [];
  return (async () => {
    for await (const ev of stream) out.push(ev);
    return out;
  })();
}

describe('LLMClient', () => {
  it('calls fetch with the correct endpoint and body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'hi', role: 'assistant' } }],
      }),
    });

    const client = new LLMClient(
      { apiKey: 'key', endpoint: 'https://api.example.com/', model: 'gpt-4' },
      fetchMock as unknown as typeof fetch
    );

    const result = await client.complete([{ role: 'user', content: 'hello' }]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer key',
        }),
        body: expect.any(String),
      })
    );
    expect(result).toBe('hi');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-4');
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(65536);
  });

  it('sends a stable x-opencode-session header per conversation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi', role: 'assistant' } }] }),
    });
    const client = new LLMClient(
      { apiKey: 'k', endpoint: 'https://opencode.ai/zen/go/v1', model: 'm', sessionId: 'ses_abc123' },
      fetchMock as unknown as typeof fetch,
    );

    await client.complete([{ role: 'user', content: 'one' }]);
    await client.complete([{ role: 'user', content: 'two' }]);

    const h1 = fetchMock.mock.calls[0][1].headers;
    const h2 = fetchMock.mock.calls[1][1].headers;
    // Same id on both requests: OpenCode requires it and uses it for caching.
    expect(h1['x-opencode-session']).toBe('ses_abc123');
    expect(h2['x-opencode-session']).toBe('ses_abc123');
    expect(h1['x-cockpit-client']).toBe('cockpit-ide');
  });

  it('generates a ses_ id when the caller supplies none', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi', role: 'assistant' } }] }),
    });
    const client = new LLMClient(
      { apiKey: 'k', endpoint: 'https://opencode.ai/zen/go/v1', model: 'm' },
      fetchMock as unknown as typeof fetch,
    );

    await client.complete([{ role: 'user', content: 'hi' }]);
    const sent = fetchMock.mock.calls[0][1].headers['x-opencode-session'];
    expect(sent).toMatch(/^ses_[A-Za-z0-9]+$/);
  });

  it('sends the same session header on the Responses path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] }),
    });
    const client = new LLMClient(
      { apiKey: 'k', endpoint: 'https://opencode.ai/inference/openai/v1', model: 'gpt-6.1-sol', sessionId: 'ses_r1' },
      fetchMock as unknown as typeof fetch,
    );

    await client.chatCompletion({ messages: [{ role: 'user', content: 'hi' }] });
    expect(fetchMock.mock.calls[0][1].headers['x-opencode-session']).toBe('ses_r1');
  });

  it('includes tool schemas when tools are provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '', role: 'assistant' } }],
      }),
    });

    const client = new LLMClient(
      { apiKey: 'key', endpoint: 'https://api.example.com', model: 'gpt-4' },
      fetchMock as unknown as typeof fetch
    );

    const tools: OpenAIFunctionSchema[] = [
      {
        type: 'function',
        function: { name: 'tool_a', description: 'a', parameters: { type: 'object' } },
      },
    ];

    await client.chatCompletion({
      messages: [{ role: 'user', content: 'use a tool' }],
      tools,
      tool_choice: 'auto',
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toEqual(tools);
    expect(body.tool_choice).toBe('auto');
  });

  it('throws on non-ok responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const client = new LLMClient(
      { apiKey: 'k', endpoint: 'https://api.example.com', model: 'm' },
      fetchMock as unknown as typeof fetch
    );
    await expect(client.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'API error 401: Unauthorized'
    );
  });

  it('falls back to a default message when choices are missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    });

    const client = new LLMClient(
      { apiKey: 'k', endpoint: 'https://api.example.com', model: 'm' },
      fetchMock as unknown as typeof fetch
    );
    const result = await client.complete([{ role: 'user', content: 'hi' }]);
    expect(result).toBe('No response.');
  });

  it('uses a bound window.fetch by default to avoid illegal invocation', async () => {
    const originalFetch = window.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'bound', role: 'assistant' } }] }),
    });
    (window as any).fetch = fetchMock;

    try {
      const client = new LLMClient({
        apiKey: 'k',
        endpoint: 'https://api.example.com',
        model: 'm',
      });
      const result = await client.complete([{ role: 'user', content: 'hi' }]);
      expect(fetchMock).toHaveBeenCalled();
      expect(result).toBe('bound');
    } finally {
      (window as any).fetch = originalFetch;
    }
  });

  describe('streaming', () => {
    it('yields content deltas from an SSE response', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: makeSSEStream([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}',
          'data: {"choices":[{"delta":{"content":" world"}}]}',
          'data: [DONE]',
        ]),
      });

      const client = new LLMClient(
        { apiKey: 'k', endpoint: 'https://api.example.com', model: 'm' },
        fetchMock as unknown as typeof fetch
      );

      const events = await collectStream(client.streamChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }));
      expect(events).toEqual([
        { type: 'content', delta: 'Hello' },
        { type: 'content', delta: ' world' },
      ]);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.stream).toBe(true);
    });

    it('accumulates tool_calls from streamed chunks', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: makeSSEStream([
          'data: {"choices":[{"delta":{"content":"Let me"}}]}',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file"}}]}}]}',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{"}}]}}]}',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"path\\":\\"/file\\""}}]}}]}',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"}"}}]}}]}',
          'data: [DONE]',
        ]),
      });

      const client = new LLMClient(
        { apiKey: 'k', endpoint: 'https://api.example.com', model: 'm' },
        fetchMock as unknown as typeof fetch
      );

      const events = await collectStream(client.streamChatCompletion({ messages: [{ role: 'user', content: 'read' }] }));
      expect(events[0]).toEqual({ type: 'content', delta: 'Let me' });
      expect(events[1].type).toBe('tool_calls');
      expect((events[1] as any).tool_calls[0].function.name).toBe('read_file');
      expect((events[1] as any).tool_calls[0].function.arguments).toBe('{"path\":\"/file\"}');
    });

    it('surfaces reasoning_content so a reasoning-only turn is not an empty completion', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: makeSSEStream([
          'data: {"choices":[{"delta":{"reasoning_content":"Let me think"}}]}',
          'data: {"choices":[{"delta":{"reasoning_content":" carefully."}}]}',
          'data: {"choices":[{"delta":{"content":"Here is the answer."}}]}',
          'data: [DONE]',
        ]),
      });

      const client = new LLMClient(
        { apiKey: 'k', endpoint: 'https://api.example.com', model: 'm' },
        fetchMock as unknown as typeof fetch
      );

      const events = await collectStream(client.streamChatCompletion({ messages: [{ role: 'user', content: 'think' }] }));
      expect(events).toEqual([
        { type: 'content', delta: 'Let me think' },
        { type: 'content', delta: ' carefully.' },
        { type: 'content', delta: 'Here is the answer.' },
      ]);
    });

    it('streams the OpenAI Responses protocol for GPT models', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: makeSSEStream([
          'data: {"type":"response.output_text.delta","delta":"Hel"}',
          'data: {"type":"response.output_text.delta","delta":"lo"}',
          'data: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"call_1","name":"read_file","arguments":"{\\"path\\":\\"a.ts\\"}"}}',
          'data: {"type":"response.completed"}',
        ]),
      });

      const client = new LLMClient(
        { apiKey: 'k', endpoint: 'https://opencode.ai/inference/openai/v1', model: 'gpt-6.1-sol' },
        fetchMock as unknown as typeof fetch
      );

      const events = await collectStream(client.streamChatCompletion({
        messages: [
          { role: 'system', content: 'be brief' },
          { role: 'user', content: 'hi' },
        ],
        tools: [{ type: 'function', function: { name: 'read_file', description: 'read', parameters: { type: 'object' } } }],
      }));

      expect(events[0]).toEqual({ type: 'content', delta: 'Hel' });
      expect(events[1]).toEqual({ type: 'content', delta: 'lo' });
      expect(events[2]).toEqual({ type: 'tool_calls', tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.ts"}' } },
      ] });

      // The request must go to /responses with flat tool definitions and the
      // system turn lifted into `instructions`.
      expect(fetchMock.mock.calls[0][0]).toBe('https://opencode.ai/inference/openai/v1/responses');
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.stream).toBe(true);
      expect(body.instructions).toBe('be brief');
      expect(body.input).toEqual([{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }]);
      expect(body.tools).toEqual([{
        type: 'function', name: 'read_file', description: 'read', parameters: { type: 'object' },
      }]);
    });

    it('maps a non-streamed Responses payload into a chat-shaped response', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output: [
            { type: 'message', content: [{ type: 'output_text', text: 'done' }] },
            { type: 'function_call', call_id: 'c1', name: 'git_status', arguments: '{}' },
          ],
        }),
      });

      const client = new LLMClient(
        { apiKey: 'k', endpoint: 'https://opencode.ai/inference/openai/v1', model: 'gpt-6.1-sol' },
        fetchMock as unknown as typeof fetch
      );

      const res = await client.chatCompletion({ messages: [{ role: 'user', content: 'x' }] });
      expect(res.choices[0].message.content).toBe('done');
      expect(res.choices[0].message.tool_calls?.[0].function.name).toBe('git_status');
      expect(res.choices[0].finish_reason).toBe('tool_calls');
    });

    it('reports an expired key as a typed auth error, not a JSON blob', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => null },
        text: async () => JSON.stringify({ error: { code: 'api_key_expired', message: 'This API key has expired.' } }),
      });

      const client = new LLMClient(
        { apiKey: 'k', endpoint: 'https://opencode.ai/zen/go/v1', model: 'm' },
        fetchMock as unknown as typeof fetch
      );

      await expect(client.chatCompletion({ messages: [{ role: 'user', content: 'x' }] }))
        .rejects.toMatchObject({ name: 'LLMHttpError', status: 401, code: 'api_key_expired' });
    });

    it('falls back to a single JSON response when no body is provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'plain' } }] }),
      });

      const client = new LLMClient(
        { apiKey: 'k', endpoint: 'https://api.example.com', model: 'm' },
        fetchMock as unknown as typeof fetch
      );

      const events = await collectStream(client.streamChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }));
      expect(events).toEqual([{ type: 'content', delta: 'plain' }]);
    });

    it('throws on non-ok streaming responses', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      });

      const client = new LLMClient(
        { apiKey: 'k', endpoint: 'https://api.example.com', model: 'm' },
        fetchMock as unknown as typeof fetch
      );

      await expect(
        collectStream(client.streamChatCompletion({ messages: [{ role: 'user', content: 'hi' }] }))
      ).rejects.toThrow('API error 500');
    });
  });
});
