// SpecsMap — graph rendering (refactor.md §A.4): the SVG edge layers, node
// DOM, hover/select highlighting, and pan/zoom animation. Owns the render-time
// derived state (nodeEls, cachedEdgePaths, selectedId, view transform); the
// corpus/graph reads flow through the injected SpecsData controller.

import {
  GRAPH_MARGIN, LAYER_COLORS_HEX, LAYER_COLORS_VAR, LAYER_LABELS, NODE_GAP, NODE_H,
  NODE_UI_H, NODE_UI_W, NODE_W, PANEL_W, PORT_OFFSET, type SpecNode,
} from '../../specs/layout';
import type { SpecsData } from './data';
import { esc } from './parse';

export interface GraphHost {
  svg: SVGSVGElement;
  nodeLayer: HTMLDivElement;
  viewport: HTMLDivElement;
  data: SpecsData;
  updateHeaderCounts(): void;
  openPanel(node: SpecNode): void;
  closePanel(resetZoom?: boolean): void;
  onSearchNodeSelected(id: string): void;
  isPanelShowingSettings(): boolean;
  isPanelOpen(): boolean;
  isCycleMode(): boolean;
  isSearchOpen(): boolean;
}

export class GraphRenderer {
  nodeEls = new Map<string, HTMLDivElement>();
  cachedEdgePaths: SVGPathElement[] = [];
  selectedId: string | null = null;
  panX = 0;
  panY = 0;
  scale = 1;
  fitScale = 1;

  constructor(private host: GraphHost) {}

  applyTransform(): void {
    const t = `translate(${this.panX}px,${this.panY}px) scale(${this.scale})`;
    this.host.nodeLayer.style.transform = t;
    this.host.nodeLayer.style.transformOrigin = '0 0';
    this.host.svg.style.transform = t;
    this.host.svg.style.transformOrigin = '0 0';
  }

  renderGraph(): void {
    this.host.nodeLayer.innerHTML = '';
    this.host.svg.innerHTML = '';
    this.nodeEls.clear();
    this.host.updateHeaderCounts();

    const nodeMap = new Map<string, SpecNode>(this.host.data.nodes.map(n => [n.id, n]));

    this.renderSVGDefs();
    this.renderLayerHeaders();
    this.renderEdges(nodeMap);

    for (const node of this.host.data.nodes) {
      const el = document.createElement('div');
      el.className = 'sm-node' + (node.isUI ? ' sm-node-ui' : '');
      el.dataset.id = node.id;
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      el.style.width = `${node.w}px`;
      el.style.height = `${node.h}px`;

      const colorVar = LAYER_COLORS_VAR[node.layer] ?? 'var(--secondary)';
      const colorHex = LAYER_COLORS_HEX[node.layer] ?? '#94a3b8';
      const depCount = node.deps.length;
      const refCount = this.host.data.refCounts.get(node.id) ?? 0;
      const layerLabel = LAYER_LABELS[node.layer] ?? node.layer;

      const portsHtml = node.isUI ? '' :
        `<span class="sm-port" style="top:-3px;left:calc(50% - ${PORT_OFFSET}px - 3px);background:${colorHex}" title="top-left: incoming"></span>` +
        `<span class="sm-port" style="top:-3px;left:calc(50% + ${PORT_OFFSET}px - 3px);background:${colorHex}" title="top-right: outgoing"></span>` +
        `<span class="sm-port" style="bottom:-3px;left:calc(50% - ${PORT_OFFSET}px - 3px);background:${colorHex}" title="bottom-left: outgoing"></span>` +
        `<span class="sm-port" style="bottom:-3px;left:calc(50% + ${PORT_OFFSET}px - 3px);background:${colorHex}" title="bottom-right: incoming"></span>`;

      if (node.isUI) {
        el.innerHTML =
          `<div class="sm-node-inner">` +
          `<div class="sm-node-head">` +
          `<span class="sm-dot" style="background:${colorHex};opacity:0.5"></span>` +
          `<span class="sm-name" style="opacity:0.7">${esc(node.name)}</span>` +
          `</div>` +
          `<div class="sm-file">${esc(node.specFile)}</div>` +
          `</div>` +
          portsHtml;
      } else {
        const depsHtml = depCount ? `<span style="color:${colorVar}">→&nbsp;${depCount}</span>` : '';
        const refsHtml = refCount ? `<span style="color:var(--tertiary)">←&nbsp;${refCount}</span>` : '';
        const isolatedHtml = !depCount && !refCount
          ? `<span style="color:var(--secondary);opacity:0.5">no links</span>` : '';
        const entryBadge = node.isEntry
          ? `<span style="font-size:11px;line-height:1;opacity:0.5;flex-shrink:0" title="Entry file: ${esc(node.entryPath)}">⚙</span>`
          : '';
        const sourceLabel = node.isEntry ? node.entryPath : node.specFile;

        el.innerHTML =
          `<div class="sm-node-inner">` +
          `<div class="sm-node-head">` +
          `<span class="sm-dot" style="background:${colorHex}"></span>` +
          `<span class="sm-name">${esc(node.name)}</span>` +
          entryBadge +
          `<span class="sm-layer-badge">${esc(layerLabel.toUpperCase())}</span>` +
          `</div>` +
          `<div class="sm-file">${esc(sourceLabel)}</div>` +
          `<div class="sm-meta">${depsHtml}${refsHtml}${isolatedHtml}</div>` +
          `</div>` +
          portsHtml;
      }

      el.addEventListener('mouseenter', () => this.hoverNode(node.id, true));
      el.addEventListener('mouseleave', () => this.hoverNode(node.id, false));
      el.addEventListener('click', (e) => { e.stopPropagation(); this.selectNode(node.id); });

      this.host.nodeLayer.appendChild(el);
      this.nodeEls.set(node.id, el);
    }

    this.fitGraph();
  }

  renderSVGDefs(): void {
    const ns = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(ns, 'defs');

    for (const [layer, hex] of Object.entries(LAYER_COLORS_HEX)) {
      const marker = document.createElementNS(ns, 'marker');
      marker.id = `sm-mk-${layer}`;
      marker.setAttribute('markerWidth', '7');
      marker.setAttribute('markerHeight', '7');
      marker.setAttribute('refX', '6');
      marker.setAttribute('refY', '3.5');
      marker.setAttribute('orient', 'auto');
      const arrow = document.createElementNS(ns, 'path');
      arrow.setAttribute('d', 'M0,0.5 L6,3.5 L0,6.5 Z');
      arrow.setAttribute('fill', hex);
      marker.appendChild(arrow);
      defs.appendChild(marker);
    }

    const hm = document.createElementNS(ns, 'marker');
    hm.id = 'sm-mk-hover';
    hm.setAttribute('markerWidth', '7');
    hm.setAttribute('markerHeight', '7');
    hm.setAttribute('refX', '6');
    hm.setAttribute('refY', '3.5');
    hm.setAttribute('orient', 'auto');
    const ha = document.createElementNS(ns, 'path');
    ha.setAttribute('d', 'M0,0.5 L6,3.5 L0,6.5 Z');
    ha.style.fill = 'var(--accent)';
    hm.appendChild(ha);
    defs.appendChild(hm);

    this.host.svg.appendChild(defs);
  }

  renderLayerHeaders(): void {
    const layerYMap = new Map<string, number>();
    for (const n of this.host.data.nodes) {
      if (n.isUI) continue;
      const prev = layerYMap.get(n.layer);
      if (prev === undefined || n.y < prev) layerYMap.set(n.layer, n.y);
    }

    const mainNodes = this.host.data.nodes.filter(n => !n.isUI);
    if (!mainNodes.length) return;
    const minX = Math.min(...mainNodes.map(n => n.x));

    for (const [layer, y] of layerYMap) {
      const label = document.createElement('div');
      label.className = 'sm-layer-header';
      label.textContent = (LAYER_LABELS[layer] ?? layer).toUpperCase();
      label.style.left = `${minX - 100}px`;
      label.style.top = `${y + NODE_H / 2 - 7}px`;
      label.style.color = LAYER_COLORS_VAR[layer] ?? 'var(--secondary)';
      label.style.width = '94px';
      label.style.textAlign = 'right';
      this.host.nodeLayer.appendChild(label);
    }
  }

  private curvePoints(src: SpecNode, tgt: SpecNode, uiPair: boolean) {
    if (uiPair) {
      const x1 = src.x + src.w / 2, y1 = src.y + src.h;
      const x2 = tgt.x + tgt.w / 2, y2 = tgt.y;
      const dy = y2 - y1;
      return { x1, y1, x2, y2, cx1: x1, cy1: y1 + dy * 0.5, cx2: x2, cy2: y2 - dy * 0.5 };
    }

    const srcCx = src.x + src.w / 2;
    const tgtCx = tgt.x + tgt.w / 2;
    const sameRow = Math.abs(src.y - tgt.y) < 4;

    if (sameRow) {
      const goRight = tgt.x > src.x;
      if (goRight) {
        const p1x = srcCx - PORT_OFFSET, p1y = src.y + src.h;
        const p2x = tgtCx + PORT_OFFSET, p2y = tgt.y + tgt.h;
        const midY = Math.max(p1y, p2y) + NODE_GAP;
        return { x1: p1x, y1: p1y, x2: p2x, y2: p2y, cx1: p1x, cy1: midY, cx2: p2x, cy2: midY };
      }
      const p1x = srcCx + PORT_OFFSET, p1y = src.y;
      const p2x = tgtCx - PORT_OFFSET, p2y = tgt.y;
      const midY = Math.min(p1y, p2y) - NODE_GAP;
      return { x1: p1x, y1: p1y, x2: p2x, y2: p2y, cx1: p1x, cy1: midY, cx2: p2x, cy2: midY };
    }

    if (src.y < tgt.y) {
      const p1x = srcCx - PORT_OFFSET, p1y = src.y + src.h;
      const p2x = tgtCx - PORT_OFFSET, p2y = tgt.y;
      const dy = p2y - p1y, dx = p2x - p1x;
      return { x1: p1x, y1: p1y, x2: p2x, y2: p2y, cx1: p1x + dx * 0.15, cy1: p1y + dy * 0.5, cx2: p2x - dx * 0.15, cy2: p2y - dy * 0.5 };
    }

    const p1x = srcCx + PORT_OFFSET, p1y = src.y;
    const p2x = tgtCx + PORT_OFFSET, p2y = tgt.y + tgt.h;
    const dy = p2y - p1y, dx = p2x - p1x;
    return { x1: p1x, y1: p1y, x2: p2x, y2: p2y, cx1: p1x + dx * 0.15, cy1: p1y + dy * 0.5, cx2: p2x - dx * 0.15, cy2: p2y - dy * 0.5 };
  }

  renderEdges(nodeMap: Map<string, SpecNode>): void {
    this.cachedEdgePaths = [];
    const ns = 'http://www.w3.org/2000/svg';

    const uiGroup = document.createElementNS(ns, 'g');
    for (const node of this.host.data.nodes) {
      if (!node.uiChildId) continue;
      const child = nodeMap.get(node.uiChildId);
      if (!child) continue;
      const pts = this.curvePoints(node, child, true);
      const d = `M${pts.x1},${pts.y1} C${pts.cx1},${pts.cy1} ${pts.cx2},${pts.cy2} ${pts.x2},${pts.y2}`;
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      p.style.stroke = LAYER_COLORS_VAR[node.layer] ?? 'var(--secondary)';
      p.setAttribute('stroke-width', '1');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-dasharray', '3 3');
      p.setAttribute('opacity', '0.25');
      p.dataset.source = node.id;
      p.dataset.target = child.id;
      p.dataset.etype = 'ui';
      uiGroup.appendChild(p);
      this.cachedEdgePaths.push(p);
    }
    this.host.svg.appendChild(uiGroup);

    const depGroup = document.createElementNS(ns, 'g');
    for (const node of this.host.data.nodes) {
      const colorVar = LAYER_COLORS_VAR[node.layer] ?? 'var(--secondary)';
      for (const depId of node.deps) {
        const target = nodeMap.get(depId);
        if (!target) continue;
        const pts = this.curvePoints(node, target, false);
        const d = `M${pts.x1},${pts.y1} C${pts.cx1},${pts.cy1} ${pts.cx2},${pts.cy2} ${pts.x2},${pts.y2}`;

        const glow = document.createElementNS(ns, 'path');
        glow.setAttribute('d', d);
        glow.style.stroke = colorVar;
        glow.setAttribute('stroke-width', '6');
        glow.setAttribute('fill', 'none');
        glow.setAttribute('opacity', '0.06');
        glow.dataset.source = node.id;
        glow.dataset.target = depId;
        glow.dataset.etype = 'glow';
        glow.dataset.layer = node.layer;
        depGroup.appendChild(glow);
        this.cachedEdgePaths.push(glow);

        const line = document.createElementNS(ns, 'path');
        line.setAttribute('d', d);
        line.style.stroke = colorVar;
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('fill', 'none');
        line.setAttribute('opacity', '0.3');
        line.setAttribute('marker-end', `url(#sm-mk-${node.layer})`);
        line.dataset.source = node.id;
        line.dataset.target = depId;
        line.dataset.etype = 'dep';
        line.dataset.layer = node.layer;
        depGroup.appendChild(line);
        this.cachedEdgePaths.push(line);
      }
    }
    this.host.svg.appendChild(depGroup);
  }

  hoverNode(id: string, enter: boolean): void {
    if (this.host.isCycleMode() || this.host.isSearchOpen()) return;
    const connected = new Set<string>([id]);
    for (const node of this.host.data.nodes) {
      if (node.id === id) {
        for (const d of node.deps) connected.add(d);
        if (node.parentId) connected.add(node.parentId);
        if (node.uiChildId) connected.add(node.uiChildId);
      }
      if (node.deps.includes(id)) connected.add(node.id);
      if (node.uiChildId === id) connected.add(node.id);
      if (node.parentId === id) connected.add(node.id);
    }

    for (const path of this.cachedEdgePaths) {
      const src = path.dataset.source!;
      const tgt = path.dataset.target!;
      const etype = path.dataset.etype!;
      const layer = path.dataset.layer ?? '';
      const isMine = src === id || tgt === id;

      if (enter) {
        if (isMine) {
          if (etype === 'glow') {
            path.setAttribute('opacity', '0.2');
          } else if (etype === 'ui') {
            path.setAttribute('opacity', '0.6');
          } else {
            path.setAttribute('opacity', '1');
            path.style.stroke = 'var(--accent)';
            path.setAttribute('stroke-width', '2');
            path.setAttribute('marker-end', 'url(#sm-mk-hover)');
            path.setAttribute('stroke-dasharray', '6 3');
            path.classList.add('sm-edge-active');
          }
        } else {
          path.setAttribute('opacity', etype === 'glow' ? '0.01' : '0.04');
        }
      } else {
        path.classList.remove('sm-edge-active');
        path.removeAttribute('stroke-dasharray');
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
      }
    }

    for (const [nid, el] of this.nodeEls) {
      if (enter) {
        if (connected.has(nid)) {
          const nc = this.host.data.nodes.find(n => n.id === nid)!;
          const hex = LAYER_COLORS_HEX[nc.layer] ?? '#94a3b8';
          el.style.borderColor = hex;
          el.style.boxShadow = `0 0 0 1px ${hex}33, 0 0 14px ${hex}22`;
          el.style.opacity = '1';
        } else {
          el.style.opacity = '0.14';
          el.style.borderColor = '';
          el.style.boxShadow = '';
        }
      } else {
        el.style.opacity = '';
        el.style.borderColor = nid === this.selectedId ? LAYER_COLORS_HEX[this.host.data.nodes.find(n => n.id === nid)?.layer ?? ''] ?? '' : '';
        el.style.boxShadow = '';
      }
    }
  }

  selectNode(id: string, fromSearch = false): void {
    // Close settings panel if open
    if (this.host.isPanelShowingSettings()) {
      this.host.closePanel();
    }
    // Deselect previous
    if (this.selectedId) {
      const prev = this.nodeEls.get(this.selectedId);
      if (prev) prev.classList.remove('sm-selected');
    }

    // Toggle behavior: clicking same node closes panel
    // From search navigation: re-select without toggle
    if (this.selectedId === id && this.host.isPanelOpen() && !fromSearch) {
      this.host.closePanel(true);
      return;
    }

    this.selectedId = id;
    const el = this.nodeEls.get(id);
    if (el) el.classList.add('sm-selected');

    const node = this.host.data.nodes.find(n => n.id === id);
    if (!node) return;

    this.zoomToNode(node);
    this.host.openPanel(node);

    // If search is open, highlight keyword in selected node name
    this.host.onSearchNodeSelected(id);
  }

  zoomToNode(node: SpecNode): void {
    const rect = this.host.viewport.getBoundingClientRect();
    const cw = rect.width || 800;
    const ch = rect.height || 600;
    const nw = node.w;
    const nh = node.h;

    const availableW = cw - PANEL_W;
    const targetScale = Math.min(availableW / (nw * 3), ch / (nh * 3), 1.5);
    const scale = Math.max(targetScale, this.fitScale);
    const targetPanX = (availableW - nw * scale) / 2 - node.x * scale;
    const targetPanY = (ch - nh * scale) / 2 - node.y * scale;

    this.animateTo(targetPanX, targetPanY, scale, 300);
  }

  animateTo(toPanX: number, toPanY: number, toScale: number, duration = 300): void {
    const startPanX = this.panX;
    const startPanY = this.panY;
    const startScale = this.scale;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.panX = startPanX + (toPanX - startPanX) * ease;
      this.panY = startPanY + (toPanY - startPanY) * ease;
      this.scale = startScale + (toScale - startScale) * ease;
      this.applyTransform();
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  getFitTarget(): { scale: number; panX: number; panY: number } | null {
    if (this.host.data.nodes.length === 0) return null;
    const rect = this.host.viewport.getBoundingClientRect();
    const cw = rect.width || 800;
    const ch = rect.height || 600;

    const minX = Math.min(...this.host.data.nodes.map(n => n.x));
    const maxX = Math.max(...this.host.data.nodes.map(n => n.x + n.w));
    const minY = Math.min(...this.host.data.nodes.map(n => n.y));
    const maxY = Math.max(...this.host.data.nodes.map(n => n.y + n.h));
    const graphW = maxX - minX;
    const graphH = maxY - minY;

    const fitX = (cw - GRAPH_MARGIN * 2) / graphW;
    const fitY = (ch - GRAPH_MARGIN * 2) / graphH;
    const scale = Math.min(fitX, fitY, 1.0);
    return {
      scale,
      panX: (cw - graphW * scale) / 2 - minX * scale,
      panY: (ch - graphH * scale) / 2 - minY * scale,
    };
  }

  fitGraph(): void {
    const target = this.getFitTarget();
    if (!target) return;
    this.fitScale = target.scale;
    this.scale = target.scale;
    this.panX = target.panX;
    this.panY = target.panY;
    this.applyTransform();
  }
}
