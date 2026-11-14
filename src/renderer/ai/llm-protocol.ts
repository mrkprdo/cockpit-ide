// Which wire protocol a given (endpoint, model) pair speaks.
//
// OpenCode's inference API is split by model family:
//
//   /inference/openai/v1/chat/completions   open models (kimi-k3, glm-5.3, …)
//   /inference/openai/v1/responses          GPT models
//
// The client used to append `/chat/completions` unconditionally, so a GPT model
// could only ever produce a confusing 400/404.
//
// Resolution is deliberately endpoint-first and conservative: we never rewrite a
// base path the user did not ask for. The model id only disambiguates *within*
// the OpenAI-compatible base, where both families live behind the same prefix.

export type LLMProtocol = 'chat' | 'responses';

/**
 * Pick the protocol for a request. `endpoint` may be a base
 * (`…/inference/openai/v1`) or already include the operation
 * (`…/chat/completions`, `…/responses`).
 */
export function resolveProtocol(endpoint: string, model: string): LLMProtocol {
  const ep = (endpoint || '').toLowerCase();

  if (/\/responses$/.test(ep)) return 'responses';

  // OpenAI-compatible base: GPT models are Responses-only there.
  if (/\/inference\/openai(\/|$)/.test(ep) && isResponsesModel(model)) return 'responses';

  return 'chat';
}

/** GPT / o-series / chatgpt ids are served by the Responses API on OpenCode. */
export function isResponsesModel(model: string): boolean {
  return /^(gpt-|chatgpt-|o\d)/i.test((model || '').trim());
}

/** Full URL for a completion request, given an endpoint that may already be one. */
export function completionUrl(endpoint: string, protocol: LLMProtocol): string {
  const base = (endpoint || '').trim().replace(/\/+$/, '');
  if (protocol === 'responses') return /\/responses$/.test(base) ? base : `${base}/responses`;
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}

/**
 * Human label for the settings panel, so "why does my model not work" has a
 * visible answer instead of a hidden branch in the client.
 */
export function protocolLabel(protocol: LLMProtocol): string {
  return protocol === 'responses' ? 'OpenAI Responses' : 'Chat Completions';
}
