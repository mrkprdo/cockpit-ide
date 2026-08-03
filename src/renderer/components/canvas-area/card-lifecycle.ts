import type { Viewport } from './viewport';
import type { LayoutOverlays } from './layout-overlays';
import type { Notifier } from './notify';
import { PluginCard } from '../PluginCard';
import { ContextMenu } from '../ContextMenu';
import { TerminalPlugin } from '../TerminalPlugin';
import { ExplorerPlugin } from '../ExplorerPlugin';
import { GitPlugin } from '../GitPlugin';
import { SpecsMapPlugin } from '../SpecsMapPlugin';
import { AgentsPlugin } from '../AgentsPlugin';
import { DevConsolePlugin } from '../dev-console/DevConsolePlugin';
import type { CardState } from './types';

export interface PluginHost {
  getOnStateChange(): (() => void) | null;
  setContextMenuOpen(v: boolean): void;
  getWsPath(): string;
  setWsPath(v: string): void;
  fitViewport(cs: CardState): void;
  snapToCorner(cs: CardState): void;
  terminateCard(cs: CardState): void;
}

export class CardLifecycle {
  cards: CardState[] = [];
  private nextZ = 10;
  private terminalCounter = 0;
  private explorerCounter = 0;
  private gitCounter = 0;

  constructor(
    private viewport: Viewport,
    private layouts: LayoutOverlays,
    private notifier: Notifier,
    private worldEl: HTMLDivElement,
    private host: PluginHost,
  ) {}

  getCards(): CardState[] { return this.cards; }

  setCards(v: CardState[]): void { this.cards = v; }

  clearCards(): void {
    for (const cs of [...this.cards]) cs.card.el.remove();
    this.cards = [];
    this.terminalCounter = 0;
    this.explorerCounter = 0;
  }

  setTerminalCounter(v: number): void { this.terminalCounter = v; }

  nextTerminalNumber(): number {
    this.terminalCounter++;
    return this.terminalCounter;
  }

  setExplorerCounter(v: number): void { this.explorerCounter = v; }

  setGitCounter(v: number): void { this.gitCounter = v; }

  positionCard(cs: CardState): void {
    // World coords only — pan/zoom lives on .canvas-world
    cs.card.el.style.left = `${cs.worldX}px`;
    cs.card.el.style.top = `${cs.worldY}px`;
    cs.card.el.style.transform = '';
    cs.terminalPlugin?.setScale(this.viewport.scale);
  }

  repositionAll(): void {
    for (const cs of this.cards) this.positionCard(cs);
  }

  addCard(title: string, subtitle: string, x: number, y: number, w: number, h: number): CardState {
    const sx = this.viewport.clampWorld(this.viewport.snap(x), 'x');
    const sy = this.viewport.clampWorld(this.viewport.snap(y), 'y');
    const sw = this.viewport.snapSize(w);
    const sh = this.viewport.snapSize(h);
    let cs: CardState;
    const card = new PluginCard(this.worldEl, {
      title, subtitle, x: 0, y: 0, width: sw, height: sh,
      onMinimize: () => {
        cs.isOpen = false;
        cs.card.el.style.display = 'none';
        this.notifier.notifyCardChanged(title);
        this.host.getOnStateChange()?.();
      },
      onFitViewport: () => this.host.fitViewport(cs),
      onTerminate: () => this.host.terminateCard(cs),
      onDragStart: (clientX, clientY) => {
        this.layouts.setDragPos(clientX, clientY);
        this.layouts.showLayoutOverlays();
      },
      onDragMove: (clientX, clientY) => {
        this.layouts.setDragPos(clientX, clientY);
      },
      onDragEnd: (worldX: number, worldY: number) => {
        const zone = this.layouts.getDropZone(this.layouts.lastDragX, this.layouts.lastDragY);
        if (zone) {
          this.layouts.applyDropZone(zone, cs);
        } else {
          cs.worldX = this.viewport.clampWorld(worldX, 'x');
          cs.worldY = this.viewport.clampWorld(worldY, 'y');
        }
        this.layouts.hideLayoutOverlays();
        this.host.getOnStateChange()?.();
      },
      onResizeEnd: (w: number, h: number) => {
        cs.savedWidth = w; cs.savedHeight = h;
        cs.onCardResize?.();
        this.host.getOnStateChange()?.();
      },
      onFocus: () => this.bringToFront(card),
      onHeaderContextMenu: (e: MouseEvent) => {
        this.host.setContextMenuOpen(true);
        const menu = new ContextMenu([
          { label: 'Fit Viewport', action: () => this.host.fitViewport(cs) },
          { label: 'Snap to Corner', action: () => this.host.snapToCorner(cs) },
          ...(cs.isOpen ? [{ label: 'Minimize', action: () => {
            cs.isOpen = false;
            cs.card.el.style.display = 'none';
            this.notifier.notifyCardChanged(title);
            this.host.getOnStateChange()?.();
          }}] : []),
          { label: title.startsWith('Terminal') ? 'Terminate' : 'Close', action: () => this.host.terminateCard(cs) },
        ], e.clientX, e.clientY);
        menu.onClose = () => { this.host.setContextMenuOpen(false); };
      },
    }, () => ({ scale: this.viewport.scale, panX: this.viewport.panX, panY: this.viewport.panY }));
    cs = { card, worldX: sx, worldY: sy, isOpen: true, savedTitle: title, savedWidth: sw, savedHeight: sh, savedWX: sx, savedWY: sy, terminalPlugin: null, explorerPlugin: null, gitPlugin: null, specsmapPlugin: null, agentsPlugin: null, devConsolePlugin: null };
    this.cards.push(cs);
    this.positionCard(cs);
    return cs;
  }

  createCardFromDef(p: { uuid?: string; title: string; x: number; y: number; width: number; height: number; isOpen: boolean }, callbacks: { onMinimize?: () => void; onFitViewport?: () => void; onTerminate?: () => void }): CardState {
    let cs: CardState;
    const card = new PluginCard(this.worldEl, {
      title: p.title, subtitle: '', x: 0, y: 0, width: p.width, height: p.height,
      onMinimize: callbacks.onMinimize,
      onFitViewport: callbacks.onFitViewport,
      onTerminate: callbacks.onTerminate,
      onDragStart: (clientX, clientY) => {
        this.layouts.setDragPos(clientX, clientY);
        this.layouts.showLayoutOverlays();
      },
      onDragMove: (clientX, clientY) => {
        this.layouts.setDragPos(clientX, clientY);
      },
      onDragEnd: (worldX: number, worldY: number) => {
        const zone = this.layouts.getDropZone(this.layouts.lastDragX, this.layouts.lastDragY);
        if (zone) {
          this.layouts.applyDropZone(zone, cs);
        } else {
          cs.worldX = this.viewport.clampWorld(worldX, 'x');
          cs.worldY = this.viewport.clampWorld(worldY, 'y');
        }
        this.layouts.hideLayoutOverlays();
        this.host.getOnStateChange()?.();
      },
      onResizeEnd: (w: number, h: number) => {
        cs.savedWidth = w; cs.savedHeight = h;
        cs.onCardResize?.();
        this.host.getOnStateChange()?.();
      },
      onFocus: () => this.bringToFront(card),
      onHeaderContextMenu: (e: MouseEvent) => {
        this.host.setContextMenuOpen(true);
        const menu = new ContextMenu([
          { label: 'Fit Viewport', action: () => this.host.fitViewport(cs) },
          { label: 'Snap to Corner', action: () => this.host.snapToCorner(cs) },
          ...(cs.isOpen ? [{ label: 'Minimize', action: () => {
            cs.isOpen = false;
            cs.card.el.style.display = 'none';
            this.notifier.notifyCardChanged(p.title);
            this.host.getOnStateChange()?.();
          }}] : []),
          { label: cs.savedTitle.startsWith('Terminal') ? 'Terminate' : 'Close', action: () => this.host.terminateCard(cs) },
        ], e.clientX, e.clientY);
        menu.onClose = () => { this.host.setContextMenuOpen(false); };
      },
    }, () => ({ scale: this.viewport.scale, panX: this.viewport.panX, panY: this.viewport.panY }));

    const cx = this.viewport.clampWorld(p.x, 'x');
    const cy = this.viewport.clampWorld(p.y, 'y');
    cs = { card, worldX: cx, worldY: cy, isOpen: p.isOpen, savedTitle: p.title, savedWidth: p.width, savedHeight: p.height, savedWX: cx, savedWY: cy, terminalPlugin: null, explorerPlugin: null, gitPlugin: null, specsmapPlugin: null, agentsPlugin: null, devConsolePlugin: null };
    this.cards.push(cs);

    if (!p.isOpen) card.el.style.display = 'none';
    return cs;
  }

  bringToFront(card: PluginCard): void {
    if (this.nextZ >= 9998) this.rebalanceZ();
    this.nextZ++;
    card.el.style.zIndex = String(this.nextZ);
  }

  rebalanceZ(): void {
    this.nextZ = 10;
    for (const cs of this.cards) {
      cs.card.el.style.zIndex = String(this.nextZ++);
    }
  }

  restoreZOrder(order: string[]): void {
    if (!order || order.length === 0) return;
    // Assign z-index based on array order (bottom first → low z, top last → high z)
    this.nextZ = 10;
    for (const uuid of order) {
      const cs = this.cards.find(c => c.card.uuid === uuid);
      if (cs) cs.card.el.style.zIndex = String(this.nextZ++);
    }
  }

  getTerminalPlugin(uuid: string): TerminalPlugin | null {
    return this.cards.find(c => c.card.uuid === uuid)?.terminalPlugin ?? null;
  }

  getActiveExplorerPlugin(): ExplorerPlugin | null {
    for (const cs of this.cards) {
      if (cs.explorerPlugin && cs.isOpen) return cs.explorerPlugin;
    }
    return null;
  }

  getActiveSpecsMapPlugin(): SpecsMapPlugin | null {
    return this.cards.find(c => c.specsmapPlugin && c.isOpen)?.specsmapPlugin ?? null;
  }

  getActiveAgentsPlugin(): AgentsPlugin | null {
    return this.cards.find(c => c.agentsPlugin && c.isOpen)?.agentsPlugin ?? null;
  }

  focusCard(title: string): void {
    const cs = this.cards.find(c => c.card.opts.title === title);
    if (cs) this.bringToFront(cs.card);
  }

  focusCardByTitle(title: string): boolean {
    const cs = this.cards.find(c => c.isOpen && c.savedTitle.toLowerCase().includes(title.toLowerCase()));
    if (!cs) return false;
    this.focusCard(cs.card.opts.title);
    this.viewport.panToCard(cs);
    return true;
  }

  cycleCard(direction: 1 | -1): void {
    const open = this.cards.filter(c => c.isOpen);
    if (open.length < 2) return;

    let currentIdx = 0;
    let maxZ = -Infinity;
    for (let i = 0; i < open.length; i++) {
      const z = parseInt(open[i].card.el.style.zIndex) || 0;
      if (z > maxZ) {
        maxZ = z;
        currentIdx = i;
      }
    }

    const nextIdx = (currentIdx + direction + open.length) % open.length;
    this.focusCard(open[nextIdx].card.opts.title);
    this.viewport.panToCard(open[nextIdx]);
  }

  panToCardByUuid(uuid: string): void {
    const cs = this.cards.find(c => c.card.uuid === uuid && c.isOpen);
    if (cs) { this.focusCard(cs.card.opts.title); this.viewport.panToCard(cs); }
  }

  panToActiveExplorer(): void {
    const cs = this.cards.find(c => c.explorerPlugin && c.isOpen);
    if (cs) { this.focusCard(cs.card.opts.title); this.viewport.panToCard(cs); }
  }

  reopenCardByTitle(title: string): boolean {
    const cs = this.cards.find(c => c.savedTitle === title && !c.isOpen);
    if (!cs) return false;
    this.reopenCard(cs);
    return true;
  }

  mountTerminal(cs: CardState, wsPath: string): void {
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const term = new TerminalPlugin(body, cs.card.uuid, wsPath);
        term.onExit = () => this.host.terminateCard(cs);
        cs.card.onDestroy = () => term.destroy();
        cs.terminalPlugin = term;
        cs.onCardResize = () => { term.setScale(this.viewport.scale); term.fit(); };
        term.setScale(this.viewport.scale);
      }
      this.notifier.notifyTerminalsChanged();
    });
  }

  mountExplorer(cs: CardState, wsPath: string): ExplorerPlugin | null {
    const body = cs.card.el.querySelector('.card-body') as HTMLElement;
    if (!body) return null;
    body.style.padding = '0';
    body.style.alignItems = 'stretch';
    body.style.justifyContent = 'stretch';
    const dev = new ExplorerPlugin(body, wsPath);
    dev.onStateChange = () => this.host.getOnStateChange()?.();
    cs.explorerPlugin = dev;
    return dev;
  }

  mountGit(cs: CardState, wsPath: string): GitPlugin | null {
    const body = cs.card.el.querySelector('.card-body') as HTMLElement;
    if (!body) return null;
    body.style.padding = '0';
    body.style.alignItems = 'stretch';
    body.style.justifyContent = 'stretch';
    const git = new GitPlugin(body, wsPath);
    git.onStateChange = () => this.host.getOnStateChange()?.();
    git.onFileOpen = (filePath) => this.getActiveExplorerPlugin()?.openFile(filePath);
    cs.gitPlugin = git;
    cs.card.onDestroy = () => git.destroy();
    return git;
  }

  mountSpecsmap(cs: CardState, wsPath: string): void {
    const body = cs.card.el.querySelector('.card-body') as HTMLElement;
    if (!body) return;
    body.style.padding = '0';
    body.style.alignItems = 'stretch';
    body.style.justifyContent = 'stretch';
    const sm = new SpecsMapPlugin(body, wsPath);
    sm.onFileOpen = (filePath) => this.getActiveExplorerPlugin()?.openFile(filePath);
    cs.specsmapPlugin = sm;
    cs.card.onDestroy = () => sm.destroy();
  }

  mountAgents(cs: CardState, wsPath: string): void {
    const body = cs.card.el.querySelector('.card-body') as HTMLElement;
    if (!body) return;
    body.style.padding = '0';
    body.style.alignItems = 'stretch';
    body.style.justifyContent = 'stretch';
    const ag = new AgentsPlugin(body, wsPath);
    cs.agentsPlugin = ag;
    cs.card.onDestroy = () => ag.destroy();
  }

  reopenCard(cs: CardState): void {
    if (cs.isOpen) return;
    if (cs.savedTitle.startsWith('Terminal')) {
      cs.isOpen = true;
      cs.card.el.style.display = '';
      cs.worldX = cs.savedWX;
      cs.worldY = cs.savedWY;
      this.positionCard(cs);
      this.notifier.notifyTerminalsChanged();
    } else if (cs.savedTitle === 'Explorer') {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body && !body.hasChildNodes()) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const dev = new ExplorerPlugin(body, this.host.getWsPath());
        dev.onStateChange = () => this.host.getOnStateChange()?.();
        cs.explorerPlugin = dev;
      }
      cs.isOpen = true;
      cs.card.el.style.display = '';
      cs.worldX = cs.savedWX;
      cs.worldY = cs.savedWY;
      this.positionCard(cs);
      this.notifier.notifyExplorersChanged();
      this.host.getOnStateChange()?.();
    } else if (cs.savedTitle === 'Git') {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body && !body.hasChildNodes()) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const git = new GitPlugin(body, this.host.getWsPath());
        git.onStateChange = () => this.host.getOnStateChange()?.();
        git.onFileOpen = (filePath) => this.getActiveExplorerPlugin()?.openFile(filePath);
        cs.gitPlugin = git;
        cs.card.onDestroy = () => git.destroy();
      }
      cs.isOpen = true;
      cs.card.el.style.display = '';
      cs.worldX = cs.savedWX;
      cs.worldY = cs.savedWY;
      this.positionCard(cs);
      this.notifier.notifyGitChanged();
      this.host.getOnStateChange()?.();
    } else if (cs.savedTitle === 'SpecsMap') {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body && !body.hasChildNodes()) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const sm = new SpecsMapPlugin(body, this.host.getWsPath());
        sm.onFileOpen = (filePath) => this.getActiveExplorerPlugin()?.openFile(filePath);
        cs.specsmapPlugin = sm;
        cs.card.onDestroy = () => sm.destroy();
      }
      cs.isOpen = true;
      cs.card.el.style.display = '';
      cs.worldX = cs.savedWX;
      cs.worldY = cs.savedWY;
      this.positionCard(cs);
      this.notifier.notifySpecsmapChanged();
      this.host.getOnStateChange()?.();
    } else if (cs.savedTitle === 'Agents') {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body && !body.hasChildNodes()) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const ag = new AgentsPlugin(body, this.host.getWsPath());
        cs.agentsPlugin = ag;
        cs.card.onDestroy = () => ag.destroy();
      }
      cs.isOpen = true;
      cs.card.el.style.display = '';
      cs.worldX = cs.savedWX;
      cs.worldY = cs.savedWY;
      this.positionCard(cs);
      this.notifier.notifyAgentsChanged();
      this.host.getOnStateChange()?.();
    } else if (cs.savedTitle === 'DevConsole') {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body && !body.hasChildNodes()) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const dc = new DevConsolePlugin(body, this.host.getWsPath());
        cs.devConsolePlugin = dc;
        cs.card.onDestroy = () => dc.destroy();
      }
      cs.isOpen = true;
      cs.card.el.style.display = '';
      cs.worldX = cs.savedWX;
      cs.worldY = cs.savedWY;
      this.positionCard(cs);
      this.host.getOnStateChange()?.();
    }
    this.viewport.panToCard(cs);
  }

  closeCard(title: string): boolean {
    const cs = this.cards.find(c => c.savedTitle === title);
    if (!cs) return false;
    this.terminateCard(cs);
    return true;
  }

  minimizeCard(title: string): boolean {
    const cs = this.cards.find(c => c.savedTitle === title && c.isOpen);
    if (!cs) return false;
    cs.isOpen = false;
    cs.card.el.style.display = 'none';
    this.notifier.notifyCardChanged(title);
    this.host.getOnStateChange()?.();
    return true;
  }

  resizeCard(title: string, width: number, height: number): boolean {
    const cs = this.cards.find(c => c.savedTitle === title);
    if (!cs) return false;
    const w = this.viewport.snapSize(Math.max(280, width));
    const h = this.viewport.snapSize(Math.max(280, height));
    cs.savedWidth = w;
    cs.savedHeight = h;
    cs.card.opts.width = w;
    cs.card.opts.height = h;
    cs.card.el.style.width = `${w}px`;
    cs.card.el.style.height = `${h}px`;
    cs.onCardResize?.();
    this.host.getOnStateChange()?.();
    return true;
  }

  terminateCard(cs: CardState): void {
    const idx = this.cards.indexOf(cs);
    if (idx === -1) return;
    // If terminal, kill its PTY
    if (cs.savedTitle.startsWith('Terminal')) {
      window.electronAPI?.terminal.kill(cs.card.uuid);
    }
    cs.card.remove();
    this.cards.splice(idx, 1);
    this.notifier.notifyCardChanged(cs.savedTitle);
    this.host.getOnStateChange()?.();
  }

  killAllTerminals(): void {
    for (const cs of this.cards) {
      if (cs.savedTitle.startsWith('Terminal')) cs.terminalPlugin?.destroy();
    }
  }

  offsetCard(title: string, worldX: number, worldY: number): void {
    const cs = this.cards.find(c => c.savedTitle === title);
    if (!cs) return;
    cs.worldX = this.viewport.clampWorld(worldX, 'x');
    cs.worldY = this.viewport.clampWorld(worldY, 'y');
    cs.savedWX = cs.worldX;
    cs.savedWY = cs.worldY;
    this.positionCard(cs);
    this.host.getOnStateChange()?.();
  }

  ensureExplorer(opts?: { pan?: boolean }): Promise<ExplorerPlugin> {
    const pan = opts?.pan !== false;
    const existing = this.cards.find(c => c.savedTitle === 'Explorer');
    if (existing) {
      existing.isOpen = true;
      existing.card.el.style.display = '';
      existing.worldX = existing.savedWX;
      existing.worldY = existing.savedWY;
      this.positionCard(existing);
      const body = existing.card.el.querySelector('.card-body') as HTMLElement;
      if (body && !body.hasChildNodes()) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const dev = new ExplorerPlugin(body, this.host.getWsPath());
        dev.onStateChange = () => this.host.getOnStateChange()?.();
        existing.explorerPlugin = dev;
      }
      this.bringToFront(existing.card);
      if (pan) this.viewport.panToCard(existing);
      this.notifier.notifyExplorersChanged();
      return Promise.resolve(existing.explorerPlugin!);
    }
    return new Promise<ExplorerPlugin>(resolve => {
      const cs = this.addCard('Explorer', '', -400, -250, 800, 500);
      requestAnimationFrame(() => {
        const body = cs.card.el.querySelector('.card-body') as HTMLElement;
        if (body && !cs.explorerPlugin && !body.hasChildNodes()) {
          body.style.padding = '0';
          body.style.alignItems = 'stretch';
          body.style.justifyContent = 'stretch';
          const dev = new ExplorerPlugin(body, this.host.getWsPath());
          dev.onStateChange = () => this.host.getOnStateChange()?.();
          cs.explorerPlugin = dev;
          this.notifier.notifyExplorersChanged();
          this.bringToFront(cs.card);
          if (pan) this.viewport.panToCard(cs);
          resolve(dev);
        } else if (cs.explorerPlugin) {
          resolve(cs.explorerPlugin);
        }
      });
    });
  }

  ensureSpecsmap(opts?: { pan?: boolean }): Promise<SpecsMapPlugin | null> {
    const pan = opts?.pan !== false;
    const existing = this.cards.find(c => c.savedTitle === 'SpecsMap');
    if (existing && existing.specsmapPlugin) {
      existing.isOpen = true;
      existing.card.el.style.display = '';
      existing.worldX = existing.savedWX;
      existing.worldY = existing.savedWY;
      this.positionCard(existing);
      this.bringToFront(existing.card);
      if (pan) this.viewport.panToCard(existing);
      this.notifier.notifySpecsmapChanged();
      return Promise.resolve(existing.specsmapPlugin);
    }
    return new Promise<SpecsMapPlugin | null>(resolve => {
      const cs = this.addCard('SpecsMap', '', -400, -250, 800, 500);
      requestAnimationFrame(() => {
        const body = cs.card.el.querySelector('.card-body') as HTMLElement;
        if (!body) {
          resolve(null);
          return;
        }
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const sm = new SpecsMapPlugin(body, this.host.getWsPath());
        sm.onFileOpen = (filePath) => this.getActiveExplorerPlugin()?.openFile(filePath);
        cs.specsmapPlugin = sm;
        cs.card.onDestroy = () => sm.destroy();
        this.notifier.notifySpecsmapChanged();
        this.bringToFront(cs.card);
        if (pan) this.viewport.panToCard(cs);
        resolve(sm);
      });
    });
  }
}
