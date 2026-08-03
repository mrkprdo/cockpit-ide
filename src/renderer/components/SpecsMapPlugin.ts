
import { contextMarkdown, search as graphSearch } from '../specs/graph';
import { reconcile } from '../specs/reconcile';
import { staleFooter, summarizeReport, validate } from '../specs/validate';
import type { ReconcileMode } from '../specs/types';
import { PANEL_W, type SpecNode } from '../specs/layout';
import { CyclesController, type CyclesHost } from './specsmap/cycles';
import { SearchController, type SearchHost } from './specsmap/search';
import { SpecsData, type DataHost } from './specsmap/data';
import { GraphRenderer, type GraphHost } from './specsmap/render-graph';
import { PanelController, type PanelHost } from './specsmap/panel';
import { showEmptyState } from './specsmap/empty-state';
import { esc } from './specsmap/parse';
import { SM_STYLES, SVG_EYE, SVG_GEAR, SVG_REFRESH, SVG_SEARCH } from './specsmap/styles';
import { bindGuarded } from '../health/monitor';

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
  private wsPath: string;
  private specDirLabel: HTMLSpanElement;
  private tabBar!: HTMLDivElement;
    private searchBtn!: HTMLButtonElement;
    private cycleBtn!: HTMLButtonElement;
    private readyResolve!: () => void;
  readonly ready: Promise<void>;

  private data!: SpecsData;
  private renderer!: GraphRenderer;
  private panelCtrl!: PanelController;
  private search!: SearchController;
  private cycles!: CyclesController;

  private dragMode: 'none' | 'pan' = 'none';
  private panStartX = 0;
  private panStartY = 0;
  private panStartPanX = 0;
  private panStartPanY = 0;
  private pendingMouseX = 0;
  private pendingMouseY = 0;
  private rafPanPending = false;
  private readonly onDocMouseMove: (e: MouseEvent) => void;
  private readonly onDocMouseUp: () => void;
  private readonly onSearchKeydown: (e: KeyboardEvent) => void;
  private unbinders: (() => void)[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private fileUnsub: (() => void) | null = null;
  private specReloadTimer: ReturnType<typeof setTimeout> | null = null;

  onFileOpen: ((filePath: string) => void) | null = null;

  // Test hook: (sm as any).panX / panY read the renderer's live transform.
  private get panX(): number { return this.renderer.panX; }
  private get panY(): number { return this.renderer.panY; }

  constructor(container: HTMLElement, wsPath: string) {
    this.wsPath = wsPath;
    this.ready = new Promise(resolve => { this.readyResolve = resolve; });

    this.onDocMouseMove = (e: MouseEvent) => {
      if (this.dragMode === 'none') return;
      this.pendingMouseX = e.clientX;
      this.pendingMouseY = e.clientY;
      if (!this.rafPanPending) {
        this.rafPanPending = true;
        requestAnimationFrame(() => {
          this.renderer.panX = this.panStartPanX + (this.pendingMouseX - this.panStartX);
          this.renderer.panY = this.panStartPanY + (this.pendingMouseY - this.panStartY);
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

    // Ctrl+F / Cmd+F → toggle search
    this.onSearchKeydown = (e) => {
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
    this.unbinders.push(bindGuarded(this.validationBadge, 'click', () => this.panelCtrl.openSettingsPanel(), 'specsmap/SpecsMapPlugin.ts'));

    this.cycleBtn = document.createElement('button');
    this.cycleBtn.className = 'sm-header-btn';
    this.cycleBtn.innerHTML = SVG_GEAR;
    this.cycleBtn.title = 'Settings';
    this.unbinders.push(bindGuarded(this.cycleBtn, 'click', () => this.panelCtrl.openSettingsPanel(), 'specsmap/SpecsMapPlugin.ts'));

    this.fitBtn = document.createElement('button');
    this.fitBtn.className = 'sm-header-btn';
    this.fitBtn.innerHTML = SVG_EYE;
    this.fitBtn.title = 'Reset view';
    this.unbinders.push(bindGuarded(this.fitBtn, 'click', () => this.renderer.fitGraph(), 'specsmap/SpecsMapPlugin.ts'));

    this.refreshBtn = document.createElement('button');
    this.refreshBtn.className = 'sm-header-btn';
    this.refreshBtn.innerHTML = SVG_REFRESH;
    this.refreshBtn.title = 'Rebuild spec graph from src/specs/';
    this.unbinders.push(bindGuarded(this.refreshBtn, 'click', () => this.refresh(), 'specsmap/SpecsMapPlugin.ts'));

    header.appendChild(headerSub);
    header.appendChild(headerPath);
    header.appendChild(this.validationBadge);

    this.searchBtn = document.createElement('button');
    this.searchBtn.className = 'sm-header-btn';
    this.searchBtn.innerHTML = SVG_SEARCH;
    this.searchBtn.title = 'Search nodes (Ctrl+F)';
    this.unbinders.push(bindGuarded(this.searchBtn, 'click', () => this.search.toggle(), 'specsmap/SpecsMapPlugin.ts'));
    header.appendChild(this.searchBtn);

    header.appendChild(this.cycleBtn);
    header.appendChild(this.refreshBtn);
    header.appendChild(this.fitBtn);
    this.el.appendChild(header);

    this.tabBar = document.createElement('div');
    this.tabBar.style.cssText =
      'display:none;flex-shrink:0;padding:0 6px;border-bottom:1px solid var(--border);' +
      'background:var(--bg);gap:0;overflow-x:auto;overflow-y:hidden';
    this.tabBar.style.display = 'none';
    this.el.appendChild(this.tabBar);

    const content = document.createElement('div');
    content.style.cssText = 'flex:1;position:relative;overflow:hidden';
    this.el.appendChild(content);

    const svgNS = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
    this.svg.setAttribute('class', 'sm-graph');
    this.svg.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:visible';

    this.nodeLayer = document.createElement('div');
    this.nodeLayer.style.cssText = 'position:absolute;inset:0;z-index:2';

    this.viewport = document.createElement('div');
    this.viewport.style.cssText = 'position:absolute;inset:0;overflow:hidden;contain:layout style';
    this.viewport.appendChild(this.svg);
    this.viewport.appendChild(this.nodeLayer);

    this.emptyState = document.createElement('div');
    this.emptyState.style.cssText =
      'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;' +
      'justify-content:center;z-index:10;padding:40px;text-align:center;pointer-events:none';
    this.viewport.appendChild(this.emptyState);

    content.appendChild(this.viewport);

    this.resizeObserver = new ResizeObserver(() => this.renderer.fitGraph());
    this.resizeObserver.observe(this.viewport);

    this.panel = document.createElement('div');
    this.panel.className = 'sm-panel-el';
    this.panel.style.cssText =
      `position:absolute;right:0;top:0;bottom:0;width:${PANEL_W}px;` +
      'background:var(--surface);border-left:1px solid var(--border);z-index:20;' +
      'transform:translateX(100%);' +
      'display:flex;flex-direction:column;overflow:hidden;pointer-events:none';

    this.panelHeaderEl = document.createElement('div');
    this.panelHeaderEl.style.cssText =
      'flex-shrink:0;border-bottom:1px solid var(--border)';
    this.panel.appendChild(this.panelHeaderEl);

    this.panelInner = document.createElement('div');
    this.panelInner.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden';
    this.panel.appendChild(this.panelInner);
    content.appendChild(this.panel);

    const dataHost: DataHost = {
      onCollections: () => {},
      onReady: () => this.readyResolve(),
      renderTabBar: () => this.renderTabBar(),
      showEmptyState: () => this.showEmptyState(),
      updateHeaderCounts: () => this.updateHeaderCounts(),
      setSpecDirLabel: (text) => { this.specDirLabel.textContent = text; },
      onGraphBuilt: () => { this.renderer.renderGraph(); this.showValidation(); },
      showValidation: () => this.showValidation(),
      showLoadError: (title, message) => this.showLoadError(title, message),
    };
    this.data = new SpecsData(window.electronAPI, wsPath, dataHost);

    const rendererHost: GraphHost = {
      svg: this.svg,
      nodeLayer: this.nodeLayer,
      viewport: this.viewport,
      data: this.data,
      updateHeaderCounts: () => this.updateHeaderCounts(),
      openPanel: (node) => this.panelCtrl.openPanel(node),
      closePanel: (resetZoom) => this.panelCtrl.closePanel(resetZoom),
      onSearchNodeSelected: (id) => this.search.onNodeSelected(id),
      isPanelShowingSettings: () => this.panelCtrl.panelShowingSettings,
      isPanelOpen: () => this.panelCtrl.panelOpen,
      isCycleMode: () => this.cycles.cycleMode,
      isSearchOpen: () => this.search.isOpen,
    };
    this.renderer = new GraphRenderer(rendererHost);

    const searchHost: SearchHost = {
      getNodes: () => this.data.nodes,
      getSpecData: (id) => this.data.specRawMap.get(id),
      getNodeEls: () => this.renderer.nodeEls,
      selectNode: (id, fromSearch) => this.renderer.selectNode(id, fromSearch),
    };
    this.search = new SearchController(content, SVG_SEARCH, searchHost, () => {
      this.searchBtn.style.color = this.search.isOpen ? 'var(--accent)' : '';
    });

    const cyclesHost: CyclesHost = {
      getGraph: () => this.data.graph,
      getNodes: () => this.data.nodes,
      getNodeEls: () => this.renderer.nodeEls,
      getEdgePaths: () => this.renderer.cachedEdgePaths,
      getRefCount: (id) => this.data.refCounts.get(id) ?? 0,
      getViewTransform: () => ({ scale: this.renderer.scale, panX: this.renderer.panX, panY: this.renderer.panY }),
      svg: this.svg,
    };
    this.cycles = new CyclesController(cyclesHost, () => {
      this.updateCycleBtnColor();
      if (this.panelCtrl.panelShowingSettings) this.panelCtrl.renderSettingsContent();
    });

    const panelHost: PanelHost = {
      data: this.data,
      renderer: this.renderer,
      cycles: this.cycles,
      panel: this.panel,
      panelHeaderEl: this.panelHeaderEl,
      panelInner: this.panelInner,
      wsPath: this.wsPath,
      onFileOpen: () => this.onFileOpen,
      runReconcile: (mode, createSkeletons) => this.reconcileSpecs(mode, createSkeletons),
      onCycleChromeChange: () => this.updateCycleBtnColor(),
    };
    this.panelCtrl = new PanelController(panelHost);

    container.appendChild(this.el);

    this.injectStyles();
    this.initInteractions();
    void this.data.loadSpecs();
    this.watchForChanges();
  }

  private updateCycleBtnColor(): void {
    const active = this.panelCtrl.panelShowingSettings || this.cycles.cycleMode || this.cycles.isolatedMode;
    this.cycleBtn.style.color = active ? 'var(--accent)' : '';
  }

  private watchForChanges(): void {
    const api = window.electronAPI;
    if (!api?.fs.onChanged) return;
    this.fileUnsub = api.fs.onChanged((filePath: string) => {
      const p = filePath.replace(/\\/g, '/');
      const specsDir = this.data.specBaseDir;
      if (specsDir && p.startsWith(specsDir + '/') && p.endsWith('.spec.md')) {
        if (this.specReloadTimer) clearTimeout(this.specReloadTimer);
        this.specReloadTimer = setTimeout(() => {
          this.specReloadTimer = null;
          this.refresh();
        }, 400);
        return;
      }
      if (this.data.graph && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p) && !/\.(test|spec)\./.test(p)) {
        const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
        const rel = p.startsWith(wsRoot + '/') ? p.slice(wsRoot.length + 1) : p;
        if (this.data.graph.byFile.has(rel) && !this.data.driftDirty) {
          this.data.driftDirty = true;
          this.showValidation();
        }
      }
    });
  }

  private injectStyles(): void {
    if (document.getElementById('sm-styles')) return;
    const style = document.createElement('style');
    style.id = 'sm-styles';
    style.textContent = SM_STYLES;
    document.head.appendChild(style);
  }

  private initInteractions(): void {
    const src = 'specsmap/SpecsMapPlugin.ts';
    this.unbinders.push(bindGuarded(this.viewport, 'wheel', (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = this.viewport.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const oldScale = this.renderer.scale;
      const maxScale = Math.max(this.renderer.fitScale * 3, 1.0);
      this.renderer.scale = Math.max(this.renderer.fitScale, Math.min(maxScale, this.renderer.scale * (1 + -e.deltaY * 0.001)));
      this.renderer.panX = mx - (mx - this.renderer.panX) * (this.renderer.scale / oldScale);
      this.renderer.panY = my - (my - this.renderer.panY) * (this.renderer.scale / oldScale);
      this.applyTransform();
    }, src, { passive: false }));

    this.unbinders.push(bindGuarded(this.viewport, 'mousedown', (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      if ((e.target as HTMLElement).closest('.sm-node')) return;
      this.dragMode = 'pan';
      this.panStartX = e.clientX;
      this.panStartY = e.clientY;
      this.panStartPanX = this.renderer.panX;
      this.panStartPanY = this.renderer.panY;
      this.viewport.style.cursor = 'grabbing';
      this.nodeLayer.style.willChange = 'transform';
      this.svg.style.willChange = 'transform';
    }, src));

    this.unbinders.push(bindGuarded(document, 'mousemove', this.onDocMouseMove, src));
    this.unbinders.push(bindGuarded(document, 'mouseup', this.onDocMouseUp, src));
    this.unbinders.push(bindGuarded(document, 'keydown', this.onSearchKeydown, src));

    this.unbinders.push(bindGuarded(this.viewport, 'click', (e: MouseEvent) => {
      const rect = this.viewport.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (this.cycles.handleViewportClick(cx, cy)) return;
      if (!(e.target as HTMLElement).closest('.sm-node')) this.panelCtrl.closePanel(true);
    }, src));
  }

  private applyTransform(): void {
    this.renderer.applyTransform();
  }

  private showEmptyState(): void | Promise<void> {
    return showEmptyState(this.emptyState, this.wsPath);
  }

  private showLoadError(title: string, message: string): void {
    this.nodeLayer.innerHTML =
      '<div style="padding:16px;color:var(--red);font-size:14px;line-height:1.5">' +
      '<div style="font-weight:700;margin-bottom:6px">' + title + '</div>' +
      '<div style="font-size:11px;opacity:0.85;word-break:break-all">' + esc(message) + '</div></div>';
  }

  private renderTabBar(): void {
    if (this.data.collections.length < 2) {
      this.tabBar.style.display = 'none';
      return;
    }
    this.tabBar.style.display = 'flex';
    this.tabBar.innerHTML = '';
    for (let i = 0; i < this.data.collections.length; i++) {
      const c = this.data.collections[i];
      const active = i === this.data.activeCollectionIndex;
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
        if (i !== this.data.activeCollectionIndex) {
          tab.style.color = 'var(--primary)';
          tab.style.borderColor = 'var(--border)';
        }
      });
      tab.addEventListener('mouseleave', () => {
        if (i !== this.data.activeCollectionIndex) {
          tab.style.color = '';
          tab.style.borderColor = '';
        }
      });
      tab.addEventListener('click', () => this.switchToTab(i));
      this.tabBar.appendChild(tab);
    }
  }

  private async switchToTab(index: number): Promise<void> {
    if (index === this.data.activeCollectionIndex || index < 0 || index >= this.data.collections.length) return;

    this.data.activeCollectionIndex = index;
    this.renderTabBar();

    this.cycles.reset();
    this.cycleBtn.style.color = '';
    this.data.nodes = [];
    this.data.specRawMap.clear();
    this.data.refCounts.clear();
    this.renderer.nodeEls.clear();
    this.nodeLayer.innerHTML = '';
    this.svg.innerHTML = '';
    this.data.lastRendered = null;
    this.emptyState.style.display = 'none';
    this.panelCtrl.closePanel();

    try {
      await this.data.buildFromFiles(index);
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.showLoadError('Error loading collection', msg);
    }
  }

  private async refresh(): Promise<void> {
    this.refreshBtn.disabled = true;
    this.refreshBtn.querySelector('svg')?.classList.add('sm-spinning');

    this.cycles.reset();
    this.cycleBtn.style.color = '';

    this.data.collections = await this.data.findAllCollections();
    if (this.data.activeCollectionIndex >= this.data.collections.length) this.data.activeCollectionIndex = 0;
    this.renderTabBar();

    this.data.specBaseDir = '';
    this.data.nodes = [];
    this.data.specRawMap.clear();
    this.data.refCounts.clear();
    this.renderer.nodeEls.clear();
    this.nodeLayer.innerHTML = '';
    this.svg.innerHTML = '';
    this.data.lastRendered = null;
    this.emptyState.style.display = 'none';
    this.panelCtrl.closePanel();

    try {
      if (this.data.collections.length > 0) {
        await this.data.buildFromFiles(this.data.activeCollectionIndex);
      } else {
        await this.showEmptyState();
      }
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.showLoadError('Error refreshing specs', msg);
    }

    this.refreshBtn.disabled = false;
    this.refreshBtn.querySelector('svg')?.classList.remove('sm-spinning');
    this.showValidation();
  }

  private updateHeaderCounts(): void {
    const sub = this.el.querySelector('.sm-header-sub') as HTMLElement | null;
    if (!sub) return;
    const mainNodes = this.data.nodes.filter(n => !n.isUI).length;
    const uiNodes = this.data.nodes.filter(n => n.isUI).length;
    sub.textContent = `${mainNodes} specs · ${uiNodes} ui specs · hover to trace · click for detail`;
  }

  private showValidation(): void {
    if (this.data.lastSpecFileCount === 0 || !this.data.report) {
      this.validationBadge.style.display = 'none';
      return;
    }
    const r = this.data.report;
    const color = r.counts.error ? 'var(--red)' : r.counts.warn ? 'var(--amber)' : 'var(--green)';
    this.validationBadge.textContent = summarizeReport(r) + (this.data.driftDirty ? ' · drift' : '');
    this.validationBadge.style.color = color;
    this.validationBadge.style.borderColor = color;
    this.validationBadge.style.background = `color-mix(in oklab, ${color} 10%, transparent)`;
    this.validationBadge.style.cursor = 'pointer';
    this.validationBadge.title = (this.data.driftDirty ? 'Source files changed since load — structure may be stale.\n' : '') +
      (r.issues.length
        ? r.issues.slice(0, 8).map(i => `[${i.severity}] ${i.message}`).join('\n') + (r.issues.length > 8 ? `\n… +${r.issues.length - 8} more` : '')
        : 'All validation rules pass') +
      '\nClick to open the validation drawer';
    this.validationBadge.style.display = 'inline';
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
    const specsDir = this.data.specBaseDir || wsRoot + '/src/specs';
    const api = window.electronAPI;
    if (!api) return 'Filesystem unavailable.';
    const result = await reconcile({
      fs: api.fs, wsRoot, specsDir, mode, createSkeletons,
    });
    if (mode === 'structural') {
      await this.refresh();
    }
    if (this.data.graph) {
      this.data.report = validate(this.data.graph, {
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
    if (this.data.report) lines.push(`- validation: ${summarizeReport(this.data.report)}`);
    return lines.join('\n');
  }

  /** Full validation report with source-tree evidence (markdown). */
  async validateSpecs(): Promise<string> {
    await this.ready;
    if (!this.data.graph) return 'No spec graph loaded.';
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    const specsDir = this.data.specBaseDir || wsRoot + '/src/specs';
    const api = window.electronAPI;
    if (api) {
      const result = await reconcile({ fs: api.fs, wsRoot, specsDir, mode: 'report' });
      this.data.report = validate(this.data.graph, {
        sourceFiles: result.sourceFiles,
        existingFiles: result.existingFiles,
        facts: result.facts,
      });
    } else {
      this.data.report = validate(this.data.graph);
    }
    this.showValidation();
    const r = this.data.report;
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
    return `SpecsMap reloaded: ${this.data.nodes.length} node(s), ${this.data.report ? summarizeReport(this.data.report) : 'no report'}.`;
  }

  getNodes(): SpecNode[] {
    return this.data.nodes.map(n => ({ ...n }));
  }

  getNodeContext(id: string): string {
    const node = this.data.nodes.find(n => n.id === id);
    if (!node) return '';
    const raw = this.data.specRawMap.get(id) ?? {};
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
    if (this.data.nodes.length === 0) {
      return 'No specs available to explore.';
    }
    const q = query.trim();
    if (!q) {
      return 'Please provide a search query.';
    }

    if (this.data.graph) {
      const matches = graphSearch(this.data.graph, q);
      if (matches.length === 0) return `No specs matched "${query}".`;

      if (opts.animate) {
        const el = matches[0].specFile;
        if (this.renderer.nodeEls.has(el)) this.renderer.selectNode(el, true);
      }

      const shown = matches.slice(0, 8);
      const contexts = shown.map(n =>
        contextMarkdown(this.data.graph!, n.id, this.data.specDocs.get(n.specFile)));
      let out = `# Matches (${matches.length}) for "${query}"` +
        (matches.length > shown.length ? ` — showing first ${shown.length}` : '') +
        '\n\n' + contexts.join('\n\n---\n\n');
      if (this.data.driftDirty) {
        out += '\n\n⚠ Source files changed since the graph was loaded — structure may be stale. Run specs_reconcile.';
      }
      out += staleFooter(this.data.report);
      return out;
    }

    const lq = q.toLowerCase();
    const matches = this.data.nodes.filter(n =>
      n.name.toLowerCase().includes(lq) ||
      n.sourceFile.toLowerCase().includes(lq) ||
      n.specFile.toLowerCase().includes(lq) ||
      (this.data.specRawMap.get(n.id)?.description ?? '').toLowerCase().includes(lq)
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
    for (const unbind of this.unbinders) {
      try { unbind(); } catch { /* best effort */ }
    }
    this.unbinders = [];
    if (this.fileUnsub) { this.fileUnsub(); this.fileUnsub = null; }
    if (this.specReloadTimer) { clearTimeout(this.specReloadTimer); this.specReloadTimer = null; }
    this.renderer.nodeEls.clear();
    this.data.specRawMap.clear();
    this.data.specDocs.clear();
  }
}
