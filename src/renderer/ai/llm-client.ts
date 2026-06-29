import type {
  LLMConfig,
  LLMCompletionOptions,
  LLMResponse,
  OpenAIFunctionSchema,
  LLMMessage,
} from './types';

type FetchLike = typeof fetch;

/**
 * Thin OpenAI-compatible chat completions client.
 *
 * - Injectable `fetch` implementation for tests.
 * - Normalizes the endpoint URL (strips trailing slashes).
 * - Throws descriptive errors for non-OK responses.
 */
export class LLMClient {
  constructor(
    private config: LLMConfig,
    private fetchImpl: FetchLike = typeof window !== 'undefined' ? window.fetch.bind(window) : fetch,
  ) {}

  async chatCompletion(options: LLMCompletionOptions): Promise<LLMResponse> {
    const url = `${this.config.endpoint.replace(/\/+$/, '')}/chat/completions`;
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.max_tokens ?? 4096,
    };
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }
    if (options.tool_choice !== undefined) {
      body.tool_choice = options.tool_choice;
    }

    const res = await this.fetchImpl(url, {
      method: 'POST',
      signal: options.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`API error ${res.status}: ${errBody.slice(0, 200)}`);
    }

    return res.json();
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
