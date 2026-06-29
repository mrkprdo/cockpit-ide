import { describe, it, expect, vi } from 'vitest';
import { LLMClient } from './llm-client';
import type { OpenAIFunctionSchema } from './types';

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
    expect(body.max_tokens).toBe(4096);
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
});
