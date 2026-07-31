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
//   2. Pair repulsion — only UNCONNECTED pairs inside a radius repel in 3D.
//      Connected pairs are exempt: their spacing is owned by the spring, so
//      the two forces never fight (the #1 cause of jitter and tangles).
//      Repulsion is NEVER annealed — isolated / unconnected nodes keep their
//      full separation force so they spread into a constellation field instead
//      of being pulled together into a blob by centering.
//   3. Alignment      — each body steers toward the mean velocity of nearby
//      neighbors, so the flock flows together instead of vibrating (the
//      "murmuration" smoothness). Default off; the host enables it.
//   4. Centering      — soft pull toward the world origin so the whole flock
//      floats in space near where the stack view was fitted (z weaker, so the
//      depth band fills before the plane crowds).
//   5. Wander         — small per-node sinusoidal noise for a living feel.
//   6. Anneal         — optional "cooling": during the first `anneal` seconds
//      alignment / wander ramp down to a floor so the flock settles into a
//      clean shape instead of pinballing forever. Springs and repulsion are
//      never cooled — structure and separation stay crisp.
//   7. Integration    — semi-implicit Euler with damping + speed clamp.
//   8. Collision      — positional separation; pairs near the same depth are
//      pushed apart in BOTH the plane and z, so nodes never overlap at the
//      same depth while depth-separated pairs may occlude (true 3D).
//   9. World bounds   — hard clamp so nothing escapes forever (x/y ±4000,
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
  /** Velocity-matching weight (1/s) — steer toward the mean velocity of
   *  nearby neighbors so the flock flows together. 0 = disabled. */
  align?: number;
  /** Alignment acts inside this 3D distance (px). */
  alignRadius?: number;
  /** Annealing time constant (s) — 0 = no cooling. When > 0, alignment and
   *  wander ramp down to `annealFloor` over the first `anneal` seconds so the
   *  flock settles. Springs and repulsion are never cooled. */
  anneal?: number;
  /** Floor for the annealing ramp (0..1). */
  annealFloor?: number;
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
  repulsionRadius: 320,
  repulsion: 3600,
  damping: 2.2,
  centering: 0.04,
  centeringZ: 0.02,
  wander: 0,
  wanderFreq: 0.6,
  align: 0,
  alignRadius: 150,
  anneal: 0,
  annealFloor: 0.4,
  maxSpeed: 300,
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

/** Orbit camera for the pinhole projection — the flock is rotated around the
 *  world origin (roughly the flock centroid, since centering pulls bodies
 *  there) so orbiting keeps the constellation roughly centered on screen. */
export interface FlockCamera {
  /** Rotation around the world Y axis (rad) — left/right orbit. */
  yaw: number;
  /** Rotation around the world X axis (rad) — up/down tilt. */
  pitch: number;
}

/** Identity camera — looking straight down the +z axis (no orbit). */
export const FLOCK_CAMERA_DEFAULT: FlockCamera = { yaw: 0, pitch: 0 };

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
 * When a `camera` is given the body is first rotated around the world origin
 * (yaw around Y, then pitch around X) so the viewer can orbit the flock and
 * see the depth band spread out instead of occluded behind the camera plane.
 * The identity camera is the default, so existing callers keep their shape.
 */
export function projectFlock(
  b: FlockBody,
  focal: number = FLOCK_FOCAL,
  camera: FlockCamera = FLOCK_CAMERA_DEFAULT,
): FlockProjection {
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cx = Math.cos(camera.pitch);
  const sx = Math.sin(camera.pitch);
  // Rotate the body around the world Y axis, then the world X axis.
  const x1 = b.x * cy + b.z * sy;
  const z1 = -b.x * sy + b.z * cy;
  const y1 = b.y * cx - z1 * sx;
  const z2 = b.y * sx + z1 * cx;
  // Clamp the depth below the focal plane so bodies that orbit past the camera
  // never mirror or explode — they just shrink to the scale floor off-screen.
  const depth = Math.min(z2, focal - 1);
  const raw = focal / Math.max(1, focal - depth);
  const scale = Math.max(FLOCK_SCALE_MIN, Math.min(FLOCK_SCALE_MAX, raw));
  return {
    x: x1 * scale,
    y: y1 * scale,
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

  // Annealing "cooling" — alignment / wander ramp down over the first `anneal`
  // seconds so the flock settles. Springs and repulsion are never cooled:
  // repulsion must keep its full strength so unconnected / isolated nodes stay
  // spread out instead of being pulled together by centering.
  const cool = o.anneal > 0 ? Math.max(o.annealFloor, 1 - o.t / o.anneal) : 1;

  // Connected pairs are exempt from repulsion: their spacing belongs to the
  // spring, so the two forces never fight each other into jitter/tangles.
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.source < e.target ? e.source + '\u0000' + e.target : e.target + '\u0000' + e.source);
  }

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

  // 2. Pair repulsion — only UNCONNECTED pairs inside the radius repel (3D),
  //    so crowded unconnected nodes spread apart and into depth. Connected
  //    pairs are skipped — the spring already owns their spacing, and letting
  //    repulsion fight it is what turned the view into a tangle.
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    for (let j = i + 1; j < arr.length; j++) {
      const b = arr[j];
      if (connected.has(a.id < b.id ? a.id + '\u0000' + b.id : b.id + '\u0000' + a.id)) continue;
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

  // 3. Alignment — steer each body toward the mean velocity of neighbors
  //    inside alignRadius. At rest this adds nothing; in motion it smooths
  //    the flow so the flock moves as one (the murmuration signature).
  if (o.align > 0) {
    const r2 = o.alignRadius * o.alignRadius;
    for (const a of arr) {
      let mvx = 0, mvy = 0, mvz = 0, n = 0;
      for (const b of arr) {
        if (a.id === b.id) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
        mvx += b.vx; mvy += b.vy; mvz += b.vz; n++;
      }
      if (n === 0) continue;
      const w = o.align * cool;
      ax.set(a.id, (ax.get(a.id) ?? 0) + (mvx / n - a.vx) * w);
      ay.set(a.id, (ay.get(a.id) ?? 0) + (mvy / n - a.vy) * w);
      az.set(a.id, (az.get(a.id) ?? 0) + (mvz / n - a.vz) * w);
    }
  }

  // 4. Centering + wander (z wander at reduced amplitude).
  for (const b of arr) {
    ax.set(b.id, (ax.get(b.id) ?? 0) - o.centering * b.x);
    ay.set(b.id, (ay.get(b.id) ?? 0) - o.centering * b.y);
    az.set(b.id, (az.get(b.id) ?? 0) - o.centeringZ * b.z);
    if (o.wander > 0) {
      const w = o.wander * cool;
      const ph = o.phase(b.id);
      ax.set(b.id, (ax.get(b.id) ?? 0) + w * Math.sin(o.t * o.wanderFreq + ph));
      ay.set(b.id, (ay.get(b.id) ?? 0) + w * Math.cos(o.t * o.wanderFreq + ph * 1.7));
      az.set(b.id, (az.get(b.id) ?? 0) + w * 0.6 * Math.sin(o.t * o.wanderFreq * 0.9 + ph * 2.3));
    }
  }

  // 5. Semi-implicit Euler integration + damping + speed clamp (3D speed).
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

  // 6. Positional collision separation — nodes must not overlap at the same
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

  // 7. World bounds — bounce back from the hard limits.
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
