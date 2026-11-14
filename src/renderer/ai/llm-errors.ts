// Typed LLM API errors + one classification table.
//
// Providers vary in how they report a failure. OpenCode's current envelope is
//   { "error": { "type": "authentication_error", "code": "api_key_expired", ... } }
// OpenAI-compatible gateways usually send { "error": { "message": "..." } } and
// some send a bare { "message": "..." }. Before this module every non-OK
// response became the string `API error 401: <raw json>` — which the user saw
// verbatim in the chat, with no hint that the fix was "renew your key".
//
// The `message` deliberately keeps the legacy `API error <status>: <body>` shape:
// older call sites and the retry regex still match it.

export type LLMErrorKind =
  | 'auth'        // bad/expired key, unauthenticated
  | 'forbidden'   // key valid but this client/model is not allowed
  | 'model'       // model or endpoint path does not exist (deprecated / moved)
  | 'bad-request' // malformed request the user must fix
  | 'rate-limit'
  | 'server'
  | 'network'
  | 'aborted'
  | 'unsupported' // protocol we cannot speak (e.g. Anthropic Messages)
  | 'unknown';

export class LLMHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly type: string,
    readonly detail: string,
    readonly retryAfterMs: number | null,
  ) {
    super(`API error ${status}: ${detail}`);
    this.name = 'LLMHttpError';
  }

  /** Provider's own one-liner (falls back to the raw body). */
  get providerMessage(): string {
    return this.detail;
  }
}

/** Error for a request we refuse to send at all (unsupported protocol, config). */
export class LLMConfigError extends Error {
  readonly kind: LLMErrorKind;
  constructor(message: string, kind: LLMErrorKind = 'unsupported') {
    super(message);
    this.name = 'LLMConfigError';
    this.kind = kind;
  }
}

function parseRetryAfter(header: string | null | undefined): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(header);
  if (!Number.isNaN(at)) return Math.max(0, at - Date.now());
  return null;
}

/** Build a typed error from a non-OK HTTP response. */
export function parseHttpError(status: number, rawBody: string, retryAfterHeader?: string | null): LLMHttpError {
  const body = (rawBody || '').trim();
  let type = '';
  let code = '';
  let message = '';
  try {
    const json = JSON.parse(body) as Record<string, any>;
    const e = (json?.error ?? json) as Record<string, any>;
    type = typeof e?.type === 'string' ? e.type : '';
    code = typeof e?.code === 'string' ? e.code : '';
    message = typeof e?.message === 'string' ? e.message : '';
  } catch {
    // Not JSON — keep the text body, it is usually a proxy's HTML error page.
  }
  return new LLMHttpError(status, code, type, message || body.slice(0, 400), parseRetryAfter(retryAfterHeader));
}

/** Classify any thrown error into one kind, regardless of its source. */
export function classifyLLMError(err: unknown): LLMErrorKind {
  const name = (err as { name?: string })?.name;
  if (name === 'AbortError') return 'aborted';
  if (err instanceof LLMConfigError) return err.kind;

  if (err instanceof LLMHttpError) {
    const blob = `${err.code} ${err.type} ${err.detail}`.toLowerCase();
    if (err.status === 401 || /api_key|authentication|unauthorized|expired|invalid.*key/.test(blob)) return 'auth';
    if (err.status === 403 || /forbidden|permission|not available|free tier|free-tier/.test(blob)) return 'forbidden';
    if (err.status === 404 || err.status === 410 || /deprecated|not found|no such model|unsupported model/.test(blob)) return 'model';
    if (err.status === 408) return 'network';           // request timeout — transient
    if (err.status === 425 || err.status === 429) return 'rate-limit';
    if (err.status >= 500) return 'server';
    if (err.status >= 400) return 'bad-request';
  }

  const msg = String((err as { message?: string })?.message ?? err ?? '');
  // Legacy string form still produced by any call site that throws manually.
  const status = /API error (\d{3})/.exec(msg);
  if (status) {
    const s = Number(status[1]);
    if (s === 401) return 'auth';
    if (s === 403) return 'forbidden';
    if (s === 404 || s === 410) return 'model';
    if (s === 408) return 'network';
    if (s === 425 || s === 429) return 'rate-limit';
    if (s >= 500) return 'server';
    if (s >= 400) return 'bad-request';
  }
  if (err instanceof TypeError || /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|network|temporary failure/i.test(msg)) {
    return 'network';
  }
  return 'unknown';
}

export interface LLMErrorDescription {
  kind: LLMErrorKind;
  /** Short headline for the chat/bubble. */
  title: string;
  /** Plain-text, user-actionable explanation (not HTML). */
  message: string;
  /** Optional next step rendered as a link/button. */
  action?: { label: string; url: string };
}

export const API_KEY_CONSOLE_URL = 'https://opencode.ai/console/account#api-keys';

/** Turn any error into something a human can act on. */
export function describeLLMError(err: unknown): LLMErrorDescription {
  const kind = classifyLLMError(err);
  const detail = (err as { detail?: string })?.detail
    || String((err as { message?: string })?.message ?? err ?? '')
    || 'Unknown error';

  switch (kind) {
    case 'auth':
      return {
        kind,
        title: 'API key rejected',
        message: `${detail} Create a new key in the OpenCode Console and paste it into Agent settings (Ctrl+Shift+A → gear).`,
        action: { label: 'Open API key console', url: API_KEY_CONSOLE_URL },
      };
    case 'forbidden':
      return {
        kind,
        title: 'Model not available to this client',
        message: `${detail} OpenCode's free chat models only work inside the OpenCode app — other clients get HTTP 403 even with a valid key. Use a paid model or a Go subscription.`,
      };
    case 'model':
      return {
        kind,
        title: 'Model or endpoint not found',
        message: `${detail} The model may have moved to a different API family (Chat Completions / Responses / Messages) or been retired. Check the endpoint and pick a model from the current list in Agent settings.`,
      };
    case 'unsupported':
      return { kind, title: 'Model needs a different API', message: detail };
    case 'rate-limit':
      return { kind, title: 'Rate limited', message: `${detail} Retrying automatically — press stop to give up.` };
    case 'server':
      return { kind, title: 'Provider error', message: `${detail} Retrying automatically — press stop to give up.` };
    case 'network':
      return { kind, title: 'Network error', message: `${detail} Check your connection; the request will be retried.` };
    case 'bad-request':
      return {
        kind,
        title: 'Request rejected',
        message: `${detail} If this mentions tools or a parameter, the model or endpoint may not support it — try another model.`,
      };
    case 'aborted':
      return { kind, title: 'Stopped', message: 'The run was stopped.' };
    default:
      return { kind, title: 'Request failed', message: detail.slice(0, 500) };
  }
}
