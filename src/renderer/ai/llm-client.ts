import type {
  LLMConfig,
  LLMCompletionOptions,
  LLMResponse,
  OpenAIFunctionSchema,
  LLMMessage,
  LLMStreamEvent,
  LLMToolCall,
} from './types';

type FetchLike = typeof fetch;

interface StreamChoice {
  delta: {
    content?: string | null;
    // DeepSeek-family models stream their hidden chain-of-thought here.
    reasoning_content?: string | null;
    tool_calls?: StreamToolCallChunk[];
  };
  finish_reason: string | null;
}

interface StreamToolCallChunk {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * Thin OpenAI-compatible chat completions client.
 *
 * - Injectable `fetch` implementation for tests.
 * - Normalizes the endpoint URL (strips trailing slashes).
 * - Throws descriptive errors for non-OK responses.
 * - Supports Server-Sent Events (SSE) streaming with tool-call accumulation.
 */
export class LLMClient {
  constructor(
    private config: LLMConfig,
    private fetchImpl: FetchLike = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch,
  ) {
    try {
      const proto = new URL(config.endpoint).protocol;
      if (proto !== 'http:' && proto !== 'https:') throw new Error('bad protocol');
    } catch {
      throw new Error(`LLMClient: invalid endpoint "${config.endpoint}" — must be http or https`);
    }
  }

  private buildBody(options: LLMCompletionOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.max_tokens ?? 65536,
    };
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }
    if (options.tool_choice !== undefined) {
      body.tool_choice = options.tool_choice;
    }
    if (options.stream) {
      body.stream = true;
    }
    return body;
  }

  async chatCompletion(options: LLMCompletionOptions): Promise<LLMResponse> {
    const url = `${this.config.endpoint.replace(/\/+$/, '')}/chat/completions`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      signal: options.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(this.buildBody(options)),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`API error ${res.status}: ${errBody}`);
    }

    return res.json();
  }

  /**
   * Stream a chat completion. Yields content deltas as they arrive. If the model
   * decides to call tools, the accumulated tool calls are yielded as a single
   * `tool_calls` event at the end of the stream.
   */
  async *streamChatCompletion(options: LLMCompletionOptions): AsyncGenerator<LLMStreamEvent> {
    const url = `${this.config.endpoint.replace(/\/+$/, '')}/chat/completions`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      signal: options.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(this.buildBody({ ...options, stream: true })),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`API error ${res.status}: ${errBody}`);
    }

    // If the server returns a plain JSON response (e.g. proxies that ignore stream: true),
    // adapt it to the same event shape instead of requiring a ReadableStream body.
    if (!res.body) {
      const data = (await res.json()) as LLMResponse;
      const msg = data.choices?.[0]?.message;
      if (msg?.content) {
        yield { type: 'content', delta: msg.content };
      }
      if (msg?.tool_calls && msg.tool_calls.length > 0) {
        yield { type: 'tool_calls', tool_calls: msg.tool_calls };
      }
      return;
    }

    const toolCallParts = new Map<number, Partial<LLMToolCall>>();
    let streamedAnyContent = false;

    for await (const line of this.readSSELines(res.body)) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') break;

      let chunk: { choices?: StreamChoice[] };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }

      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        streamedAnyContent = true;
        yield { type: 'content', delta: delta.content };
      } else if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
        // Surface DeepSeek-style reasoning deltas so a reasoning-only turn is
        // never mistaken for an empty completion (and so the user sees the
        // model thinking when its answer is cut off by max_tokens).
        streamedAnyContent = true;
        yield { type: 'content', delta: delta.reasoning_content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCallParts.get(tc.index) || {};
          if (tc.id) existing.id = tc.id;
          if (tc.type) existing.type = tc.type;
          if (tc.function?.name || tc.function?.arguments) {
            existing.function = existing.function || { name: '', arguments: '' };
            if (tc.function.name) existing.function.name = tc.function.name;
            if (tc.function.arguments) {
              existing.function.arguments = (existing.function.arguments || '') + tc.function.arguments;
            }
          }
          toolCallParts.set(tc.index, existing);
        }
      }
    }

    if (toolCallParts.size > 0) {
      const tool_calls: LLMToolCall[] = [];
      for (let i = 0; i < toolCallParts.size; i++) {
        const part = toolCallParts.get(i);
        if (!part || !part.id || !part.function) continue;
        tool_calls.push({
          id: part.id,
          type: part.type || 'function',
          function: {
            name: part.function.name || '',
            arguments: part.function.arguments || '',
          },
        });
      }
      if (tool_calls.length > 0) {
        yield { type: 'tool_calls', tool_calls };
      }
    }
  }

  private async *readSSELines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find(l => l.startsWith('data: ')) || '';
          if (line) yield line;
        }
      }
      // Flush any trailing event that didn't end with a blank line.
      if (buffer) {
        const line = buffer.split('\n').find(l => l.startsWith('data: ')) || '';
        if (line) yield line;
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Convenience helper for a plain text completion with no tools.
   */
  async complete(messages: LLMMessage[], signal?: AbortSignal): Promise<string> {
    const data = await this.chatCompletion({ messages, signal });
    return data.choices?.[0]?.message?.content || 'No response.';
  }
}

export type { OpenAIFunctionSchema, LLMMessage, LLMResponse };
