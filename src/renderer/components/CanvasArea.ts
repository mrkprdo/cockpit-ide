export type GridStyle = 'none' | 'dots' | 'grid';
export type EditorState = { openFiles: string[]; activeFile: string; explorerWidth: number; cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }> };
export type PluginEntry = { uuid: string; title: string; x: number; y: number; width: number; height: number; isOpen: boolean; editorState?: EditorState };
export type SaveState = { plugins: PluginEntry[]; zOrder: string[]; zoom: number; panX: number; panY: number; isDark: boolean };

import { PluginCard } from './PluginCard';
import { TextRenderer } from './TextRenderer';
import { TerminalPlugin } from './TerminalPlugin';
import { FileExplorerPlugin } from './FileExplorerPlugin';
import { MonacoEditorPlugin } from './MonacoEditorPlugin';
import { DevPlugin } from './DevPlugin';
import { ContextMenu } from './ContextMenu';

interface CardState {
  card: PluginCard;
  worldX: number;
  worldY: number;
  isOpen: boolean;
  savedTitle: string;
  savedWidth: number;
  savedHeight: number;
  savedWX: number;
  savedWY: number;
}

export class CanvasArea {
  onStateChange: (() => void) | null = null;
  onTerminalsChanged: ((items: { uuid: string; title: string; isOpen: boolean }[]) => void) | null = null;
  onDevsChanged: ((items: { uuid: string; title: string; isOpen: boolean }[]) => void) | null = null;
  private patternSize = 28;
  private patternDataURL = '';
  private cards: CardState[] = [];

  private scale = 1;
  private panX = 0;
  private panY = 0;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartPanX = 0;
  private panStartPanY = 0;
  private rafId = 0;
  private gridStyle: GridStyle = 'dots';
  private originDot: HTMLElement;
  private terminalCounter = 0;
  workspaceName = 'no workspace';

  private pluginListPanel: HTMLDivElement;

  private contextMenuOpen = false;

  constructor(private el: HTMLElement) {
    this.originDot = document.createElement('div');
    this.originDot.style.cssText = 'position:absolute;width:6px;height:6px;border-radius:50%;border:1px solid #FF1744;background:transparent;z-index:5;pointer-events:none;transform:translate(-50%,-50%)';
    this.el.appendChild(this.originDot);

    // Plugin list panel (lower-left hover zone)
    const zone = document.createElement('div');
    zone.className = 'pli-zone';
    const icon = document.createElement('span');
    icon.className = 'pli-icon';
    icon.textContent = '◣';
    zone.appendChild(icon);

    this.pluginListPanel = document.createElement('div');
    this.pluginListPanel.className = 'plugin-list-panel';

    zone.appendChild(this.pluginListPanel);
    this.el.appendChild(zone);

    zone.addEventListener('mouseenter', () => this.showPluginList());
    zone.addEventListener('mouseleave', (e) => {
      setTimeout(() => {
        if (!zone.matches(':hover') && !this.pluginListPanel.matches(':hover')) {
          this.pluginListPanel.style.display = 'none';
        }
      }, 200);
    });
    this.pluginListPanel.addEventListener('mouseenter', () => { this.pluginListPanel.style.display = 'block'; });
    this.pluginListPanel.addEventListener('mouseleave', () => {
      if (!this.contextMenuOpen) this.pluginListPanel.style.display = 'none';
    });

    this.generatePattern();
    this.applyGrid();
    this.initZoomPan();
    this.updateStatusBar();
  }

  private showPluginList(): void {
    const panel = this.pluginListPanel;
    panel.innerHTML = '';
    if (this.cards.length === 0) {
      panel.innerHTML = '<div class="pli-empty">No plugins</div>';
    } else {
      for (const cs of this.cards) {
        const item = document.createElement('div');
        item.className = 'pli-item';
        item.textContent = cs.savedTitle + (cs.isOpen ? '' : ' (hidden)');
        item.addEventListener('click', () => {
          if (cs.isOpen) {
            this.focusCard(cs.card.opts.title);
            this.panToCard(cs);
          } else {
            this.reopenCard(cs);
          }
        });
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.contextMenuOpen = true;
          const menu = new ContextMenu([
            { label: 'Show', action: () => {
              if (cs.isOpen) { this.focusCard(cs.card.opts.title); this.panToCard(cs); }
              else this.reopenCard(cs);
            }},
            { separator: true },
            { label: 'Terminate', action: () => this.terminateCard(cs) },
          ], e.clientX, e.clientY);
          menu.onClose = () => { this.contextMenuOpen = false; };
        });
        panel.appendChild(item);
      }
    }
    panel.style.display = 'block';
  }

  private centerView(): void {
    this.panX = this.el.clientWidth / 2;
    this.panY = this.el.clientHeight / 2;
    this.scheduleTransform();
  }

  setGridStyle(style: GridStyle): void {
    this.gridStyle = style;
    this.generatePattern();
    this.applyGrid();
  }

  private snap(v: number): number {
    const half = this.patternSize / 2;
    return Math.round((v - half) / this.patternSize) * this.patternSize + half;
  }

  private snapSize(v: number): number {
    return Math.max(this.patternSize, Math.round(v / this.patternSize) * this.patternSize);
  }

  private addCard(title: string, subtitle: string, x: number, y: number, w: number, h: number): CardState {
    const sx = this.snap(x);
    const sy = this.snap(y);
    const sw = this.snapSize(w);
    const sh = this.snapSize(h);
    const card = new PluginCard(this.el, {
      title, subtitle, x: 0, y: 0, width: sw, height: sh,
      onClose: () => {
        const cs = this.cards.find(c => c.card === card);
        if (cs) {
          cs.isOpen = false;
          cs.card.el.style.display = 'none';
          this.notifyTerminalsChanged();
          this.notifyDevsChanged();
        }
      },
      onDragEnd: (worldX: number, worldY: number) => {
        const cs = this.cards.find(c => c.card === card);
        if (cs) { cs.worldX = worldX; cs.worldY = worldY; }
        this.onStateChange?.();
      },
      onResizeEnd: (w: number, h: number) => {
        const cs = this.cards.find(c => c.card === card);
        if (cs) { cs.savedWidth = w; cs.savedHeight = h; }
        this.onStateChange?.();
      },
      onFocus: () => this.bringToFront(card),
    }, () => ({ scale: this.scale, panX: this.panX, panY: this.panY }));
    const cs: CardState = { card, worldX: sx, worldY: sy, isOpen: true, savedTitle: title, savedWidth: sw, savedHeight: sh, savedWX: sx, savedWY: sy };
    this.cards.push(cs);
    this.positionCard(cs);
    return cs;
  }

  private positionCard(cs: CardState): void {
    const left = cs.worldX * this.scale + this.panX;
    const top = cs.worldY * this.scale + this.panY;
    cs.card.el.style.left = `${left}px`;
    cs.card.el.style.top = `${top}px`;
    cs.card.el.style.transform = `scale(${this.scale})`;
    cs.card.el.style.transformOrigin = '0 0';
  }

  private repositionAllCards(): void {
    for (const cs of this.cards) this.positionCard(cs);
  }

  private resolveCSSVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  private generatePattern(): void {
    if (this.gridStyle === 'none') { this.patternDataURL = ''; return; }
    const s = this.patternSize;
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const ctx = c.getContext('2d')!;
    const color = this.resolveCSSVar('--tertiary');

    if (this.gridStyle === 'dots') {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, 1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.15;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(s, 0); ctx.lineTo(s, s);
      ctx.moveTo(0, s); ctx.lineTo(s, s);
      ctx.stroke();
    }
    this.patternDataURL = c.toDataURL();
  }

  private applyGrid(): void {
    if (this.gridStyle === 'none' || !this.patternDataURL) {
      this.el.style.backgroundImage = 'none';
      return;
    }
    this.el.style.backgroundImage = `url(${this.patternDataURL})`;
    this.el.style.backgroundRepeat = 'repeat';
    this.el.style.backgroundSize = `${this.patternSize * this.scale}px ${this.patternSize * this.scale}px`;
    this.el.style.backgroundPosition = `${this.panX}px ${this.panY}px`;
  }

  getSaveState(): SaveState {
    // Sort by current z-index to get bottom-to-top order
    const byZ = [...this.cards].sort((a, b) => parseInt(a.card.el.style.zIndex || '1') - parseInt(b.card.el.style.zIndex || '1'));
    const editorState = this.devPlugin ? this.devPlugin.getEditorState() : null;
    return {
      plugins: this.cards.map(c => {
        const base: PluginEntry = { uuid: c.card.uuid, title: c.savedTitle, x: c.worldX, y: c.worldY, width: c.savedWidth, height: c.savedHeight, isOpen: c.isOpen };
        if (c.savedTitle === 'Dev' && editorState) base.editorState = editorState;
        return base;
      }),
      zOrder: byZ.map(c => c.card.uuid),
      zoom: this.scale, panX: this.panX, panY: this.panY,
      isDark: this.resolveCSSVar('--bg').trim() === '#0A0E14',
    };
  }

  private nextZ = 10;

  private bringToFront(card: PluginCard): void {
    this.nextZ++;
    card.el.style.zIndex = String(this.nextZ);
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

  private activeEditor: MonacoEditorPlugin | null = null;
  devPlugin: DevPlugin | null = null;
  private wsPath = '';

  private createCardFromDef(p: { uuid?: string; title: string; x: number; y: number; width: number; height: number; isOpen: boolean }, callbacks: { onClose?: () => void }): CardState {
    const card = new PluginCard(this.el, {
      title: p.title, subtitle: '', x: 0, y: 0, width: p.width, height: p.height,
      onClose: callbacks.onClose,
      onDragEnd: (worldX, worldY) => {
        const cs = this.cards.find(c => c.card === card);
        if (cs) { cs.worldX = worldX; cs.worldY = worldY; }
      },
      onFocus: () => this.bringToFront(card),
    }, () => ({ scale: this.scale, panX: this.panX, panY: this.panY }));

    const cs: CardState = { card, worldX: p.x, worldY: p.y, isOpen: p.isOpen, savedTitle: p.title, savedWidth: p.width, savedHeight: p.height, savedWX: p.x, savedWY: p.y };
    this.cards.push(cs);

    if (!p.isOpen) card.el.style.display = 'none';
    return cs;
  }

  restorePlugins(state: SaveState, wsPath: string): void {
    this.wsPath = wsPath;
    for (const cs of [...this.cards]) cs.card.el.remove();
    this.cards = [];
    this.terminalCounter = 0;

    // Find highest terminal number for counter
    let highestTerm = 0;
    for (const p of state.plugins) {
      const m = p.title.match(/^Terminal (\d+)$/);
      if (m) highestTerm = Math.max(highestTerm, parseInt(m[1]));
    }
    this.terminalCounter = highestTerm;

    for (const p of state.plugins) {
      if (p.title.startsWith('Terminal')) {
        const cs = this.createCardFromDef(p, {
          onClose: () => {
            cs.isOpen = false;
            cs.card.el.style.display = 'none';
            this.notifyTerminalsChanged();
          },
        });

        if (p.isOpen) {
          requestAnimationFrame(() => {
            const body = cs.card.el.querySelector('.card-body') as HTMLElement;
            if (body) {
              body.style.padding = '0';
              const term = new TerminalPlugin(body, cs.card.uuid, wsPath);
              cs.card.onDestroy = () => term.destroy();
              cs.card.opts.onResizeEnd = () => term.fit();
            }
            this.notifyTerminalsChanged();
          });
        }
      } else if (p.title === 'Dev') {
        const cs = this.createCardFromDef(p, {
          onClose: () => { cs.isOpen = false; cs.card.el.style.display = 'none'; },
        });

        if (p.isOpen) {
          const body = cs.card.el.querySelector('.card-body') as HTMLElement;
          if (body) {
            body.style.padding = '0';
            body.style.alignItems = 'stretch';
            body.style.justifyContent = 'stretch';
            const dev = new DevPlugin(body, wsPath);
            dev.onStateChange = () => this.onStateChange?.();
            this.devPlugin = dev;
            // Restore editor state from plugin entry
            if (p.editorState) {
              const es = p.editorState;
              setTimeout(() => this.devPlugin?.restoreEditorState(es), 500);
            }
          }
        }
      }
    }

    this.restoreZOrder(state.zOrder);
    this.terminalCounter = highestTerm;
    this.repositionAllCards();
  }

  addExplorer(wsPath: string): void {
    const cs = this.addCard('EXPLORER', '', 0, 0, 300, 420);
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body');
      if (body) {
        (body as HTMLElement).style.padding = '0';
        new FileExplorerPlugin(body as HTMLElement, wsPath, (filePath) => {
          this.activeEditor?.openFile(filePath);
        });
      }
    });
  }

  addEditor(): void {
    const cs = this.addCard('EDITOR', '', 0, 0, 500, 420);
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body');
      if (body) {
        (body as HTMLElement).style.padding = '0';
        this.activeEditor = new MonacoEditorPlugin(body as HTMLElement);
      }
    });
  }

  addDev(wsPath: string): void {
    const cs = this.addCard('Dev', '', 0, 0, 800, 500);
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const dev = new DevPlugin(body, wsPath);
        dev.onStateChange = () => this.onStateChange?.();
        this.devPlugin = dev;
        this.notifyDevsChanged();
      }
    });
  }

  addTerminal(cwd?: string): void {
    this.terminalCounter++;
    const name = `Terminal ${this.terminalCounter}`;
    const cs = this.addCard(name, '', 0, 0, 560, 420);
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body');
      if (body) {
        (body as HTMLElement).style.padding = '0';
        const term = new TerminalPlugin(body as HTMLElement, cs.card.uuid, cwd);
        cs.card.onDestroy = () => term.destroy();
        cs.card.opts.onResizeEnd = () => term.fit();
      }
      this.notifyTerminalsChanged();
    });
  }

  focusTerminal(uuid: string): void {
    const cs = this.cards.find(c => c.card.uuid === uuid && c.isOpen);
    if (cs) this.focusCard(cs.card.opts.title);
  }

  focusDev(uuid: string): void {
    const cs = this.cards.find(c => c.card.uuid === uuid && c.isOpen);
    if (cs) { this.focusCard(cs.card.opts.title); this.panToCard(cs); }
  }

  focusCard(title: string): void {
    let base = 10;
    for (const cs of this.cards) {
      cs.card.el.style.zIndex = String(base++);
      if (cs.card.opts.title === title) cs.card.el.style.zIndex = String(base + 100);
    }
  }

  reopenTerminal(uuid: string): void {
    const cs = this.cards.find(c => c.card.uuid === uuid && !c.isOpen);
    if (!cs) return;
    cs.isOpen = true;
    cs.card.el.style.display = '';
    cs.worldX = cs.savedWX;
    cs.worldY = cs.savedWY;
    this.positionCard(cs);
    this.notifyTerminalsChanged();
  }

  reopenDev(uuid: string): void {
    const cs = this.cards.find(c => c.card.uuid === uuid && !c.isOpen);
    if (cs) this.reopenCard(cs);
  }

  reopenCard(cs: CardState): void {
    if (cs.isOpen) return;
    if (cs.savedTitle.startsWith('Terminal')) {
      this.reopenTerminal(cs.card.uuid);
    } else if (cs.savedTitle === 'Dev') {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const dev = new DevPlugin(body, this.wsPath);
        dev.onStateChange = () => this.onStateChange?.();
        this.devPlugin = dev;
      }
      cs.isOpen = true;
      cs.card.el.style.display = '';
      cs.worldX = cs.savedWX;
      cs.worldY = cs.savedWY;
      this.positionCard(cs);
      this.notifyDevsChanged();
      this.onStateChange?.();
    }
    this.panToCard(cs);
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
    this.notifyTerminalsChanged();
    this.notifyDevsChanged();
    this.onStateChange?.();
  }

  private notifyTerminalsChanged(): void {
    const list = this.cards.filter(c => c.savedTitle.startsWith('Terminal'))
      .map(c => ({ uuid: c.card.uuid, title: c.savedTitle, isOpen: c.isOpen }));
    this.onTerminalsChanged?.(list);
  }

  private notifyDevsChanged(): void {
    const list = this.cards.filter(c => c.savedTitle === 'Dev')
      .map(c => ({ uuid: c.card.uuid, title: c.savedTitle, isOpen: c.isOpen }));
    this.onDevsChanged?.(list);
  }

  zoomIn(): void {
    this.scale = Math.min(5, this.scale * 1.3);
    this.scheduleTransform();
  }

  zoomOut(): void {
    this.scale = Math.max(0.1, this.scale / 1.3);
    this.scheduleTransform();
  }

  resetView(): void {
    this.scale = 1;
    this.panX = this.el.clientWidth / 2;
    this.panY = this.el.clientHeight / 2;
    this.scheduleTransform();
  }

  setView(state: { zoom: number; panX: number; panY: number }): void {
    this.scale = state.zoom; this.panX = state.panX; this.panY = state.panY;
    this.scheduleTransform();
  }

  refresh(): void { this.scheduleTransform(); }
  private scheduleTransform(): void {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.repositionAllCards();
      this.applyGrid();
      for (const cs of this.cards) cs.card.renderTitle();
      const half = this.patternSize / 2;
      this.originDot.style.left = `${this.panX + half * this.scale}px`;
      this.originDot.style.top = `${this.panY + half * this.scale}px`;
      this.updateStatusBar();
      this.onStateChange?.();
    });
  }

  private initZoomPan(): void {
    this.el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const oldScale = this.scale;
      const delta = -e.deltaY * 0.001;
      this.scale = Math.max(0.1, Math.min(5, this.scale * (1 + delta)));
      const worldX = (mx - this.panX) / oldScale;
      const worldY = (my - this.panY) / oldScale;
      this.panX = mx - worldX * this.scale;
      this.panY = my - worldY * this.scale;
      this.scheduleTransform();
    }, { passive: false });

    this.el.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 1) {
        this.isPanning = true;
        this.panStartX = e.clientX;
        this.panStartY = e.clientY;
        this.panStartPanX = this.panX;
        this.panStartPanY = this.panY;
        this.el.style.cursor = 'grabbing';
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      this.panX = this.panStartPanX + (e.clientX - this.panStartX);
      this.panY = this.panStartPanY + (e.clientY - this.panStartY);
      this.scheduleTransform();
    });

    document.addEventListener('mouseup', () => {
      this.isPanning = false;
      this.el.style.cursor = '';
    });
  }

  private animatePan(targetX: number, targetY: number, duration = 300): void {
    const startX = this.panX;
    const startY = this.panY;
    const startTime = performance.now();
    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.panX = startX + (targetX - startX) * ease;
      this.panY = startY + (targetY - startY) * ease;
      this.scheduleTransform();
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  private goOrigin(): void {
    this.animatePan(this.el.clientWidth / 2, this.el.clientHeight / 2);
  }

  private panToCard(cs: CardState): void {
    const cw = this.el.clientWidth;
    const ch = this.el.clientHeight;

    // Zoom out if card is wider than viewport, but don't zoom in
    const cardScreenW = cs.savedWidth * this.scale;
    const cardScreenH = cs.savedHeight * this.scale;
    const margin = 40;
    if (cardScreenW > cw - margin || cardScreenH > ch - margin) {
      const fitX = (cw - margin) / cs.savedWidth;
      const fitY = (ch - margin) / cs.savedHeight;
      this.scale = Math.min(this.scale, Math.min(fitX, fitY));
    }

    // Center on card center (not top-left)
    const cx = cw / 2;
    const cy = ch / 2;
    const targetX = cx - (cs.worldX + cs.savedWidth / 2) * this.scale;
    const targetY = cy - (cs.worldY + cs.savedHeight / 2) * this.scale;
    this.animatePan(targetX, targetY);
  }

  private updateStatusBar(): void {
    const sb = document.getElementById('statusbar');
    if (!sb) return;

    const zoomText = `Zoom: ${Math.round(this.scale * 100)}%`;
    const panText = `${Math.round(this.panX)}, ${Math.round(this.panY)}`;

    sb.innerHTML = '';
    const add = (tag: string, text: string, cls = 'status-item'): HTMLElement => {
      const el = document.createElement(tag);
      el.className = cls;
      el.textContent = text;
      sb.appendChild(el);
      return el;
    };
    const sep = (): void => { const s = document.createElement('span'); s.className = 'status-sep'; sb.appendChild(s); };

    add('span', zoomText);
    sep();
    add('span', `Pan: ${panText}`);
    sep();
    add('span', this.workspaceName);

    const fill = document.createElement('span'); fill.style.cssText = 'flex:1'; sb.appendChild(fill);

    sep();
    const originBtn = add('button', 'origin', 'status-btn');
    originBtn.addEventListener('click', () => this.goOrigin());
  }
}
