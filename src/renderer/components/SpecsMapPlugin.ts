import SPECGEN_TEMPLATE from '../../../SPECGEN.md';
import { SPECGEN_HASH, SPECGEN_VERSION } from '../specgen-hash';
import { parseSpecDoc, type SpecDoc } from '../specs/format';
import { buildGraph, buildMainIndex, contextMarkdown, search as graphSearch } from '../specs/graph';
import { reconcile } from '../specs/reconcile';
import { corpusHash, loadSnapshot as loadSnapshotV2, makeSnapshot } from '../specs/snapshot';
import { staleFooter, summarizeReport, validate } from '../specs/validate';
import type { ReconcileMode, SpecGraph, ValidationReport } from '../specs/types';
import {
  computeLayout, GRAPH_MARGIN, LAYER_COLORS_HEX, LAYER_COLORS_VAR, LAYER_LABELS,
  NODE_GAP, NODE_H, NODE_UI_H, NODE_UI_W, NODE_W, PANEL_W, PORT_OFFSET, type SpecNode,
} from '../specs/layout';
import { CyclesController, CYCLE_COLORS, type CyclesHost } from './specsmap/cycles';
import { SearchController, type SearchHost } from './specsmap/search';

interface SpecData {
  name?: string;
  file?: string;
  entry?: string;
  title?: string;
  parent?: string;
  layer?: string;
  dependencies?: Array<{ feature: string; file: string; usage?: string }>;
  referenced_by?: Array<{ feature: string; file: string }>;
  ui?: { spec: string };
  ipc?: string[];
  description?: string;
  scripts?: Record<string, string>;
  build?: Record<string, string>;
  [key: string]: unknown;
}

interface SpecCollection {
  title: string;
  specsDir: string;
  mainData: Record<string, unknown> | null;
}

interface SnapNode {
  id: string;
  name: string;
  specFile: string;
  sourceFile: string;
  isEntry: boolean;
  entryPath: string;
  layer: string;
  isUI: boolean;
  parentId?: string;
  uiChildId?: string;
  deps: string[];
  raw: Record<string, unknown>;
}

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
  private collections: SpecCollection[] = [];
  private activeCollectionIndex = 0;
  private tabBar!: HTMLDivElement;
  private nodes: SpecNode[] = [];
  private nodeEls = new Map<string, HTMLDivElement>();
  private specRawMap = new Map<string, SpecData>();
  private refCounts = new Map<string, number>();
  private selectedId: string | null = null;
  private panelOpen = false;
  private readyResolve!: () => void;
  readonly ready: Promise<void>;
  private panelShowingSettings = false;
  private cycles!: CyclesController;
  private cycleBtn!: HTMLButtonElement;
  private panX = 0;
  private panY = 0;
  private readonly onDocMouseMove: (e: MouseEvent) => void;
  private readonly onDocMouseUp: () => void;
  private readonly onSearchKeydown: (e: KeyboardEvent) => void;
  private scale = 1;
  private fitScale = 1;
  private dragMode: 'none' | 'pan' = 'none';
  private panStartX = 0;
  private panStartY = 0;
  private panStartPanX = 0;
  private panStartPanY = 0;
  private cachedEdgePaths: SVGPathElement[] = [];
  private pendingMouseX = 0;
  private pendingMouseY = 0;
  private rafPanPending = false;
  private resizeObserver: ResizeObserver | null = null;

  // SPECGEN runtime state (graph is a projection; *.spec.md is canonical)
  private graph: SpecGraph | null = null;
  private specDocs = new Map<string, SpecDoc>();
  private report: ValidationReport | null = null;
  private driftDirty = false;
  private lastRendered: string | null = null; // `${collectionId}:${hash}` of the last renderGraph() call
  private fileUnsub: (() => void) | null = null;
  private specReloadTimer: ReturnType<typeof setTimeout> | null = null;

  // Search state
  private search!: SearchController;
  private searchBtn!: HTMLButtonElement;

  onFileOpen: ((filePath: string) => void) | null = null;

  private esc(s: unknown): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private parseSpecMd(raw: string): SpecData {
    const data: SpecData = {};
    const lines = raw.split('\n');
    let i = 0;

    if (lines[0] === '---') {
      i = 1;
      while (i < lines.length && lines[i] !== '---') {
        const kv = lines[i].match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
        if (kv) {
          const key = kv[1], val = kv[2].trim();
          if (val === 'true') (data as any)[key] = true;
          else if (val === 'false') (data as any)[key] = false;
          else if (/^\[.*\]$/.test(val)) {
            const inner = val.slice(1, -1).trim();
            (data as any)[key] = inner ? inner.split(',').map(s => s.trim()).filter(Boolean) : [];
          } else (data as any)[key] = val;
        }
        i++;
      }
      i++;
    }

    const sections = new Map<string, string[]>();
    let currentSection: string | null = null;
    let currentLines: string[] = [];
    let descLines: string[] = [];
    let inDesc = false;

    for (; i < lines.length; i++) {
      const line = lines[i];
      if (!inDesc && line.startsWith('# ') && !line.startsWith('## ')) { inDesc = true; continue; }
      if (line.startsWith('## ')) {
        if (currentSection !== null) sections.set(currentSection, currentLines);
        else if (inDesc) data.description = descLines.join('\n').trim() || undefined;
        currentSection = line.slice(3).trim();
        currentLines = [];
        inDesc = false;
      } else if (inDesc) {
        descLines.push(line);
      } else if (currentSection !== null) {
        currentLines.push(line);
      }
    }
    if (currentSection !== null) sections.set(currentSection, currentLines);
    else if (inDesc && descLines.length) data.description = descLines.join('\n').trim() || undefined;

    const deps: Array<{feature: string; file: string; usage?: string}> = [];
    for (const line of sections.get('Dependencies') ?? []) {
      // Handles: [[spec.md|name]] `file` — usage  OR  **name** `file` — usage
      const m = line.match(/^-\s+(?:\[\[[^\]|]*\|([^\]]+)\]\]|\*\*([^*]+)\*\*)\s+`([^`]+)`(?:\s+[—–-]\s+(.+))?/);
      if (m) deps.push({ feature: (m[1] ?? m[2] ?? '').trim(), file: m[3].trim(), ...(m[4] ? { usage: m[4].trim() } : {}) });
    }
    if (deps.length) data.dependencies = deps;

    const refs: Array<{feature: string; file: string}> = [];
    for (const line of sections.get('Referenced By') ?? []) {
      // Handles: [[spec.md|name]] `file`  OR  **name** `file`
      const m = line.match(/^-\s+(?:\[\[[^\]|]*\|([^\]]+)\]\]|\*\*([^*]+)\*\*)\s+`([^`]+)`/);
      if (m) refs.push({ feature: (m[1] ?? m[2] ?? '').trim(), file: m[3].trim() });
    }
    if (refs.length) data.referenced_by = refs;

    const ipc: string[] = [];
    for (const line of sections.get('IPC Channels') ?? []) {
      const m = line.match(/^-\s+`([^`]+)`/);
      if (m) ipc.push(m[1]);
    }
    if (ipc.length) data.ipc = ipc;

    const scripts: Record<string, string> = {};
    for (const line of sections.get('Scripts') ?? []) {
      const m = line.match(/^-\s+\*\*([^*]+)\*\*:\s+`([^`]+)`/);
      if (m) scripts[m[1]] = m[2];
    }
    if (Object.keys(scripts).length) data.scripts = scripts;

    const build: Record<string, string> = {};
    for (const line of sections.get('Build') ?? []) {
      const m = line.match(/^-\s+\*\*([^*]+)\*\*:\s+`([^`]+)`/);
      if (m) build[m[1]] = m[2];
    }
    if (Object.keys(build).length) data.build = build;

    return data;
  }

  private parseMainSpecMd(raw: string): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const lines = raw.split('\n');
    let i = 0;

    if (lines[0] === '---') {
      i = 1;
      while (i < lines.length && lines[i] !== '---') {
        const kv = lines[i].match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
        if (kv) data[kv[1]] = kv[2].trim();
        i++;
      }
      i++;
    }

    let inFeatures = false;
    let currentLayer: string | null = null;
    let inTable = false;
    let tableHeaders: string[] = [];
    const features: Record<string, Record<string, string>[]> = {};

    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line === '## Features') { inFeatures = true; continue; }
      if (inFeatures && line.startsWith('## ') && line !== '## Features') break;
      if (!inFeatures) continue;
      if (line.startsWith('### ')) {
        currentLayer = line.slice(4).trim();
        inTable = false; tableHeaders = [];
        features[currentLayer] = [];
        continue;
      }
      if (currentLayer && line.startsWith('|')) {
        const cells = line.split('|').slice(1, -1).map(s => s.trim());
        if (cells.every(c => /^[-:\s]+$/.test(c))) continue;
        if (!inTable) { tableHeaders = cells; inTable = true; continue; }
        const row: Record<string, string> = {};
        // Strip [[...]] wiki-link brackets from cell values (Obsidian links → plain filenames)
        tableHeaders.forEach((h, idx) => { row[h] = (cells[idx] ?? '').replace(/^\[\[(.+)\]\]$/, '$1'); });
        features[currentLayer].push(row);
      }
    }

    if (Object.keys(features).length) data.features = features;
    return data;
  }

  private specFullPath(filename: string): string {
    const base = this.specBaseDir || (this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '') + '/src/specs');
    return base + '/' + filename;
  }

  private tryResolveSourcePath(rawData: Record<string, unknown>): string {
    const filePath = (rawData as any).file;
    const entryPath = (rawData as any).entry;
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    if (filePath && typeof filePath === 'string') return wsRoot + '/' + filePath;
    if (entryPath && typeof entryPath === 'string') return wsRoot + '/' + entryPath;
    return '';
  }

  constructor(container: HTMLElement, wsPath: string) {
    this.wsPath = wsPath;
    this.snapshotPath = wsPath.replace(/\\/g, '/').replace(/\/?$/, '') + '/.cockpit/specsmap.json';
    this.ready = new Promise(resolve => { this.readyResolve = resolve; });

    this.onDocMouseMove = (e: MouseEvent) => {
      if (this.dragMode === 'none') return;
      this.pendingMouseX = e.clientX;
      this.pendingMouseY = e.clientY;
      if (!this.rafPanPending) {
        this.rafPanPending = true;
        requestAnimationFrame(() => {
          this.panX = this.panStartPanX + (this.pendingMouseX - this.panStartX);
          this.panY = this.panStartPanY + (this.pendingMouseY - this.panStartY);
          this.applyTransform();
          this.rafPanPending = false;
        });
      }
    };
    this.onDocMouseUp = () => {
      this.dragMode = 'none';
      this.viewport.style.cursor = '';
      this.nodeLayer.style.willChange = '';
      this.svg.style.willChange = '';
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
    this.validationBadge.className = 'sm-validation-badge';
    this.validationBadge.style.cssText =
      'display:none;font-size:9px;font-weight:700;letter-spacing:0.3px;padding:1px 6px;' +
      'border-radius:4px;border:1px solid;line-height:1.6;white-space:nowrap';
    this.validationBadge.addEventListener('click', () => this.openSettingsPanel());

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

    const SVG_SEARCH =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16" height="16" ` +
      `fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M221.09 64a157.09 157.09 0 1 0 0 314.17 157.09 157.09 0 0 0 0-314.17z" stroke-miterlimit="10"/>` +
      `<path d="M338.29 338.29L448 448" stroke-miterlimit="10"/>` +
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

    this.searchBtn = document.createElement('button');
    this.searchBtn.className = 'sm-header-btn';
    this.searchBtn.innerHTML = SVG_SEARCH;
    this.searchBtn.title = 'Search nodes (Ctrl+F)';
    this.searchBtn.addEventListener('click', () => this.search.toggle());
    header.appendChild(this.searchBtn);

    header.appendChild(this.cycleBtn);
    header.appendChild(this.refreshBtn);
    header.appendChild(this.fitBtn);
    this.el.appendChild(header);

    // Tab bar (hidden by default, shown when 2+ collections found)
    this.tabBar = document.createElement('div');
    this.tabBar.style.cssText =
      'display:none;flex-shrink:0;padding:0 6px;border-bottom:1px solid var(--border);' +
      'background:var(--bg);gap:0;overflow-x:auto;overflow-y:hidden';
    this.tabBar.style.display = 'none';
    this.el.appendChild(this.tabBar);

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
    this.viewport.style.cssText = 'position:absolute;inset:0;overflow:hidden;contain:layout style';
    this.viewport.appendChild(this.svg);
    this.viewport.appendChild(this.nodeLayer);

    // Empty state: sits above the canvas, not inside the pan/zoom transform
    this.emptyState = document.createElement('div');
    this.emptyState.style.cssText =
      'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;' +
      'justify-content:center;z-index:10;padding:40px;text-align:center;pointer-events:none';
    this.viewport.appendChild(this.emptyState);

    content.appendChild(this.viewport);

    this.resizeObserver = new ResizeObserver(() => this.fitGraph());
    this.resizeObserver.observe(this.viewport);

    // Side panel (overlays right side)
    this.panel = document.createElement('div');
    this.panel.className = 'sm-panel-el';
    this.panel.style.cssText =
      `position:absolute;right:0;top:0;bottom:0;width:${PANEL_W}px;` +
      'background:var(--surface);border-left:1px solid var(--border);z-index:20;' +
      'transform:translateX(100%);' +
      'display:flex;flex-direction:column;overflow:hidden;pointer-events:none';

    // Fixed header (never scrolls)
    this.panelHeaderEl = document.createElement('div');
    this.panelHeaderEl.style.cssText =
      'flex-shrink:0;border-bottom:1px solid var(--border)';
    this.panel.appendChild(this.panelHeaderEl);

    // Scrollable body
    this.panelInner = document.createElement('div');
    this.panelInner.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden';
    this.panel.appendChild(this.panelInner);
    content.appendChild(this.panel);

    // Search bar (slides down from top of content area)
    const searchHost: SearchHost = {
      getNodes: () => this.nodes,
      getSpecData: (id) => this.specRawMap.get(id),
      getNodeEls: () => this.nodeEls,
      selectNode: (id, fromSearch) => this.selectNode(id, fromSearch),
    };
    this.search = new SearchController(content, SVG_SEARCH, searchHost, () => {
      this.searchBtn.style.color = this.search.isOpen ? 'var(--accent)' : '';
    });

    // Cycle-detection + isolated-node highlighting
    const cyclesHost: CyclesHost = {
      getGraph: () => this.graph,
      getNodes: () => this.nodes,
      getNodeEls: () => this.nodeEls,
      getEdgePaths: () => this.cachedEdgePaths,
      getRefCount: (id) => this.refCounts.get(id) ?? 0,
      getViewTransform: () => ({ scale: this.scale, panX: this.panX, panY: this.panY }),
      svg: this.svg,
    };
    this.cycles = new CyclesController(cyclesHost, () => {
      this.updateCycleBtnColor();
      if (this.panelShowingSettings) this.renderSettingsContent();
    });

    container.appendChild(this.el);

    this.injectStyles();
    this.initInteractions();
    this.loadSpecs();
    this.watchForChanges();
  }

  private updateCycleBtnColor(): void {
    const active = this.panelShowingSettings || this.cycles.cycleMode || this.cycles.isolatedMode;
    this.cycleBtn.style.color = active ? 'var(--accent)' : '';
  }

  /**
   * Freshness (R5): spec edits auto-reload the graph (debounced); source
   * edits only mark drift — never a silent structural rewrite.
   */
  private watchForChanges(): void {
    const api = window.electronAPI;
    if (!api?.fs.onChanged) return;
    this.fileUnsub = api.fs.onChanged((filePath: string) => {
      const p = filePath.replace(/\\/g, '/');
      const specsDir = this.specBaseDir;
      if (specsDir && p.startsWith(specsDir + '/') && p.endsWith('.spec.md')) {
        if (this.specReloadTimer) clearTimeout(this.specReloadTimer);
        this.specReloadTimer = setTimeout(() => {
          this.specReloadTimer = null;
          this.refresh();
        }, 400);
        return;
      }
      if (this.graph && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p) && !/\.(test|spec)\./.test(p)) {
        const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
        const rel = p.startsWith(wsRoot + '/') ? p.slice(wsRoot.length + 1) : p;
        if (this.graph.byFile.has(rel) && !this.driftDirty) {
          this.driftDirty = true;
          this.showValidation();
        }
      }
    });
  }

  private injectStyles(): void {
    if (document.getElementById('sm-styles')) return;
    const style = document.createElement('style');
    style.id = 'sm-styles';
    style.textContent = `
      .sm-node {
        position: absolute;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        cursor: pointer;
        transition: box-shadow 0.15s, border-color 0.15s, opacity 0.15s;
        box-shadow: var(--shadow);
        overflow: visible;
        box-sizing: border-box;
      }
      .sm-node.sm-selected {
        border-color: var(--accent);
        box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent) 40%, transparent), 0 0 18px color-mix(in oklab, var(--accent) 18%, transparent);
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
      .sm-panel-el { transition: transform 0.2s cubic-bezier(0.4,0,0.2,1); }
      @media (prefers-reduced-motion: reduce) {
        .sm-edge-active { animation: none; }
        .sm-isolated-border { animation: none; }
        .sm-spinning { animation: none; }
        .sm-panel-el { transition: none; }
      }
      .sm-header-btn { border:none; outline:none; background:none; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:5px 7px; color:var(--tertiary); line-height:0; transition:color 0.15s,background 0.15s; }
      .sm-header-btn:hover { color:var(--accent); background:var(--surface); }
      .sm-header-btn:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
      .sm-empty-btn {
        pointer-events: auto;
        background: transparent;
        border: 1px solid var(--border);
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
      .sm-search-bar { box-sizing: border-box; }
      .sm-search-bar input::placeholder { color: var(--tertiary); opacity: 0.5; }
      .sm-search-bar input:focus { border-color: var(--accent); }
      .sm-search-mark {
        background: var(--accent);
        color: var(--bg);
        border-radius: 2px;
        padding: 0 2px;
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
      this.dragMode = 'pan';
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.panStartPanX = this.panX;
      this.panStartPanY = this.panY;
      this.viewport.style.cursor = 'grabbing';
      this.nodeLayer.style.willChange = 'transform';
      this.svg.style.willChange = 'transform';
    });

    document.addEventListener('mousemove', this.onDocMouseMove);
    document.addEventListener('mouseup', this.onDocMouseUp);

    // Ctrl+F / Cmd+F → toggle search
    document.addEventListener('keydown', this.onSearchKeydown = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
        if (this.el.isConnected) {
          e.preventDefault();
          e.stopPropagation();
          this.search.toggle();
        }
      }
      if (e.key === 'Escape' && this.search.isOpen) {
        this.search.close();
      }
    });

    // Click on canvas background → close panel; cycle edges → select cycle
    this.viewport.addEventListener('click', (e) => {
      const rect = this.viewport.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (this.cycles.handleViewportClick(cx, cy)) return;
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
      const collections = await this.findAllCollections();
      if (collections.length === 0) {
        await this.showEmptyState();
        this.readyResolve();
        return;
      }
      this.collections = collections;
      this.activeCollectionIndex = 0;
      this.renderTabBar();

      await this.buildFromFiles(0);
      this.readyResolve();
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error('[SpecsMapPlugin] loadSpecs failed:', e);
      this.nodeLayer.innerHTML =
        '<div style="padding:16px;color:var(--red);font-size:14px;line-height:1.5">' +
        '<div style="font-weight:700;margin-bottom:6px">Error loading specs</div>' +
        '<div style="font-size:11px;opacity:0.85;word-break:break-all">' + this.esc(msg) + '</div></div>';
      this.readyResolve();
    }
  }

  /**
   * Snapshot v2 is a layout cache only (R2): the corpus is always re-read and
   * re-validated; the snapshot just skips parse+layout when corpusHash matches.
   */
  private tryLoadSnapshotV2(raw: string | null, hash: string, collectionId: string): boolean {
    const snap = loadSnapshotV2<SnapNode>(raw, {
      specgenVersion: SPECGEN_VERSION, collectionId, corpusHash: hash,
    });
    if (!snap || snap.nodes.length === 0) return false;

    const rawNodes: SpecNode[] = snap.nodes.map(sn => ({
      id: sn.id, name: sn.name, specFile: sn.specFile, sourceFile: sn.sourceFile,
      isEntry: sn.isEntry, entryPath: sn.entryPath,
      layer: sn.layer, isUI: sn.isUI, parentId: sn.parentId, uiChildId: sn.uiChildId,
      deps: sn.deps, x: 0, y: 0,
      w: sn.isUI ? NODE_UI_W : NODE_W,
      h: sn.isUI ? NODE_UI_H : NODE_H,
    }));

    this.refCounts.clear();
    for (const n of rawNodes) {
      for (const d of n.deps) this.refCounts.set(d, (this.refCounts.get(d) ?? 0) + 1);
    }
    this.nodes = computeLayout(rawNodes);
    return true;
  }

  private async saveSnapshot(hash: string, collectionId: string): Promise<void> {
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    await window.electronAPI?.fs.mkdir(wsRoot + '/.cockpit');
    const nodes: SnapNode[] = this.nodes.map(n => ({
      id: n.id, name: n.name, specFile: n.specFile, sourceFile: n.sourceFile,
      isEntry: n.isEntry, entryPath: n.entryPath,
      layer: n.layer, isUI: n.isUI, parentId: n.parentId, uiChildId: n.uiChildId,
      deps: n.deps,
      raw: (this.specRawMap.get(n.id) ?? {}) as Record<string, unknown>,
    }));
    const snap = makeSnapshot(SPECGEN_VERSION, collectionId, hash, nodes);
    await window.electronAPI?.fs.writeFile(this.snapshotPath, JSON.stringify(snap));
  }

  private async buildFromFiles(collectionIndex: number): Promise<void> {
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    const collection = this.collections[collectionIndex];
    if (!collection) {
      await this.showEmptyState();
      return;
    }
    const base = collection.specsDir;
    this.specBaseDir = base;
    this.specDirLabel.textContent = base + '/';
    this.snapshotPath = wsRoot + '/.cockpit/specsmap-' +
      base.replace(wsRoot, '').replace(/[\/\\]/g, '_').replace(/^_/, '') + '.json';

    const mainData = collection.mainData ?? {};

    const specLayerMap = new Map<string, string>();
    const specToUI = new Map<string, string>();
    const uiToParent = new Map<string, string>();

    const featuresMap = mainData.features;
    if (Array.isArray(featuresMap)) {
      console.warn('[SpecsMapPlugin] main.spec.md "features" is an array — expected an object with layer keys (e.g. ### core table). Treating features as "unknown" layer.');
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
      .filter(e => !e.isDirectory && e.name.endsWith('.spec.md') && e.name !== 'main.spec.md')
      .map(e => e.name);

    this.lastSpecFileCount = specFiles.length;

    if (specFiles.length === 0) {
      await this.showEmptyState();
      return;
    }

    this.specRawMap.clear();
    this.specDocs.clear();
    const rawTexts: Array<{ path: string; content: string }> = [];
    for (const filename of specFiles) {
      const raw = await window.electronAPI?.fs.readFile(base + '/' + filename);
      if (raw) {
        rawTexts.push({ path: filename, content: raw });
        try {
          this.specRawMap.set(filename, this.parseSpecMd(raw));
          this.specDocs.set(filename, parseSpecDoc(raw));
        } catch (e) {
          console.warn('[SpecsMapPlugin] Skipping invalid spec file ' + filename + ':', e);
        }
      }
    }

    // SPECGEN runtime projection: graph + validation (corpus stays canonical)
    const mainRaw = await window.electronAPI?.fs.readFile(base + '/main.spec.md');
    if (mainRaw) rawTexts.push({ path: 'main.spec.md', content: mainRaw });
    try {
      const mainIndex = mainRaw ? buildMainIndex(parseSpecDoc(mainRaw)) : null;
      this.graph = buildGraph(mainIndex, this.specDocs);
      this.report = validate(this.graph);
    } catch (e) {
      console.warn('[SpecsMapPlugin] Graph runtime build failed:', e);
      this.graph = null;
      this.report = null;
    }
    this.driftDirty = false;

    const collectionId = base.replace(wsRoot, '').replace(/^\//, '') || base;
    const hash = corpusHash(rawTexts);
    const renderKey = `${collectionId}:${hash}`;
    const snapRaw = await window.electronAPI?.fs.readFile(this.snapshotPath) ?? null;
    if (this.tryLoadSnapshotV2(snapRaw, hash, collectionId)) {
      // Corpus unchanged since last render (e.g. Refresh clicked with no file edits) — skip
      // the full DOM teardown/rebuild, just refresh derived state.
      if (renderKey === this.lastRendered) {
        this.updateHeaderCounts();
        this.showValidation();
        return;
      }
      this.renderGraph();
      this.lastRendered = renderKey;
      this.showValidation();
      return;
    }

    const sourceToSpec = new Map<string, string>();
    for (const [filename, data] of this.specRawMap) {
      if (data.file) {
        const base = data.file.split('/').pop()!;
        sourceToSpec.set(base, filename);
        const stem = base.replace(/\.[^.]+$/, '');
        if (stem !== base) sourceToSpec.set(stem, filename);
      }
    }

    const rawNodes: SpecNode[] = [];
    for (const [filename, data] of this.specRawMap) {
      const isUI = uiToParent.has(filename);
      const layer = specLayerMap.get(filename) ?? data.layer ?? 'plugin';
      const hasEntry = !!data.entry;
      const entryPath = data.entry ?? '';
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
        name: data.name ?? filename.replace('.spec.md', ''),
        specFile: filename,
        sourceFile: hasEntry ? entryPath : (data.file ? data.file.split('/').pop()! : ''),
        isEntry: hasEntry,
        entryPath,
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

    this.nodes = computeLayout(rawNodes);
    await this.saveSnapshot(hash, collectionId);
    this.renderGraph();
    this.lastRendered = renderKey;
    this.showValidation();
  }

  private async findAllCollections(): Promise<SpecCollection[]> {
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    const foundPaths: string[] = [];

    // Fast path: check common locations
    const quickPaths = [
      wsRoot + '/src/specs/main.spec.md',
      wsRoot + '/specs/main.spec.md',
      wsRoot + '/.specs/main.spec.md',
    ];
    for (const p of quickPaths) {
      const raw = await window.electronAPI?.fs.readFile(p);
      if (raw && !foundPaths.includes(p)) foundPaths.push(p);
    }

    // Recursive walk for more collections
    await this.walkFindAll(wsRoot, 0, 4, foundPaths);

    const collections: SpecCollection[] = [];
    const seenDirs = new Set<string>();
    for (const p of foundPaths) {
      const dir = p.replace(/\/main\.spec\.md$/, '');
      if (seenDirs.has(dir)) continue;
      seenDirs.add(dir);
      const raw = await window.electronAPI?.fs.readFile(p);
      let mainData: Record<string, unknown> | null = null;
      let title = '';
      if (raw) {
        try { mainData = this.parseMainSpecMd(raw); } catch { /* skip */ }
      }
      if (mainData && typeof mainData === 'object') {
        title = String((mainData as any).title ?? (mainData as any).name ?? '');
      }
      if (!title) title = dir.split('/').pop() || 'Specs';
      collections.push({ title, specsDir: dir, mainData });
    }

    // Sort by depth (shallower first), then alphabetically
    collections.sort((a, b) => {
      const aDepth = a.specsDir.split('/').length;
      const bDepth = b.specsDir.split('/').length;
      if (aDepth !== bDepth) return aDepth - bDepth;
      return a.title.localeCompare(b.title);
    });

    return collections;
  }

  private async walkFindAll(dir: string, depth: number, maxDepth: number, out: string[]): Promise<void> {
    if (depth > maxDepth) return;
    const entries = await window.electronAPI?.fs.readDir(dir);
    if (!entries) return;

    // Check current dir
    const mainRaw = await window.electronAPI?.fs.readFile(dir + '/main.spec.md');
    if (mainRaw) {
      const p = dir + '/main.spec.md';
      if (!out.includes(p)) out.push(p);
    }

    // Recurse into subdirectories (skip junk dirs)
    for (const e of entries) {
      if (!e.isDirectory) continue;
      if (e.name === '.git' || e.name === 'node_modules' || e.name === '.cockpit' ||
          e.name === '.codegraph' || e.name === 'coverage' || e.name === 'dist') continue;
      await this.walkFindAll(dir + '/' + e.name, depth + 1, maxDepth, out);
    }
  }

  private renderTabBar(): void {
    if (this.collections.length < 2) {
      this.tabBar.style.display = 'none';
      return;
    }
    this.tabBar.style.display = 'flex';
    this.tabBar.innerHTML = '';
    for (let i = 0; i < this.collections.length; i++) {
      const c = this.collections[i];
      const active = i === this.activeCollectionIndex;
      const tab = document.createElement('button');
      tab.style.cssText =
        'background:none;border:none;border-bottom:2px solid ' +
        (active ? 'var(--accent)' : 'transparent') + ';' +
        'padding:4px 12px;font-family:"Space Mono","Courier New",monospace;' +
        'font-size:11px;font-weight:' + (active ? '700' : '400') + ';' +
        'color:' + (active ? 'var(--accent)' : 'var(--tertiary)') + ';' +
        'cursor:pointer;white-space:nowrap;transition:color 0.12s,border-color 0.12s;' +
        'flex-shrink:0';
      tab.textContent = c.title;
      tab.title = c.specsDir;
      tab.addEventListener('mouseenter', () => {
        if (i !== this.activeCollectionIndex) {
          tab.style.color = 'var(--primary)';
          tab.style.borderColor = 'var(--border)';
        }
      });
      tab.addEventListener('mouseleave', () => {
        if (i !== this.activeCollectionIndex) {
          tab.style.color = '';
          tab.style.borderColor = '';
        }
      });
      tab.addEventListener('click', () => this.switchToTab(i));
      this.tabBar.appendChild(tab);
    }
  }

  private async switchToTab(index: number): Promise<void> {
    if (index === this.activeCollectionIndex || index < 0 || index >= this.collections.length) return;

    this.activeCollectionIndex = index;
    this.renderTabBar();

    // Reset view state
    this.cycles.reset();
    this.cycleBtn.style.color = '';
    this.nodes = [];
    this.specRawMap.clear();
    this.refCounts.clear();
    this.nodeEls.clear();
    this.nodeLayer.innerHTML = '';
    this.svg.innerHTML = '';
    this.lastRendered = null;
    this.emptyState.style.display = 'none';
    this.closePanel();

    try {
      await this.buildFromFiles(index);
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error('[SpecsMapPlugin] Tab switch failed:', e);
      this.nodeLayer.innerHTML =
        '<div style="padding:16px;color:var(--red);font-size:14px;line-height:1.5">' +
        '<div style="font-weight:700;margin-bottom:6px">Error loading collection</div>' +
        '<div style="font-size:11px;opacity:0.85;word-break:break-all">' + this.esc(msg) + '</div></div>';
    }
  }

  private async refresh(): Promise<void> {
    this.refreshBtn.disabled = true;
    this.refreshBtn.querySelector('svg')?.classList.add('sm-spinning');

    // Reset cycle mode
    this.cycles.reset();
    this.cycleBtn.style.color = '';

    // Re-discover collections
    this.collections = await this.findAllCollections();
    if (this.activeCollectionIndex >= this.collections.length) this.activeCollectionIndex = 0;
    this.renderTabBar();

    // Clear current state
    this.specBaseDir = '';
    this.nodes = [];
    this.specRawMap.clear();
    this.refCounts.clear();
    this.nodeEls.clear();
    this.nodeLayer.innerHTML = '';
    this.svg.innerHTML = '';
    this.lastRendered = null;
    this.emptyState.style.display = 'none';
    this.closePanel();

    try {
      if (this.collections.length > 0) {
        await this.buildFromFiles(this.activeCollectionIndex);
      } else {
        await this.showEmptyState();
      }
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
    if (this.lastSpecFileCount === 0 || !this.report) {
      this.validationBadge.style.display = 'none';
      return;
    }
    const r = this.report;
    const color = r.counts.error ? 'var(--red)' : r.counts.warn ? 'var(--amber)' : 'var(--green)';
    this.validationBadge.textContent = summarizeReport(r) + (this.driftDirty ? ' · drift' : '');
    this.validationBadge.style.color = color;
    this.validationBadge.style.borderColor = color;
    this.validationBadge.style.background = `color-mix(in oklab, ${color} 10%, transparent)`;
    this.validationBadge.style.cursor = 'pointer';
    this.validationBadge.title = (this.driftDirty ? 'Source files changed since load — structure may be stale.\n' : '') +
      (r.issues.length
        ? r.issues.slice(0, 8).map(i => `[${i.severity}] ${i.message}`).join('\n') + (r.issues.length > 8 ? `\n… +${r.issues.length - 8} more` : '')
        : 'All validation rules pass') +
      '\nClick to open the validation drawer';
    this.validationBadge.style.display = 'inline';
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
          `<span class="sm-name" style="opacity:0.7">${this.esc(node.name)}</span>` +
          `</div>` +
          `<div class="sm-file">${this.esc(node.specFile)}</div>` +
          `</div>` +
          portsHtml;
      } else {
        const depsHtml = depCount ? `<span style="color:${colorVar}">→&nbsp;${depCount}</span>` : '';
        const refsHtml = refCount ? `<span style="color:var(--tertiary)">←&nbsp;${refCount}</span>` : '';
        const isolatedHtml = !depCount && !refCount
          ? `<span style="color:var(--secondary);opacity:0.5">no links</span>` : '';
        const entryBadge = node.isEntry
          ? `<span style="font-size:11px;line-height:1;opacity:0.5;flex-shrink:0" title="Entry file: ${this.esc(node.entryPath)}">⚙</span>`
          : '';
        const sourceLabel = node.isEntry ? node.entryPath : node.specFile;

        el.innerHTML =
          `<div class="sm-node-inner">` +
          `<div class="sm-node-head">` +
          `<span class="sm-dot" style="background:${colorHex}"></span>` +
          `<span class="sm-name">${this.esc(node.name)}</span>` +
          entryBadge +
          `<span class="sm-layer-badge">${this.esc(layerLabel.toUpperCase())}</span>` +
          `</div>` +
          `<div class="sm-file">${this.esc(sourceLabel)}</div>` +
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
    this.cachedEdgePaths = [];
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
      this.cachedEdgePaths.push(p);
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
    this.svg.appendChild(depGroup);
  }

  private hoverNode(id: string, enter: boolean): void {
    if (this.cycles.cycleMode || this.search.isOpen) return;
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
          const nc = this.nodes.find(n => n.id === nid)!;
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
        el.style.borderColor = nid === this.selectedId ? LAYER_COLORS_HEX[this.nodes.find(n => n.id === nid)?.layer ?? ''] ?? '' : '';
        el.style.boxShadow = '';
      }
    }
  }

  selectNode(id: string, fromSearch = false): void {
    // Close settings panel if open
    if (this.panelShowingSettings) {
      this.closePanel();
    }
    // Deselect previous
    if (this.selectedId) {
      const prev = this.nodeEls.get(this.selectedId);
      if (prev) prev.classList.remove('sm-selected');
    }

    // Toggle behavior: clicking same node closes panel
    // From search navigation: re-select without toggle
    if (this.selectedId === id && this.panelOpen && !fromSearch) {
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

    // If search is open, highlight keyword in selected node name
    this.search.onNodeSelected(id);
  }

  private zoomToNode(node: SpecNode): void {
    const rect = this.viewport.getBoundingClientRect();
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
    this.updateCycleBtnColor();
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
    const isActive = this.cycles.cycleMode;
    const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    this.panelHeaderEl.innerHTML =
      `<div style="padding:14px 18px 12px;display:flex;align-items:center;gap:12px">` +
      `<span style="font-size:14px;font-weight:700;color:var(--primary);flex:1">Settings</span>` +
      `<button id="sm-panel-close" style="background:none;border:none;cursor:pointer;color:var(--tertiary);font-size:18px;line-height:1;padding:0 0 0 4px;font-family:inherit" aria-label="Close">×</button>` +
      `</div>`;

    const toggleBg = isActive ? 'var(--red)' : 'var(--border)';
    const toggleLabel = isActive ? 'On' : 'Off';

    const levelChips = (lvl: number) =>
      `<button class="sm-cycle-level" data-level="${lvl}" style="background:none;border:1px solid ${lvl === this.cycles.cycleLevel ? 'var(--accent)' : 'var(--border)'};color:${lvl === this.cycles.cycleLevel ? 'var(--accent)' : 'var(--tertiary)'};border-radius:5px;padding:2px 10px;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;transition:color 0.12s,border-color 0.12s" title="Level ${lvl}: ${lvl === 1 ? 'cycle nodes only' : lvl === 2 ? '+ immediate neighbors' : '+ 2-hop neighbors'}">${lvl}</button>`;

    let cyclesSection = '';
    if (isActive) {
      cyclesSection =
        `<div class="sm-panel-section">` +
        `<div class="sm-panel-label">DEPTH</div>` +
        `<div style="display:flex;gap:6px;padding:4px 0">${[1, 2, 3].map(levelChips).join('')}</div></div>`;
      if (this.cycles.cycleSets.length > 0) {
        cyclesSection +=
          `<div class="sm-panel-section">` +
          `<div class="sm-panel-label">CYCLES (${this.cycles.cycleSets.length}) — click edge on graph to trace</div>` +
          this.cycles.cycleSets.map((s, i) => {
            const c = CYCLE_COLORS[i % CYCLE_COLORS.length];
            const isSel = i === this.cycles.selectedCycleIndex;
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

    const isolatedToggleBg = this.cycles.isolatedMode ? 'var(--amber)' : 'var(--border)';
    const isolatedLabel = this.cycles.isolatedMode ? 'On' : 'Off';

    this.panelInner.innerHTML =
      `<div class="sm-panel-section">` +
      `<div class="sm-panel-label">GRAPH ANALYSIS</div>` +
      `<div style="display:flex;align-items:center;gap:12px;padding:8px 0">` +
      `<label style="flex:1;font-size:12px;color:var(--primary);cursor:pointer">Show cyclic dependencies</label>` +
      `<div id="sm-cycle-toggle" style="width:36px;height:20px;border-radius:10px;background:${toggleBg};cursor:pointer;position:relative;transition:background 0.15s;flex-shrink:0" role="switch" aria-checked="${isActive}">` +
      `<div style="width:16px;height:16px;border-radius:50%;background:var(--bg);position:absolute;top:2px;left:2px;transform:${isActive ? 'translateX(16px)' : 'translateX(0)'};transition:transform 0.15s"></div>` +
      `</div>` +
      `<span style="font-size:10px;color:var(--tertiary);min-width:20px;text-align:right">${toggleLabel}</span>` +
      `</div>` +
      `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid var(--border);margin-top:4px;padding-top:12px">` +
      `<label style="flex:1;font-size:12px;color:var(--primary);cursor:pointer">Show isolated nodes</label>` +
      `<div id="sm-isolated-toggle" style="width:36px;height:20px;border-radius:10px;background:${isolatedToggleBg};cursor:pointer;position:relative;transition:background 0.15s;flex-shrink:0" role="switch" aria-checked="${this.cycles.isolatedMode}">` +
      `<div style="width:16px;height:16px;border-radius:50%;background:var(--bg);position:absolute;top:2px;left:2px;transform:${this.cycles.isolatedMode ? 'translateX(16px)' : 'translateX(0)'};transition:transform 0.15s"></div>` +
      `</div>` +
      `<span style="font-size:10px;color:var(--tertiary);min-width:20px;text-align:right">${isolatedLabel}</span>` +
      `</div></div>` +
      cyclesSection +
      this.validationSectionHtml(esc) +
      `<div class="sm-panel-section" style="border-top:1px solid var(--border)">` +
      `<div class="sm-panel-label">RECONCILE</div>` +
      `<div style="font-size:10px;color:var(--tertiary);margin-bottom:8px;line-height:1.5">Syncs structural fields (exports, dependencies, referenced by, IPC) from source. Prose is never touched. Report writes nothing.</div>` +
      `<div style="display:flex;gap:6px">` +
      `<button id="sm-reconcile-report-btn" class="sm-reconcile-btn" style="background:transparent;border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-family:inherit;font-size:11px;font-weight:700;color:var(--primary);cursor:pointer;flex:1;transition:border-color 0.12s,color 0.12s">Report</button>` +
      `<button id="sm-reconcile-apply-btn" class="sm-reconcile-btn" style="background:transparent;border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-family:inherit;font-size:11px;font-weight:700;color:var(--primary);cursor:pointer;flex:1;transition:border-color 0.12s,color 0.12s">⚡ Apply structural</button>` +
      `</div>` +
      `<div id="sm-reconcile-result" style="font-size:10px;color:var(--tertiary);margin-top:8px;line-height:1.5;white-space:pre-wrap;word-break:break-word"></div>` +
      `</div>`;

    this.panelHeaderEl.querySelector('#sm-panel-close')
      ?.addEventListener('click', () => this.closePanel(true));

    const toggle = this.panelInner.querySelector('#sm-cycle-toggle');
    toggle?.addEventListener('click', () => this.cycles.toggleCycleMode());

    for (const chip of this.panelInner.querySelectorAll<HTMLElement>('.sm-cycle-level')) {
      chip.addEventListener('click', () => {
        const lvl = parseInt(chip.dataset.level ?? '1', 10);
        this.cycles.setCycleLevel(lvl);
      });
    }

    const isolatedToggle = this.panelInner.querySelector('#sm-isolated-toggle');
    isolatedToggle?.addEventListener('click', () => this.cycles.toggleIsolatedMode());

    for (const btn of this.panelInner.querySelectorAll<HTMLButtonElement>('.sm-reconcile-btn')) {
      btn.addEventListener('mouseenter', () => {
        btn.style.borderColor = 'var(--accent)';
        btn.style.color = 'var(--accent)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.borderColor = ''; btn.style.color = '';
      });
    }
    this.panelInner.querySelector('#sm-reconcile-report-btn')
      ?.addEventListener('click', () => this.runReconcileFromPanel('report'));
    this.panelInner.querySelector('#sm-reconcile-apply-btn')
      ?.addEventListener('click', () => this.runReconcileFromPanel('structural'));

    for (const el of this.panelInner.querySelectorAll<HTMLElement>('[data-issue-goto]')) {
      el.addEventListener('click', () => {
        const specFile = el.dataset.issueGoto!;
        if (this.nodeEls.has(specFile)) this.selectNode(specFile);
      });
    }
  }

  private validationSectionHtml(esc: (s: unknown) => string): string {
    const r = this.report;
    if (!r) return '';
    const sevColor: Record<string, string> = { error: 'var(--red)', warn: 'var(--amber)', info: 'var(--tertiary)' };
    const items = r.issues.slice(0, 40).map(i => {
      const specFile = i.featureId ? `${i.featureId}.spec.md` : '';
      const clickable = specFile && this.nodeEls.has(specFile);
      return `<div style="font-size:10px;padding:3px 0;display:flex;gap:6px;align-items:baseline;border-bottom:1px solid var(--border);${clickable ? 'cursor:pointer' : ''}"` +
        (clickable ? ` data-issue-goto="${esc(specFile)}"` : '') + `>` +
        `<span style="color:${sevColor[i.severity]};font-weight:700;flex-shrink:0">${i.severity.toUpperCase()}</span>` +
        `<span style="color:var(--secondary);word-break:break-word">${esc(i.message)}</span></div>`;
    }).join('');
    return `<div class="sm-panel-section" style="border-top:1px solid var(--border)">` +
      `<div class="sm-panel-label">VALIDATION — ${esc(summarizeReport(r))}${this.driftDirty ? ' · DRIFT' : ''}</div>` +
      (r.issues.length ? items : `<div style="font-size:11px;color:var(--green)">✓ All validation rules pass</div>`) +
      (r.issues.length > 40 ? `<div style="font-size:10px;color:var(--tertiary);padding-top:4px">… +${r.issues.length - 40} more</div>` : '') +
      `</div>`;
  }

  private async runReconcileFromPanel(mode: ReconcileMode): Promise<void> {
    const resultEl = this.panelInner.querySelector<HTMLElement>('#sm-reconcile-result');
    if (resultEl) resultEl.textContent = mode === 'report' ? 'Scanning…' : 'Reconciling…';
    let summary: string;
    try {
      summary = await this.reconcileSpecs(mode, mode === 'structural');
    } catch (e) {
      summary = 'Reconcile failed: ' + (e instanceof Error ? e.message : String(e));
    }
    // Structural mode refreshes the graph, which closes the panel — reopen it
    // so the changelog is actually visible.
    if (!this.panelShowingSettings) this.openSettingsPanel();
    else this.renderSettingsContent();
    const el = this.panelInner.querySelector<HTMLElement>('#sm-reconcile-result');
    if (el) el.textContent = summary;
  }

  private closePanel(resetZoom?: boolean): void {
    this.panelOpen = false;
    this.panelShowingSettings = false;
    this.panel.style.transform = 'translateX(100%)';
    this.panel.style.pointerEvents = 'none';
    this.updateCycleBtnColor();
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
    const isEntry = node.isEntry;
    const headerIcon = isEntry ? '⚙' : '';
    this.panelHeaderEl.innerHTML =
      `<div style="padding:14px 18px 12px;display:flex;align-items:center;gap:12px">` +
      `<span style="width:12px;height:12px;border-radius:50%;background:${colorHex};flex-shrink:0;display:inline-block"></span>` +
      (isEntry ? `<span style="font-size:14px;line-height:1;opacity:0.6;flex-shrink:0" title="Entry file">⚙</span>` : '') +
      `<span style="font-size:14px;font-weight:700;color:var(--primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(node.name)}</span>` +
      `<span style="font-size:10px;font-weight:700;letter-spacing:0.8px;color:${colorVar};flex-shrink:0">${layerLabel.toUpperCase()}</span>` +
      `<button id="sm-panel-close" style="background:none;border:none;cursor:pointer;color:var(--tertiary);font-size:18px;line-height:1;padding:0 0 0 4px;font-family:inherit" aria-label="Close">×</button>` +
      `</div>`;

    // Scrollable body
    const specFullPath = this.specFullPath(node.specFile);
    const sourceFullPath = node.sourceFile ? this.tryResolveSourcePath(data) : '';
    const fileLabel = isEntry ? 'ENTRY FILE' : 'SOURCE FILE';
    const identity =
      `<div class="sm-panel-section">` +
      `<div class="sm-panel-label">SPEC FILE</div>` +
      `<div class="sm-panel-row" style="font-size:11px;cursor:pointer;color:var(--accent)" data-open-file="${esc(specFullPath)}">${esc(node.specFile)}</div>` +
      (sourceFullPath ? `<div class="sm-panel-label" style="margin-top:8px">${fileLabel}</div><div class="sm-panel-row" style="font-size:11px;cursor:pointer;color:var(--accent)" data-open-file="${esc(sourceFullPath)}">${esc(node.sourceFile)}</div>` : '') +
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

    // Entry-specific sections
    const scripts = isEntry && data.scripts && typeof data.scripts === 'object' ? data.scripts as Record<string, string> : null;
    const buildDef = isEntry && data.build && typeof data.build === 'object' ? data.build as Record<string, string> : null;
    const declaredDeps = isEntry && data.dependencies && typeof data.dependencies === 'object' && !Array.isArray(data.dependencies)
      ? data.dependencies as Record<string, string> : null;

    const scriptsSection = scripts
      ? `<div class="sm-panel-section"><div class="sm-panel-label">SCRIPTS (${Object.keys(scripts).length})</div>` +
        Object.entries(scripts).map(([k, v]) =>
          `<div style="font-size:11px;padding:3px 0;display:flex;gap:8px;border-bottom:1px solid var(--border)">` +
          `<span style="font-weight:700;color:var(--primary);flex-shrink:0">${esc(k)}</span>` +
          `<span style="color:var(--tertiary);word-break:break-all">${esc(v)}</span></div>`
        ).join('') +
        `</div>`
      : '';

    const buildSection = buildDef
      ? `<div class="sm-panel-section"><div class="sm-panel-label">BUILD</div>` +
        Object.entries(buildDef).map(([k, v]) =>
          `<div style="font-size:11px;padding:3px 0;display:flex;gap:8px">` +
          `<span style="font-weight:700;color:var(--primary);flex-shrink:0">${esc(k)}</span>` +
          `<span style="color:var(--tertiary);word-break:break-all">${esc(v)}</span></div>`
        ).join('') +
        `</div>`
      : '';

    const declaredDepsSection = declaredDeps
      ? `<div class="sm-panel-section"><div class="sm-panel-label">DECLARED DEPS (${Object.keys(declaredDeps).length})</div>` +
        Object.entries(declaredDeps).map(([k, v]) =>
          `<div style="font-size:11px;padding:2px 0;display:flex;gap:8px">` +
          `<span style="color:var(--primary);font-weight:700;flex-shrink:0">${esc(k)}</span>` +
          `<span style="color:var(--tertiary);word-break:break-all;font-size:10px">${esc(v)}</span></div>`
        ).join('') +
        `</div>`
      : '';

    this.panelInner.innerHTML = identity + desc + depsSection + refsSection + ipcSection + scriptsSection + buildSection + declaredDepsSection;

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
          'background:none;border:1px solid var(--border);border-radius:5px;' +
          'padding:3px 10px;font-family:"Space Mono","Courier New",monospace;font-size:10px;' +
          'color:var(--tertiary);cursor:pointer;transition:border-color 0.12s,color 0.12s';
        chip.textContent = c;
        chip.addEventListener('mouseenter', () => { chip.style.borderColor = 'var(--accent)'; chip.style.color = 'var(--accent)'; });
        chip.addEventListener('mouseleave', () => { chip.style.borderColor = ''; chip.style.color = ''; });
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
      'width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);' +
      'border-radius:6px;padding:6px 12px;font-family:"Space Mono","Courier New",monospace;' +
      'font-size:11px;color:var(--primary);outline:none;transition:border-color 0.12s;';
    entryInput.addEventListener('focus', () => { entryInput.style.borderColor = 'var(--accent)'; });
    entryInput.addEventListener('blur', () => { entryInput.style.borderColor = ''; });
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
      ? `## Step 0 — Update Agents.md\n\nAdd a "Spec System" section:\n- Spec files live in \`src/specs/\`, one per source module\n- \`src/specs/main.spec.md\` is the authoritative index\n- The SpecsMap plugin (Tools → SpecsMap) visualizes the dependency graph\n- When adding or changing source files, update the corresponding spec\n\n`
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
      ? `For each source file found in Pass 1, write \`src/specs/[feature-name].spec.md\` following SPECGEN.md exactly.\n` +
        `Required fields in frontmatter: name, file, type, layer, singleton, exports. Required sections: description, Dependencies, Referenced By, IPC Channels.\n` +
        `Write a companion \`[feature-name]-ui.spec.md\` for any component with 3 or more user interactions or complex DOM.\n` +
        `Keep descriptions specific — no generic phrases like "manages state" or "handles events".`
      : `For each service/component/module in the inventory, write \`src/specs/[feature-name].spec.md\` following SPECGEN.md.\n` +
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
      `Write \`src/specs/main.spec.md\`:\n` +
      `1. Group all specs under their layer in the \`## Features\` section (one \`### layer\` table per layer)\n` +
      `2. Each table row: \`| id | name | file | spec | ui |\` where spec = the .spec.md filename\n` +
      `3. Catalog IPC channels in an \`## IPC Channels\` section\n` +
      `4. Validate: every \`## Dependencies\` entry in each spec must match another spec's \`file:\` frontmatter field. Fix mismatches.\n\n` +
      `Start with Pass 1 now. List every file before writing any spec.\n`;

    await window.electronAPI?.clipboard.writeText(prompt);

    const label = specgenAlreadyExists ? '✓ Prompt Copied' : '✓ SPECGEN.md Written + Prompt Copied';
    btn.textContent = label;
    btn.style.borderColor = 'var(--green)';
    btn.style.color = 'var(--green)';

    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '⚡ Copy Generation Prompt';
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 3000);
  }

  triggerRefresh(): void {
    this.refreshBtn?.click();
  }

  /** Legacy entry point — full clobber regen is gone; maps to structural reconcile. */
  async triggerRegenerate(): Promise<void> {
    await this.reconcileSpecs('structural', true);
  }

  /** Run reconcile (report | structural). Returns a human/agent-readable changelog. */
  async reconcileSpecs(mode: ReconcileMode, createSkeletons = false): Promise<string> {
    await this.ready;
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    const specsDir = this.specBaseDir || wsRoot + '/src/specs';
    const api = window.electronAPI;
    if (!api) return 'Filesystem unavailable.';
    const result = await reconcile({
      fs: api.fs, wsRoot, specsDir, mode, createSkeletons,
    });
    if (mode === 'structural') {
      await this.refresh();
    }
    if (this.graph) {
      // Same evidence-backed rule set in both modes — otherwise apply appears
      // to "fix" issues that plain (evidence-less) validation simply can't see.
      this.report = validate(this.graph, {
        sourceFiles: result.sourceFiles,
        existingFiles: result.existingFiles,
        facts: result.facts,
      });
      this.showValidation();
    }
    const lines = [
      `Reconcile (${mode})${mode === 'report' ? ' — nothing written' : ''}:`,
      `- created: ${result.created.length ? result.created.join(', ') : 'none'}`,
      `- updated: ${result.updated.length ? result.updated.join(', ') : 'none'}`,
      `- unchanged: ${result.unchanged.length}`,
    ];
    if (result.failed.length) {
      lines.push(`- attention: ${result.failed.map(f => `${f.path} (${f.error})`).join(', ')}`);
    }
    if (this.report) lines.push(`- validation: ${summarizeReport(this.report)}`);
    return lines.join('\n');
  }

  /** Full validation report with source-tree evidence (markdown). */
  async validateSpecs(): Promise<string> {
    await this.ready;
    if (!this.graph) return 'No spec graph loaded.';
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    const specsDir = this.specBaseDir || wsRoot + '/src/specs';
    const api = window.electronAPI;
    if (api) {
      const result = await reconcile({ fs: api.fs, wsRoot, specsDir, mode: 'report' });
      this.report = validate(this.graph, {
        sourceFiles: result.sourceFiles,
        existingFiles: result.existingFiles,
        facts: result.facts,
      });
    } else {
      this.report = validate(this.graph);
    }
    this.showValidation();
    const r = this.report;
    const lines = [`# Validation — ${summarizeReport(r)}`, ''];
    lines.push(`- spec files: ${r.coverage.specFiles} · source files: ${r.coverage.sourceFiles} · linked: ${r.coverage.linked}`);
    if (r.coverage.unspecced.length) {
      lines.push(`- unspecced: ${r.coverage.unspecced.join(', ')}`);
    }
    if (r.issues.length) {
      lines.push('', '## Issues');
      for (const i of r.issues) {
        lines.push(`- [${i.severity}] ${i.id}: ${i.message}${i.fixHint ? ` (fix: ${i.fixHint})` : ''}`);
      }
    } else {
      lines.push('', 'All validation rules pass.');
    }
    return lines.join('\n');
  }

  /** Reload the graph from disk (agent-facing; awaits completion). */
  async reloadSpecs(): Promise<string> {
    await this.ready;
    await this.refresh();
    return `SpecsMap reloaded: ${this.nodes.length} node(s), ${this.report ? summarizeReport(this.report) : 'no report'}.`;
  }

  getNodes(): SpecNode[] {
    return this.nodes.map(n => ({ ...n }));
  }

  getNodeContext(id: string): string {
    const node = this.nodes.find(n => n.id === id);
    if (!node) return '';
    const raw = this.specRawMap.get(id) ?? {};
    const lines: string[] = [];
    lines.push(`## ${node.name}`);
    lines.push(`- **File:** \`${node.sourceFile || node.specFile}\``);
    lines.push(`- **Layer:** ${node.layer}`);
    if (raw.description) lines.push(`- **Description:** ${raw.description}`);
    if (Array.isArray(raw.dependencies) && raw.dependencies.length) {
      lines.push('### Dependencies');
      for (const d of raw.dependencies) {
        const usage = (d as any).usage ? ` — ${(d as any).usage}` : '';
        lines.push(`- **${(d as any).feature || '?'}** \`${(d as any).file || ''}\`${usage}`);
      }
    }
    if (Array.isArray(raw.referenced_by) && raw.referenced_by.length) {
      lines.push('### Referenced By');
      for (const r of raw.referenced_by) {
        lines.push(`- **${(r as any).feature || '?'}** \`${(r as any).file || ''}\``);
      }
    }
    return lines.join('\n');
  }

  /**
   * Agent-grade explore (R4): instant, dense markdown with neighborhood +
   * impact. No camera moves unless `animate` is requested by a human surface.
   */
  async explore(query: string, opts: { animate?: boolean } = {}): Promise<string> {
    await this.ready;
    if (this.nodes.length === 0) {
      return 'No specs available to explore.';
    }
    const q = query.trim();
    if (!q) {
      return 'Please provide a search query.';
    }

    if (this.graph) {
      const matches = graphSearch(this.graph, q);
      if (matches.length === 0) return `No specs matched "${query}".`;

      if (opts.animate) {
        const el = matches[0].specFile;
        if (this.nodeEls.has(el)) this.selectNode(el, true);
      }

      const shown = matches.slice(0, 8);
      const contexts = shown.map(n =>
        contextMarkdown(this.graph!, n.id, this.specDocs.get(n.specFile)));
      let out = `# Matches (${matches.length}) for "${query}"` +
        (matches.length > shown.length ? ` — showing first ${shown.length}` : '') +
        '\n\n' + contexts.join('\n\n---\n\n');
      if (this.driftDirty) {
        out += '\n\n⚠ Source files changed since the graph was loaded — structure may be stale. Run specs_reconcile.';
      }
      out += staleFooter(this.report);
      return out;
    }

    // Fallback when runtime graph failed to build: legacy shallow match
    const lq = q.toLowerCase();
    const matches = this.nodes.filter(n =>
      n.name.toLowerCase().includes(lq) ||
      n.sourceFile.toLowerCase().includes(lq) ||
      n.specFile.toLowerCase().includes(lq) ||
      (this.specRawMap.get(n.id)?.description ?? '').toLowerCase().includes(lq)
    );
    if (matches.length === 0) return `No specs matched "${query}".`;
    const contexts = matches.map(n => this.getNodeContext(n.id));
    return `Found ${matches.length} spec node(s) matching "${query}":\n\n` + contexts.join('\n\n---\n\n');
  }

  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    document.removeEventListener('mousemove', this.onDocMouseMove);
    document.removeEventListener('mouseup', this.onDocMouseUp);
    document.removeEventListener('keydown', this.onSearchKeydown);
    if (this.fileUnsub) { this.fileUnsub(); this.fileUnsub = null; }
    if (this.specReloadTimer) { clearTimeout(this.specReloadTimer); this.specReloadTimer = null; }
    this.nodeEls.clear();
    this.specRawMap.clear();
    this.specDocs.clear();
  }
}
