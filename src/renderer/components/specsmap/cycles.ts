// SpecsMap cycle-detection + isolated-node highlight interaction.
//
// Owns cycle/isolated toggle state and the DOM highlight side effects that
// follow from it. All graph/DOM reads the host owns go through CyclesHost;
// `onChange` lets the host refresh its own chrome (button color, settings
// panel) after state changes here.

import { findCycles } from '../../specs/graph';
import type { SpecGraph } from '../../specs/types';
import { LAYER_COLORS_VAR, type SpecNode } from '../../specs/layout';

export const CYCLE_COLORS = ['#f87171', '#fb923c', '#fbbf24', '#f472b6', '#a78bfa'];

export interface CyclesHost {
  getGraph(): SpecGraph | null;
  getNodes(): SpecNode[];
  getNodeEls(): Map<string, HTMLDivElement>;
  getEdgePaths(): SVGPathElement[];
  getRefCount(id: string): number;
  getViewTransform(): { scale: number; panX: number; panY: number };
  svg: SVGSVGElement;
}

export class CyclesController {
  private _cycleMode = false;
  private _cycleSets: Set<string>[] = [];
  private _cycleLevel = 1;
  private _selectedCycleIndex: number | null = null;
  private _isolatedMode = false;

  constructor(private host: CyclesHost, private onChange: () => void) {}

  get cycleMode(): boolean { return this._cycleMode; }
  get cycleSets(): Set<string>[] { return this._cycleSets; }
  get cycleLevel(): number { return this._cycleLevel; }
  get selectedCycleIndex(): number | null { return this._selectedCycleIndex; }
  get isolatedMode(): boolean { return this._isolatedMode; }

  /** Clears all state without touching the DOM (caller is about to wipe/rebuild it). */
  reset(): void {
    this._cycleMode = false;
    this._cycleSets = [];
    this._cycleLevel = 1;
    this._selectedCycleIndex = null;
    this._isolatedMode = false;
  }

  toggleCycleMode(): void {
    if (this._cycleMode) {
      this._cycleMode = false;
      this._selectedCycleIndex = null;
      this.clearCycleHighlights();
      this._cycleSets = [];
    } else {
      this._cycleMode = true;
      this._cycleLevel = 1;
      this._selectedCycleIndex = null;
      const graph = this.host.getGraph();
      this._cycleSets = graph
        ? findCycles(graph).map(scc =>
            new Set(scc.map(gid => graph.nodes.get(gid)?.specFile ?? gid)))
        : [];
      this.applyCycleHighlights();
    }
    this.onChange();
  }

  setCycleLevel(lvl: number): void {
    if (lvl === this._cycleLevel) return;
    this._cycleLevel = lvl;
    this.applyCycleHighlights();
    this.onChange();
  }

  toggleIsolatedMode(): void {
    this._isolatedMode = !this._isolatedMode;
    if (this._isolatedMode) {
      this.applyIsolatedHighlights();
    } else {
      this.clearIsolatedHighlights();
    }
    this.onChange();
  }

  /** Hit-tests a viewport-space click against cycle edge midpoints. Returns true if handled. */
  handleViewportClick(cx: number, cy: number): boolean {
    if (!this._cycleMode || this._cycleSets.length === 0) return false;
    for (const hit of this.getCycleEdgeHitTargets()) {
      const dist = Math.sqrt((cx - hit.cx) ** 2 + (cy - hit.cy) ** 2);
      if (dist < 18) {
        this._selectedCycleIndex = this._selectedCycleIndex === hit.cycleIdx ? null : hit.cycleIdx;
        this.applyCycleHighlights();
        this.onChange();
        return true;
      }
    }
    return false;
  }

  private addIsolatedBorderRect(worldX: number, worldY: number, w: number, h: number): void {
    const ns = 'http://www.w3.org/2000/svg';
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', `${worldX + 1}`);
    rect.setAttribute('y', `${worldY + 1}`);
    rect.setAttribute('width', `${w - 2}`);
    rect.setAttribute('height', `${h - 2}`);
    rect.setAttribute('rx', '8');
    rect.setAttribute('ry', '8');
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', '#fbbf24');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('stroke-dasharray', '6 3');
    rect.classList.add('sm-isolated-border');
    rect.style.pointerEvents = 'none';
    rect.dataset.isolated = '1';
    const svg = this.host.svg;
    let group = svg.querySelector('#sm-isolated-group') as SVGGElement | null;
    if (!group) {
      group = document.createElementNS(ns, 'g');
      group.id = 'sm-isolated-group';
      svg.appendChild(group);
    }
    group.appendChild(rect);
  }

  private removeIsolatedBorderRects(): void {
    const group = this.host.svg.querySelector('#sm-isolated-group');
    if (group) group.innerHTML = '';
  }

  private applyIsolatedHighlights(): void {
    const nodes = this.host.getNodes();
    const nodeEls = this.host.getNodeEls();
    const isolatedIds = new Set<string>();
    for (const n of nodes) {
      if (n.isUI) continue;
      const refCount = this.host.getRefCount(n.id);
      if (n.deps.length === 0 && refCount === 0) isolatedIds.add(n.id);
    }
    if (isolatedIds.size === 0) {
      this._isolatedMode = false;
      return;
    }

    const addRects = (nid: string) => {
      const node = nodes.find(n => n.id === nid);
      if (node) this.addIsolatedBorderRect(node.x, node.y, node.w, node.h);
    };

    if (this._cycleMode) {
      for (const [nid, el] of nodeEls) {
        if (isolatedIds.has(nid) && !this._cycleSets.some(c => c.has(nid))) {
          el.classList.add('sm-isolated');
          el.style.opacity = '1';
          addRects(nid);
        }
      }
      return;
    }

    for (const [nid, el] of nodeEls) {
      if (isolatedIds.has(nid)) {
        el.classList.add('sm-isolated');
        el.style.opacity = '1';
        addRects(nid);
      } else {
        el.style.opacity = '0.14';
      }
    }
    for (const path of this.host.getEdgePaths()) {
      if (path.dataset.etype !== 'ui') path.setAttribute('opacity', '0.04');
    }
  }

  private clearIsolatedHighlights(): void {
    this.removeIsolatedBorderRects();
    for (const [, el] of this.host.getNodeEls()) el.classList.remove('sm-isolated');
    if (this._cycleMode) { this.applyCycleHighlights(); return; }
    for (const [, el] of this.host.getNodeEls()) {
      el.style.opacity = '';
      el.style.borderColor = '';
      el.style.borderStyle = '';
      el.style.boxShadow = '';
    }
    for (const path of this.host.getEdgePaths()) {
      const etype = path.dataset.etype!;
      const layer = path.dataset.layer ?? '';
      if (etype === 'dep') {
        path.style.stroke = LAYER_COLORS_VAR[layer] ?? 'var(--secondary)';
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('marker-end', `url(#sm-mk-${layer})`);
        path.setAttribute('opacity', '0.3');
      } else if (etype === 'glow') {
        path.setAttribute('opacity', '0.06');
      } else if (etype === 'ui') {
        path.setAttribute('opacity', '0.25');
      }
      path.style.stroke = '';
    }
  }

  private getCycleEdgeHitTargets(): Array<{ cx: number; cy: number; cycleIdx: number }> {
    const hits: Array<{ cx: number; cy: number; cycleIdx: number }> = [];
    const nodes = this.host.getNodes();
    const { scale, panX, panY } = this.host.getViewTransform();
    const cycleNodeIds = new Set<string>();
    for (const cycle of this._cycleSets) {
      for (const id of cycle) cycleNodeIds.add(id);
    }
    for (const node of nodes) {
      if (!cycleNodeIds.has(node.id)) continue;
      for (const depId of node.deps) {
        if (!cycleNodeIds.has(depId)) continue;
        const cycleIdx = this._cycleSets.findIndex(c => c.has(node.id) && c.has(depId));
        if (cycleIdx === -1) continue;
        const target = nodes.find(n => n.id === depId);
        if (!target) continue;
        const midX = (node.x + node.w / 2 + target.x + target.w / 2) / 2;
        const midY = (node.y + node.h / 2 + target.y + target.h / 2) / 2;
        hits.push({ cx: midX * scale + panX, cy: midY * scale + panY, cycleIdx });
      }
    }
    return hits;
  }

  private getAffectedNodes(cycleNodeIds: Set<string>): Set<string> {
    if (this._cycleLevel <= 1) return cycleNodeIds;

    const nodes = this.host.getNodes();
    const affected = new Set(cycleNodeIds);
    const adj = new Map<string, string[]>();
    for (const n of nodes) adj.set(n.id, n.deps);

    const queue = [...cycleNodeIds];
    let hops = 0;
    while (queue.length > 0 && hops < this._cycleLevel) {
      const levelSize = queue.length;
      for (let i = 0; i < levelSize; i++) {
        const id = queue.shift()!;
        for (const dep of adj.get(id) ?? []) {
          if (!affected.has(dep)) { affected.add(dep); queue.push(dep); }
        }
        for (const n of nodes) {
          if (n.deps.includes(id) && !affected.has(n.id)) { affected.add(n.id); queue.push(n.id); }
        }
      }
      hops++;
    }
    return affected;
  }

  private applyCycleHighlights(): void {
    if (this._cycleSets.length === 0) return;
    const nodeEls = this.host.getNodeEls();

    const cycleNodeIds = new Set<string>();
    for (const cycle of this._cycleSets) {
      for (const id of cycle) cycleNodeIds.add(id);
    }

    const highlighted = this.getAffectedNodes(cycleNodeIds);

    for (const [nid, el] of nodeEls) {
      if (highlighted.has(nid)) {
        if (cycleNodeIds.has(nid)) {
          const cycleIdx = this._cycleSets.findIndex(c => c.has(nid));
          const isSelected = cycleIdx === this._selectedCycleIndex;
          const c = CYCLE_COLORS[cycleIdx % CYCLE_COLORS.length];
          el.style.borderColor = c;
          el.style.borderStyle = 'solid';
          el.style.boxShadow = isSelected
            ? `0 0 0 2px ${c}, 0 0 20px ${c}55`
            : `0 0 0 1px ${c}44, 0 0 14px ${c}33`;
          el.style.opacity = isSelected ? '1' : (this._selectedCycleIndex !== null ? '0.5' : '1');
        } else {
          const c = '#94a3b8';
          el.style.borderColor = c;
          el.style.borderStyle = 'solid';
          el.style.boxShadow = `0 0 0 1px ${c}33, 0 0 10px ${c}22`;
          el.style.opacity = '0.85';
        }
      } else {
        el.style.opacity = '0.14';
      }
    }

    const isConnected = (src: string, tgt: string) =>
      highlighted.has(src) && highlighted.has(tgt);

    for (const path of this.host.getEdgePaths()) {
      const src = path.dataset.source!;
      const tgt = path.dataset.target!;
      const etype = path.dataset.etype!;
      const bothInCycle = cycleNodeIds.has(src) && cycleNodeIds.has(tgt);
      const sameCycle = bothInCycle && this._cycleSets.some(c => c.has(src) && c.has(tgt));
      if (sameCycle) {
        const cycleIdx = this._cycleSets.findIndex(c => c.has(src));
        const isSelected = cycleIdx === this._selectedCycleIndex;
        const c = CYCLE_COLORS[cycleIdx % CYCLE_COLORS.length];
        if (etype === 'glow') {
          path.style.stroke = c;
          path.setAttribute('opacity', isSelected ? '0.4' : '0.25');
        } else {
          path.style.stroke = c;
          path.setAttribute('opacity', isSelected ? '1' : (this._selectedCycleIndex !== null ? '0.3' : '1'));
          path.setAttribute('stroke-width', isSelected ? '4' : '2.5');
          path.classList.add('sm-edge-active');
          path.setAttribute('stroke-dasharray', '6 3');
          path.style.cursor = 'pointer';
        }
      } else if (isConnected(src, tgt) && etype !== 'glow') {
        path.setAttribute('opacity', '0.6');
      } else if (etype !== 'ui' || !isConnected(src, tgt)) {
        path.setAttribute('opacity', '0.04');
      }
    }
  }

  private clearCycleHighlights(): void {
    this.removeIsolatedBorderRects();
    for (const [, el] of this.host.getNodeEls()) {
      el.classList.remove('sm-isolated');
      el.style.opacity = '';
      el.style.borderColor = '';
      el.style.borderStyle = '';
      el.style.boxShadow = '';
    }
    for (const path of this.host.getEdgePaths()) {
      const etype = path.dataset.etype!;
      const layer = path.dataset.layer ?? '';
      path.classList.remove('sm-edge-active');
      path.removeAttribute('stroke-dasharray');
      path.style.cursor = '';
      if (etype === 'dep') {
        path.style.stroke = LAYER_COLORS_VAR[layer] ?? 'var(--secondary)';
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('marker-end', `url(#sm-mk-${layer})`);
        path.setAttribute('opacity', '0.3');
      } else if (etype === 'glow') {
        path.setAttribute('opacity', '0.06');
      } else if (etype === 'ui') {
        path.setAttribute('opacity', '0.25');
      }
      path.style.stroke = '';
    }
    if (this._isolatedMode) this.applyIsolatedHighlights();
  }
}
