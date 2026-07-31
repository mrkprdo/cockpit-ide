import { describe, it, expect } from 'vitest';
import {
  createFlockBodies,
  createFlockEdges,
  flockStep,
  DEFAULT_FLOCK_OPTIONS,
} from './flock';

// ── Fixture ──────────────────────────────────────────────────────────────────

interface FixtureNode {
  id: string;
  deps: string[];
  uiChildId?: string;
  parentId?: string;
}

const NODE_W = 280;
const NODE_H = 100;

function makeNodes(ids: string[]): Array<{ id: string; x: number; y: number; w: number; h: number; deps: string[] }> {
  return ids.map((id, i) => ({
    id,
    x: i * 340 - (ids.length * 170),
    y: i * 140,
    w: NODE_W,
    h: NODE_H,
    deps: [],
  }));
}

/** Chain A→B→C plus three isolated nodes. */
function makeFixture() {
  const raw = makeNodes(['a', 'b', 'c', 'd', 'e', 'f']);
  const withEdges: FixtureNode[] = [
    { id: 'a', deps: ['b'] },
    { id: 'b', deps: ['c'] },
    { id: 'c', deps: [] },
    { id: 'd', deps: [] },
    { id: 'e', deps: [] },
    { id: 'f', deps: [] },
  ];
  const bodies = createFlockBodies(raw.map(r => ({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h })));
  const edges = createFlockEdges(withEdges);
  return { bodies, edges };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function run(bodies: ReturnType<typeof createFlockBodies>, edges: ReturnType<typeof createFlockEdges>, steps = 300, opts: Record<string, unknown> = {}) {
  for (let i = 0; i < steps; i++) {
    flockStep(bodies, edges, { ...opts, t: i / 60 });
  }
  return bodies;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createFlockEdges', () => {
  it('builds dependency edges and ui-of edges, skipping self-loops', () => {
    const edges = createFlockEdges([
      { id: 'a', deps: ['b', 'a'] },               // self-loop 'a' skipped
      { id: 'b', deps: [] },
      { id: 'parent', deps: [], uiChildId: 'ui' },
      { id: 'ui', deps: [], parentId: 'parent' },
      { id: 'ghost', deps: ['missing'] },          // unresolved dep skipped
    ]);
    expect(edges).toEqual([
      { source: 'a', target: 'b' },
      { source: 'parent', target: 'ui' },
      { source: 'ui', target: 'parent' },
    ]);
  });
});

describe('flockStep', () => {
  it('settles connected nodes near the spring rest length (flock closer)', () => {
    const { bodies, edges } = makeFixture();
    run(bodies, edges, 600);
    const a = bodies.get('a')!;
    const b = bodies.get('b')!;
    const c = bodies.get('c')!;
    const rest = NODE_W + DEFAULT_FLOCK_OPTIONS.restGap; // 324
    expect(dist(a, b)).toBeGreaterThan(rest - 70);
    expect(dist(a, b)).toBeLessThan(rest + 70);
    expect(dist(b, c)).toBeGreaterThan(rest - 70);
    expect(dist(b, c)).toBeLessThan(rest + 70);
  });

  it('never lets two nodes overlap (rect separation invariant)', () => {
    const { bodies, edges } = makeFixture();
    run(bodies, edges, 600);
    const arr = [...bodies.values()];
    const pad = DEFAULT_FLOCK_OPTIONS.collisionPadding;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const dx = Math.abs(b.x - a.x);
        const dy = Math.abs(b.y - a.y);
        const minX = (a.w + b.w) / 2 + pad;
        const minY = (a.h + b.h) / 2 + pad;
        expect(dx >= minX - 0.5 || dy >= minY - 0.5).toBe(true);
      }
    }
  });

  it('keeps isolated nodes out of the connected cluster (repel without)', () => {
    const { bodies, edges } = makeFixture();
    run(bodies, edges, 600);
    const clusterIds = ['a', 'b', 'c'];
    for (const isoId of ['d', 'e', 'f']) {
      const iso = bodies.get(isoId)!;
      for (const cid of clusterIds) {
        const c = bodies.get(cid)!;
        expect(dist(iso, c)).toBeGreaterThan(150);
      }
    }
  });

  it('is deterministic for identical inputs and phases', () => {
    const { bodies: b1, edges } = makeFixture();
    const { bodies: b2 } = makeFixture();
    run(b1, edges, 120);
    run(b2, edges, 120);
    for (const [id, body] of b1) {
      expect(body.x).toBeCloseTo(b2.get(id)!.x, 9);
      expect(body.y).toBeCloseTo(b2.get(id)!.y, 9);
    }
  });

  it('respects the max speed limit even with strong wander', () => {
    const { bodies, edges } = makeFixture();
    for (let i = 0; i < 60; i++) {
      flockStep(bodies, edges, {
        wander: 500,
        t: i / 60,
      });
    }
    for (const b of bodies.values()) {
      expect(Math.hypot(b.vx, b.vy)).toBeLessThanOrEqual(DEFAULT_FLOCK_OPTIONS.maxSpeed + 1e-6);
    }
  });

  it('clamps bodies inside the world bounds', () => {
    const { bodies, edges } = makeFixture();
    // Give every body a huge outward velocity to try to escape.
    for (const b of bodies.values()) {
      b.vx = 9999;
      b.vy = 9999;
    }
    for (let i = 0; i < 600; i++) flockStep(bodies, edges, { t: i / 60 });
    for (const b of bodies.values()) {
      expect(Math.abs(b.x)).toBeLessThanOrEqual(4000 + 1e-6);
      expect(Math.abs(b.y)).toBeLessThanOrEqual(4000 + 1e-6);
    }
  });

  it('is a no-op for an empty or single-body map', () => {
    const bodies = createFlockBodies([{ id: 'solo', x: 10, y: 20, w: 280, h: 100 }]);
    flockStep(bodies, []);
    expect(bodies.get('solo')).toMatchObject({ x: 10, y: 20 });
  });
});
