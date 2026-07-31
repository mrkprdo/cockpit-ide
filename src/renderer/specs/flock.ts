// SPECGEN runtime — pure "Constellation" flock physics for the SpecsMap canvas.
// No DOM, no timers. Deterministic given a phase function, so the module is
// unit-testable in isolation (mirrors layout.ts's role for the stack view).
//
// The simulation lives in 3D (x, y, z) so crowded nodes separate in DEPTH
// instead of fighting for 2D space; `projectFlock` then maps each body to the
// 2D canvas with a pinhole perspective (near = bigger + painted on top).
//
// Model (all accelerations in px/s^2):
//   1. Edge springs   — connected nodes are pulled together toward a rest
//      length derived from their widths (they "flock close", in 3D).
//   2. Pair repulsion — every node pair inside a radius repels in 3D
//      (unconnected nodes drift apart; dense clusters separate in depth).
//   3. Centering      — soft pull toward the world origin so the whole flock
//      floats in space near where the stack view was fitted (z weaker, so the
//      depth band fills before the plane crowds).
//   4. Wander         — small per-node sinusoidal noise for a living feel.
//   5. Integration    — semi-implicit Euler with damping + speed clamp.
//   6. Collision      — positional separation; pairs near the same depth are
//      pushed apart in BOTH the plane and z, so nodes never overlap at the
//      same depth while depth-separated pairs may occlude (true 3D).
//   7. World bounds   — hard clamp so nothing escapes forever (x/y ±4000,
//      z ±FLOCK_Z_LIMIT).

export interface FlockBody {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
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
  /** Repulsion acts inside this 3D distance (px). */
  repulsionRadius?: number;
  /** Pair repulsion coefficient (px^2/s^2); force = k / dist. */
  repulsion?: number;
  /** Velocity damping (1/s). */
  damping?: number;
  /** Pull toward origin in the plane (1/s^2). */
  centering?: number;
  /** Pull toward origin in depth (1/s^2) — weaker so z fills before the plane. */
  centeringZ?: number;
  /** Wander noise amplitude (px/s^2); 0 = settle statically. */
  wander?: number;
  /** Wander oscillation frequency (rad/s). */
  wanderFreq?: number;
  /** Hard speed limit (px/s), applied to the 3D speed. */
  maxSpeed?: number;
  /** Seconds per step. */
  dt?: number;
  /** Positional collision resolution iterations per step. */
  collisionIterations?: number;
  /** Minimum gap between node rects (px). */
  collisionPadding?: number;
  /** Same-depth threshold (px) — overlapping pairs closer than this separate in z. */
  zCollisionDepth?: number;
  /** Simulation clock (s) — used by the wander term. */
  t?: number;
  /** Per-body phase in [0, 2π) — decorrelates wander between nodes. */
  phase?: (id: string) => number;
}

export const DEFAULT_FLOCK_OPTIONS: Required<FlockOptions> = {
  restGap: 44,
  edgeStiffness: 4.0,
  repulsionRadius: 340,
  repulsion: 4200,
  damping: 1.4,
  centering: 0.03,
  centeringZ: 0.02,
  wander: 0,
  wanderFreq: 0.6,
  maxSpeed: 700,
  dt: 1 / 60,
  collisionIterations: 3,
  collisionPadding: 6,
  zCollisionDepth: 70,
  t: 0,
  phase: () => 0,
};

/** World-space hard limit (x/y) — bodies are clamped inside this square. */
export const FLOCK_WORLD_LIMIT = 4000;
/** World-space hard limit (z/depth) — the visible depth band. */
export const FLOCK_Z_LIMIT = 900;
/** Pinhole camera focal length (px) used by `projectFlock`. */
export const FLOCK_FOCAL = 1600;
/** Perspective scale clamps — nodes never shrink below / blow past these. */
export const FLOCK_SCALE_MIN = 0.5;
export const FLOCK_SCALE_MAX = 2;

export interface FlockProjection {
  /** Projected top-left x (world px, ready for style.left). */
  x: number;
  /** Projected top-left y (world px, ready for style.top). */
  y: number;
  /** Perspective size factor — 1 sits on the camera plane. */
  scale: number;
  /** Paint-order key — higher = nearer the viewer. */
  zIndex: number;
}

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

/** Initialize bodies at the given node positions with zero velocity (z = 0). */
export function createFlockBodies(
  nodes: Array<{ id: string; x: number; y: number; w: number; h: number }>,
): Map<string, FlockBody> {
  const bodies = new Map<string, FlockBody>();
  for (const n of nodes) {
    bodies.set(n.id, { id: n.id, x: n.x, y: n.y, z: 0, vx: 0, vy: 0, vz: 0, w: n.w, h: n.h });
  }
  return bodies;
}

/**
 * Pinhole-perspective projection of a 3D body onto the 2D canvas.
 * Nearer bodies (z > 0) render bigger and paint on top of farther ones.
 */
export function projectFlock(b: FlockBody, focal: number = FLOCK_FOCAL): FlockProjection {
  const raw = focal / Math.max(1, focal - b.z);
  const scale = Math.max(FLOCK_SCALE_MIN, Math.min(FLOCK_SCALE_MAX, raw));
  return {
    x: b.x * scale,
    y: b.y * scale,
    scale,
    zIndex: Math.round(scale * 100),
  };
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
  const az = new Map<string, number>();
  for (const b of arr) { ax.set(b.id, 0); ay.set(b.id, 0); az.set(b.id, 0); }

  // 1. Edge springs — connected nodes float closer (in 3D). For an edge a→b
  //    the unit vector points from a to b; when dist > rest the spring pulls a
  //    toward b (+f on a) and b toward a (−f on b). When dist < rest it pushes
  //    apart.
  for (const e of edges) {
    const a = bodies.get(e.source);
    const b = bodies.get(e.target);
    if (!a || !b || a.id === b.id) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const rest = (a.w + b.w) / 2 + o.restGap;
    const f = o.edgeStiffness * (dist - rest);
    const fx = (dx / dist) * f;
    const fy = (dy / dist) * f;
    const fz = (dz / dist) * f;
    ax.set(a.id, (ax.get(a.id) ?? 0) + fx);
    ay.set(a.id, (ay.get(a.id) ?? 0) + fy);
    az.set(a.id, (az.get(a.id) ?? 0) + fz);
    ax.set(b.id, (ax.get(b.id) ?? 0) - fx);
    ay.set(b.id, (ay.get(b.id) ?? 0) - fy);
    az.set(b.id, (az.get(b.id) ?? 0) - fz);
  }

  // 2. Pair repulsion — unconnected (and over-close) nodes drift apart in 3D,
  //    so crowded nodes spread into depth instead of fighting for the plane.
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    for (let j = i + 1; j < arr.length; j++) {
      const b = arr[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist >= o.repulsionRadius) continue;
      const d = Math.max(40, dist); // clamp: no singularity at contact
      const f = o.repulsion / d;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      const fz = (dz / d) * f;
      ax.set(a.id, (ax.get(a.id) ?? 0) - fx);
      ay.set(a.id, (ay.get(a.id) ?? 0) - fy);
      az.set(a.id, (az.get(a.id) ?? 0) - fz);
      ax.set(b.id, (ax.get(b.id) ?? 0) + fx);
      ay.set(b.id, (ay.get(b.id) ?? 0) + fy);
      az.set(b.id, (az.get(b.id) ?? 0) + fz);
    }
  }

  // 3. Centering + wander (z wander at reduced amplitude).
  for (const b of arr) {
    ax.set(b.id, (ax.get(b.id) ?? 0) - o.centering * b.x);
    ay.set(b.id, (ay.get(b.id) ?? 0) - o.centering * b.y);
    az.set(b.id, (az.get(b.id) ?? 0) - o.centeringZ * b.z);
    if (o.wander > 0) {
      const ph = o.phase(b.id);
      ax.set(b.id, (ax.get(b.id) ?? 0) + o.wander * Math.sin(o.t * o.wanderFreq + ph));
      ay.set(b.id, (ay.get(b.id) ?? 0) + o.wander * Math.cos(o.t * o.wanderFreq + ph * 1.7));
      az.set(b.id, (az.get(b.id) ?? 0) + o.wander * 0.6 * Math.sin(o.t * o.wanderFreq * 0.9 + ph * 2.3));
    }
  }

  // 4. Semi-implicit Euler integration + damping + speed clamp (3D speed).
  for (const b of arr) {
    b.vx = (b.vx + (ax.get(b.id) ?? 0) * dt) * (1 - Math.min(1, o.damping * dt));
    b.vy = (b.vy + (ay.get(b.id) ?? 0) * dt) * (1 - Math.min(1, o.damping * dt));
    b.vz = (b.vz + (az.get(b.id) ?? 0) * dt) * (1 - Math.min(1, o.damping * dt));
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    if (sp > o.maxSpeed) {
      b.vx *= o.maxSpeed / sp;
      b.vy *= o.maxSpeed / sp;
      b.vz *= o.maxSpeed / sp;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
  }

  // 5. Positional collision separation — nodes must not overlap at the same
  //    depth. Pairs overlapping in the plane are separated; pairs closer than
  //    zCollisionDepth are ALSO pushed apart in depth, so crowded nodes spread
  //    into 3D. Pairs far apart in depth may occlude in projection — the
  //    nearer one paints on top (true 3D), handled by projectFlock/z-index.
  const pad = o.collisionPadding;
  for (let it = 0; it < o.collisionIterations; it++) {
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const minX = (a.w + b.w) / 2 + pad;
        const minY = (a.h + b.h) / 2 + pad;
        const ox = minX - Math.abs(dx);
        const oy = minY - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        if (Math.abs(dz) < o.zCollisionDepth) {
          // Same depth layer: separate in z so they stop fighting for 2D space.
          const need = (o.zCollisionDepth - Math.abs(dz)) / 2;
          const zDir = dz === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dz);
          a.z -= zDir * need;
          b.z += zDir * need;
        }
        // Plane separation (always) — keeps same-depth overlap impossible.
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

  // 6. World bounds — bounce back from the hard limits.
  for (const b of arr) {
    if (Math.abs(b.x) > FLOCK_WORLD_LIMIT) {
      b.x = Math.sign(b.x) * FLOCK_WORLD_LIMIT;
      b.vx *= -0.4;
    }
    if (Math.abs(b.y) > FLOCK_WORLD_LIMIT) {
      b.y = Math.sign(b.y) * FLOCK_WORLD_LIMIT;
      b.vy *= -0.4;
    }
    if (Math.abs(b.z) > FLOCK_Z_LIMIT) {
      b.z = Math.sign(b.z) * FLOCK_Z_LIMIT;
      b.vz *= -0.4;
    }
  }

  return bodies;
}
