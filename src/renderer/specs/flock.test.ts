import { describe, it, expect } from 'vitest';
import {
  createFlockBodies,
  createFlockEdges,
  flockStep,
  projectFlock,
  DEFAULT_FLOCK_OPTIONS,
  FLOCK_Z_LIMIT,
  FLOCK_FOCAL,
  FLOCK_SCALE_MIN,
  FLOCK_SCALE_MAX,
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

function dist(a: { x: number; y: number; z?: number }, b: { x: number; y: number; z?: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function run(bodies: ReturnType<typeof createFlockBodies>, edges: ReturnType<typeof createFlockEdges>, steps = 600, opts: Record<string, unknown> = {}) {
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

describe('projectFlock', () => {
  it('projects 3D positions onto the 2D canvas with perspective', () => {
    const near = projectFlock({ id: 'n', x: 100, y: 200, z: 300, vx: 0, vy: 0, vz: 0, w: 280, h: 100 });
    const far = projectFlock({ id: 'f', x: 100, y: 200, z: -300, vx: 0, vy: 0, vz: 0, w: 280, h: 100 });
    // Nearer bodies project larger and closer to the origin on screen.
    expect(near.scale).toBeGreaterThan(1);
    expect(far.scale).toBeLessThan(1);
    expect(near.zIndex).toBeGreaterThan(far.zIndex);
    // x/y scale with depth (pinhole: screen = world * f/(f−z)).
    expect(near.x).toBeCloseTo(100 * near.scale, 6);
    expect(far.y).toBeCloseTo(200 * far.scale, 6);
  });

  it('clamps the perspective scale so nodes never vanish or explode', () => {
    const huge = projectFlock({ id: 'h', x: 0, y: 0, z: FLOCK_Z_LIMIT, vx: 0, vy: 0, vz: 0, w: 280, h: 100 });
    const deep = projectFlock({ id: 'd', x: 0, y: 0, z: -FLOCK_Z_LIMIT, vx: 0, vy: 0, vz: 0, w: 280, h: 100 });
    expect(huge.scale).toBeLessThanOrEqual(FLOCK_SCALE_MAX);
    expect(deep.scale).toBeGreaterThanOrEqual(FLOCK_SCALE_MIN);
    // Within the depth band the raw projection is used (no clamp).
    const mid = projectFlock({ id: 'm', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, w: 280, h: 100 });
    expect(mid.scale).toBeCloseTo(1, 6);
    expect(mid.x).toBeCloseTo(0, 6);
  });

  it('maps the depth band to a monotonic z-order key', () => {
    const p = (z: number) => projectFlock({ id: 'x', x: 0, y: 0, z, vx: 0, vy: 0, vz: 0, w: 280, h: 100 });
    expect(p(100).zIndex).toBeGreaterThan(p(0).zIndex);
    expect(p(0).zIndex).toBeGreaterThan(p(-100).zIndex);
    expect(p(FLOCK_Z_LIMIT).zIndex).toBeGreaterThan(p(-FLOCK_Z_LIMIT).zIndex);
  });
});

describe('flockStep', () => {
  it('settles connected nodes near the spring rest length (flock closer, in 3D)', () => {
    const { bodies, edges } = makeFixture();
    run(bodies, edges);
    const a = bodies.get('a')!;
    const b = bodies.get('b')!;
    const c = bodies.get('c')!;
    const rest = NODE_W + DEFAULT_FLOCK_OPTIONS.restGap; // 324
    expect(dist(a, b)).toBeGreaterThan(rest - 70);
    expect(dist(a, b)).toBeLessThan(rest + 70);
    expect(dist(b, c)).toBeGreaterThan(rest - 70);
    expect(dist(b, c)).toBeLessThan(rest + 70);
  });

  it('never lets two nodes overlap at the same depth (3D rect separation invariant)', () => {
    const { bodies, edges } = makeFixture();
    run(bodies, edges);
    const arr = [...bodies.values()];
    const pad = DEFAULT_FLOCK_OPTIONS.collisionPadding;
    const zDepth = DEFAULT_FLOCK_OPTIONS.zCollisionDepth;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const dx = Math.abs(b.x - a.x);
        const dy = Math.abs(b.y - a.y);
        const dz = Math.abs(b.z - a.z);
        const minX = (a.w + b.w) / 2 + pad;
        const minY = (a.h + b.h) / 2 + pad;
        // Either separated in the plane, or separated in depth.
        expect(dx >= minX - 0.5 || dy >= minY - 0.5 || dz >= zDepth - 0.5).toBe(true);
      }
    }
  });

  it('resolves same-plane collisions by separating in DEPTH (not just 2D space)', () => {
    const bodies = createFlockBodies([
      { id: 'a', x: 0, y: 0, w: NODE_W, h: NODE_H },
      { id: 'b', x: 20, y: 10, w: NODE_W, h: NODE_H },  // fully overlapping in the plane
    ]);
    for (let i = 0; i < 120; i++) flockStep(bodies, [], { t: i / 60 });
    const a = bodies.get('a')!;
    const b = bodies.get('b')!;
    expect(Math.abs(b.z - a.z)).toBeGreaterThan(DEFAULT_FLOCK_OPTIONS.zCollisionDepth - 0.5);
  });

  it('keeps isolated nodes out of the connected cluster (repel without)', () => {
    const { bodies, edges } = makeFixture();
    run(bodies, edges);
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
      expect(body.z).toBeCloseTo(b2.get(id)!.z, 9);
    }
  });

  it('respects the max speed limit even with strong wander (3D speed)', () => {
    const { bodies, edges } = makeFixture();
    for (let i = 0; i < 60; i++) {
      flockStep(bodies, edges, {
        wander: 500,
        t: i / 60,
      });
    }
    for (const b of bodies.values()) {
      expect(Math.hypot(b.vx, b.vy, b.vz)).toBeLessThanOrEqual(DEFAULT_FLOCK_OPTIONS.maxSpeed + 1e-6);
    }
  });

  it('clamps bodies inside the world bounds (plane and depth)', () => {
    const { bodies, edges } = makeFixture();
    // Give every body a huge outward velocity to try to escape.
    for (const b of bodies.values()) {
      b.vx = 9999;
      b.vy = 9999;
      b.vz = 9999;
    }
    for (let i = 0; i < 600; i++) flockStep(bodies, edges, { t: i / 60 });
    for (const b of bodies.values()) {
      expect(Math.abs(b.x)).toBeLessThanOrEqual(4000 + 1e-6);
      expect(Math.abs(b.y)).toBeLessThanOrEqual(4000 + 1e-6);
      expect(Math.abs(b.z)).toBeLessThanOrEqual(FLOCK_Z_LIMIT + 1e-6);
    }
  });

  it('is a no-op for an empty or single-body map', () => {
    const bodies = createFlockBodies([{ id: 'solo', x: 10, y: 20, w: 280, h: 100 }]);
    flockStep(bodies, []);
    expect(bodies.get('solo')).toMatchObject({ x: 10, y: 20, z: 0 });
  });

  it('uses the pinhole focal length in projections by default', () => {
    const b = { id: 'p', x: 10, y: 10, z: 0, vx: 0, vy: 0, vz: 0, w: 280, h: 100 };
    const p = projectFlock(b);
    // z=0 sits exactly on the camera plane: scale 1, position unchanged.
    expect(p.scale).toBeCloseTo(1, 9);
    expect(p.x).toBeCloseTo(10, 9);
    expect(p.y).toBeCloseTo(10, 9);
    expect(FLOCK_FOCAL).toBeGreaterThan(FLOCK_Z_LIMIT);
  });
});
