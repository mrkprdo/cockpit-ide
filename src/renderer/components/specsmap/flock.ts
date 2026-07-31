// SpecsMap "Constellation" view interaction module.
//
// Owns the requestAnimationFrame loop that drives the pure flock physics:
// each tick it steps the 3D simulation, projects every body through a pinhole
// camera onto the 2D canvas (near = bigger, painted on top), writes the
// projected positions back onto the SpecNode records and the .sm-node DOM
// elements, then asks the host to refresh SVG edge paths so edges follow the
// moving nodes. All graph/DOM reads go through FlockHost; `onChange` lets the
// host refresh its chrome. Rendering stays in SpecsMapPlugin; this module owns
// the animation clock.

import {
  createFlockBodies,
  createFlockEdges,
  flockStep,
  projectFlock,
  type FlockBody,
  type FlockCamera,
  type FlockEdge,
  type FlockProjection,
} from '../../specs/flock';
import type { SpecNode } from '../../specs/layout';

export interface FlockHost {
  getNodes(): SpecNode[];
  getNodeEls(): Map<string, HTMLDivElement>;
  getEdgePaths(): SVGPathElement[];
  /** Called after positions are written each frame (edge re-curve, etc.). */
  onFrame(): void;
}

const WANDER = 14;       // px/s^2 — gentle life (was 40: too jittery)
const WANDER_FREQ = 0.6; // rad/s
const MAX_FRAME_DT = 0.05; // clamp big gaps (tab switches, debugger pauses)
const Z_BASE = 100;        // CSS z-index floor for the depth-sorted stack
/** Orbit sensitivity — pixels of drag per radian of camera rotation. */
export const ORBIT_SENSITIVITY = 260;
/** Pitch clamp — keeps the horizon sensible and avoids gimbal flipping. */
const PITCH_LIMIT = Math.PI / 2.3;
/** Fraction of the card's shorter side a constellation node circle spans. */
const FLOCK_CIRCLE_RATIO = 0.8;

/** Tuned for the circle constellation: connected pairs hold at their spring
 *  rest length (no repulsion fight), unconnected / isolated neighbors repel at
 *  full strength so they spread into a clean field, a mild velocity-matching
 *  term smooths the motion, and the first ~6 s anneal wander/alignment down so
 *  the flock settles instead of pinballing. */
const FLOCK_TUNING = {
  align: 0.6,
  alignRadius: 150,
  anneal: 6,
  annealFloor: 0.4,
} as const;

/** Circle diameter (px) for a node in the Constellation view — the flock
 *  physics collides against this square footprint and the element is styled
 *  as a circle of the same diameter. Shared by the controller and the host. */
export function flockNodeDiameter(n: { w: number; h: number }): number {
  return Math.round(Math.min(n.w, n.h) * FLOCK_CIRCLE_RATIO);
}

export class FlockController {
  private _active = false;
  private bodies = new Map<string, FlockBody>();
  private edges: FlockEdge[] = [];
  private rafId: number | null = null;
  private last = 0;
  private t = 0;
  private wander = WANDER;
  private camera: FlockCamera = { yaw: 0, pitch: 0 };

  // rAF with a setTimeout fallback (jsdom test env / non-browser contexts).
  private readonly raf: (cb: FrameRequestCallback) => number;
  private readonly caf: (id: number) => void;

  constructor(private host: FlockHost, private onChange: () => void) {
    const hasRaf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function';
    this.raf = hasRaf
      ? (cb) => window.requestAnimationFrame(cb)
      : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
    this.caf = hasRaf
      ? (id) => window.cancelAnimationFrame(id)
      : (id) => clearTimeout(id);
  }

  get active(): boolean { return this._active; }

  /** Initialize bodies at current node positions and start animating.
   *  Bodies use the circle footprint (`flockNodeDiameter`) so the physics
   *  separates the visual dots, not the full card rectangles. */
  start(): void {
    const nodes = this.host.getNodes();
    if (nodes.length === 0) return;
    this.bodies = createFlockBodies(nodes.map(n => ({
      id: n.id, x: n.x, y: n.y,
      w: flockNodeDiameter(n), h: flockNodeDiameter(n),
    })));
    this.edges = createFlockEdges(nodes);
    this.wander = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : WANDER;
    this._active = true;
    this.last = performance.now();
    this.t = 0;
    this.rafId = this.raf(this.tick);
    this.onChange();
  }

  /** Cancel the loop and clear simulation state. */
  stop(): void {
    if (this.rafId !== null) this.caf(this.rafId);
    this.rafId = null;
    this._active = false;
    this.bodies.clear();
    this.edges = [];
  }

  toggle(): void {
    if (this._active) this.stop();
    else this.start();
  }

  /** Stop + start — re-seeds bodies from current positions (e.g. after reload). */
  restart(): void {
    this.stop();
    this.start();
  }

  /** Current orbit camera (yaw/pitch in radians). */
  getCamera(): FlockCamera {
    return { ...this.camera };
  }

  /** Absolute camera orbit. `pitch` is clamped to the allowed tilt range. */
  setCamera(yaw: number, pitch: number): void {
    this.camera.yaw = yaw;
    this.camera.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  }

  /** Reset the orbit camera back to the identity (straight-on) view. */
  resetCamera(): void {
    this.camera.yaw = 0;
    this.camera.pitch = 0;
  }

  private tick = (now: number): void => {
    if (!this._active) return;
    const dt = Math.min(MAX_FRAME_DT, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.t += dt;

    flockStep(this.bodies, this.edges, {
      dt,
      t: this.t,
      wander: this.wander,
      phase: (id) => this.phaseOf(id),
      ...FLOCK_TUNING,
    });

    const nodes = this.host.getNodes();
    const els = this.host.getNodeEls();
    const byId = new Map(nodes.map(n => [n.id, n]));

    // Project the 3D bodies through the orbit pinhole camera, then paint far→near.
    const projections = new Map<string, FlockProjection>();
    for (const b of this.bodies.values()) projections.set(b.id, projectFlock(b, undefined, this.camera));
    const order = [...projections.keys()].sort(
      (a, b) => (projections.get(a)!.zIndex - projections.get(b)!.zIndex),
    );
    order.forEach((id, rank) => {
      const node = byId.get(id);
      const el = els.get(id);
      const p = projections.get(id)!;
      if (!node || !el) return;
      node.x = p.x;
      node.y = p.y;
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.transform = `scale(${p.scale})`;
      el.style.zIndex = String(Z_BASE + rank);
    });

    this.host.onFrame();
    this.rafId = this.raf(this.tick);
  };

  /** Deterministic per-node phase from the id string — decorrelates wander. */
  private phaseOf(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return ((h % 1000) / 1000) * Math.PI * 2;
  }
}
