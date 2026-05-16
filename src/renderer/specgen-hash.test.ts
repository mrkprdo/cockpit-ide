import { describe, it, expect } from 'vitest';
import { SPECGEN_HASH, SPECGEN_VERSION } from './specgen-hash';

describe('specgen-hash', () => {
  it('SPECGEN_HASH is a non-empty string', () => {
    expect(typeof SPECGEN_HASH).toBe('string');
    expect(SPECGEN_HASH.length).toBeGreaterThan(0);
  });

  it('SPECGEN_HASH is a valid hex string (64 hex chars for SHA-256)', () => {
    expect(SPECGEN_HASH).toMatch(/^[0-9a-f]{64}$/);
  });

  it('SPECGEN_VERSION is a non-empty string', () => {
    expect(typeof SPECGEN_VERSION).toBe('string');
    expect(SPECGEN_VERSION.length).toBeGreaterThan(0);
  });

  it('SPECGEN_VERSION follows date-based format', () => {
    expect(SPECGEN_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
