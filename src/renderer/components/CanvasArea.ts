export type { EditorState, WindowEntry, SaveState } from './canvas-area/types';

import { GridStyle, generateGridPattern, applyGridPattern } from './canvas-grid';
import { StatusBar } from './canvas-statusbar';
import { ContextMenu } from './ContextMenu';
import { ExplorerWindow } from './ExplorerWindow';
import { TerminalWindow } from './TerminalWindow';
import { SpecsMapWindow } from './SpecsMapWindow';
import type { SaveState, CardState, WindowEntry } from './canvas-area/types';
import { Viewport, WORLD_BOUNDS_X, WORLD_BOUNDS_Y } from './canvas-area/viewport';
import { Notifier } from './canvas-area/notify';
import { LayoutOverlays } from './canvas-area/layout-overlays';
import { CardLifecycle } from './canvas-area/card-lifecycle';
import { WindowFocus } from './canvas-area/window-focus';
import { WindowFactories } from './canvas-area/window-factories';
import { Panels } from './canvas-area/panels';
import { bindGuarded } from '../health/monitor';

export class CanvasArea {
  onStateChange: (() => void) | null = null;
  onTerminalsChanged: ((items: { uuid: string; title: string; isOpen: boolean }[]) => void) | null = null;
  onExplorersChanged: ((items: { uuid: string; title: string; isOpen: boolean }[]) => void) | null = null;
  onGitChanged: ((items: { uuid: string; title: string; isOpen: boolean }[]) => void) | null = null;
  onSpecsmapChanged: ((items: { uuid: string; title: string; isOpen: boolean }[]) => void) | null = null;
  onLockToggle: (() => void) | null = null;
  workspaceName = 'no workspace';

  private _locked = false;
  get locked(): boolean { return this._locked; }
  set locked(v: boolean) {
    this._locked = v;
    this.statusBar.update(this._locked, this.scale, this.workspaceName, this.onLockToggle, () => this.fitAll(), () => { this.scale = 1; this.scheduleTransform(); });
    this.onStateChange?.();
  }

  private _overlayLeft = 0;
  get overlayLeft(): number { return this._overlayLeft; }
  set overlayLeft(v: number) {
    this._overlayLeft = v;
    this.setDrawerOffset(v);
  }

  private statusBar = new StatusBar();

  // Sub-controllers (private; all public surface routes through forwarders)
  private viewport: Viewport;
  private layouts: LayoutOverlays;
  private lifecycle: CardLifecycle;
  private notifier: Notifier;
  private focus: WindowFocus;
  private factories: WindowFactories;
  private panels: Panels;

  // Grid / world DOM
  private patternSize = 28;
  private patternDataURL = '';
  private gridStyle: GridStyle = 'dots';
  private worldEl: HTMLDivElement;
  private gridEl: HTMLDivElement;
  private originDot: HTMLDivElement;
  private boundaryEl: HTMLDivElement;

  // Panels
  private tileW = '23';
  private tileH = '17';

  // Panning + nav state (kept on the facade; initZoomPan lives here)
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartPanX = 0;
  private panStartPanY = 0;
  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private unbinders: (() => void)[] = [];
  private boundMouseUp: (() => void) | null = null;
  private boundDocWheel: ((e: WheelEvent) => void) | null = null;
  private contextMenuOpen = false;
  private wsPath = '';

  // Proxied private state — the test suite (and internal code) reads/writes these
  // exactly as before; the value lives on the owning sub-controller.
  private get scale(): number { return this.viewport.scale; }
  private set scale(v: number) { this.viewport.scale = v; }
  private get panX(): number { return this.viewport.panX; }
  private set panX(v: number) { this.viewport.panX = v; }
  private get panY(): number { return this.viewport.panY; }
  private set panY(v: number) { this.viewport.panY = v; }
  private get cards(): CardState[] { return this.lifecycle.getCards(); }
  private set cards(v: CardState[]) { this.lifecycle.setCards(v); }
  private get layoutOverlays(): HTMLElement[] { return this.layouts.layoutOverlays; }
  private get lastDragX(): number { return this.layouts.lastDragX; }
  private set lastDragX(v: number) { this.layouts.lastDragX = v; }
  private get lastDragY(): number { return this.layouts.lastDragY; }
  private set lastDragY(v: number) { this.layouts.lastDragY = v; }

  constructor(private el: HTMLElement) {
    // Window list panel (lower-left) + arrange panel (lower-right) hover zones
    this.panels = new Panels(this.el, {
      getCards: () => this.cards,
      getContextMenuOpen: () => this.contextMenuOpen,
      setContextMenuOpen: (v) => { this.contextMenuOpen = v; },
      getTileW: () => this.tileW,
      setTileW: (v) => { this.tileW = v; },
      getTileH: () => this.tileH,
      setTileH: (v) => { this.tileH = v; },
      focusCard: (title) => this.focusCard(title),
      panToCard: (cs) => this.panToCard(cs),
      reopenCard: (cs) => this.reopenCard(cs),
      terminateCard: (cs) => this.terminateCard(cs),
      autoArrange: () => this.autoArrange(),
      tileWindows: () => this.tileWindows(),
      snapOrigin: () => this.snapOrigin(),
    });

    // Single world layer: pan/zoom is one compositor transform; cards stay in world coords.
    this.worldEl = document.createElement('div');
    this.worldEl.className = 'canvas-world';
    this.el.appendChild(this.worldEl);

    this.gridEl = document.createElement('div');
    this.gridEl.className = 'canvas-grid-layer';
    this.gridEl.setAttribute('aria-hidden', 'true');
    this.gridEl.style.left = `${-WORLD_BOUNDS_X}px`;
    this.gridEl.style.top = `${-WORLD_BOUNDS_Y}px`;
    this.gridEl.style.width = `${WORLD_BOUNDS_X * 2}px`;
    this.gridEl.style.height = `${WORLD_BOUNDS_Y * 2}px`;
    this.worldEl.appendChild(this.gridEl);

    this.boundaryEl = document.createElement('div');
    this.boundaryEl.className = 'canvas-boundary';
    this.boundaryEl.style.left = `${-WORLD_BOUNDS_X}px`;
    this.boundaryEl.style.top = `${-WORLD_BOUNDS_Y}px`;
    this.boundaryEl.style.width = `${WORLD_BOUNDS_X * 2}px`;
    this.boundaryEl.style.height = `${WORLD_BOUNDS_Y * 2}px`;
    this.worldEl.appendChild(this.boundaryEl);

    this.originDot = document.createElement('div');
    this.originDot.className = 'origin-dot';
    this.originDot.style.left = '-3px';
    this.originDot.style.top = '-3px';
    this.worldEl.appendChild(this.originDot);

    // Sub-controllers (hosts close over `this` lazily — order is irrelevant to calls)
    this.notifier = new Notifier({
      getCards: () => this.cards,
      getTerminalsChanged: () => this.onTerminalsChanged,
      getExplorersChanged: () => this.onExplorersChanged,
      getGitChanged: () => this.onGitChanged,
      getSpecsmapChanged: () => this.onSpecsmapChanged,
    });
    this.viewport = new Viewport(this.el, this.worldEl, {
      getOverlayLeft: () => this.overlayLeft,
      getLocked: () => this.locked,
      getWorkspaceName: () => this.workspaceName,
      isPanning: () => this.isPanning,
      getOnStateChange: () => this.onStateChange,
      getOnLockToggle: () => this.onLockToggle,
      getStatusBar: () => this.statusBar,
      getCards: () => this.cards,
      onRepositionAll: () => this.lifecycle.repositionAll(),
      bringToFront: (card) => this.lifecycle.bringToFront(card),
      moveToNonOverlapping: (cs) => this.layouts.moveToNonOverlapping(cs),
      positionCard: (cs) => this.lifecycle.positionCard(cs),
      animatePan: (x, y, d) => this.animatePan(x, y, d),
    });
    this.layouts = new LayoutOverlays(this.el, this.viewport, {
      getCards: () => this.cards,
      getLocked: () => this.locked,
      getOverlayLeft: () => this.overlayLeft,
      getOnStateChange: () => this.onStateChange,
      positionCard: (cs) => this.lifecycle.positionCard(cs),
      fitAll: () => this.fitAll(),
      getTileW: () => this.tileW,
      getTileH: () => this.tileH,
    });
    this.lifecycle = new CardLifecycle(this.viewport, this.layouts, this.notifier, this.worldEl, {
      getOnStateChange: () => this.onStateChange,
      setContextMenuOpen: (v) => { this.contextMenuOpen = v; },
      getWsPath: () => this.wsPath,
      setWsPath: (v) => { this.wsPath = v; },
      fitViewport: (cs) => this.fitViewport(cs),
      snapToCorner: (cs) => this.snapToCorner(cs),
      terminateCard: (cs) => this.terminateCard(cs),
    });
    this.focus = new WindowFocus(this.lifecycle, this.notifier, this.viewport);
    this.factories = new WindowFactories(this.lifecycle, this.viewport, this.notifier, {
      getWsPath: () => this.wsPath,
      setWsPath: (v) => { this.wsPath = v; },
      getOnStateChange: () => this.onStateChange,
    });

    this.patternDataURL = generateGridPattern(this.gridStyle, this.patternSize);
    applyGridPattern(this.gridEl, this.gridStyle, this.patternDataURL, this.patternSize);
    this.applyWorldTransform();
    this.initZoomPan();
    this.statusBar.init();
    this.statusBar.update(this._locked, this.scale, this.workspaceName, this.onLockToggle, () => this.fitAll(), () => { this.scale = 1; this.scheduleTransform(); });
  }

  // ── panel chrome ────────────────────────────────────────────────

  private setDrawerOffset(left: number): void {
    this.panels.setDrawerOffset(left);
  }

  // ── viewport / zoom / pan delegation ────────────────────────────

  private applyWorldTransform(): void {
    this.viewport.applyWorldTransform();
  }

  private beginNavigating(): void {
    this.viewport.beginNavigating();
  }

  private endNavigating(): void {
    this.viewport.endNavigating();
  }

  private scheduleTransform(flushChrome = false): void {
    this.viewport.scheduleTransform(flushChrome);
  }

  private animatePan(targetX: number, targetY: number, duration = 300): void {
    this.viewport.animatePan(targetX, targetY, duration);
  }

  private fitAll(): void {
    this.viewport.fitAll();
  }

  private fitViewport(cs: CardState): void {
    this.viewport.fitViewport(cs);
  }

  private panToCard(cs: CardState): void {
    this.viewport.panToCard(cs);
  }

  private snapToCorner(cs: CardState): void {
    this.viewport.snapToCorner(cs);
  }

  private snapOrigin(): void {
    this.viewport.snapOrigin();
  }

  // ── layout overlays delegation ──────────────────────────────────

  private showLayoutOverlays(): void {
    this.layouts.showLayoutOverlays();
  }

  private hideLayoutOverlays(): void {
    this.layouts.hideLayoutOverlays();
  }

  private getDropZone(clientX: number, clientY: number): string | null {
    return this.layouts.getDropZone(clientX, clientY);
  }

  private applyDropZone(zone: string, cs: CardState): void {
    this.layouts.applyDropZone(zone, cs);
  }

  private tileWindows(): void {
    this.layouts.tileWindows();
  }

  // ── card lifecycle delegation ───────────────────────────────────

  private addCard(title: string, subtitle: string, x: number, y: number, w: number, h: number): CardState {
    return this.lifecycle.addCard(title, subtitle, x, y, w, h);
  }

  private terminateCard(cs: CardState): void {
    this.lifecycle.terminateCard(cs);
  }

  private reopenCard(cs: CardState): void {
    this.lifecycle.reopenCard(cs);
  }

  // ── public API ──────────────────────────────────────────────────

  setGridStyle(style: GridStyle): void {
    this.gridStyle = style;
    this.patternDataURL = generateGridPattern(this.gridStyle, this.patternSize);
    applyGridPattern(this.gridEl, this.gridStyle, this.patternDataURL, this.patternSize);
  }

  refresh(): void { this.scheduleTransform(true); }

  centerView(): void { this.viewport.centerView(); }

  zoomIn(): void { this.viewport.zoomIn(); }

  zoomOut(): void { this.viewport.zoomOut(); }

  resetView(): void { this.viewport.resetView(); }

  setView(state: { zoom: number; panX: number; panY: number }): void { this.viewport.setView(state); }

  setViewAnimated(panX: number, panY: number, zoom?: number): void { this.viewport.setViewAnimated(panX, panY, zoom); }

  autoArrange(): void { this.layouts.autoArrange(); }

  addEditor(): void { this.factories.addEditor(); }

  addExplorer(wsPath: string): void { this.factories.addExplorer(wsPath); }

  addGit(wsPath: string): void { this.factories.addGit(wsPath); }

  addMarkdown(): void { this.factories.addMarkdown(); }

  addSpecsmap(wsPath: string): void { this.factories.addSpecsmap(wsPath); }

  addTerminal(cwd?: string): Promise<string> { return this.factories.addTerminal(cwd); }

  addDevConsole(wsPath: string): void { this.factories.addDevConsole(wsPath); }

  focusTerminal(uuid: string): void { this.focus.focusTerminal(uuid); }

  focusExplorer(uuid: string): void { this.focus.focusExplorer(uuid); }

  focusGit(uuid: string): void { this.focus.focusGit(uuid); }

  focusSpecsmap(uuid: string): void { this.focus.focusSpecsmap(uuid); }

  focusCard(title: string): void { this.lifecycle.focusCard(title); }

  cycleCard(direction: 1 | -1): void { this.lifecycle.cycleCard(direction); }

  reopenTerminal(uuid: string): void { this.focus.reopenTerminal(uuid); }

  reopenExplorer(uuid: string): void { this.focus.reopenExplorer(uuid); }

  reopenGit(uuid: string): void { this.focus.reopenGit(uuid); }

  reopenSpecsmap(uuid: string): void { this.focus.reopenSpecsmap(uuid); }

  reopenCardByTitle(title: string): boolean { return this.lifecycle.reopenCardByTitle(title); }

  offsetCard(title: string, worldX: number, worldY: number): void { this.lifecycle.offsetCard(title, worldX, worldY); }

  resizeCard(title: string, width: number, height: number): boolean { return this.lifecycle.resizeCard(title, width, height); }

  minimizeCard(title: string): boolean { return this.lifecycle.minimizeCard(title); }

  closeCard(title: string): boolean { return this.lifecycle.closeCard(title); }

  fitCardToViewport(title: string): boolean { return this.viewport.fitCardToViewport(title); }

  focusCardByTitle(title: string): boolean { return this.lifecycle.focusCardByTitle(title); }

  panToCardByUuid(uuid: string): void { this.lifecycle.panToCardByUuid(uuid); }

  panToActiveExplorer(): void { this.lifecycle.panToActiveExplorer(); }

  ensureExplorer(opts?: { pan?: boolean }): Promise<ExplorerWindow> { return this.lifecycle.ensureExplorer(opts); }

  ensureSpecsmap(opts?: { pan?: boolean }): Promise<SpecsMapWindow | null> { return this.lifecycle.ensureSpecsmap(opts); }

  openFileAndReveal(filePath: string): void { this.focus.openFileAndReveal(filePath); }

  async openInMarkdown(filePath: string, _label?: string, pan = true): Promise<void> {
    const explorer = this.getActiveExplorerWindow() || await this.ensureExplorer({ pan });
    explorer.openInMarkdown(filePath);
  }

  getActiveExplorerWindow(): ExplorerWindow | null { return this.lifecycle.getActiveExplorerWindow(); }

  getTerminalWindow(uuid: string): TerminalWindow | null { return this.lifecycle.getTerminalWindow(uuid); }

  getActiveSpecsMapWindow(): SpecsMapWindow | null { return this.lifecycle.getActiveSpecsMapWindow(); }

  killAllTerminals(): void { this.lifecycle.killAllTerminals(); }

  restoreZOrder(order: string[]): void { this.lifecycle.restoreZOrder(order); }

  updateAllThemes(): void {
    for (const cs of this.cards) {
      if (cs.terminalWindow) {
        cs.terminalWindow.updateTheme();
      }
      if (cs.explorerWindow) {
        cs.explorerWindow.updateTheme();
      }
    }
  }

  getSaveState(): SaveState {
    const byZ = [...this.cards].sort((a, b) => parseInt(a.card.el.style.zIndex || '1') - parseInt(b.card.el.style.zIndex || '1'));
    return {
      windows: this.cards.filter(c => c.savedTitle !== 'DevConsole').map(c => {
        const w = c.savedWidth;
        const h = c.savedHeight;
        const base: WindowEntry = { uuid: c.card.uuid, title: c.savedTitle, x: c.worldX, y: c.worldY, width: w, height: h, isOpen: c.isOpen };
        const editorState = c.explorerWindow ? c.explorerWindow.getEditorState() : null;
        if (c.savedTitle === 'Explorer' && editorState) base.editorState = editorState;
        if (c.savedTitle === 'Git' && c.gitWindow) {
          base.gitState = c.gitWindow.getState();
        }
        return base;
      }),
      zOrder: byZ.map(c => c.card.uuid),
      zoom: this.scale, panX: this.panX, panY: this.panY,
      locked: this._locked,
    };
  }

  restoreWindows(state: SaveState, wsPath: string): void {
    this.wsPath = wsPath;
    this.lifecycle.clearCards();

    // Find highest numbers for counters
    let highestTerm = 0;
    for (const p of state.windows) {
      const tm = p.title.match(/^Terminal (\d+)$/);
      if (tm) highestTerm = Math.max(highestTerm, parseInt(tm[1]));
    }
    this.lifecycle.setTerminalCounter(highestTerm);

    // Normalize old "Dev" / "Explorer N" titles to "Explorer"
    let seenExplorer = false;
    for (const p of state.windows) {
      if (p.title === 'Dev' || /^Explorer \d+$/.test(p.title)) {
        p.title = 'Explorer';
      }
    }
    // Deduplicate Explorer (keep only first entry)
    state.windows = state.windows.filter(p => {
      if (p.title === 'Explorer') {
        if (seenExplorer) return false;
        seenExplorer = true;
      }
      return true;
    });
    // Remove any legacy "Markdown" cards
    state.windows = state.windows.filter(p => p.title !== 'Markdown');
    // Dev console is ephemeral — always opened fresh, never restored.
    state.windows = state.windows.filter(p => p.title !== 'DevConsole');
    // ponytail: legacy card type; workspaces saved before the group-chat panel
    // landed get skipped here so no empty WindowCard shell is mounted.
    state.windows = state.windows.filter(p => p.title !== 'Agents');

    for (const p of state.windows) {
      if (p.title.startsWith('Terminal')) {
        const cs = this.lifecycle.createCardFromDef(p, {
          onMinimize: () => {
            cs.isOpen = false;
            cs.card.el.style.display = 'none';
            this.notifier.notifyTerminalsChanged();
          },
          onFitViewport: () => this.fitViewport(cs),
          onTerminate: () => this.terminateCard(cs),
        });

        if (p.isOpen) this.lifecycle.mountTerminal(cs, wsPath);
      } else if (p.title === 'Explorer') {
        const cs = this.lifecycle.createCardFromDef(p, {
          onMinimize: () => { cs.isOpen = false; cs.card.el.style.display = 'none'; },
          onFitViewport: () => this.fitViewport(cs),
          onTerminate: () => this.terminateCard(cs),
        });

        if (p.isOpen) {
          const dev = this.lifecycle.mountExplorer(cs, wsPath);
          // markdown integrated into explorer — setMarkdownOpeners removed
          // Restore editor state from window entry
          if (p.editorState) {
            const es = p.editorState;
            setTimeout(() => dev?.restoreEditorState(es), 500);
          }
        }
      } else if (p.title === 'Git') {
        const cs = this.lifecycle.createCardFromDef(p, {
          onMinimize: () => { cs.isOpen = false; cs.card.el.style.display = 'none'; this.notifier.notifyGitChanged(); },
          onFitViewport: () => this.fitViewport(cs),
          onTerminate: () => this.terminateCard(cs),
        });

        if (p.isOpen) {
          const git = this.lifecycle.mountGit(cs, wsPath);
          if (git && p.gitState) {
            const gitState = p.gitState;
            git.applyLayout(gitState);
            setTimeout(() => git.restoreState(gitState), 500);
          }
        }
      } else if (p.title === 'SpecsMap') {
        const cs = this.lifecycle.createCardFromDef(p, {
          onMinimize: () => { cs.isOpen = false; cs.card.el.style.display = 'none'; this.notifier.notifySpecsmapChanged(); },
          onFitViewport: () => this.fitViewport(cs),
          onTerminate: () => this.terminateCard(cs),
        });

        if (p.isOpen) this.lifecycle.mountSpecsmap(cs, wsPath);
      }
    }

    this.restoreZOrder(state.zOrder);
    this.lifecycle.setTerminalCounter(highestTerm);
    this.lifecycle.repositionAll();
    this.notifier.notifyExplorersChanged();
    this.notifier.notifyGitChanged();
    this.notifier.notifySpecsmapChanged();
  }

  // ── input wiring ────────────────────────────────────────────────

  private initZoomPan(): void {
    // Canvas wheel zoom (only when over empty canvas area, not over cards)
    this.unbinders.push(bindGuarded(this.el, 'wheel', (e: WheelEvent) => {
      if (this.locked || e.ctrlKey) return;
      const rect = this.el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const oldScale = this.scale;
      const delta = -e.deltaY * 0.001;
      const cw = this.el.clientWidth;
      const ch = this.el.clientHeight;
      this.scale = Math.max(cw / (WORLD_BOUNDS_X * 2), ch / (WORLD_BOUNDS_Y * 2), Math.min(5, this.scale * (1 + delta)));
      const worldX = (mx - this.panX) / oldScale;
      const worldY = (my - this.panY) / oldScale;
      this.panX = mx - worldX * this.scale;
      this.panY = my - worldY * this.scale;
      this.beginNavigating();
      this.scheduleTransform();
    }, 'canvas-area/CanvasArea.ts', { passive: false }));

    // Global Ctrl+Wheel zoom — capture phase so it fires before child stopPropagation
    this.boundDocWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      if (this.locked) { e.preventDefault(); return; }
      e.preventDefault();
      e.stopPropagation();
      const rect = this.el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const oldScale = this.scale;
      const delta = -e.deltaY * 0.001;
      this.scale = Math.max(this.el.clientWidth / (WORLD_BOUNDS_X * 2), this.el.clientHeight / (WORLD_BOUNDS_Y * 2), Math.min(5, this.scale * (1 + delta)));
      const worldX = (mx - this.panX) / oldScale;
      const worldY = (my - this.panY) / oldScale;
      this.panX = mx - worldX * this.scale;
      this.panY = my - worldY * this.scale;
      this.beginNavigating();
      this.scheduleTransform();
    };
    this.unbinders.push(bindGuarded(document, 'wheel', this.boundDocWheel, 'canvas-area/CanvasArea.ts', { capture: true, passive: false }));

    this.unbinders.push(bindGuarded(this.el, 'mousedown', (e: MouseEvent) => {
      // Ctrl+drag pans even over cards; otherwise only on empty canvas for text selection
      if (e.button === 0 || e.button === 1) {
        if (e.ctrlKey || !(e.target as HTMLElement)?.closest('.card, .prr-zone, .pli-zone')) {
          this.isPanning = true;
          this.panStartX = e.clientX;
          this.panStartY = e.clientY;
          this.panStartPanX = this.panX;
          this.panStartPanY = this.panY;
          this.el.style.cursor = 'grabbing';
          this.beginNavigating();
        }
      }
    }, 'canvas-area/CanvasArea.ts'));

    this.boundMouseMove = (e: MouseEvent) => {
      if (!this.isPanning) return;
      this.panX = this.panStartPanX + (e.clientX - this.panStartX);
      this.panY = this.panStartPanY + (e.clientY - this.panStartY);
      this.beginNavigating();
      this.scheduleTransform();
    };
    this.unbinders.push(bindGuarded(document, 'mousemove', this.boundMouseMove, 'canvas-area/CanvasArea.ts'));

    this.boundMouseUp = () => {
      if (!this.isPanning) return;
      this.isPanning = false;
      this.el.style.cursor = '';
      this.endNavigating();
    };
    this.unbinders.push(bindGuarded(document, 'mouseup', this.boundMouseUp, 'canvas-area/CanvasArea.ts'));

    this.unbinders.push(bindGuarded(this.el, 'contextmenu', (e: MouseEvent) => {
      if (this.locked) return;
      if ((e.target as HTMLElement)?.closest('.card, .prr-zone, .pli-zone')) return;
      e.preventDefault();
      new ContextMenu([
        { label: 'View All', action: () => this.fitAll() },
        { label: 'Auto Arrange', action: () => this.autoArrange() },
      ], e.clientX, e.clientY);
    }, 'canvas-area/CanvasArea.ts'));
  }

  destroy(): void {
    for (const unbind of this.unbinders) {
      try { unbind(); } catch { /* best effort */ }
    }
    this.unbinders = [];
    for (const cs of [...this.cards]) {
      cs.card.remove();
    }
    this.cards = [];
    this.viewport.destroy();
    this.el.innerHTML = '';
  }
}
