import { describe, it, expect } from 'vitest';
import { isRetryableError, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS } from './llm-retry';

function apiError(status: number): Error {
  return new Error(`API error ${status}: boom`);
}

function abortError(): Error {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

describe('isRetryableError', () => {
  it('retries server-side errors and rate limits indefinitely', () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      expect(isRetryableError(apiError(status)), `HTTP ${status} should retry`).toBe(true);
    }
  });

  it('surfaces config/request errors immediately (retry would not help)', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryableError(apiError(status)), `HTTP ${status} should not retry`).toBe(false);
    }
  });

  it('retries network-level failures', () => {
    expect(isRetryableError(new TypeError('fetch failed'))).toBe(true);
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableError(new Error('ENOTFOUND api.openai.com'))).toBe(true);
    expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
  });

  it('never retries a user abort', () => {
    expect(isRetryableError(abortError())).toBe(false);
  });

  it('treats unknown errors as transient — indefinite retry is the ask', () => {
    expect(isRetryableError(new Error('mysterious failure'))).toBe(true);
    expect(isRetryableError('raw string')).toBe(true);
  });

  it('exposes a sane cooldown band', () => {
    expect(RETRY_BASE_DELAY_MS).toBeGreaterThan(0);
    expect(RETRY_MAX_DELAY_MS).toBeGreaterThan(RETRY_BASE_DELAY_MS);
  });
});
