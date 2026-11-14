import type {
  LLMConfig,
  LLMCompletionOptions,
  LLMResponse,
  OpenAIFunctionSchema,
  LLMMessage,
  LLMStreamEvent,
  LLMToolCall,
} from './types';
import { parseHttpError } from './llm-errors';
import { completionUrl, resolveProtocol, type LLMProtocol } from './llm-protocol';

type FetchLike = typeof fetch;

/**
 * One id per app run, used when a caller does not supply a conversation id.
 * Better than a per-request id: requests still route, and prompt caching has a
 * stable bucket to land in.
 */
let appRunSessionId = '';

function processSessionId(): string {
  if (!appRunSessionId) {
    const rand = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
    appRunSessionId = rand.replace(/-/g, '').slice(0, 32);
  }
  return appRunSessionId;
}

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
 * Thin LLM client speaking the OpenAI Chat Completions and OpenAI Responses
 * protocols (the two families OpenCode serves behind its OpenAI-compatible
 * base).
 *
 * - Injectable `fetch` implementation for tests.
 * - Normalizes the endpoint URL (strips trailing slashes).
 * - Throws typed `LLMHttpError`s (status + provider code/message) for non-OK
 *   responses, so the UI can say "your key expired" instead of printing JSON.
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
      // The CSP only permits cleartext http to loopback, so a remote http
      // endpoint fails at fetch with an opaque error. Refuse it here instead:
      // the real problem is that the API key would cross the wire unencrypted.
      if (proto === 'http:') {
        const host = new URL(config.endpoint).hostname;
        const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
        if (!isLoopback) {
          throw new Error(
            `LLMClient: refusing cleartext http://${host} — the API key would be sent unencrypted. Use https:// (plain http is only allowed for a local server).`,
          );
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('LLMClient:')) throw err;
      throw new Error(`LLMClient: invalid endpoint "${config.endpoint}" — must be http or https`);
    }
  }

  /** Wire protocol this (endpoint, model) pair speaks. */
  get protocol(): LLMProtocol {
    return resolveProtocol(this.config.endpoint, this.config.model);
  }

  /**
   * Conversation id for `x-opencode-session`.
   *
   * OpenCode requires this header and answers 400 MissingSessionID without it
   * ("cannot be routed efficiently"). It must be STABLE for a conversation — a
   * fresh id per request still routes, but throws away prompt-cache hits. Falls
   * back to a per-client id, then to one per app run.
   */
  get sessionId(): string {
    const raw = this.config.sessionId || `ses_${processSessionId()}`;
    const clean = raw.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 128);
    return clean.startsWith('ses_') ? clean : `ses_${clean}`;
  }

  /**
   * Headers sent with every request.
   *
   * `x-cockpit-client` identifies this client (OpenCode asks clients to identify
   * themselves rather than looking like a generic SDK); a browser `fetch` cannot
   * set `User-Agent`, so this is the equivalent signal.
   */
  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'x-opencode-session': this.sessionId,
      'x-cockpit-client': 'cockpit-ide',
      ...extra,
    };
  }

  /** The URL this client will actually call (shown in the settings panel). */
  get requestUrl(): string {
    return completionUrl(this.config.endpoint, this.protocol);
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
    const protocol = this.protocol;
    if (protocol === 'responses') return this.responsesCompletion(options);

    const res = await this.fetchImpl(this.requestUrl, {
      method: 'POST',
      signal: options.signal,
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(options)),
    });

    if (!res.ok) {
      throw parseHttpError(res.status, await res.text().catch(() => ''), res.headers?.get?.('retry-after'));
    }

    return res.json();
  }

  /**
   * Stream a chat completion. Yields content deltas as they arrive. If the model
   * decides to call tools, the accumulated tool calls are yielded as a single
   * `tool_calls` event at the end of the stream.
   */
  async *streamChatCompletion(options: LLMCompletionOptions): AsyncGenerator<LLMStreamEvent> {
    const protocol = this.protocol;
    if (protocol === 'responses') { yield* this.streamResponses(options); return; }

    const res = await this.fetchImpl(this.requestUrl, {
      method: 'POST',
      signal: options.signal,
      headers: this.headers({ 'Accept': 'text/event-stream' }),
      body: JSON.stringify(this.buildBody({ ...options, stream: true })),
    });

    if (!res.ok) {
      throw parseHttpError(res.status, await res.text().catch(() => ''), res.headers?.get?.('retry-after'));
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

  // ── OpenAI Responses protocol ───────────────────────────────────────────
  // GPT models on OpenCode are Responses-only. That API takes a different body
  // (`input` items instead of `messages`, flat tool definitions) and emits a
  // different stream (`response.output_text.delta`,
  // `response.output_item.done`), so both directions are mapped here and the
  // rest of the app keeps seeing Chat-Completions-shaped messages.

  private buildResponsesBody(options: LLMCompletionOptions, stream: boolean): Record<string, unknown> {
    const { instructions, input } = toResponsesInput(options.messages);
    const body: Record<string, unknown> = {
      model: this.config.model,
      input,
      max_output_tokens: options.max_tokens ?? 65536,
    };
    if (instructions) body.instructions = instructions;
    if (stream) body.stream = true;
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(t => ({
        type: 'function',
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      }));
      body.tool_choice = options.tool_choice ?? 'auto';
    }
    return body;
  }

  private async responsesCompletion(options: LLMCompletionOptions): Promise<LLMResponse> {
    const res = await this.fetchImpl(this.requestUrl, {
      method: 'POST',
      signal: options.signal,
      headers: this.headers(),
      body: JSON.stringify(this.buildResponsesBody(options, false)),
    });
    if (!res.ok) {
      throw parseHttpError(res.status, await res.text().catch(() => ''), res.headers?.get?.('retry-after'));
    }
    return fromResponsesPayload(await res.json());
  }

  private async *streamResponses(options: LLMCompletionOptions): AsyncGenerator<LLMStreamEvent> {
    const res = await this.fetchImpl(this.requestUrl, {
      method: 'POST',
      signal: options.signal,
      headers: this.headers({ 'Accept': 'text/event-stream' }),
      body: JSON.stringify(this.buildResponsesBody(options, true)),
    });
    if (!res.ok) {
      throw parseHttpError(res.status, await res.text().catch(() => ''), res.headers?.get?.('retry-after'));
    }

    // Proxies that ignore stream:true still return one JSON document.
    if (!res.body) {
      const payload = fromResponsesPayload(await res.json());
      const msg = payload.choices[0]?.message;
      if (msg?.content) yield { type: 'content', delta: msg.content };
      if (msg?.tool_calls?.length) yield { type: 'tool_calls', tool_calls: msg.tool_calls };
      return;
    }

    const calls: LLMToolCall[] = [];
    for await (const line of this.readSSELines(res.body)) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6);
      if (raw === '[DONE]') break;

      let ev: Record<string, any>;
      try { ev = JSON.parse(raw) as Record<string, any>; } catch { continue; }

      switch (ev.type) {
        case 'response.output_text.delta':
        case 'response.reasoning_summary_text.delta':
          if (typeof ev.delta === 'string' && ev.delta) yield { type: 'content', delta: ev.delta };
          break;
        case 'response.output_item.done': {
          const item = ev.item;
          if (item?.type === 'function_call' && item.name) {
            calls.push({
              id: item.call_id || item.id || `call_${calls.length}`,
              type: 'function',
              function: { name: item.name, arguments: item.arguments || '{}' },
            });
          }
          break;
        }
        case 'response.failed':
        case 'error': {
          const e = ev.response?.error ?? ev.error ?? {};
          throw new Error(`API error 502: ${e.message || e.code || 'stream failed'}`);
        }
        case 'response.completed':
          if (calls.length > 0) yield { type: 'tool_calls', tool_calls: calls };
          return;
        default:
          break;
      }
    }
    if (calls.length > 0) yield { type: 'tool_calls', tool_calls: calls };
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

/**
 * Map Chat-Completions messages onto Responses `input` items.
 * System turns become `instructions`; tool results become function_call_output.
 */
export function toResponsesInput(messages: LLMMessage[]): { instructions: string; input: any[] } {
  const system: string[] = [];
  const input: any[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content) system.push(m.content);
      continue;
    }
    if (m.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: m.tool_call_id ?? '', output: m.content ?? '' });
      continue;
    }
    if (m.role === 'assistant') {
      if (m.content) {
        input.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: m.content }] });
      }
      for (const tc of m.tool_calls ?? []) {
        input.push({
          type: 'function_call',
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments || '{}',
        });
      }
      continue;
    }
    input.push({ type: 'message', role: 'user', content: [{ type: 'input_text', text: m.content ?? '' }] });
  }
  return { instructions: system.join('\n\n'), input };
}

/** Map a Responses payload (or completed stream) back to a Chat-Completions shape. */
export function fromResponsesPayload(data: any): LLMResponse {
  let content = '';
  const tool_calls: LLMToolCall[] = [];
  for (const item of (data?.output ?? []) as any[]) {
    if (item?.type === 'message') {
      for (const part of (item.content ?? []) as any[]) {
        if (part?.type === 'output_text' && typeof part.text === 'string') content += part.text;
      }
    } else if (item?.type === 'function_call' && item.name) {
      tool_calls.push({
        id: item.call_id || item.id || `call_${tool_calls.length}`,
        type: 'function',
        function: { name: item.name, arguments: item.arguments || '{}' },
      });
    }
  }
  const message: LLMMessage = { role: 'assistant', content };
  if (tool_calls.length > 0) message.tool_calls = tool_calls;
  return { choices: [{ message, finish_reason: tool_calls.length > 0 ? 'tool_calls' : 'stop' }] };
}
