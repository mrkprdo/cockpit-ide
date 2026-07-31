// SPECGEN runtime — pure "Constellation" flock physics for the SpecsMap canvas.
// No DOM, no timers. Deterministic given a phase function, so the module is
// unit-testable in isolation (mirrors layout.ts's role for the stack view).
//
// Model (all accelerations in px/s^2):
//   1. Edge springs   — connected nodes are pulled together toward a rest
//      length derived from their widths (they "flock close").
//   2. Pair repulsion — every node pair inside a radius repels (unconnected
//      nodes drift apart; also keeps dense clusters from collapsing).
//   3. Centering      — soft pull toward the world origin so the whole flock
//      floats in space near where the stack view was fitted.
//   4. Wander         — small per-node sinusoidal noise for a living feel.
//   5. Integration    — semi-implicit Euler with damping + speed clamp.
//   6. Collision      — positional rect separation so nodes never overlap.
//   7. World bounds   — hard clamp so nothing escapes forever.

export interface FlockBody {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
}

export interface FlockEdge {
  source: string;
  target: string;
}

export interface FlockOptions {
  /** Extra gap beyond half-widths for connected pairs (px). */
  restGap?: number;
  /** Spring constant (1/s^2). */
  edgeStiffness?: number;
  /** Repulsion acts inside this distance (px). */
  repulsionRadius?: number;
  /** Pair repulsion coefficient (px^2/s^2); force = k / dist. */
  repulsion?: number;
  /** Velocity damping (1/s). */
  damping?: number;
  /** Pull toward origin (1/s^2). */
  centering?: number;
  /** Wander noise amplitude (px/s^2); 0 = settle statically. */
  wander?: number;
  /** Wander oscillation frequency (rad/s). */
  wanderFreq?: number;
  /** Hard speed limit (px/s). */
  maxSpeed?: number;
  /** Seconds per step. */
  dt?: number;
  /** Positional collision resolution iterations per step. */
  collisionIterations?: number;
  /** Minimum gap between node rects (px). */
  collisionPadding?: number;
  /** Simulation clock (s) — used by the wander term. */
  t?: number;
  /** Per-body phase in [0, 2π) — decorrelates wander between nodes. */
  phase?: (id: string) => number;
}

export const DEFAULT_FLOCK_OPTIONS: Required<FlockOptions> = {
  restGap: 44,
  edgeStiffness: 2.5,
  repulsionRadius: 300,
  repulsion: 2500,
  damping: 2.0,
  centering: 0.04,
  wander: 0,
  wanderFreq: 0.6,
  maxSpeed: 150,
  dt: 1 / 60,
  collisionIterations: 3,
  collisionPadding: 6,
  t: 0,
  phase: () => 0,
};

/** World-space hard limit — bodies are clamped inside this square. */
export const FLOCK_WORLD_LIMIT = 4000;

/** Build the spring set from SpecNodes: dependency edges + ui-of edges. */
export function createFlockEdges(
  nodes: Array<{ id: string; deps: string[]; uiChildId?: string; parentId?: string }>,
): FlockEdge[] {
  const edges: FlockEdge[] = [];
  const ids = new Set(nodes.map(n => n.id));
  for (const n of nodes) {
    for (const d of n.deps) {
      if (d !== n.id && ids.has(d)) edges.push({ source: n.id, target: d });
    }
    if (n.uiChildId && ids.has(n.uiChildId)) edges.push({ source: n.id, target: n.uiChildId });
    if (n.parentId && ids.has(n.parentId)) edges.push({ source: n.id, target: n.parentId });
  }
  return edges;
}

/** Initialize bodies at the given node positions with zero velocity. */
export function createFlockBodies(
  nodes: Array<{ id: string; x: number; y: number; w: number; h: number }>,
): Map<string, FlockBody> {
  const bodies = new Map<string, FlockBody>();
  for (const n of nodes) {
    bodies.set(n.id, { id: n.id, x: n.x, y: n.y, vx: 0, vy: 0, w: n.w, h: n.h });
  }
  return bodies;
}

/**
 * Advance the simulation one tick. Mutates `bodies` in place.
 * Returns the same map for convenience.
 */
export function flockStep(
  bodies: Map<string, FlockBody>,
  edges: FlockEdge[],
  opts: FlockOptions = {},
): Map<string, FlockBody> {
  const o: Required<FlockOptions> = { ...DEFAULT_FLOCK_OPTIONS, ...opts };
  const dt = o.dt;
  const arr = [...bodies.values()];
  if (arr.length < 2) return bodies;

  const ax = new Map<string, number>();
  const ay = new Map<string, number>();
  for (const b of arr) { ax.set(b.id, 0); ay.set(b.id, 0); }

  // 1. Edge springs — connected nodes float closer. For an edge a→b the unit
  //    vector points from a to b; when dist > rest the spring pulls a toward b
  //    (+fx on a) and b toward a (−fx on b). When dist < rest it pushes apart.
  for (const e of edges) {
    const a = bodies.get(e.source);
    const b = bodies.get(e.target);
    if (!a || !b || a.id === b.id) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const rest = (a.w + b.w) / 2 + o.restGap;
    const f = o.edgeStiffness * (dist - rest);
    const fx = (dx / dist) * f;
    const fy = (dy / dist) * f;
    ax.set(a.id, (ax.get(a.id) ?? 0) + fx);
    ay.set(a.id, (ay.get(a.id) ?? 0) + fy);
    ax.set(b.id, (ax.get(b.id) ?? 0) - fx);
    ay.set(b.id, (ay.get(b.id) ?? 0) - fy);
  }

  // 2. Pair repulsion — unconnected (and over-close) nodes drift apart.
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    for (let j = i + 1; j < arr.length; j++) {
      const b = arr[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= o.repulsionRadius) continue;
      const d = Math.max(40, dist); // clamp: no singularity at contact
      const f = o.repulsion / d;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      ax.set(a.id, (ax.get(a.id) ?? 0) - fx);
      ay.set(a.id, (ay.get(a.id) ?? 0) - fy);
      ax.set(b.id, (ax.get(b.id) ?? 0) + fx);
      ay.set(b.id, (ay.get(b.id) ?? 0) + fy);
    }
  }

  // 3. Centering + wander.
  for (const b of arr) {
    ax.set(b.id, (ax.get(b.id) ?? 0) - o.centering * b.x);
    ay.set(b.id, (ay.get(b.id) ?? 0) - o.centering * b.y);
    if (o.wander > 0) {
      const ph = o.phase(b.id);
      ax.set(b.id, (ax.get(b.id) ?? 0) + o.wander * Math.sin(o.t * o.wanderFreq + ph));
      ay.set(b.id, (ay.get(b.id) ?? 0) + o.wander * Math.cos(o.t * o.wanderFreq + ph * 1.7));
    }
  }

  // 4. Semi-implicit Euler integration + damping + speed clamp.
  for (const b of arr) {
    b.vx = (b.vx + (ax.get(b.id) ?? 0) * dt) * (1 - Math.min(1, o.damping * dt));
    b.vy = (b.vy + (ay.get(b.id) ?? 0) * dt) * (1 - Math.min(1, o.damping * dt));
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > o.maxSpeed) {
      b.vx *= o.maxSpeed / sp;
      b.vy *= o.maxSpeed / sp;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  // 5. Positional collision separation — nodes must not overlap.
  const pad = o.collisionPadding;
  for (let it = 0; it < o.collisionIterations; it++) {
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minX = (a.w + b.w) / 2 + pad;
        const minY = (a.h + b.h) / 2 + pad;
        const ox = minX - Math.abs(dx);
        const oy = minY - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        if (ox < oy) {
          const s = (dx < 0 ? -1 : 1) * (ox / 2);
          a.x -= s;
          b.x += s;
        } else {
          const s = (dy < 0 ? -1 : 1) * (oy / 2);
          a.y -= s;
          b.y += s;
        }
      }
    }
  }

  // 6. World bounds — bounce back from the hard limit.
  for (const b of arr) {
    if (Math.abs(b.x) > FLOCK_WORLD_LIMIT) {
      b.x = Math.sign(b.x) * FLOCK_WORLD_LIMIT;
      b.vx *= -0.4;
    }
    if (Math.abs(b.y) > FLOCK_WORLD_LIMIT) {
      b.y = Math.sign(b.y) * FLOCK_WORLD_LIMIT;
      b.vy *= -0.4;
    }
  }

  return bodies;
}
