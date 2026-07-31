// SpecsMap "Constellation" view interaction module.
//
// Owns the requestAnimationFrame loop that drives the pure flock physics:
// each tick it steps the simulation, writes body positions back onto the
// SpecNode records and the .sm-node DOM elements, then asks the host to
// refresh SVG edge paths so edges follow the moving nodes. All graph/DOM
// reads go through FlockHost; `onChange` lets the host refresh its chrome.
// Rendering stays in SpecsMapPlugin; this module owns the animation clock.

import {
  createFlockBodies,
  createFlockEdges,
  flockStep,
  type FlockBody,
  type FlockEdge,
} from '../../specs/flock';
import type { SpecNode } from '../../specs/layout';

export interface FlockHost {
  getNodes(): SpecNode[];
  getNodeEls(): Map<string, HTMLDivElement>;
  getEdgePaths(): SVGPathElement[];
  /** Called after positions are written each frame (edge re-curve, etc.). */
  onFrame(): void;
}

const WANDER = 24;       // px/s^2 — gentle life
const WANDER_FREQ = 0.6; // rad/s
const MAX_FRAME_DT = 0.05; // clamp big gaps (tab switches, debugger pauses)

export class FlockController {
  private _active = false;
  private bodies = new Map<string, FlockBody>();
  private edges: FlockEdge[] = [];
  private rafId: number | null = null;
  private last = 0;
  private t = 0;
  private wander = WANDER;

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

  /** Initialize bodies at current node positions and start animating. */
  start(): void {
    const nodes = this.host.getNodes();
    if (nodes.length === 0) return;
    this.bodies = createFlockBodies(nodes);
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
    });

    const nodes = this.host.getNodes();
    const els = this.host.getNodeEls();
    const byId = new Map(nodes.map(n => [n.id, n]));
    for (const b of this.bodies.values()) {
      const node = byId.get(b.id);
      const el = els.get(b.id);
      if (!node || !el) continue;
      node.x = b.x;
      node.y = b.y;
      el.style.left = `${b.x}px`;
      el.style.top = `${b.y}px`;
    }

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
