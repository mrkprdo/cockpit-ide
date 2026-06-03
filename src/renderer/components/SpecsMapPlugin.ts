import SPECGEN_TEMPLATE from '../../../SPECGEN.md';
import { SPECGEN_HASH, SPECGEN_VERSION } from '../specgen-hash';

interface SpecData {
  name?: string;
  file?: string;
  parent?: string;
  layer?: string;
  dependencies?: Array<{ feature: string; file: string; usage?: string }>;
  referenced_by?: Array<{ feature: string; file: string }>;
  ui?: { spec: string };
  ipc?: string[];
  description?: string;
  [key: string]: unknown;
}

interface SnapNode {
  id: string;
  name: string;
  specFile: string;
  sourceFile: string;
  layer: string;
  isUI: boolean;
  parentId?: string;
  uiChildId?: string;
  deps: string[];
  raw: Record<string, unknown>;
}

interface SpecNode {
  id: string;
  name: string;
  specFile: string;
  sourceFile: string;
  layer: string;
  isUI: boolean;
  parentId?: string;
  uiChildId?: string;
  deps: string[];
  x: number;
  y: number;
  w: number;
  h: number;
}

const NODE_W = 280;
const NODE_H = 100;
const NODE_UI_W = 230;
const NODE_UI_H = 62;
const NODE_GAP = 28;
const MAX_PER_ROW = 10;
const LAYER_GAP = 60;
const UI_OFFSET_Y = 64;
const PANEL_W = 320;
const GRAPH_MARGIN = 80;
const PORT_OFFSET = 28;

const LAYER_ORDER = ['foundation', 'core', 'widget', 'modal', 'overlay', 'plugin'];
const LAYER_LABELS: Record<string, string> = {
  foundation: 'Foundation',
  core: 'Core',
  widget: 'Widget',
  modal: 'Modal',
  overlay: 'Overlay',
  plugin: 'Plugins',
};

const LAYER_COLORS_VAR: Record<string, string> = {
  foundation: 'var(--green)',
  core: 'var(--accent)',
  widget: 'var(--accent2)',
  modal: 'var(--amber)',
  overlay: 'var(--red)',
  plugin: 'var(--secondary)',
};

const LAYER_COLORS_HEX: Record<string, string> = {
  foundation: '#4ade80',
  core: '#5a8af4',
  widget: '#a78bfa',
  modal: '#fbbf24',
  overlay: '#f87171',
  plugin: '#94a3b8',
};

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export class SpecsMapPlugin {
  private el: HTMLDivElement;
  private viewport: HTMLDivElement;
  private svg: SVGSVGElement;
  private nodeLayer: HTMLDivElement;
  private panel: HTMLDivElement;
  private panelHeaderEl!: HTMLDivElement;
  private panelInner: HTMLDivElement;
  private emptyState: HTMLDivElement;
  private refreshBtn!: HTMLButtonElement;
  private validationBadge!: HTMLSpanElement;
  private fitBtn!: HTMLButtonElement;
  private lastSpecFileCount = 0;
  private wsPath: string;
  private specBaseDir = '';
  private snapshotPath = '';
  private specDirLabel: HTMLSpanElement;
  private nodes: SpecNode[] = [];
  private nodeEls = new Map<string, HTMLDivElement>();
  private specRawMap = new Map<string, SpecData>();
  private refCounts = new Map<string, number>();
  private selectedId: string | null = null;
  private panelOpen = false;
  private panelShowingSettings = false;
  private cycleMode = false;
  private cycleSets: Set<string>[] = [];
  private cycleLevel = 1;
  private selectedCycleIndex: number | null = null;
  private isolatedMode = false;
  private cycleBtn!: HTMLButtonElement;
  private panX = 0;
  private panY = 0;
  private readonly onDocMouseMove: (e: MouseEvent) => void;
  private readonly onDocMouseUp: () => void;
  private scale = 1;
  private fitScale = 1;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartPanX = 0;
  private panStartPanY = 0;

  onFileOpen: ((filePath: string) => void) | null = null;

  private esc(s: unknown): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private specFullPath(filename: string): string {
    const base = this.specBaseDir || (this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '') + '/src/specs');
    return base + '/' + filename;
  }

  private tryResolveSourcePath(rawData: Record<string, unknown>): string {
    const filePath = (rawData as any).file;
    if (!filePath || typeof filePath !== 'string') return '';
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    return wsRoot + '/' + filePath;
  }

  constructor(container: HTMLElement, wsPath: string) {
    this.wsPath = wsPath;
    this.snapshotPath = wsPath.replace(/\\/g, '/').replace(/\/?$/, '') + '/.cockpit/specsmap.json';

    this.onDocMouseMove = (e: MouseEvent) => {
      if (!this.isPanning) return;
      this.panX = this.panStartPanX + (e.clientX - this.panStartX);
      this.panY = this.panStartPanY + (e.clientY - this.panStartY);
      this.applyTransform();
    };
    this.onDocMouseUp = () => {
      this.isPanning = false;
      this.viewport.style.cursor = '';
    };

    this.el = document.createElement('div');
    this.el.style.cssText =
      'width:100%;height:100%;display:flex;flex-direction:column;' +
      'background:transparent;font-family:"Space Mono","Courier New",monospace;font-size:14px;position:relative;overflow:hidden';

    const header = document.createElement('div');
    header.style.cssText =
      'padding:3px 10px 3px 12px;font-size:11px;font-weight:700;letter-spacing:1.5px;color:var(--accent);' +
      'flex-shrink:0;border-bottom:1px solid var(--border);user-select:none;display:flex;align-items:center;gap:10px;z-index:10;position:relative';

    const headerSub = document.createElement('span');
    headerSub.className = 'sm-header-sub';
    headerSub.style.cssText = 'font-size:10px;color:var(--tertiary);font-weight:400;letter-spacing:0.3px;text-transform:none;flex-shrink:0';
    headerSub.textContent = 'hover to trace · click for detail';

    const headerPath = document.createElement('span');
    headerPath.style.cssText = 'font-size:9px;color:var(--tertiary);opacity:0.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0';
    headerPath.textContent = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '') + '/src/specs/';
    this.specDirLabel = headerPath;

    this.validationBadge = document.createElement('span');
    this.validationBadge.style.cssText =
      'display:none;font-size:9px;font-weight:700;letter-spacing:0.3px;padding:1px 6px;' +
      'border-radius:4px;border:1px solid;line-height:1.6;white-space:nowrap';

    const SVG_EYE =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16" height="16" ` +
      `fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M255.66 112c-77.94 0-157.89 45.11-220.83 135.33a16 16 0 0 0-.27 17.77` +
      `C82.92 340.8 161.8 400 255.66 400c92.84 0 173.34-59.38 221.79-135.25a16.14 16.14 0 0 0 0-17.47` +
      `C428.89 172.28 347.8 112 255.66 112z"/>` +
      `<circle cx="256" cy="256" r="80" stroke-miterlimit="10"/>` +
      `</svg>`;

    const SVG_REFRESH =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16" height="16" ` +
      `fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M320 146s24.36-12-64-12a160 160 0 1 0 160 160" stroke-miterlimit="10"/>` +
      `<polyline points="256 58 336 138 256 218"/>` +
      `</svg>`;

    const SVG_GEAR =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16" height="16" ` +
      `fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round">` +
      `<circle cx="256" cy="256" r="48"/>` +
      `<path d="M222.7 48.6a16 16 0 0 0-13.6 13.2l-3.4 22.5a17.4 17.4 0 0 1-13.5 14.8A187.2 187.2 0 0 0 145.2 119a17.4 17.4 0 0 1-14.8 6.3l-22.7-2.6a16 16 0 0 0-15.7 10.5 207.9 207.9 0 0 0-14.7 39.9 16 16 0 0 0 5.3 17.5l16.9 14.6a17.4 17.4 0 0 1 5.2 16.2 186.1 186.1 0 0 0 0 36.8 17.4 17.4 0 0 1-5.2 16.2L92.7 294.6a16 16 0 0 0-5.3 17.5 207.9 207.9 0 0 0 14.7 39.9 16 16 0 0 0 15.7 10.5l22.7-2.6a17.4 17.4 0 0 1 14.8 6.3 187.2 187.2 0 0 0 47 31.9 17.4 17.4 0 0 1 13.5 14.8l3.4 22.5a16 16 0 0 0 13.6 13.2 207.9 207.9 0 0 0 66.6 0 16 16 0 0 0 13.6-13.2l3.4-22.5a17.4 17.4 0 0 1 13.5-14.8 187.2 187.2 0 0 0 47-31.9 17.4 17.4 0 0 1 14.8-6.3l22.7 2.6a16 16 0 0 0 15.7-10.5 207.9 207.9 0 0 0 14.7-39.9 16 16 0 0 0-5.3-17.5l-16.9-14.6a17.4 17.4 0 0 1-5.2-16.2 186.1 186.1 0 0 0 0-36.8 17.4 17.4 0 0 1 5.2-16.2l16.9-14.6a16 16 0 0 0 5.3-17.5 207.9 207.9 0 0 0-14.7-39.9 16 16 0 0 0-15.7-10.5l-22.7 2.6a17.4 17.4 0 0 1-14.8-6.3 187.2 187.2 0 0 0-47-31.9 17.4 17.4 0 0 1-13.5-14.8l-3.4-22.5a16 16 0 0 0-13.6-13.2 207.9 207.9 0 0 0-66.6 0z"/>` +
      `</svg>`;

    this.cycleBtn = document.createElement('button');
    this.cycleBtn.className = 'sm-header-btn';
    this.cycleBtn.innerHTML = SVG_GEAR;
    this.cycleBtn.title = 'Settings';
    this.cycleBtn.addEventListener('click', () => this.openSettingsPanel());

    this.fitBtn = document.createElement('button');
    this.fitBtn.className = 'sm-header-btn';
    this.fitBtn.innerHTML = SVG_EYE;
    this.fitBtn.title = 'Reset view';
    this.fitBtn.addEventListener('click', () => this.fitGraph());

    this.refreshBtn = document.createElement('button');
    this.refreshBtn.className = 'sm-header-btn';
    this.refreshBtn.innerHTML = SVG_REFRESH;
    this.refreshBtn.title = 'Rebuild spec graph from src/specs/';
    this.refreshBtn.addEventListener('click', () => this.refresh());

    // subtitle, path, validation, cycle controls, refresh, then reset-view (eye) on the right
    header.appendChild(headerSub);
    header.appendChild(headerPath);
    header.appendChild(this.validationBadge);
    header.appendChild(this.cycleBtn);
    header.appendChild(this.refreshBtn);
    header.appendChild(this.fitBtn);
    this.el.appendChild(header);

    // Content area: canvas + panel
    const content = document.createElement('div');
    content.style.cssText = 'flex:1;position:relative;overflow:hidden';
    this.el.appendChild(content);

    // SVG layer
    const svgNS = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
    this.svg.setAttribute('class', 'sm-graph');
    this.svg.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:visible';

    // Node layer
    this.nodeLayer = document.createElement('div');
    this.nodeLayer.style.cssText = 'position:absolute;inset:0;z-index:2';

    // Viewport
    this.viewport = document.createElement('div');
    this.viewport.style.cssText = 'position:absolute;inset:0;overflow:hidden';
    this.viewport.appendChild(this.svg);
    this.viewport.appendChild(this.nodeLayer);

    // Empty state: sits above the canvas, not inside the pan/zoom transform
    this.emptyState = document.createElement('div');
    this.emptyState.style.cssText =
      'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;' +
      'justify-content:center;z-index:10;padding:40px;text-align:center;pointer-events:none';
    this.viewport.appendChild(this.emptyState);

    content.appendChild(this.viewport);

    // Side panel (overlays right side)
    this.panel = document.createElement('div');
    this.panel.style.cssText =
      `position:absolute;right:0;top:0;bottom:0;width:${PANEL_W}px;` +
      'background:var(--surface);border-left:1px dashed var(--border);z-index:20;' +
      'transform:translateX(100%);transition:transform 0.2s cubic-bezier(0.4,0,0.2,1);' +
      'display:flex;flex-direction:column;overflow:hidden;pointer-events:none';

    // Fixed header (never scrolls)
    this.panelHeaderEl = document.createElement('div');
    this.panelHeaderEl.style.cssText =
      'flex-shrink:0;border-bottom:1px dashed var(--border)';
    this.panel.appendChild(this.panelHeaderEl);

    // Scrollable body
    this.panelInner = document.createElement('div');
    this.panelInner.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden';
    this.panel.appendChild(this.panelInner);
    content.appendChild(this.panel);

    container.appendChild(this.el);

    this.injectStyles();
    this.initInteractions();
    this.loadSpecs();
  }

  private injectStyles(): void {
    if (document.getElementById('sm-styles')) return;
    const style = document.createElement('style');
    style.id = 'sm-styles';
    style.textContent = `
      .sm-node {
        position: absolute;
        border: 1px dashed var(--border);
        border-radius: 8px;
        background: var(--surface);
        cursor: pointer;
        transition: box-shadow 0.15s, border-color 0.15s, opacity 0.15s, border-style 0.1s;
        box-shadow: var(--shadow);
        overflow: visible;
        box-sizing: border-box;
      }
      .sm-node.sm-selected {
        border-style: solid;
      }
      .sm-node-inner {
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 3px;
        height: 100%;
        box-sizing: border-box;
      }
      .sm-node-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .sm-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .sm-name {
        font-size: 13px; font-weight: 700; color: var(--primary);
        line-height: 1.3; flex: 1; min-width: 0;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .sm-layer-badge { font-size: 9px; font-weight: 700; letter-spacing: 0.8px; flex-shrink: 0; color: var(--tertiary); opacity: 0.8; }
      .sm-file { font-size: 11px; color: var(--tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sm-meta { font-size: 10px; color: var(--secondary); margin-top: auto; display: flex; gap: 6px; }
      .sm-node-ui .sm-name { font-size: 11px; }
      .sm-node-ui .sm-file { font-size: 10px; }
      .sm-node-ui .sm-dot { width: 6px; height: 6px; opacity: 0.6; }
      .sm-layer-header {
        position: absolute; font-size: 13px; font-weight: 700; letter-spacing: 1.5px;
        user-select: none; pointer-events: none; opacity: 0.45;
      }
      .sm-panel-section { padding: 10px 14px; border-bottom: 1px solid var(--border); }
      .sm-panel-label {
        font-size: 9px; font-weight: 700; letter-spacing: 1px;
        color: var(--tertiary); margin-bottom: 8px;
      }
      .sm-panel-row { font-size: 11px; color: var(--primary); line-height: 1.5; }
      .sm-panel-mono { font-size: 10px; color: var(--secondary); word-break: break-all; }
      .sm-dep-item {
        display: flex; gap: 6px; align-items: baseline;
        padding: 4px 0; border-bottom: 1px solid var(--border);
        font-size: 10px;
      }
      .sm-dep-item:last-child { border-bottom: none; }
      .sm-dep-name { font-weight: 700; color: var(--primary); flex-shrink: 0; }
      .sm-dep-file { color: var(--tertiary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sm-dep-usage { font-size: 9px; color: var(--secondary); line-height: 1.4; margin-top: 1px; }
      @keyframes sm-flow { to { stroke-dashoffset: -20; } }
      .sm-edge-active { animation: sm-flow 0.8s linear infinite; }
      @keyframes sm-flow-fast { 0% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -24; } }
      .sm-isolated-border { animation: sm-flow-fast 0.4s linear infinite; stroke-dashoffset: 0; }
      @keyframes sm-spin { to { transform: rotate(360deg); } }
      .sm-spinning { display: inline-block; animation: sm-spin 0.7s linear infinite; }
      @media (prefers-reduced-motion: reduce) {
        .sm-edge-active { animation: none; }
        .sm-spinning { animation: none; }
      }
      .sm-header-btn { border:none; outline:none; background:none; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:5px 7px; color:var(--tertiary); line-height:0; transition:color 0.15s,background 0.15s; }
      .sm-header-btn:hover { color:var(--accent); background:var(--surface); }
      .sm-header-btn:focus-visible { outline:none; }
      .sm-empty-btn {
        pointer-events: auto;
        background: transparent;
        border: 1px dashed var(--border);
        border-radius: 8px;
        padding: 10px 24px;
        font-family: "Space Mono", "Courier New", monospace;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.8px;
        color: var(--primary);
        cursor: pointer;
        transition: border-color 0.15s, box-shadow 0.15s, color 0.15s;
      }
      .sm-empty-btn:hover {
        border-color: var(--accent);
        border-style: solid;
        color: var(--accent);
        box-shadow: 0 0 12px color-mix(in oklab, var(--accent) 20%, transparent);
      }
      .sm-empty-btn:disabled {
        opacity: 0.45;
        cursor: default;
      }
      .sm-isolated {
        box-shadow: 0 0 0 1px #fbbf2444, 0 0 14px #fbbf2433 !important;
      }
      .sm-port {
        position: absolute;
        width: 6px; height: 6px;
        border-radius: 50%;
        z-index: 1;
        pointer-events: none;
        opacity: 0.4;
        transition: opacity 0.15s, transform 0.15s;
      }
      .sm-node:hover .sm-port {
        opacity: 0.85;
        transform: scale(1.3);
      }
      .sm-node-ui .sm-port {
        display: none;
      }
    `;
    document.head.appendChild(style);
  }

  private initInteractions(): void {
    this.viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = this.viewport.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const oldScale = this.scale;
      const maxScale = Math.max(this.fitScale * 3, 1.0);
      this.scale = Math.max(this.fitScale, Math.min(maxScale, this.scale * (1 + -e.deltaY * 0.001)));
      this.panX = mx - (mx - this.panX) * (this.scale / oldScale);
      this.panY = my - (my - this.panY) * (this.scale / oldScale);
      this.applyTransform();
    }, { passive: false });

    this.viewport.addEventListener('mousedown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      if ((e.target as HTMLElement).closest('.sm-node')) return;
      this.isPanning = true;
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.panStartPanX = this.panX;
      this.panStartPanY = this.panY;
      this.viewport.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', this.onDocMouseMove);
    document.addEventListener('mouseup', this.onDocMouseUp);

    // Click on canvas background → close panel; cycle edges → select cycle
    this.viewport.addEventListener('click', (e) => {
      if (this.cycleMode && this.cycleSets.length > 0) {
        const rect = this.viewport.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        for (const hit of this.getCycleEdgeHitTargets()) {
          const dist = Math.sqrt((cx - hit.cx) ** 2 + (cy - hit.cy) ** 2);
          if (dist < 18) {
            this.selectedCycleIndex = this.selectedCycleIndex === hit.cycleIdx ? null : hit.cycleIdx;
            this.applyCycleHighlights();
            if (this.panelShowingSettings) this.renderSettingsContent();
            return;
          }
        }
      }
      if (!(e.target as HTMLElement).closest('.sm-node')) this.closePanel(true);
    });
  }

  private applyTransform(): void {
    const t = `translate(${this.panX}px,${this.panY}px) scale(${this.scale})`;
    this.nodeLayer.style.transform = t;
    this.nodeLayer.style.transformOrigin = '0 0';
    this.svg.style.transform = t;
    this.svg.style.transformOrigin = '0 0';
  }

  private async loadSpecs(): Promise<void> {
    try {
      const fromCache = await this.loadSnapshot();
      if (fromCache) {
        this.renderGraph();
        return;
      }
      await this.buildFromFiles();
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error('[SpecsMapPlugin] loadSpecs failed:', e);
      this.nodeLayer.innerHTML =
        '<div style="padding:16px;color:var(--red);font-size:14px;line-height:1.5">' +
        '<div style="font-weight:700;margin-bottom:6px">Error loading specs</div>' +
        '<div style="font-size:11px;opacity:0.85;word-break:break-all">' + this.esc(msg) + '</div></div>';
    }
  }

  private async loadSnapshot(): Promise<boolean> {
    const raw = await window.electronAPI?.fs.readFile(this.snapshotPath);
    if (!raw) return false;
    try {
      const snap = JSON.parse(raw);
      if (snap.v !== 1 || !Array.isArray(snap.nodes) || snap.nodes.length === 0) return false;

      this.specRawMap.clear();
      const rawNodes: SpecNode[] = [];

      for (const sn of snap.nodes as SnapNode[]) {
        this.specRawMap.set(sn.id, sn.raw as SpecData);
        rawNodes.push({
          id: sn.id, name: sn.name, specFile: sn.specFile, sourceFile: sn.sourceFile,
          layer: sn.layer, isUI: sn.isUI, parentId: sn.parentId, uiChildId: sn.uiChildId,
          deps: sn.deps, x: 0, y: 0,
          w: sn.isUI ? NODE_UI_W : NODE_W,
          h: sn.isUI ? NODE_UI_H : NODE_H,
        });
      }

      this.refCounts.clear();
      for (const n of rawNodes) {
        for (const d of n.deps) this.refCounts.set(d, (this.refCounts.get(d) ?? 0) + 1);
      }

      this.nodes = this.computeLayout(rawNodes);
      return true;
    } catch (e) {
      console.warn('[SpecsMapPlugin] Snapshot parse failed, will rebuild from files:', e);
      return false;
    }
  }

  private async saveSnapshot(): Promise<void> {
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    await window.electronAPI?.fs.mkdir(wsRoot + '/.cockpit');
    const snap: { v: 1; ts: string; nodes: SnapNode[] } = {
      v: 1,
      ts: new Date().toISOString(),
      nodes: this.nodes.map(n => ({
        id: n.id, name: n.name, specFile: n.specFile, sourceFile: n.sourceFile,
        layer: n.layer, isUI: n.isUI, parentId: n.parentId, uiChildId: n.uiChildId,
        deps: n.deps,
        raw: (this.specRawMap.get(n.id) ?? {}) as Record<string, unknown>,
      })),
    };
    await window.electronAPI?.fs.writeFile(this.snapshotPath, JSON.stringify(snap));
  }

  private async buildFromFiles(): Promise<void> {
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    let base = this.specBaseDir;
    if (!base) {
      base = await this.findBaseDir();
      if (base) {
        this.specBaseDir = base;
        this.specDirLabel.textContent = base + '/';
      }
    }
    if (!base) {
      await this.showEmptyState();
      return;
    }

    const mainRaw = await window.electronAPI?.fs.readFile(base + '/main.spec.json') ?? '{}';
    let mainData: any = {};
    try { mainData = JSON.parse(mainRaw); } catch (e) {
      console.error('[SpecsMapPlugin] Failed to parse main.spec.json:', e);
    }

    const specLayerMap = new Map<string, string>();
    const specToUI = new Map<string, string>();
    const uiToParent = new Map<string, string>();

    const featuresMap = mainData.features;
    if (Array.isArray(featuresMap)) {
      console.warn('[SpecsMapPlugin] main.spec.json "features" is an array — expected an object with layer keys (e.g. {"core":[...]}). Treating features as "unknown" layer.');
      for (const feat of featuresMap as unknown[]) {
        if (feat && typeof feat === 'object' && 'spec' in (feat as Record<string, unknown>)) {
          const f = feat as { spec: string; ui?: string };
          specLayerMap.set(f.spec, 'unknown');
          if (f.ui) {
            specToUI.set(f.spec, f.ui);
            uiToParent.set(f.ui, f.spec);
            specLayerMap.set(f.ui, 'unknown');
          }
        }
      }
    } else {
      for (const [layer, features] of Object.entries(featuresMap ?? {})) {
        if (!Array.isArray(features)) {
          console.warn('[SpecsMapPlugin] Skipping layer "' + layer + '": features should be an array (got ' + typeof features + ')');
          continue;
        }
        for (const feat of features) {
          if (feat && typeof feat === 'object' && 'spec' in (feat as Record<string, unknown>)) {
            const f = feat as { spec: string; ui?: string };
            specLayerMap.set(f.spec, layer);
            if (f.ui) {
              specToUI.set(f.spec, f.ui);
              uiToParent.set(f.ui, f.spec);
              specLayerMap.set(f.ui, layer);
            }
          }
        }
      }
    }

    const entries = await window.electronAPI?.fs.readDir(base) ?? [];
    const specFiles = entries
      .filter(e => !e.isDirectory && e.name.endsWith('.spec.json') && e.name !== 'main.spec.json')
      .map(e => e.name);

    this.lastSpecFileCount = specFiles.length;

    if (specFiles.length === 0) {
      await this.showEmptyState();
      return;
    }

    this.specRawMap.clear();
    for (const filename of specFiles) {
      const raw = await window.electronAPI?.fs.readFile(base + '/' + filename);
      if (raw) {
        try { this.specRawMap.set(filename, JSON.parse(raw)); } catch (e) {
          console.warn('[SpecsMapPlugin] Skipping invalid spec file ' + filename + ':', e);
        }
      }
    }

    const sourceToSpec = new Map<string, string>();
    for (const [filename, data] of this.specRawMap) {
      if (data.file) sourceToSpec.set(data.file.split('/').pop()!, filename);
    }

    const rawNodes: SpecNode[] = [];
    for (const [filename, data] of this.specRawMap) {
      const isUI = uiToParent.has(filename);
      const layer = specLayerMap.get(filename) ?? data.layer ?? 'plugin';
      const deps: string[] = [];
      for (const dep of data.dependencies ?? []) {
        const basename = dep.file?.split('/').pop();
        if (basename) {
          const depId = sourceToSpec.get(basename);
          if (depId && depId !== filename) deps.push(depId);
        }
      }
      rawNodes.push({
        id: filename,
        name: data.name ?? filename.replace('.spec.json', ''),
        specFile: filename,
        sourceFile: data.file ? data.file.split('/').pop()! : '',
        layer, isUI,
        parentId: isUI ? uiToParent.get(filename) : undefined,
        uiChildId: specToUI.get(filename),
        deps, x: 0, y: 0,
        w: isUI ? NODE_UI_W : NODE_W,
        h: isUI ? NODE_UI_H : NODE_H,
      });
    }

    this.refCounts.clear();
    for (const n of rawNodes) {
      for (const d of n.deps) this.refCounts.set(d, (this.refCounts.get(d) ?? 0) + 1);
    }

    this.nodes = this.computeLayout(rawNodes);
    await this.saveSnapshot();
    this.renderGraph();
  }

  private async findBaseDir(): Promise<string | null> {
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');

    // Fast path: check common locations
    const quickPaths = [
      wsRoot + '/src/specs/main.spec.json',
      wsRoot + '/specs/main.spec.json',
      wsRoot + '/.specs/main.spec.json',
    ];
    for (const p of quickPaths) {
      const raw = await window.electronAPI?.fs.readFile(p);
      if (raw) return p.replace(/\/main\.spec\.json$/, '');
    }

    // Recursive walk
    const found = await this.walkFind(wsRoot, 0, 4);
    if (found) return found.replace(/\/main\.spec\.json$/, '');
    return null;
  }

  private async walkFind(dir: string, depth: number, maxDepth: number): Promise<string | null> {
    if (depth > maxDepth) return null;
    const entries = await window.electronAPI?.fs.readDir(dir);
    if (!entries) return null;

    // Check current dir
    const mainRaw = await window.electronAPI?.fs.readFile(dir + '/main.spec.json');
    if (mainRaw) return dir + '/main.spec.json';

    // Recurse into subdirectories (skip junk dirs)
    for (const e of entries) {
      if (!e.isDirectory) continue;
      if (e.name === '.git' || e.name === 'node_modules' || e.name === '.cockpit') continue;
      const found = await this.walkFind(dir + '/' + e.name, depth + 1, maxDepth);
      if (found) return found;
    }
    return null;
  }

  private async refresh(): Promise<void> {
    this.refreshBtn.disabled = true;
    this.refreshBtn.querySelector('svg')?.classList.add('sm-spinning');

    // Reset cycle mode
    this.cycleMode = false;
    this.cycleSets = [];
    this.cycleLevel = 1;
    this.selectedCycleIndex = null;
    this.isolatedMode = false;
    this.cycleBtn.style.color = '';

    // Clear current state
    this.specBaseDir = '';
    this.nodes = [];
    this.specRawMap.clear();
    this.refCounts.clear();
    this.nodeEls.clear();
    this.nodeLayer.innerHTML = '';
    this.svg.innerHTML = '';
    this.emptyState.style.display = 'none';
    this.closePanel();

    try {
      await this.buildFromFiles();
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error('[SpecsMapPlugin] Refresh failed:', e);
      this.nodeLayer.innerHTML =
        '<div style="padding:16px;color:var(--red);font-size:14px;line-height:1.5">' +
        '<div style="font-weight:700;margin-bottom:6px">Error refreshing specs</div>' +
        '<div style="font-size:11px;opacity:0.85;word-break:break-all">' + this.esc(msg) + '</div></div>';
    }

    this.refreshBtn.disabled = false;
    this.refreshBtn.querySelector('svg')?.classList.remove('sm-spinning');
    this.showValidation();
  }

  private updateHeaderCounts(): void {
    const sub = this.el.querySelector('.sm-header-sub') as HTMLElement | null;
    if (!sub) return;
    const mainNodes = this.nodes.filter(n => !n.isUI).length;
    const uiNodes = this.nodes.filter(n => n.isUI).length;
    sub.textContent = `${mainNodes} specs · ${uiNodes} ui specs · hover to trace · click for detail`;
  }

  private showValidation(): void {
    const specCount = this.lastSpecFileCount;
    const nodeCount = this.nodes.length;
    if (specCount === 0) { this.validationBadge.style.display = 'none'; return; }

    const ok = nodeCount === specCount;
    this.validationBadge.textContent = ok
      ? `✓ ${nodeCount} / ${specCount}`
      : `⚠ ${nodeCount} / ${specCount}`;
    this.validationBadge.style.color = ok ? 'var(--green)' : 'var(--amber)';
    this.validationBadge.style.borderColor = ok ? 'var(--green)' : 'var(--amber)';
    this.validationBadge.style.background = ok
      ? 'color-mix(in oklab, var(--green) 10%, transparent)'
      : 'color-mix(in oklab, var(--amber) 10%, transparent)';
    this.validationBadge.title = ok
      ? `All ${specCount} spec files parsed successfully`
      : `${specCount - nodeCount} spec file(s) failed to parse — check JSON syntax`;
    this.validationBadge.style.display = 'inline';
  }

  private computeLayout(nodes: SpecNode[]): SpecNode[] {
    const mainNodes = nodes.filter(n => !n.isUI);
    const uiNodes = nodes.filter(n => n.isUI);
    const nodeById = new Map<string, SpecNode>(nodes.map(n => [n.id, n]));

    const layerMap = new Map<string, SpecNode[]>();
    for (const n of mainNodes) {
      if (!layerMap.has(n.layer)) layerMap.set(n.layer, []);
      layerMap.get(n.layer)!.push(n);
    }

    let globalY = 40;

    for (const layer of LAYER_ORDER) {
      const items = layerMap.get(layer);
      if (!items || items.length === 0) continue;
      globalY = this.positionLayer(items, uiNodes, nodeById, globalY);
    }

    // Unknown/custom layers (e.g. "FEATURE" from generated specs) — sort alphabetically, position below
    const unknownLayers = [...layerMap.keys()].filter(l => !LAYER_ORDER.includes(l)).sort();
    for (const layer of unknownLayers) {
      const items = layerMap.get(layer)!;
      globalY = this.positionLayer(items, uiNodes, nodeById, globalY);
    }

    return nodes;
  }

  private positionLayer(
    items: SpecNode[],
    uiNodes: SpecNode[],
    nodeById: Map<string, SpecNode>,
    globalY: number,
  ): number {
    for (let chunkStart = 0; chunkStart < items.length; chunkStart += MAX_PER_ROW) {
      const chunk = items.slice(chunkStart, chunkStart + MAX_PER_ROW);
      const rowW = chunk.length * NODE_W + (chunk.length - 1) * NODE_GAP;
      const startX = -rowW / 2;

      for (let i = 0; i < chunk.length; i++) {
        chunk[i].x = startX + i * (NODE_W + NODE_GAP);
        chunk[i].y = globalY;
      }

      const chunkUI = uiNodes.filter(u => u.parentId && chunk.some(m => m.id === u.parentId));
      for (const uiNode of chunkUI) {
        const parent = nodeById.get(uiNode.parentId!);
        if (parent) {
          uiNode.x = parent.x + (NODE_W - NODE_UI_W) / 2;
          uiNode.y = globalY + NODE_H + UI_OFFSET_Y;
        }
      }

      const hasUI = chunkUI.length > 0;
      globalY += NODE_H + (hasUI ? UI_OFFSET_Y + NODE_UI_H + 20 : 0) + LAYER_GAP;
    }
    return globalY;
  }

  private renderGraph(): void {
    this.nodeLayer.innerHTML = '';
    this.svg.innerHTML = '';
    this.nodeEls.clear();
    this.updateHeaderCounts();

    const nodeMap = new Map<string, SpecNode>(this.nodes.map(n => [n.id, n]));

    this.renderSVGDefs();
    this.renderLayerHeaders();
    this.renderEdges(nodeMap);

    for (const node of this.nodes) {
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
      const refCount = this.refCounts.get(node.id) ?? 0;
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
          `<span class="sm-name" style="opacity:0.7">${node.name}</span>` +
          `</div>` +
          `<div class="sm-file">${node.specFile}</div>` +
          `</div>` +
          portsHtml;
      } else {
        const depsHtml = depCount ? `<span style="color:${colorVar}">→&nbsp;${depCount}</span>` : '';
        const refsHtml = refCount ? `<span style="color:var(--tertiary)">←&nbsp;${refCount}</span>` : '';
        const isolatedHtml = !depCount && !refCount
          ? `<span style="color:var(--secondary);opacity:0.5">no links</span>` : '';

        el.innerHTML =
          `<div class="sm-node-inner">` +
          `<div class="sm-node-head">` +
          `<span class="sm-dot" style="background:${colorHex}"></span>` +
          `<span class="sm-name">${node.name}</span>` +
          `<span class="sm-layer-badge">${layerLabel.toUpperCase()}</span>` +
          `</div>` +
          `<div class="sm-file">${node.specFile}</div>` +
          `<div class="sm-meta">${depsHtml}${refsHtml}${isolatedHtml}</div>` +
          `</div>` +
          portsHtml;
      }

      el.addEventListener('mouseenter', () => this.hoverNode(node.id, true));
      el.addEventListener('mouseleave', () => this.hoverNode(node.id, false));
      el.addEventListener('click', (e) => { e.stopPropagation(); this.selectNode(node.id); });

      this.nodeLayer.appendChild(el);
      this.nodeEls.set(node.id, el);
    }

    this.fitGraph();
  }

  private renderSVGDefs(): void {
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

    this.svg.appendChild(defs);
  }

  private renderLayerHeaders(): void {
    const layerYMap = new Map<string, number>();
    for (const n of this.nodes) {
      if (n.isUI) continue;
      const prev = layerYMap.get(n.layer);
      if (prev === undefined || n.y < prev) layerYMap.set(n.layer, n.y);
    }

    const mainNodes = this.nodes.filter(n => !n.isUI);
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
      this.nodeLayer.appendChild(label);
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

  private renderEdges(nodeMap: Map<string, SpecNode>): void {
    const ns = 'http://www.w3.org/2000/svg';

    const uiGroup = document.createElementNS(ns, 'g');
    for (const node of this.nodes) {
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
    }
    this.svg.appendChild(uiGroup);

    const depGroup = document.createElementNS(ns, 'g');
    for (const node of this.nodes) {
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
      }
    }
    this.svg.appendChild(depGroup);
  }

  private hoverNode(id: string, enter: boolean): void {
    if (this.cycleMode) return;
    const connected = new Set<string>([id]);
    for (const node of this.nodes) {
      if (node.id === id) {
        for (const d of node.deps) connected.add(d);
        if (node.parentId) connected.add(node.parentId);
        if (node.uiChildId) connected.add(node.uiChildId);
      }
      if (node.deps.includes(id)) connected.add(node.id);
      if (node.uiChildId === id) connected.add(node.id);
      if (node.parentId === id) connected.add(node.id);
    }

    for (const path of this.svg.querySelectorAll<SVGPathElement>('path[data-source]')) {
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
          const nc = this.nodes.find(n => n.id === nid)!;
          const hex = LAYER_COLORS_HEX[nc.layer] ?? '#94a3b8';
          el.style.borderColor = hex;
          el.style.borderStyle = 'solid';
          el.style.boxShadow = `0 0 0 1px ${hex}33, 0 0 14px ${hex}22`;
          el.style.opacity = '1';
        } else {
          el.style.opacity = '0.14';
          el.style.borderColor = '';
          el.style.borderStyle = '';
          el.style.boxShadow = '';
        }
      } else {
        el.style.opacity = '';
        el.style.borderColor = nid === this.selectedId ? LAYER_COLORS_HEX[this.nodes.find(n => n.id === nid)?.layer ?? ''] ?? '' : '';
        el.style.borderStyle = nid === this.selectedId ? 'solid' : '';
        el.style.boxShadow = '';
      }
    }
  }

  private selectNode(id: string): void {
    // Close settings panel if open
    if (this.panelShowingSettings) {
      this.closePanel();
    }
    // Deselect previous
    if (this.selectedId) {
      const prev = this.nodeEls.get(this.selectedId);
      if (prev) prev.classList.remove('sm-selected');
    }

    if (this.selectedId === id && this.panelOpen) {
      this.closePanel(true);
      return;
    }

    this.selectedId = id;
    const el = this.nodeEls.get(id);
    if (el) el.classList.add('sm-selected');

    const node = this.nodes.find(n => n.id === id);
    if (!node) return;

    this.zoomToNode(node);
    this.openPanel(node);
  }

  private zoomToNode(node: SpecNode): void {
    const rect = this.viewport.getBoundingClientRect();
    const cw = rect.width || 800;
    const ch = rect.height || 600;

    const availableW = cw - PANEL_W;
    const targetScale = Math.min(availableW / (node.w * 3), ch / (node.h * 3), 1.5);
    const scale = Math.max(targetScale, this.fitScale);
    const targetPanX = (availableW - node.w * scale) / 2 - node.x * scale;
    const targetPanY = (ch - node.h * scale) / 2 - node.y * scale;

    this.animateTo(targetPanX, targetPanY, scale, 300);
  }

  private animateTo(toPanX: number, toPanY: number, toScale: number, duration = 300): void {
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

  private openPanel(node: SpecNode): void {
    this.panelOpen = true;
    this.panel.style.transform = 'translateX(0)';
    this.panel.style.pointerEvents = 'auto';
    try {
      this.renderPanelContent(node);
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error('[SpecsMapPlugin] Panel render failed for ' + node.id + ':', e);
      this.panelHeaderEl.innerHTML = '';
      this.panelInner.innerHTML =
        '<div class="sm-panel-section" style="color:var(--red);font-size:12px;line-height:1.5">' +
        '<div style="font-weight:700;margin-bottom:4px">Error rendering spec</div>' +
        '<div style="font-size:10px;opacity:0.85;word-break:break-all">' + this.esc(msg) + '</div></div>';
    }
  }

  private openSettingsPanel(): void {
    if (this.panelShowingSettings) {
      this.closePanel(true);
      return;
    }
    if (this.panelOpen) {
      this.closePanel();
    }
    this.panelShowingSettings = true;
    this.panelOpen = true;
    this.panel.style.transform = 'translateX(0)';
    this.panel.style.pointerEvents = 'auto';
    this.cycleBtn.style.color = 'var(--accent)';
    try {
      this.renderSettingsContent();
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error('[SpecsMapPlugin] Settings panel render failed:', e);
      this.panelHeaderEl.innerHTML = '';
      this.panelInner.innerHTML =
        '<div class="sm-panel-section" style="color:var(--red);font-size:12px;line-height:1.5">' +
        '<div style="font-weight:700;margin-bottom:4px">Error rendering settings</div>' +
        '<div style="font-size:10px;opacity:0.85;word-break:break-all">' + this.esc(msg) + '</div></div>';
    }
  }

  private renderSettingsContent(): void {
    const isActive = this.cycleMode;
    const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    this.panelHeaderEl.innerHTML =
      `<div style="padding:14px 18px 12px;display:flex;align-items:center;gap:12px">` +
      `<span style="font-size:14px;font-weight:700;color:var(--primary);flex:1">Settings</span>` +
      `<button id="sm-panel-close" style="background:none;border:none;cursor:pointer;color:var(--tertiary);font-size:18px;line-height:1;padding:0 0 0 4px;font-family:inherit" aria-label="Close">×</button>` +
      `</div>`;

    const toggleBg = isActive ? 'var(--red)' : 'var(--border)';
    const toggleKnob = isActive ? 'right:2px' : 'left:2px';
    const toggleLabel = isActive ? 'On' : 'Off';

    const levelChips = (lvl: number) =>
      `<button class="sm-cycle-level" data-level="${lvl}" style="background:none;border:1px solid ${lvl === this.cycleLevel ? 'var(--accent)' : 'var(--border)'};color:${lvl === this.cycleLevel ? 'var(--accent)' : 'var(--tertiary)'};border-radius:5px;padding:2px 10px;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;transition:color 0.12s,border-color 0.12s" title="Level ${lvl}: ${lvl === 1 ? 'cycle nodes only' : lvl === 2 ? '+ immediate neighbors' : '+ 2-hop neighbors'}">${lvl}</button>`;

    let cyclesSection = '';
    if (isActive) {
      cyclesSection =
        `<div class="sm-panel-section">` +
        `<div class="sm-panel-label">DEPTH</div>` +
        `<div style="display:flex;gap:6px;padding:4px 0">${[1, 2, 3].map(levelChips).join('')}</div></div>`;
      if (this.cycleSets.length > 0) {
        cyclesSection +=
          `<div class="sm-panel-section">` +
          `<div class="sm-panel-label">CYCLES (${this.cycleSets.length}) — click edge on graph to trace</div>` +
          this.cycleSets.map((s, i) => {
            const CYCLE_COLORS = ['#f87171', '#fb923c', '#fbbf24', '#f472b6', '#a78bfa'];
            const c = CYCLE_COLORS[i % CYCLE_COLORS.length];
            const isSel = i === this.selectedCycleIndex;
            return `<div style="font-size:11px;color:${c};padding:4px 0;display:flex;align-items:center;gap:6px;${isSel ? `background:${c}15;border-radius:4px;padding:4px 6px;margin:0 -6px;font-weight:700` : ''}">` +
              `<span style="width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0"></span>` +
              `<span>${isSel ? '▸ ' : ''}${esc([...s].join(' → '))}</span></div>`;
          }).join('') +
          `</div>`;
      } else {
        cyclesSection +=
          `<div class="sm-panel-section">` +
          `<div style="font-size:11px;color:var(--green);display:flex;align-items:center;gap:6px">` +
          `<span>✓</span><span>No cycles — graph is a valid DAG</span></div></div>`;
      }
    }

    const isolatedToggleBg = this.isolatedMode ? 'var(--amber)' : 'var(--border)';
    const isolatedKnob = this.isolatedMode ? 'right:2px' : 'left:2px';
    const isolatedLabel = this.isolatedMode ? 'On' : 'Off';

    this.panelInner.innerHTML =
      `<div class="sm-panel-section">` +
      `<div class="sm-panel-label">GRAPH ANALYSIS</div>` +
      `<div style="display:flex;align-items:center;gap:12px;padding:8px 0">` +
      `<label style="flex:1;font-size:12px;color:var(--primary);cursor:pointer">Show cyclic dependencies</label>` +
      `<div id="sm-cycle-toggle" style="width:36px;height:20px;border-radius:10px;background:${toggleBg};cursor:pointer;position:relative;transition:background 0.15s;flex-shrink:0" role="switch" aria-checked="${isActive}">` +
      `<div style="width:16px;height:16px;border-radius:50%;background:var(--bg);position:absolute;top:2px;${toggleKnob};transition:left 0.15s,right 0.15s"></div>` +
      `</div>` +
      `<span style="font-size:10px;color:var(--tertiary);min-width:20px;text-align:right">${toggleLabel}</span>` +
      `</div>` +
      `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid var(--border);margin-top:4px;padding-top:12px">` +
      `<label style="flex:1;font-size:12px;color:var(--primary);cursor:pointer">Show isolated nodes</label>` +
      `<div id="sm-isolated-toggle" style="width:36px;height:20px;border-radius:10px;background:${isolatedToggleBg};cursor:pointer;position:relative;transition:background 0.15s;flex-shrink:0" role="switch" aria-checked="${this.isolatedMode}">` +
      `<div style="width:16px;height:16px;border-radius:50%;background:var(--bg);position:absolute;top:2px;${isolatedKnob};transition:left 0.15s,right 0.15s"></div>` +
      `</div>` +
      `<span style="font-size:10px;color:var(--tertiary);min-width:20px;text-align:right">${isolatedLabel}</span>` +
      `</div></div>` +
      cyclesSection;

    this.panelHeaderEl.querySelector('#sm-panel-close')
      ?.addEventListener('click', () => this.closePanel(true));

    const toggle = this.panelInner.querySelector('#sm-cycle-toggle');
    toggle?.addEventListener('click', () => {
      if (this.cycleMode) {
        this.cycleMode = false;
        this.selectedCycleIndex = null;
        this.clearCycleHighlights();
        this.cycleSets = [];
        if (!this.isolatedMode) this.cycleBtn.style.color = '';
      } else {
        this.cycleMode = true;
        this.cycleLevel = 1;
        this.selectedCycleIndex = null;
        this.cycleSets = this.findCycles();
        this.applyCycleHighlights();
        this.cycleBtn.style.color = 'var(--accent)';
      }
      this.renderSettingsContent();
    });

    for (const chip of this.panelInner.querySelectorAll<HTMLElement>('.sm-cycle-level')) {
      chip.addEventListener('click', () => {
        const lvl = parseInt(chip.dataset.level ?? '1', 10);
        if (lvl !== this.cycleLevel) {
          this.cycleLevel = lvl;
          this.applyCycleHighlights();
          this.renderSettingsContent();
        }
      });
    }

    const isolatedToggle = this.panelInner.querySelector('#sm-isolated-toggle');
    isolatedToggle?.addEventListener('click', () => {
      this.isolatedMode = !this.isolatedMode;
      if (this.isolatedMode) {
        this.cycleBtn.style.color = 'var(--accent)';
        this.applyIsolatedHighlights();
      } else {
        this.clearIsolatedHighlights();
        if (!this.cycleMode) this.cycleBtn.style.color = '';
      }
      this.renderSettingsContent();
    });
  }

  private closePanel(resetZoom?: boolean): void {
    this.panelOpen = false;
    this.panelShowingSettings = false;
    this.panel.style.transform = 'translateX(100%)';
    this.panel.style.pointerEvents = 'none';
    if (!this.cycleMode && !this.isolatedMode) this.cycleBtn.style.color = '';
    if (this.selectedId) {
      const prev = this.nodeEls.get(this.selectedId);
      if (prev) prev.classList.remove('sm-selected');
    }
    this.selectedId = null;
    if (resetZoom) {
      const target = this.getFitTarget();
      if (target) {
        this.fitScale = target.scale;
        this.animateTo(target.panX, target.panY, target.scale, 300);
      }
    }
  }

  private renderPanelContent(node: SpecNode): void {
    const data = this.specRawMap.get(node.id) ?? {};
    const colorHex = LAYER_COLORS_HEX[node.layer] ?? '#94a3b8';
    const colorVar = LAYER_COLORS_VAR[node.layer] ?? 'var(--secondary)';
    const layerLabel = LAYER_LABELS[node.layer] ?? node.layer;

    const depNodes = node.deps.map(d => this.nodes.find(n => n.id === d)).filter(Boolean) as SpecNode[];
    const refNodes = this.nodes.filter(n => n.deps.includes(node.id));
    const uiChild = node.uiChildId ? this.nodes.find(n => n.id === node.uiChildId) : undefined;
    const parentNode = node.parentId ? this.nodes.find(n => n.id === node.parentId) : undefined;

    const deps = Array.isArray(data.dependencies) ? data.dependencies as Array<{ feature?: unknown; file?: unknown; usage?: unknown }> : [];
    const refs = Array.isArray(data.referenced_by) ? data.referenced_by as Array<{ feature?: unknown; file?: unknown }> : [];
    const ipc = Array.isArray(data.ipc) ? data.ipc as unknown[] : [];

    // Safe: coerces any value to escaped string
    const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Fixed header (inside panelHeaderEl, never scrolls)
    this.panelHeaderEl.innerHTML =
      `<div style="padding:14px 18px 12px;display:flex;align-items:center;gap:12px">` +
      `<span style="width:12px;height:12px;border-radius:50%;background:${colorHex};flex-shrink:0;display:inline-block"></span>` +
      `<span style="font-size:14px;font-weight:700;color:var(--primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(node.name)}</span>` +
      `<span style="font-size:10px;font-weight:700;letter-spacing:0.8px;color:${colorVar};flex-shrink:0">${layerLabel.toUpperCase()}</span>` +
      `<button id="sm-panel-close" style="background:none;border:none;cursor:pointer;color:var(--tertiary);font-size:18px;line-height:1;padding:0 0 0 4px;font-family:inherit" aria-label="Close">×</button>` +
      `</div>`;

    // Scrollable body
    const specFullPath = this.specFullPath(node.specFile);
    const sourceFullPath = node.sourceFile ? this.tryResolveSourcePath(data) : '';
    const identity =
      `<div class="sm-panel-section">` +
      `<div class="sm-panel-label">SPEC FILE</div>` +
      `<div class="sm-panel-row" style="font-size:11px;cursor:pointer;color:var(--accent)" data-open-file="${esc(specFullPath)}">${esc(node.specFile)}</div>` +
      (sourceFullPath ? `<div class="sm-panel-label" style="margin-top:8px">SOURCE FILE</div><div class="sm-panel-row" style="font-size:11px;cursor:pointer;color:var(--accent)" data-open-file="${esc(sourceFullPath)}">${esc(node.sourceFile)}</div>` : '') +
      (parentNode ? `<div class="sm-panel-label" style="margin-top:8px">UI SPEC FOR</div><div class="sm-panel-row" style="font-size:12px;cursor:pointer;color:${colorVar}" data-goto="${esc(parentNode.id)}">${esc(parentNode.name)}</div>` : '') +
      (uiChild ? `<div class="sm-panel-label" style="margin-top:8px">UI SPEC</div><div class="sm-panel-row" style="font-size:12px;cursor:pointer;color:${colorVar}" data-goto="${esc(uiChild.id)}">${esc(uiChild.name)}</div>` : '') +
      `</div>`;

    const desc = data.description
      ? `<div class="sm-panel-section"><div class="sm-panel-label">DESCRIPTION</div><div style="font-size:12px;color:var(--secondary);line-height:1.6;word-break:break-word">${esc(data.description)}</div></div>`
      : '';

    const depsSection = deps.length
      ? `<div class="sm-panel-section"><div class="sm-panel-label">DEPENDS ON (${deps.length})</div>` +
        deps.map(d => {
          const raw = String(d.file ?? '');
          const dBasename = raw.split('/').pop() || raw;
          const linked = dBasename ? depNodes.find(n => n.sourceFile === dBasename) : undefined;
          return `<div class="sm-dep-item"><div>` +
            `<div class="sm-dep-name" ${linked ? `style="cursor:pointer;color:${colorVar}" data-goto="${esc(linked.id)}"` : ''}>${esc(d.feature)}</div>` +
            `<div class="sm-dep-file">${esc(dBasename)}</div>` +
            (d.usage ? `<div class="sm-dep-usage">${esc(d.usage)}</div>` : '') +
            `</div></div>`;
        }).join('') +
        `</div>`
      : '';

    const refsSection = refs.length
      ? `<div class="sm-panel-section"><div class="sm-panel-label">REFERENCED BY (${refs.length})</div>` +
        refs.map(r => {
          const raw = String(r.file ?? '');
          const rBasename = raw.split('/').pop() || raw;
          const linked = rBasename ? refNodes.find(n => n.sourceFile === rBasename) : undefined;
          return `<div class="sm-dep-item"><div>` +
            `<div class="sm-dep-name" ${linked ? `style="cursor:pointer;color:${colorVar}" data-goto="${esc(linked.id)}"` : ''}>${esc(r.feature)}</div>` +
            `<div class="sm-dep-file">${esc(rBasename)}</div>` +
            `</div></div>`;
        }).join('') +
        `</div>`
      : '';

    const ipcSection = ipc.length
      ? `<div class="sm-panel-section"><div class="sm-panel-label">IPC CHANNELS (${ipc.length})</div>` +
        ipc.map(ch => `<div style="font-size:12px;color:var(--tertiary);padding:3px 0">${esc(ch)}</div>`).join('') +
        `</div>`
      : '';

    this.panelInner.innerHTML = identity + desc + depsSection + refsSection + ipcSection;

    this.panelHeaderEl.querySelector('#sm-panel-close')
      ?.addEventListener('click', () => this.closePanel(true));

    for (const el of this.panelInner.querySelectorAll<HTMLElement>('[data-goto]')) {
      el.addEventListener('click', () => this.selectNode(el.dataset.goto!));
    }
    for (const el of this.panelHeaderEl.querySelectorAll<HTMLElement>('[data-goto]')) {
      el.addEventListener('click', () => this.selectNode(el.dataset.goto!));
    }
    for (const el of this.panelInner.querySelectorAll<HTMLElement>('[data-open-file]')) {
      el.addEventListener('click', () => { const fp = el.dataset.openFile!; this.onFileOpen?.(fp); });
    }
  }

  private getFitTarget(): { scale: number; panX: number; panY: number } | null {
    if (this.nodes.length === 0) return null;
    const rect = this.viewport.getBoundingClientRect();
    const cw = rect.width || 800;
    const ch = rect.height || 600;

    const minX = Math.min(...this.nodes.map(n => n.x));
    const maxX = Math.max(...this.nodes.map(n => n.x + n.w));
    const minY = Math.min(...this.nodes.map(n => n.y));
    const maxY = Math.max(...this.nodes.map(n => n.y + n.h));
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

  private fitGraph(): void {
    const target = this.getFitTarget();
    if (!target) return;
    this.fitScale = target.scale;
    this.scale = target.scale;
    this.panX = target.panX;
    this.panY = target.panY;
    this.applyTransform();
  }

  private detectEntrycandidates(entries: DirEntry[]): string[] {
    const dirNames = new Set(entries.filter(e => e.isDirectory).map(e => e.name));
    const fileNames = new Set(entries.filter(e => !e.isDirectory).map(e => e.name));
    const out: string[] = [];
    for (const d of ['src', 'lib', 'app', 'backend', 'frontend', 'server', 'client', 'core', 'packages', 'internal']) {
      if (dirNames.has(d)) out.push(d + '/');
    }
    for (const f of ['docker-compose.yml', 'docker-compose.yaml', 'Makefile', 'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'setup.py', 'build.gradle', 'pom.xml', 'CMakeLists.txt']) {
      if (fileNames.has(f)) out.push(f);
    }
    return out;
  }

  private async showEmptyState(): Promise<void> {
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');

    // Check src/ and gather root entries in parallel
    const [srcEntries, rootEntries, specgenRaw, agentsRaw] = await Promise.all([
      window.electronAPI?.fs.readDir(wsRoot + '/src'),
      window.electronAPI?.fs.readDir(wsRoot),
      window.electronAPI?.fs.readFile(wsRoot + '/SPECGEN.md'),
      window.electronAPI?.fs.readFile(wsRoot + '/Agents.md'),
    ]);

    const hasSrc = srcEntries !== null;
    const specgenExists = !!specgenRaw;
    const agentsExists = !!agentsRaw;
    const candidates = (() => {
      const detected = this.detectEntrycandidates(rootEntries ?? []);
      if (hasSrc && !detected.includes('src/')) detected.unshift('src/');
      return detected;
    })();

    // Hash-verify workspace SPECGEN.md against bundled hash (seeded with version)
    type SpecgenIntegrity = 'verified' | 'modified' | 'missing';
    let specgenIntegrity: SpecgenIntegrity = 'missing';
    if (specgenRaw) {
      const wsHash = await sha256(`${SPECGEN_VERSION}:${specgenRaw}`);
      specgenIntegrity = wsHash === SPECGEN_HASH ? 'verified' : 'modified';
    }

    this.emptyState.innerHTML = '';
    this.emptyState.style.display = 'flex';

    // Icon + title
    const icon = document.createElement('div');
    icon.style.cssText = 'font-size:32px;opacity:0.18;margin-bottom:10px;color:var(--primary)';
    icon.textContent = '⬡';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:13px;font-weight:700;letter-spacing:1px;color:var(--primary);margin-bottom:8px';
    title.textContent = 'NO SPEC FILES';

    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:10px;color:var(--tertiary);margin-bottom:18px;line-height:1.6;max-width:340px';
    sub.textContent = hasSrc
      ? (specgenExists ? 'SPECGEN.md found. Copy the generation prompt and paste it into Claude.' : 'Write SPECGEN.md to this workspace and copy a 3-pass generation prompt.')
      : 'src/ not found. Choose the entry point for spec generation.';

    // Entry point section (always shown, always editable)
    const entrySection = document.createElement('div');
    entrySection.style.cssText = 'width:100%;max-width:320px;margin-bottom:16px;pointer-events:auto';

    const entryLabel = document.createElement('div');
    entryLabel.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:0.8px;color:var(--tertiary);margin-bottom:8px';
    entryLabel.textContent = 'ENTRY POINT — choose or type';
    entrySection.appendChild(entryLabel);

    // Chip row for candidates
    if (candidates.length > 0) {
      const chipRow = document.createElement('div');
      chipRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px';
      for (const c of candidates) {
        const chip = document.createElement('button');
        chip.style.cssText =
          'background:none;border:1px dashed var(--border);border-radius:5px;' +
          'padding:3px 10px;font-family:"Space Mono","Courier New",monospace;font-size:10px;' +
          'color:var(--tertiary);cursor:pointer;transition:border-color 0.12s,color 0.12s';
        chip.textContent = c;
        chip.addEventListener('mouseenter', () => { chip.style.borderColor = 'var(--accent)'; chip.style.color = 'var(--accent)'; chip.style.borderStyle = 'solid'; });
        chip.addEventListener('mouseleave', () => { chip.style.borderColor = ''; chip.style.color = ''; chip.style.borderStyle = ''; });
        chip.addEventListener('click', () => { entryInput.value = c; entryInput.focus(); });
        chipRow.appendChild(chip);
      }
      entrySection.appendChild(chipRow);
    }

    // Entry input
    const entryInput = document.createElement('input');
    entryInput.type = 'text';
    entryInput.value = candidates[0] ?? 'src/';
    entryInput.placeholder = 'e.g. src/ or docker-compose.yml';
    entryInput.style.cssText =
      'width:100%;box-sizing:border-box;background:var(--bg);border:1px dashed var(--border);' +
      'border-radius:6px;padding:6px 12px;font-family:"Space Mono","Courier New",monospace;' +
      'font-size:11px;color:var(--primary);outline:none;transition:border-color 0.12s;';
    entryInput.addEventListener('focus', () => { entryInput.style.borderColor = 'var(--accent)'; entryInput.style.borderStyle = 'solid'; });
    entryInput.addEventListener('blur', () => { entryInput.style.borderColor = ''; entryInput.style.borderStyle = ''; });
    entrySection.appendChild(entryInput);

    // Integrity badge
    const integrityBadge = document.createElement('div');
    integrityBadge.style.cssText =
      'font-size:10px;font-weight:700;letter-spacing:0.3px;margin-bottom:16px;pointer-events:none;' +
      'display:flex;align-items:center;gap:6px';
    const badgeConfig: Record<SpecgenIntegrity, { icon: string; text: string; color: string }> = {
      verified:  { icon: '✓', text: `SPECGEN.md verified · v${SPECGEN_VERSION}`, color: 'var(--green)' },
      modified:  { icon: '⚠', text: 'SPECGEN.md modified — differs from bundled template', color: 'var(--amber)' },
      missing:   { icon: '○', text: `SPECGEN.md will be written · v${SPECGEN_VERSION}`, color: 'var(--tertiary)' },
    };
    const bc = badgeConfig[specgenIntegrity];
    integrityBadge.innerHTML =
      `<span style="color:${bc.color}">${bc.icon}</span>` +
      `<span style="color:${bc.color};opacity:0.85">${bc.text}</span>`;
    if (specgenIntegrity === 'modified') {
      integrityBadge.title =
        `Hash mismatch: workspace SPECGEN.md differs from the v${SPECGEN_VERSION} bundled template. ` +
        `The prompt may not match the expected generation format.`;
    }

    // Generate button
    const btn = document.createElement('button');
    btn.className = 'sm-empty-btn';
    btn.style.pointerEvents = 'auto';
    btn.textContent = specgenExists ? '⚡ Copy Generation Prompt' : '⚡ Setup Spec Generation';

    // Hint
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:var(--tertiary);margin-top:12px;opacity:0.7;max-width:340px;line-height:1.5';
    hint.textContent = agentsExists
      ? 'Agents.md detected — prompt will include update instructions.'
      : 'Paste prompt into Claude or your AI assistant.';

    btn.addEventListener('click', () =>
      this.generateAndCopyPrompt(btn, wsRoot, specgenExists, entryInput.value.trim() || 'src/', specgenIntegrity)
    );

    this.emptyState.appendChild(icon);
    this.emptyState.appendChild(title);
    this.emptyState.appendChild(sub);
    this.emptyState.appendChild(entrySection);
    this.emptyState.appendChild(integrityBadge);
    this.emptyState.appendChild(btn);
    this.emptyState.appendChild(hint);
  }

  private async generateAndCopyPrompt(
    btn: HTMLButtonElement,
    wsRoot: string,
    specgenAlreadyExists: boolean,
    entryPath: string,
    integrity: 'verified' | 'modified' | 'missing',
  ): Promise<void> {
    btn.disabled = true;
    btn.textContent = 'Working…';

    if (!specgenAlreadyExists) {
      await window.electronAPI?.fs.writeFile(wsRoot + '/SPECGEN.md', SPECGEN_TEMPLATE);
    }

    const agentsRaw = await window.electronAPI?.fs.readFile(wsRoot + '/Agents.md') ?? null;

    const agentsSection = agentsRaw
      ? `## Step 0 — Update Agents.md\n\nAdd a "Spec System" section:\n- Spec files live in \`src/specs/\`, one per source module\n- \`src/specs/main.spec.json\` is the authoritative index\n- The SpecsMap plugin (Tools → SpecsMap) visualizes the dependency graph\n- When adding or changing source files, update the corresponding spec\n\n`
      : '';

    const isDir = entryPath.endsWith('/');
    const pass1 = isDir
      ? `Walk \`${entryPath}\` recursively. For every source file record:\n` +
        `- Full path from repo root\n` +
        `- Which other \`${entryPath}\` files it imports (runtime imports only, not node_modules)\n` +
        `- Its architectural layer: foundation / core / widget / modal / overlay / plugins\n\n` +
        `Print the complete file list before generating any spec. Do not skip files.`
      : `Start from \`${entryPath}\`. Map every service, component, or module it defines or references.\n` +
        `Follow references to Dockerfiles, scripts, config files, and source directories.\n` +
        `Build a complete inventory: entry = \`${entryPath}\`, then all referenced files/dirs.\n\n` +
        `Print the full inventory before generating any spec. Do not skip files.`;

    const pass2 = isDir
      ? `For each source file found in Pass 1, write \`src/specs/[feature-name].spec.json\` following SPECGEN.md exactly.\n` +
        `Required fields: name, file, description, type, layer, singleton, exports, dependencies (with usage), referenced_by, ipc, interface.\n` +
        `Write a companion \`[feature-name]-ui.spec.json\` for any component with 3 or more user interactions or complex DOM.\n` +
        `Keep descriptions specific — no generic phrases like "manages state" or "handles events".`
      : `For each service/component/module in the inventory, write \`src/specs/[feature-name].spec.json\` following SPECGEN.md.\n` +
        `Adapt the layer taxonomy to fit the project type. Use "foundation" for base infrastructure, "core" for primary logic, "plugins" for optional extensions.\n` +
        `Keep descriptions specific to what each component actually does.`;

    const integrityNote = integrity === 'modified'
      ? `> ⚠ SPECGEN.md integrity warning: the workspace copy differs from the v${SPECGEN_VERSION} ` +
        `bundled template (hash mismatch). Review SPECGEN.md before proceeding — it may have been ` +
        `intentionally updated or accidentally modified.\n\n`
      : '';

    const prompt =
      `# Task: Generate Spec Files\n\n` +
      integrityNote +
      `Follow the spec format defined in SPECGEN.md (now in your workspace root).\n` +
      `Entry point: \`${entryPath}\`\n\n` +
      agentsSection +
      `## Pass 1 — Codebase Discovery\n\n${pass1}\n\n` +
      `## Pass 2 — Individual Spec Files\n\n${pass2}\n\n` +
      `## Pass 3 — Index and Validation\n\n` +
      `Write \`src/specs/main.spec.json\`:\n` +
      `1. Group all specs under their layer in \`features\`\n` +
      `2. Build \`dependency_graph.edges\` from actual imports/references (not from spec fields)\n` +
      `3. Catalog IPC channels, scripts, or API routes observed across specs in \`ipc_channels\`\n` +
      `4. Validate: every \`dependencies[].file\` in each spec must match another spec's \`file\` field. Fix mismatches.\n\n` +
      `Start with Pass 1 now. List every file before writing any spec.\n`;

    await window.electronAPI?.clipboard.writeText(prompt);

    const label = specgenAlreadyExists ? '✓ Prompt Copied' : '✓ SPECGEN.md Written + Prompt Copied';
    btn.textContent = label;
    btn.style.borderColor = 'var(--green)';
    btn.style.borderStyle = 'solid';
    btn.style.color = 'var(--green)';

    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '⚡ Copy Generation Prompt';
      btn.style.borderColor = '';
      btn.style.borderStyle = '';
      btn.style.color = '';
    }, 3000);
  }

  private findCycles(): Set<string>[] {
    const adj = new Map<string, string[]>();
    const nodeIds = new Set(this.nodes.map(n => n.id));
    for (const n of this.nodes) {
      adj.set(n.id, n.deps.filter(d => nodeIds.has(d)));
    }

    const index = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    let idx = 0;
    const sccs: Set<string>[] = [];

    const strongconnect = (v: string) => {
      index.set(v, idx);
      lowlink.set(v, idx);
      idx++;
      stack.push(v);
      onStack.add(v);

      for (const w of adj.get(v) ?? []) {
        if (!index.has(w)) {
          strongconnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
        }
      }

      if (lowlink.get(v) === index.get(v)) {
        const scc = new Set<string>();
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.add(w);
        } while (w !== v);
        if (scc.size > 1) sccs.push(scc);
      }
    };

    for (const v of adj.keys()) {
      if (!index.has(v)) strongconnect(v);
    }

    return sccs;
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
    let group = this.svg.querySelector('#sm-isolated-group') as SVGGElement | null;
    if (!group) {
      group = document.createElementNS(ns, 'g');
      group.id = 'sm-isolated-group';
      this.svg.appendChild(group);
    }
    group.appendChild(rect);
  }

  private removeIsolatedBorderRects(): void {
    const group = this.svg.querySelector('#sm-isolated-group');
    if (group) group.innerHTML = '';
  }

  private applyIsolatedHighlights(): void {
    const isolatedIds = new Set<string>();
    for (const n of this.nodes) {
      if (n.isUI) continue;
      const refCount = this.refCounts.get(n.id) ?? 0;
      if (n.deps.length === 0 && refCount === 0) isolatedIds.add(n.id);
    }
    if (isolatedIds.size === 0) {
      this.isolatedMode = false;
      return;
    }

    const addRects = (nid: string) => {
      const node = this.nodes.find(n => n.id === nid);
      if (node) this.addIsolatedBorderRect(node.x, node.y, node.w, node.h);
    };

    if (this.cycleMode) {
      for (const [nid, el] of this.nodeEls) {
        if (isolatedIds.has(nid) && !this.cycleSets.some(c => c.has(nid))) {
          el.classList.add('sm-isolated');
          el.style.opacity = '1';
          addRects(nid);
        }
      }
      return;
    }

    for (const [nid, el] of this.nodeEls) {
      if (isolatedIds.has(nid)) {
        el.classList.add('sm-isolated');
        el.style.opacity = '1';
        addRects(nid);
      } else {
        el.style.opacity = '0.14';
      }
    }
    for (const path of this.svg.querySelectorAll<SVGPathElement>('path[data-source]')) {
      if (path.dataset.etype !== 'ui') path.setAttribute('opacity', '0.04');
    }
  }

  private clearIsolatedHighlights(): void {
    this.removeIsolatedBorderRects();
    for (const [, el] of this.nodeEls) el.classList.remove('sm-isolated');
    if (this.cycleMode) { this.applyCycleHighlights(); return; }
    for (const [, el] of this.nodeEls) {
      el.style.opacity = '';
      el.style.borderColor = '';
      el.style.borderStyle = '';
      el.style.boxShadow = '';
    }
    for (const path of this.svg.querySelectorAll<SVGPathElement>('path[data-source]')) {
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
    const cycleNodeIds = new Set<string>();
    for (const cycle of this.cycleSets) {
      for (const id of cycle) cycleNodeIds.add(id);
    }
    for (const node of this.nodes) {
      if (!cycleNodeIds.has(node.id)) continue;
      for (const depId of node.deps) {
        if (!cycleNodeIds.has(depId)) continue;
        const cycleIdx = this.cycleSets.findIndex(c => c.has(node.id) && c.has(depId));
        if (cycleIdx === -1) continue;
        const target = this.nodes.find(n => n.id === depId);
        if (!target) continue;
        const midX = (node.x + node.w / 2 + target.x + target.w / 2) / 2;
        const midY = (node.y + node.h / 2 + target.y + target.h / 2) / 2;
        hits.push({ cx: midX * this.scale + this.panX, cy: midY * this.scale + this.panY, cycleIdx });
      }
    }
    return hits;
  }

  private getAffectedNodes(cycleNodeIds: Set<string>): Set<string> {
    if (this.cycleLevel <= 1) return cycleNodeIds;

    const affected = new Set(cycleNodeIds);
    const adj = new Map<string, string[]>();
    for (const n of this.nodes) adj.set(n.id, n.deps);

    const queue = [...cycleNodeIds];
    let hops = 0;
    while (queue.length > 0 && hops < this.cycleLevel) {
      const levelSize = queue.length;
      for (let i = 0; i < levelSize; i++) {
        const id = queue.shift()!;
        for (const dep of adj.get(id) ?? []) {
          if (!affected.has(dep)) { affected.add(dep); queue.push(dep); }
        }
        for (const n of this.nodes) {
          if (n.deps.includes(id) && !affected.has(n.id)) { affected.add(n.id); queue.push(n.id); }
        }
      }
      hops++;
    }
    return affected;
  }

  private applyCycleHighlights(): void {
    if (this.cycleSets.length === 0) return;

    const cycleNodeIds = new Set<string>();
    for (const cycle of this.cycleSets) {
      for (const id of cycle) cycleNodeIds.add(id);
    }

    const highlighted = this.getAffectedNodes(cycleNodeIds);
    const CYCLE_COLORS = ['#f87171', '#fb923c', '#fbbf24', '#f472b6', '#a78bfa'];

    for (const [nid, el] of this.nodeEls) {
      if (highlighted.has(nid)) {
        if (cycleNodeIds.has(nid)) {
          const cycleIdx = this.cycleSets.findIndex(c => c.has(nid));
          const isSelected = cycleIdx === this.selectedCycleIndex;
          const c = CYCLE_COLORS[cycleIdx % CYCLE_COLORS.length];
          el.style.borderColor = c;
          el.style.borderStyle = 'solid';
          el.style.boxShadow = isSelected
            ? `0 0 0 2px ${c}, 0 0 20px ${c}55`
            : `0 0 0 1px ${c}44, 0 0 14px ${c}33`;
          el.style.opacity = isSelected ? '1' : (this.selectedCycleIndex !== null ? '0.5' : '1');
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

    for (const path of this.svg.querySelectorAll<SVGPathElement>('path[data-source]')) {
      const src = path.dataset.source!;
      const tgt = path.dataset.target!;
      const etype = path.dataset.etype!;
      const bothInCycle = cycleNodeIds.has(src) && cycleNodeIds.has(tgt);
      const sameCycle = bothInCycle && this.cycleSets.some(c => c.has(src) && c.has(tgt));
      if (sameCycle) {
        const cycleIdx = this.cycleSets.findIndex(c => c.has(src));
        const isSelected = cycleIdx === this.selectedCycleIndex;
        const c = CYCLE_COLORS[cycleIdx % CYCLE_COLORS.length];
        if (etype === 'glow') {
          path.style.stroke = c;
          path.setAttribute('opacity', isSelected ? '0.4' : '0.25');
        } else {
          path.style.stroke = c;
          path.setAttribute('opacity', isSelected ? '1' : (this.selectedCycleIndex !== null ? '0.3' : '1'));
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
    for (const [, el] of this.nodeEls) {
      el.classList.remove('sm-isolated');
      el.style.opacity = '';
      el.style.borderColor = '';
      el.style.borderStyle = '';
      el.style.boxShadow = '';
    }
    for (const path of this.svg.querySelectorAll<SVGPathElement>('path[data-source]')) {
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
    if (this.isolatedMode) this.applyIsolatedHighlights();
  }

  destroy(): void {
    document.removeEventListener('mousemove', this.onDocMouseMove);
    document.removeEventListener('mouseup', this.onDocMouseUp);
    this.nodeEls.clear();
    this.specRawMap.clear();
  }
}
