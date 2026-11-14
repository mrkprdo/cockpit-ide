import { describe, it, expect } from 'vitest';
import {
  classifyLLMError,
  describeLLMError,
  parseHttpError,
  LLMConfigError,
  API_KEY_CONSOLE_URL,
} from './llm-errors';

describe('parseHttpError', () => {
  it('reads the OpenCode error envelope (type + code + message)', () => {
    const body = JSON.stringify({
      error: {
        type: 'authentication_error',
        code: 'api_key_expired',
        message: 'This API key has expired.',
      },
    });
    const err = parseHttpError(401, body, null);
    expect(err.status).toBe(401);
    expect(err.type).toBe('authentication_error');
    expect(err.code).toBe('api_key_expired');
    expect(err.detail).toContain('expired');
    // Legacy shape stays intact for older call sites / log greps.
    expect(err.message).toContain('API error 401');
  });

  it('tolerates a bare { message } body and non-JSON bodies', () => {
    expect(parseHttpError(500, JSON.stringify({ message: 'boom' })).detail).toBe('boom');
    expect(parseHttpError(502, '<html>bad gateway</html>').detail).toContain('bad gateway');
  });

  it('parses retry-after in seconds or as a date', () => {
    expect(parseHttpError(429, '{}', '3').retryAfterMs).toBe(3000);
    expect(parseHttpError(429, '{}', null).retryAfterMs).toBeNull();
  });
});

describe('classifyLLMError', () => {
  it('classifies an expired key as auth', () => {
    const err = parseHttpError(401, JSON.stringify({ error: { code: 'api_key_expired', message: 'expired' } }));
    expect(classifyLLMError(err)).toBe('auth');
    expect(describeLLMError(err).action?.url).toBe(API_KEY_CONSOLE_URL);
  });

  it('classifies the free-tier 403 as forbidden, not auth', () => {
    const err = parseHttpError(403, JSON.stringify({ error: { message: 'Free models are not available to this client' } }));
    expect(classifyLLMError(err)).toBe('forbidden');
    expect(describeLLMError(err).message).toContain('only work inside the OpenCode app');
  });

  it('classifies 404 and deprecation wording as model errors', () => {
    expect(classifyLLMError(parseHttpError(404, '{}'))).toBe('model');
    expect(classifyLLMError(parseHttpError(400, 'chat completions deprecated for this model'))).toBe('model');
  });

  it('classifies 429, 5xx and network failures as transient', () => {
    expect(classifyLLMError(parseHttpError(429, '{}'))).toBe('rate-limit');
    expect(classifyLLMError(parseHttpError(503, '{}'))).toBe('server');
    expect(classifyLLMError(new TypeError('fetch failed'))).toBe('network');
  });

  it('never retries an abort', () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    expect(classifyLLMError(e)).toBe('aborted');
  });

  it('carries the kind of a config refusal', () => {
    expect(classifyLLMError(new LLMConfigError('unsupported', 'unsupported'))).toBe('unsupported');
  });

  it('still understands the legacy "API error 401" string form', () => {
    expect(classifyLLMError(new Error('API error 401: {"error":"nope"}'))).toBe('auth');
  });
});
