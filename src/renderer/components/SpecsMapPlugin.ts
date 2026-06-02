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
const LAYER_GAP = 60;
const UI_OFFSET_Y = 64;
const PANEL_W = 320;
const GRAPH_MARGIN = 80;

const LAYER_ORDER = ['foundation', 'core', 'widget', 'modal', 'overlay', 'plugins'];
const LAYER_LABELS: Record<string, string> = {
  foundation: 'Foundation',
  core: 'Core',
  widget: 'Widget',
  modal: 'Modal',
  overlay: 'Overlay',
  plugins: 'Plugins',
};

const LAYER_COLORS_VAR: Record<string, string> = {
  foundation: 'var(--green)',
  core: 'var(--accent)',
  widget: 'var(--accent2)',
  modal: 'var(--amber)',
  overlay: 'var(--red)',
  plugins: 'var(--secondary)',
};

const LAYER_COLORS_HEX: Record<string, string> = {
  foundation: '#4ade80',
  core: '#5a8af4',
  widget: '#a78bfa',
  modal: '#fbbf24',
  overlay: '#f87171',
  plugins: '#94a3b8',
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
  private snapshotPath = '';
  private nodes: SpecNode[] = [];
  private nodeEls = new Map<string, HTMLDivElement>();
  private specRawMap = new Map<string, SpecData>();
  private refCounts = new Map<string, number>();
  private selectedId: string | null = null;
  private panelOpen = false;
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
      'padding:3px 10px 3px 12px;font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--accent);' +
      'flex-shrink:0;border-bottom:1px solid var(--border);user-select:none;display:flex;align-items:center;gap:10px;z-index:10;position:relative';

    const headerSub = document.createElement('span');
    headerSub.className = 'sm-header-sub';
    headerSub.style.cssText = 'font-size:10px;color:var(--tertiary);font-weight:400;letter-spacing:0.3px;text-transform:none;flex-shrink:0';
    headerSub.textContent = 'hover to trace · click for detail';

    const headerPath = document.createElement('span');
    headerPath.style.cssText = 'font-size:8px;color:var(--tertiary);opacity:0.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0';
    headerPath.textContent = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '') + '/src/specs/';

    this.validationBadge = document.createElement('span');
    this.validationBadge.style.cssText =
      'display:none;font-size:8px;font-weight:700;letter-spacing:0.3px;padding:1px 6px;' +
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

    // title, subtitle, validation, refresh, then reset-view (eye) on the right
    header.appendChild(headerSub);
    header.appendChild(headerPath);
    header.appendChild(this.validationBadge);
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
        overflow: hidden;
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
      .sm-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
      .sm-name {
        font-size: 10px; font-weight: 700; color: var(--primary);
        line-height: 1.2; flex: 1; min-width: 0;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .sm-layer-badge { font-size: 7px; font-weight: 700; letter-spacing: 0.8px; flex-shrink: 0; color: var(--tertiary); opacity: 0.8; }
      .sm-file { font-size: 8.5px; color: var(--tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sm-meta { font-size: 8px; color: var(--secondary); margin-top: auto; display: flex; gap: 6px; }
      .sm-node-ui .sm-name { font-size: 9px; }
      .sm-node-ui .sm-file { font-size: 7.5px; }
      .sm-node-ui .sm-dot { width: 5px; height: 5px; opacity: 0.6; }
      .sm-layer-header {
        position: absolute; font-size: 10px; font-weight: 700; letter-spacing: 1.5px;
        user-select: none; pointer-events: none; opacity: 0.45;
      }
      .sm-panel-section { padding: 10px 14px; border-bottom: 1px solid var(--border); }
      .sm-panel-label {
        font-size: 8px; font-weight: 700; letter-spacing: 1px;
        color: var(--tertiary); margin-bottom: 8px;
      }
      .sm-panel-row { font-size: 10px; color: var(--primary); line-height: 1.5; }
      .sm-panel-mono { font-size: 9px; color: var(--secondary); word-break: break-all; }
      .sm-dep-item {
        display: flex; gap: 6px; align-items: baseline;
        padding: 4px 0; border-bottom: 1px solid var(--border);
        font-size: 9px;
      }
      .sm-dep-item:last-child { border-bottom: none; }
      .sm-dep-name { font-weight: 700; color: var(--primary); flex-shrink: 0; }
      .sm-dep-file { color: var(--tertiary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sm-dep-usage { font-size: 8px; color: var(--secondary); line-height: 1.4; margin-top: 1px; }
      @keyframes sm-flow { to { stroke-dashoffset: -20; } }
      .sm-edge-active { animation: sm-flow 0.8s linear infinite; }
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
    `;
    document.head.appendChild(style);
  }

  private initInteractions(): void {
    this.viewport.addEventListener('wheel', (e) => {
      e.stopPropagation();
      if (e.ctrlKey) {
        e.preventDefault();
        const rect = this.viewport.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const oldScale = this.scale;
        const maxScale = Math.max(this.fitScale * 3, 1.0);
        this.scale = Math.max(this.fitScale, Math.min(maxScale, this.scale * (1 + -e.deltaY * 0.001)));
        this.panX = mx - (mx - this.panX) * (this.scale / oldScale);
        this.panY = my - (my - this.panY) * (this.scale / oldScale);
        this.applyTransform();
      } else {
        this.panY -= e.deltaY;
        this.applyTransform();
      }
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

    // Click on canvas background → close panel
    this.viewport.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.sm-node')) this.closePanel();
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
    } catch {
      this.nodeLayer.innerHTML =
        '<div style="padding:16px;color:var(--red);font-size:14px">Error loading specs</div>';
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
    } catch { return false; }
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
    const base = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '') + '/src/specs/';

    const mainRaw = await window.electronAPI?.fs.readFile(base + 'main.spec.json') ?? '{}';
    let mainData: any = {};
    try { mainData = JSON.parse(mainRaw); } catch { /* empty */ }

    const specLayerMap = new Map<string, string>();
    const specToUI = new Map<string, string>();
    const uiToParent = new Map<string, string>();

    for (const [layer, features] of Object.entries(mainData.features ?? {})) {
      for (const feat of features as any[]) {
        if (feat.spec) {
          specLayerMap.set(feat.spec, layer);
          if (feat.ui) {
            specToUI.set(feat.spec, feat.ui);
            uiToParent.set(feat.ui, feat.spec);
            specLayerMap.set(feat.ui, layer);
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
      const raw = await window.electronAPI?.fs.readFile(base + filename);
      if (raw) {
        try { this.specRawMap.set(filename, JSON.parse(raw)); } catch { /* skip */ }
      }
    }

    const sourceToSpec = new Map<string, string>();
    for (const [filename, data] of this.specRawMap) {
      if (data.file) sourceToSpec.set(data.file.split('/').pop()!, filename);
    }

    const rawNodes: SpecNode[] = [];
    for (const [filename, data] of this.specRawMap) {
      const isUI = uiToParent.has(filename);
      const layer = specLayerMap.get(filename) ?? data.layer ?? 'plugins';
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

  private async refresh(): Promise<void> {
    this.refreshBtn.disabled = true;
    this.refreshBtn.querySelector('svg')?.classList.add('sm-spinning');

    // Clear current state
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
    } catch {
      this.nodeLayer.innerHTML =
        '<div style="padding:16px;color:var(--red);font-size:14px">Error refreshing specs</div>';
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

      const rowW = items.length * NODE_W + (items.length - 1) * NODE_GAP;
      const startX = -rowW / 2;

      for (let i = 0; i < items.length; i++) {
        items[i].x = startX + i * (NODE_W + NODE_GAP);
        items[i].y = globalY;
      }

      const layerUI = uiNodes.filter(u => u.parentId && items.some(m => m.id === u.parentId));
      for (const uiNode of layerUI) {
        const parent = nodeById.get(uiNode.parentId!);
        if (parent) {
          uiNode.x = parent.x + (NODE_W - NODE_UI_W) / 2;
          uiNode.y = globalY + NODE_H + UI_OFFSET_Y;
        }
      }

      const hasUI = layerUI.length > 0;
      globalY += NODE_H + (hasUI ? UI_OFFSET_Y + NODE_UI_H + 20 : 0) + LAYER_GAP;
    }

    return nodes;
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

      if (node.isUI) {
        el.innerHTML =
          `<div class="sm-node-inner">` +
          `<div class="sm-node-head">` +
          `<span class="sm-dot" style="background:${colorHex};opacity:0.5"></span>` +
          `<span class="sm-name" style="opacity:0.7">${node.name}</span>` +
          `</div>` +
          `<div class="sm-file">${node.specFile}</div>` +
          `</div>`;
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
          `</div>`;
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

    const sameRow = Math.abs(src.y - tgt.y) < 4;
    if (sameRow) {
      const goRight = tgt.x > src.x;
      const x1 = goRight ? src.x + src.w : src.x;
      const y1 = src.y + src.h / 2;
      const x2 = goRight ? tgt.x : tgt.x + tgt.w;
      const y2 = tgt.y + tgt.h / 2;
      const dx = Math.abs(x2 - x1);
      const sign = goRight ? 1 : -1;
      return { x1, y1, x2, y2, cx1: x1 + dx * 0.45 * sign, cy1: y1, cx2: x2 - dx * 0.45 * sign, cy2: y2 };
    }

    const srcAbove = src.y < tgt.y;
    const x1 = src.x + src.w / 2;
    const y1 = srcAbove ? src.y + src.h : src.y;
    const x2 = tgt.x + tgt.w / 2;
    const y2 = srcAbove ? tgt.y : tgt.y + tgt.h;
    const dy = y2 - y1, dx = x2 - x1;
    return { x1, y1, x2, y2, cx1: x1 + dx * 0.1, cy1: y1 + dy * 0.5, cx2: x2 - dx * 0.1, cy2: y2 - dy * 0.5 };
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
    // Deselect previous
    if (this.selectedId) {
      const prev = this.nodeEls.get(this.selectedId);
      if (prev) prev.classList.remove('sm-selected');
    }

    if (this.selectedId === id && this.panelOpen) {
      this.closePanel();
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

    const targetScale = Math.min(cw / (node.w * 3), ch / (node.h * 3), 1.5);
    const scale = Math.max(targetScale, this.fitScale);
    const targetPanX = (cw - node.w * scale) / 2 - node.x * scale;
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
    } catch {
      this.panelHeaderEl.innerHTML = '';
      this.panelInner.innerHTML =
        '<div class="sm-panel-section" style="color:var(--red);font-size:12px">Error rendering spec</div>';
    }
  }

  private closePanel(): void {
    this.panelOpen = false;
    this.panel.style.transform = 'translateX(100%)';
    this.panel.style.pointerEvents = 'none';
    if (this.selectedId) {
      const prev = this.nodeEls.get(this.selectedId);
      if (prev) prev.classList.remove('sm-selected');
    }
    this.selectedId = null;
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
    const identity =
      `<div class="sm-panel-section">` +
      `<div class="sm-panel-label">SPEC FILE</div>` +
      `<div class="sm-panel-mono">${esc(node.specFile)}</div>` +
      (node.sourceFile ? `<div class="sm-panel-label" style="margin-top:8px">SOURCE FILE</div><div class="sm-panel-mono">${esc(node.sourceFile)}</div>` : '') +
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
      ?.addEventListener('click', () => this.closePanel());

    for (const el of this.panelInner.querySelectorAll<HTMLElement>('[data-goto]')) {
      el.addEventListener('click', () => this.selectNode(el.dataset.goto!));
    }
    for (const el of this.panelHeaderEl.querySelectorAll<HTMLElement>('[data-goto]')) {
      el.addEventListener('click', () => this.selectNode(el.dataset.goto!));
    }
  }

  private fitGraph(): void {
    if (this.nodes.length === 0) return;
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
    this.fitScale = Math.min(fitX, fitY, 1.0);
    this.scale = this.fitScale;

    // Center both axes
    this.panX = (cw - graphW * this.scale) / 2 - minX * this.scale;
    this.panY = (ch - graphH * this.scale) / 2 - minY * this.scale;

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
    const candidates = hasSrc ? ['src/'] : this.detectEntrycandidates(rootEntries ?? []);

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

    // Entry point section (always shown; readonly when hasSrc)
    const entrySection = document.createElement('div');
    entrySection.style.cssText = 'width:100%;max-width:320px;margin-bottom:16px;pointer-events:auto';

    const entryLabel = document.createElement('div');
    entryLabel.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:0.8px;color:var(--tertiary);margin-bottom:8px';
    entryLabel.textContent = hasSrc ? 'ENTRY POINT' : 'ENTRY POINT — choose or type';
    entrySection.appendChild(entryLabel);

    // Chip row for candidates
    if (candidates.length > 0 && !hasSrc) {
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
    entryInput.readOnly = hasSrc;
    entryInput.style.cssText =
      'width:100%;box-sizing:border-box;background:var(--bg);border:1px dashed var(--border);' +
      'border-radius:6px;padding:6px 12px;font-family:"Space Mono","Courier New",monospace;' +
      'font-size:11px;color:var(--primary);outline:none;' +
      (hasSrc ? 'opacity:0.5;cursor:default;' : 'transition:border-color 0.12s;');
    if (!hasSrc) {
      entryInput.addEventListener('focus', () => { entryInput.style.borderColor = 'var(--accent)'; entryInput.style.borderStyle = 'solid'; });
      entryInput.addEventListener('blur', () => { entryInput.style.borderColor = ''; entryInput.style.borderStyle = ''; });
    }
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

  destroy(): void {
    document.removeEventListener('mousemove', this.onDocMouseMove);
    document.removeEventListener('mouseup', this.onDocMouseUp);
    this.nodeEls.clear();
    this.specRawMap.clear();
  }
}
