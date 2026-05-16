import { describe, it, expect } from 'vitest';
import { corpusHash, loadSnapshot, makeSnapshot } from './snapshot';

describe('corpusHash', () => {
  it('is order-independent and content-sensitive', () => {
    const a = corpusHash([{ path: 'a.md', content: 'x' }, { path: 'b.md', content: 'y' }]);
    const b = corpusHash([{ path: 'b.md', content: 'y' }, { path: 'a.md', content: 'x' }]);
    expect(a).toBe(b);
    expect(corpusHash([{ path: 'a.md', content: 'x2' }, { path: 'b.md', content: 'y' }])).not.toBe(a);
    expect(corpusHash([{ path: 'a2.md', content: 'x' }, { path: 'b.md', content: 'y' }])).not.toBe(a);
  });

  it('is stable (regression pin)', () => {
    expect(corpusHash([])).toBe('cbf29ce484222325');
  });
});

describe('snapshot load/save', () => {
  const expected = { specgenVersion: '1.0', collectionId: 'src/specs', corpusHash: 'abc' };

  it('round-trips a valid snapshot', () => {
    const snap = makeSnapshot('1.0', 'src/specs', 'abc', [{ id: 'x' }]);
    const loaded = loadSnapshot<{ id: string }>(JSON.stringify(snap), expected);
    expect(loaded?.nodes).toEqual([{ id: 'x' }]);
  });

  it('rejects mismatched hash, version, collection, v1, and garbage', () => {
    const snap = JSON.stringify(makeSnapshot('1.0', 'src/specs', 'abc', []));
    expect(loadSnapshot(snap, { ...expected, corpusHash: 'zzz' })).toBeNull();
    expect(loadSnapshot(snap, { ...expected, specgenVersion: '2.0' })).toBeNull();
    expect(loadSnapshot(snap, { ...expected, collectionId: 'other' })).toBeNull();
    expect(loadSnapshot(JSON.stringify({ v: 1, nodes: [] }), expected)).toBeNull();
    expect(loadSnapshot('not json', expected)).toBeNull();
    expect(loadSnapshot(null, expected)).toBeNull();
  });
});
