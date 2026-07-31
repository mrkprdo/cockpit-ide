import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { resolveModelLimit, providerForEndpoint, resetModelMetadataCache } from './model-metadata';

const DEV_DATA = {
  'opencode-go': {
    models: {
      'deepseek-v4-flash': {
        reasoning: true,
        limit: { context: 1000000, output: 384000 },
      },
    },
  },
  openai: {
    models: {
      'gpt-4o-mini': {
        limit: { context: 128000, output: 16384 },
      },
    },
  },
};

describe('model-metadata', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalLocalStorage: Storage;

  beforeEach(() => {
    resetModelMetadataCache();
    originalFetch = globalThis.fetch;
    originalLocalStorage = window.localStorage;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => DEV_DATA,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    // Clear any localStorage cache written by a previous test so the mocked
    // fetch actually runs. Tolerant of a stubbed storage implementation.
    try {
      window.localStorage.removeItem('cockpit.models-dev.cache');
    } catch { /* no-op */ }
    try {
      window.localStorage.clear?.();
    } catch { /* no-op */ }
  });

  it('resolves the official output/context limits for a Go model', async () => {
    const info = await resolveModelLimit('deepseek-v4-flash', 'https://opencode.ai/zen/go/v1');
    expect(info).toEqual({ maxOutput: 384000, maxContext: 1000000, reasoning: true });
  });

  it('searches all providers for a custom model id', async () => {
    const info = await resolveModelLimit('gpt-4o-mini', 'https://custom.example.com/v1');
    expect(info).toEqual({ maxOutput: 16384, maxContext: 128000, reasoning: false });
  });

  it('returns null for unknown models', async () => {
    const info = await resolveModelLimit('no-such-model', 'https://opencode.ai/zen/go/v1');
    expect(info).toBeNull();
  });

  it('returns null when the registry is unreachable', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const info = await resolveModelLimit('deepseek-v4-flash', 'https://opencode.ai/zen/go/v1');
    expect(info).toBeNull();
  });

  it('maps endpoints to providers', () => {
    expect(providerForEndpoint('https://opencode.ai/zen/go/v1')).toBe('opencode-go');
    expect(providerForEndpoint('https://opencode.ai/zen/v1')).toBe('opencode');
    expect(providerForEndpoint('https://api.openai.com/v1')).toBeNull();
  });
});
