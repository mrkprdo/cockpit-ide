export type GridStyle = 'none' | 'dots' | 'grid';
export type EditorState = { openFiles: string[]; activeFile: string; explorerWidth: number; cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }> };
export type PluginEntry = { uuid: string; title: string; x: number; y: number; width: number; height: number; isOpen: boolean; editorState?: EditorState; contextState?: ContextState };
export type SaveState = { plugins: PluginEntry[]; zOrder: string[]; zoom: number; panX: number; panY: number };

import { PluginCard } from './PluginCard';
import { TerminalPlugin } from './TerminalPlugin';
import { FileExplorerPlugin } from './FileExplorerPlugin';
import { MonacoEditorPlugin } from './MonacoEditorPlugin';
import { DevPlugin } from './DevPlugin';
import { ContextMenu } from './ContextMenu';
import { ContextPlugin, ContextState } from './ContextPlugin';

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
  terminalPlugin: TerminalPlugin | null;
  onCardResize?: () => void;
}

export class CanvasArea {
  onStateChange: (() => void) | null = null;
  onTerminalsChanged: ((items: { uuid: string; title: string; isOpen: boolean }[]) => void) | null = null;
  onDevsChanged: ((items: { uuid: string; title: string; isOpen: boolean }[]) => void) | null = null;
  onContextsChanged: ((items: { uuid: string; title: string; isOpen: boolean }[]) => void) | null = null;
  locked = false;
  private patternSize = 28;
  private patternDataURL = '';
  private cards: CardState[] = [];

  private contextPlugins: ContextPlugin[] = [];
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
  private terminalCounter = 0;
  private devCounter = 0;
  private contextCounter = 0;
  workspaceName = 'no workspace';

  private pluginListPanel: HTMLDivElement;
  private arrPanel: HTMLDivElement;
  private tileW = '23';
  private tileH = '17';

  private contextMenuOpen = false;

  private static readonly WORLD_BOUNDS = 50000;

  private clampWorld(v: number): number {
    return Math.max(-CanvasArea.WORLD_BOUNDS, Math.min(CanvasArea.WORLD_BOUNDS, Math.round(v)));
  }

  private clampView(): void {
    const cw = this.el.clientWidth;
    const ch = this.el.clientHeight;
    const bound = CanvasArea.WORLD_BOUNDS * this.scale;
    this.panX = Math.max(cw - bound, Math.min(bound, this.panX));
    this.panY = Math.max(ch - bound, Math.min(bound, this.panY));
  }

  constructor(private el: HTMLElement) {
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
    zone.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (!this.contextMenuOpen && !zone.matches(':hover') && !this.pluginListPanel.matches(':hover')) {
          this.pluginListPanel.style.display = 'none';
        }
      }, 200);
    });
    this.pluginListPanel.addEventListener('mouseenter', () => { this.pluginListPanel.style.display = 'block'; });
    this.pluginListPanel.addEventListener('mouseleave', () => {
      if (!this.contextMenuOpen && !zone.matches(':hover')) this.pluginListPanel.style.display = 'none';
    });

    // Arrange panel (lower-right hover zone)
    const arrZone = document.createElement('div');
    arrZone.className = 'prr-zone';
    const arrIcon = document.createElement('span');
    arrIcon.className = 'prr-icon';
    arrIcon.textContent = '◢';
    arrZone.appendChild(arrIcon);

    this.arrPanel = document.createElement('div');
    this.arrPanel.className = 'arr-panel';
    this.arrPanel.style.display = 'none';

    arrZone.appendChild(this.arrPanel);
    this.el.appendChild(arrZone);

    arrZone.addEventListener('mouseenter', () => this.showArrPanel());
    arrZone.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (!this.arrPanel.matches(':hover')) {
          this.arrPanel.style.display = 'none';
        }
      }, 200);
    });
    this.arrPanel.addEventListener('mouseenter', () => { this.arrPanel.style.display = 'block'; });
    this.arrPanel.addEventListener('mouseleave', () => {
      if (!arrZone.matches(':hover')) this.arrPanel.style.display = 'none';
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
      const sorted = [...this.cards].sort((a, b) => a.savedTitle.localeCompare(b.savedTitle));
      for (const cs of sorted) {
        const item = document.createElement('div');
        item.className = 'pli-item';
        item.textContent = cs.savedTitle + (cs.isOpen ? '' : ' (minimized)');
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

  private showArrPanel(): void {
    const panel = this.arrPanel;
    panel.innerHTML = '';

    const items: { label: string; action: () => void }[] = [
      { label: 'Auto Arrange', action: () => this.autoArrange() },
      { label: 'Tile Plugins', action: () => this.tilePlugins() },
    ];

    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'arr-item';
      el.textContent = item.label;
      el.addEventListener('click', () => {
        item.action();
        panel.style.display = 'none';
      });
      panel.appendChild(el);
    }

    const row = document.createElement('div');
    row.className = 'arr-input-row';
    const validate = (v: string): string => {
      const n = parseInt(v);
      if (isNaN(n) || n < 10) return '10';
      if (n > 2000) return '2000';
      return String(n);
    };
    const inpW = document.createElement('input');
    inpW.className = 'arr-input';
    inpW.type = 'text';
    inpW.placeholder = 'W';
    inpW.value = this.tileW;
    inpW.addEventListener('input', () => { this.tileW = inpW.value; });
    inpW.addEventListener('change', () => { this.tileW = validate(inpW.value); inpW.value = this.tileW; });
    row.appendChild(inpW);
    const sep = document.createElement('span');
    sep.className = 'arr-input-sep';
    sep.textContent = '×';
    row.appendChild(sep);
    const inpH = document.createElement('input');
    inpH.className = 'arr-input';
    inpH.type = 'text';
    inpH.placeholder = 'H';
    inpH.value = this.tileH;
    inpH.addEventListener('input', () => { this.tileH = inpH.value; });
    inpH.addEventListener('change', () => { this.tileH = validate(inpH.value); inpH.value = this.tileH; });
    row.appendChild(inpH);
    panel.appendChild(row);

    panel.style.display = 'block';
  }

  private animateArrange(cards: CardState[], fn: () => void): void {
    for (const cs of cards) cs.card.el.classList.add('card-arranging');
    fn();
    requestAnimationFrame(() => {
      for (const cs of cards) cs.card.el.classList.remove('card-arranging');
    });
  }

  autoArrange(): void {
    const open = this.cards.filter(c => c.isOpen);
    this.animateArrange(open, () => {
      const gap = 28;
      let x = 0;
      let y = 0;
      let rowH = 0;
      for (const cs of open) {
        cs.worldX = x;
        cs.worldY = y;
        cs.savedWX = x;
        cs.savedWY = y;
        this.positionCard(cs);
        x += cs.savedWidth + gap;
        rowH = Math.max(rowH, cs.savedHeight);
        if (x > 1400) {
          x = 0;
          y += rowH + gap;
          rowH = 0;
        }
      }
      this.onStateChange?.();
    });
    this.fitAll();
  }

  private tilePlugins(): void {
    const open = this.cards.filter(c => c.isOpen);
    if (open.length === 0) return;

    this.animateArrange(open, () => {
      const gap = 28;

      let cellW: number, cellH: number;
      let cols: number, rows: number;
    const pw = Math.min(2000, parseInt(this.tileW) * this.patternSize);
    const ph = Math.min(2000, parseInt(this.tileH) * this.patternSize);
    if (pw > 0 && ph > 0) {
      cellW = Math.max(gap, pw);
      cellH = Math.max(gap, ph);
        cols = Math.ceil(Math.sqrt(open.length));
        rows = Math.ceil(open.length / cols);
      } else {
        cols = Math.ceil(Math.sqrt(open.length));
        rows = Math.ceil(open.length / cols);
        const availW = 1400;
        const availH = 900;
        cellW = (availW - (cols - 1) * gap) / cols;
        cellH = (availH - (rows - 1) * gap) / rows;
      }

      let idx = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols && idx < open.length; c++) {
          const cs = open[idx];
          cs.worldX = Math.round(c * (cellW + gap));
          cs.worldY = Math.round(r * (cellH + gap));
          cs.savedWX = cs.worldX;
          cs.savedWY = cs.worldY;
          const sw = Math.max(28 * 10, Math.round(cellW));
          const sh = Math.max(28 * 10, Math.round(cellH));
          cs.savedWidth = sw;
          cs.savedHeight = sh;
          cs.card.el.style.width = `${sw}px`;
          cs.card.el.style.height = `${sh}px`;
          cs.card.opts.width = sw;
          cs.card.opts.height = sh;
          this.positionCard(cs);
          cs.terminalPlugin?.fit();
          idx++;
        }
      }
      this.onStateChange?.();
    });
    this.fitAll();
  }

  centerView(): void {
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
    return Math.round(v / this.patternSize) * this.patternSize;
  }

  private snapSize(v: number): number {
    return Math.max(this.patternSize, Math.round(v / this.patternSize) * this.patternSize);
  }

  private addCard(title: string, subtitle: string, x: number, y: number, w: number, h: number): CardState {
    const sx = this.clampWorld(this.snap(x));
    const sy = this.clampWorld(this.snap(y));
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
          this.notifyContextsChanged();
        }
      },
      onDragEnd: (worldX: number, worldY: number) => {
        const cs = this.cards.find(c => c.card === card);
        if (cs) { cs.worldX = this.clampWorld(worldX); cs.worldY = this.clampWorld(worldY); }
        this.onStateChange?.();
      },
      onResizeEnd: (w: number, h: number) => {
        const cs = this.cards.find(c => c.card === card);
        if (cs) { cs.savedWidth = w; cs.savedHeight = h; }
        cs?.onCardResize?.();
        this.onStateChange?.();
      },
      onFocus: () => this.bringToFront(card),
      onHeaderContextMenu: (e: MouseEvent) => {
        const cs = this.cards.find(c => c.card === card);
        if (!cs) return;
        this.contextMenuOpen = true;
        const menu = new ContextMenu([
          ...(cs.isOpen ? [{ label: 'Minimize', action: () => {
            cs.isOpen = false;
            cs.card.el.style.display = 'none';
            this.notifyTerminalsChanged();
            this.notifyDevsChanged();
            this.notifyContextsChanged();
            this.onStateChange?.();
          }}] : []),
          { label: 'Terminate', action: () => this.terminateCard(cs) },
        ], e.clientX, e.clientY);
        menu.onClose = () => { this.contextMenuOpen = false; };
      },
    }, () => ({ scale: this.scale, panX: this.panX, panY: this.panY }));
    const cs: CardState = { card, worldX: sx, worldY: sy, isOpen: true, savedTitle: title, savedWidth: sw, savedHeight: sh, savedWX: sx, savedWY: sy, terminalPlugin: null };
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
    cs.terminalPlugin?.setScale(this.scale);
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
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1;
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
        // Always read actual DOM dimensions as authoritative source
        const w = parseFloat(c.card.el.style.width) || c.savedWidth;
        const h = parseFloat(c.card.el.style.height) || c.savedHeight;
        c.savedWidth = w;
        c.savedHeight = h;
        const base: PluginEntry = { uuid: c.card.uuid, title: c.savedTitle, x: c.worldX, y: c.worldY, width: w, height: h, isOpen: c.isOpen };
        if (c.savedTitle.startsWith('Dev') && editorState) base.editorState = editorState;
        if (c.savedTitle.startsWith('Context')) {
          const ctx = this.contextPlugins.find(p => p.title === c.savedTitle);
          if (ctx) base.contextState = ctx.getState();
        }
        return base;
      }),
      zOrder: byZ.map(c => c.card.uuid),
      zoom: this.scale, panX: this.panX, panY: this.panY,
    };
  }

  private nextZ = 10;

  private bringToFront(card: PluginCard): void {
    if (this.nextZ >= 9998) this.rebalanceZ();
    this.nextZ++;
    card.el.style.zIndex = String(this.nextZ);
  }

  private rebalanceZ(): void {
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

  private activeEditor: MonacoEditorPlugin | null = null;
  devPlugin: DevPlugin | null = null;
  private wsPath = '';

  private createCardFromDef(p: { uuid?: string; title: string; x: number; y: number; width: number; height: number; isOpen: boolean }, callbacks: { onClose?: () => void }): CardState {
    const card = new PluginCard(this.el, {
      title: p.title, subtitle: '', x: 0, y: 0, width: p.width, height: p.height,
      onClose: callbacks.onClose,
      onDragEnd: (worldX, worldY) => {
        const cs = this.cards.find(c => c.card === card);
        if (cs) { cs.worldX = this.clampWorld(worldX); cs.worldY = this.clampWorld(worldY); }
        this.onStateChange?.();
      },
      onResizeEnd: (w: number, h: number) => {
        const cs = this.cards.find(c => c.card === card);
        if (cs) { cs.savedWidth = w; cs.savedHeight = h; }
        cs?.onCardResize?.();
        this.onStateChange?.();
      },
      onFocus: () => this.bringToFront(card),
      onHeaderContextMenu: (e: MouseEvent) => {
        const cs = this.cards.find(c => c.card === card);
        if (!cs) return;
        this.contextMenuOpen = true;
        const menu = new ContextMenu([
          ...(cs.isOpen ? [{ label: 'Minimize', action: () => {
            cs.isOpen = false;
            cs.card.el.style.display = 'none';
            this.notifyTerminalsChanged();
            this.notifyDevsChanged();
            this.notifyContextsChanged();
            this.onStateChange?.();
          }}] : []),
          { label: 'Terminate', action: () => this.terminateCard(cs) },
        ], e.clientX, e.clientY);
        menu.onClose = () => { this.contextMenuOpen = false; };
      },
    }, () => ({ scale: this.scale, panX: this.panX, panY: this.panY }));

    const cx = this.clampWorld(p.x);
    const cy = this.clampWorld(p.y);
    const cs: CardState = { card, worldX: cx, worldY: cy, isOpen: p.isOpen, savedTitle: p.title, savedWidth: p.width, savedHeight: p.height, savedWX: cx, savedWY: cy, terminalPlugin: null };
    this.cards.push(cs);

    if (!p.isOpen) card.el.style.display = 'none';
    return cs;
  }

  restorePlugins(state: SaveState, wsPath: string): void {
    this.wsPath = wsPath;
    for (const cs of [...this.cards]) cs.card.el.remove();
    this.cards = [];
    this.terminalCounter = 0;
    this.devCounter = 0;
    this.contextCounter = 0;

    // Find highest numbers for counters
    let highestTerm = 0;
    let highestDev = 0;
    let highestCtx = 0;
    for (const p of state.plugins) {
      const tm = p.title.match(/^Terminal (\d+)$/);
      if (tm) highestTerm = Math.max(highestTerm, parseInt(tm[1]));
      const dm = p.title.match(/^Dev (\d+)$/);
      if (dm) highestDev = Math.max(highestDev, parseInt(dm[1]));
      const cm = p.title.match(/^Context (\d+)$/);
      if (cm) highestCtx = Math.max(highestCtx, parseInt(cm[1]));
    }
    this.terminalCounter = highestTerm;
    this.devCounter = Math.max(highestDev, 1);
    this.contextCounter = highestCtx;

    // Normalize old "Dev" titles to "Dev 1"
    for (const p of state.plugins) {
      if (p.title === 'Dev') {
        p.title = 'Dev 1';
        this.devCounter = Math.max(this.devCounter, 1);
      }
    }

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
              body.style.alignItems = 'stretch';
              body.style.justifyContent = 'stretch';
              const term = new TerminalPlugin(body, cs.card.uuid, wsPath);
              term.onExit = () => this.terminateCard(cs);
              cs.card.onDestroy = () => term.destroy();
              cs.terminalPlugin = term;
              cs.onCardResize = () => term.setScale(this.scale);
              term.setScale(this.scale);
            }
            this.notifyTerminalsChanged();
          });
        }
      } else if (p.title.startsWith('Dev')) {
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
            dev.setContextOpeners(this.getContextLabels(), (filePath, label) => this.openInContext(filePath, label));
            // Restore editor state from plugin entry
            if (p.editorState) {
              const es = p.editorState;
              setTimeout(() => this.devPlugin?.restoreEditorState(es), 500);
            }
          }
        }
      } else if (p.title.startsWith('Context')) {
        const cs = this.createCardFromDef(p, {
          onClose: () => { cs.isOpen = false; cs.card.el.style.display = 'none'; this.notifyContextsChanged(); },
        });

        if (p.isOpen) {
          requestAnimationFrame(async () => {
            const body = cs.card.el.querySelector('.card-body') as HTMLElement;
            if (body) {
              body.style.padding = '0';
              body.style.alignItems = 'stretch';
              body.style.justifyContent = 'stretch';
              const ctx = new ContextPlugin(body);
              ctx.title = p.title;
              this.contextPlugins.push(ctx);
              await ctx.restoreState(p.contextState || null);
              cs.card.onDestroy = () => {
                ctx.destroy();
                const i = this.contextPlugins.indexOf(ctx);
                if (i !== -1) this.contextPlugins.splice(i, 1);
              };
            }
            this.notifyContextsChanged();
          });
        }
      }
    }

    this.restoreZOrder(state.zOrder);
    this.terminalCounter = highestTerm;
    this.repositionAllCards();
    this.notifyDevsChanged();
    this.notifyContextsChanged();
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
      this.bringToFront(cs.card);
      this.panToCard(cs);
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
      this.bringToFront(cs.card);
      this.panToCard(cs);
    });
  }

  addDev(wsPath: string): void {
    this.wsPath = wsPath;
    this.devCounter++;
    const cs = this.addCard(`Dev ${this.devCounter}`, '', 0, 0, 800, 500);
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const dev = new DevPlugin(body, wsPath);
        dev.onStateChange = () => this.onStateChange?.();
        this.devPlugin = dev;
        dev.setContextOpeners(this.getContextLabels(), (filePath, label) => this.openInContext(filePath, label));
        this.notifyDevsChanged();
        this.bringToFront(cs.card);
        this.panToCard(cs);
      }
    });
  }

  addContext(): Promise<ContextPlugin | null> {
    this.contextCounter++;
    const name = `Context ${this.contextCounter}`;
    const cs = this.addCard(name, '', 0, 0, 700, 500);
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        const body = cs.card.el.querySelector('.card-body') as HTMLElement;
        if (body) {
          body.style.padding = '0';
          body.style.alignItems = 'stretch';
          body.style.justifyContent = 'stretch';
          const ctx = new ContextPlugin(body);
          ctx.title = name;
          this.contextPlugins.push(ctx);
          cs.card.onDestroy = () => {
            ctx.destroy();
            const i = this.contextPlugins.indexOf(ctx);
            if (i !== -1) this.contextPlugins.splice(i, 1);
          };
          this.notifyContextsChanged();
          this.bringToFront(cs.card);
          this.panToCard(cs);
          resolve(ctx);
        } else {
          resolve(null);
        }
      });
    });
  }

  getContextLabels(): string[] {
    return this.contextPlugins.map(c => c.title).filter(Boolean);
  }

  async openInContext(filePath: string, label?: string): Promise<void> {
    let target: ContextPlugin | null | undefined = label
      ? this.contextPlugins.find(c => c.title === label)
      : this.contextPlugins[0];
    if (!target) {
      target = await this.addContext();
    }
    target?.loadFile(filePath);
  }

  addTerminal(cwd?: string): void {
    this.terminalCounter++;
    const name = `Terminal ${this.terminalCounter}`;
    const cs = this.addCard(name, '', 0, 0, 560, 420);
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body');
      if (body) {
        (body as HTMLElement).style.padding = '0';
        (body as HTMLElement).style.alignItems = 'stretch';
        (body as HTMLElement).style.justifyContent = 'stretch';
        const term = new TerminalPlugin(body as HTMLElement, cs.card.uuid, cwd);
        term.onExit = () => this.terminateCard(cs);
        cs.card.onDestroy = () => term.destroy();
        cs.terminalPlugin = term;
        cs.onCardResize = () => term.setScale(this.scale);
        term.setScale(this.scale);
      }
      this.notifyTerminalsChanged();
      this.bringToFront(cs.card);
      this.panToCard(cs);
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

  focusContext(uuid: string): void {
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
    this.panToCard(open[nextIdx]);
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

  reopenContext(uuid: string): void {
    const cs = this.cards.find(c => c.card.uuid === uuid && !c.isOpen);
    if (cs) this.reopenCard(cs);
  }

  reopenCard(cs: CardState): void {
    if (cs.isOpen) return;
    if (cs.savedTitle.startsWith('Terminal')) {
      this.reopenTerminal(cs.card.uuid);
    } else if (cs.savedTitle.startsWith('Dev')) {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body && !body.hasChildNodes()) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const dev = new DevPlugin(body, this.wsPath);
        dev.onStateChange = () => this.onStateChange?.();
        this.devPlugin = dev;
        dev.setContextOpeners(this.getContextLabels(), (filePath, label) => this.openInContext(filePath, label));
      }
      cs.isOpen = true;
      cs.card.el.style.display = '';
      cs.worldX = cs.savedWX;
      cs.worldY = cs.savedWY;
      this.positionCard(cs);
      this.notifyDevsChanged();
      this.onStateChange?.();
    } else if (cs.savedTitle.startsWith('Context')) {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body && !body.hasChildNodes()) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const ctx = new ContextPlugin(body);
        ctx.title = cs.savedTitle;
        this.contextPlugins.push(ctx);
        cs.card.onDestroy = () => {
          ctx.destroy();
          const i = this.contextPlugins.indexOf(ctx);
          if (i !== -1) this.contextPlugins.splice(i, 1);
        };
      }
      cs.isOpen = true;
      cs.card.el.style.display = '';
      cs.worldX = cs.savedWX;
      cs.worldY = cs.savedWY;
      this.positionCard(cs);
      this.notifyContextsChanged();
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
    this.notifyContextsChanged();
    this.onStateChange?.();
  }

  private notifyTerminalsChanged(): void {
    const list = this.cards.filter(c => c.savedTitle.startsWith('Terminal'))
      .map(c => ({ uuid: c.card.uuid, title: c.savedTitle, isOpen: c.isOpen }));
    this.onTerminalsChanged?.(list);
  }

  private notifyDevsChanged(): void {
    const list = this.cards.filter(c => c.savedTitle.startsWith('Dev '))
      .map(c => ({ uuid: c.card.uuid, title: c.savedTitle, isOpen: c.isOpen }));
    this.onDevsChanged?.(list);
  }

  private notifyContextsChanged(): void {
    const list = this.cards.filter(c => c.savedTitle.startsWith('Context '))
      .map(c => ({ uuid: c.card.uuid, title: c.savedTitle, isOpen: c.isOpen }));
    this.onContextsChanged?.(list);
  }

  offsetCard(title: string, worldX: number, worldY: number): void {
    const cs = this.cards.find(c => c.savedTitle === title);
    if (!cs) return;
    cs.worldX = this.clampWorld(worldX);
    cs.worldY = this.clampWorld(worldY);
    cs.savedWX = cs.worldX;
    cs.savedWY = cs.worldY;
    this.positionCard(cs);
    this.onStateChange?.();
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
      this.clampView();
      this.repositionAllCards();
      this.applyGrid();
      for (const cs of this.cards) cs.card.renderTitle();
      const half = this.patternSize / 2;

      this.updateStatusBar();
      this.onStateChange?.();
    });
  }

  private initZoomPan(): void {
    // Canvas wheel zoom (only when over empty canvas area, not over cards)
    this.el.addEventListener('wheel', (e) => {
      if (e.ctrlKey) return; // handled by global handler below
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

    // Global Ctrl+Wheel zoom — capture phase so it fires before child stopPropagation
    document.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      if (this.locked) { e.preventDefault(); return; }
      e.preventDefault();
      e.stopPropagation();
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
    }, { capture: true, passive: false });

    this.el.addEventListener('mousedown', (e) => {
      if (this.locked) return;
      // Ctrl+drag pans even over cards; otherwise only on empty canvas for text selection
      if (e.button === 0 || e.button === 1) {
        if (e.ctrlKey || !(e.target as HTMLElement)?.closest('.card, .prr-zone, .pli-zone')) {
          this.isPanning = true;
          this.panStartX = e.clientX;
          this.panStartY = e.clientY;
          this.panStartPanX = this.panX;
          this.panStartPanY = this.panY;
          this.el.style.cursor = 'grabbing';
        }
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isPanning || this.locked) return;
      this.panX = this.panStartPanX + (e.clientX - this.panStartX);
      this.panY = this.panStartPanY + (e.clientY - this.panStartY);
      this.scheduleTransform();
    });

    document.addEventListener('mouseup', () => {
      this.isPanning = false;
      this.el.style.cursor = '';
    });

    this.el.addEventListener('contextmenu', (e) => {
      if (this.locked) return;
      if ((e.target as HTMLElement)?.closest('.card, .prr-zone, .pli-zone')) return;
      e.preventDefault();
      new ContextMenu([
        { label: 'View All', action: () => this.fitAll() },
        { label: 'Auto Arrange', action: () => this.autoArrange() },
      ], e.clientX, e.clientY);
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

  private fitAll(): void {
    const open = this.cards.filter(c => c.isOpen);
    if (open.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cs of open) {
      minX = Math.min(minX, cs.worldX);
      minY = Math.min(minY, cs.worldY);
      maxX = Math.max(maxX, cs.worldX + cs.savedWidth);
      maxY = Math.max(maxY, cs.worldY + cs.savedHeight);
    }

    const worldW = maxX - minX;
    const worldH = maxY - minY;
    const cw = this.el.clientWidth;
    const ch = this.el.clientHeight;
    const margin = 80;

    const fitX = (cw - margin) / worldW;
    const fitY = (ch - margin) / worldH;
    this.scale = Math.max(0.1, Math.min(fitX, fitY, 1));

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.animatePan(cw / 2 - cx * this.scale, ch / 2 - cy * this.scale);
  }

  private panToCard(cs: CardState): void {
    const cw = this.el.clientWidth;
    const ch = this.el.clientHeight;
    const margin = 80;

    // Force zoom to fit the card with margin (always zoom out, never zoom in past 0.1)
    const fitX = (cw - margin) / cs.savedWidth;
    const fitY = (ch - margin) / cs.savedHeight;
    const targetScale = Math.min(fitX, fitY, 1);
    this.scale = Math.max(0.1, targetScale);

    // Center on card center (not top-left) using the NEW scale
    const targetX = cw / 2 - (cs.worldX + cs.savedWidth / 2) * this.scale;
    const targetY = ch / 2 - (cs.worldY + cs.savedHeight / 2) * this.scale;
    this.animatePan(targetX, targetY);
  }

  private sbZoom: HTMLSpanElement | null = null;
  private sbPan: HTMLSpanElement | null = null;
  private sbWorkspace: HTMLSpanElement | null = null;

  private initStatusBar(): void {
    const sb = document.getElementById('statusbar');
    if (!sb || sb.children.length > 0) return;

    const sep = (): HTMLSpanElement => { const s = document.createElement('span'); s.className = 'status-sep'; sb.appendChild(s); return s; };

    this.sbZoom = document.createElement('span');
    this.sbZoom.className = 'status-item';
    sb.appendChild(this.sbZoom);
    sep();

    this.sbPan = document.createElement('span');
    this.sbPan.className = 'status-item';
    sb.appendChild(this.sbPan);
    sep();

    this.sbWorkspace = document.createElement('span');
    this.sbWorkspace.className = 'status-item';
    sb.appendChild(this.sbWorkspace);

    const fillL = document.createElement('span');
    fillL.style.cssText = 'flex:1';
    sb.appendChild(fillL);

    const center = document.createElement('span');
    center.id = 'statusbar-center';
    sb.appendChild(center);

    const fillR = document.createElement('span');
    fillR.style.cssText = 'flex:1';
    sb.appendChild(fillR);

    sep();
    const viewAllBtn = document.createElement('button');
    viewAllBtn.className = 'status-btn';
    viewAllBtn.textContent = 'view all';
    viewAllBtn.addEventListener('click', () => this.fitAll());
    sb.appendChild(viewAllBtn);
  }

  private updateStatusBar(): void {
    this.initStatusBar();
    if (this.sbZoom) this.sbZoom.textContent = `Zoom: ${Math.round(this.scale * 100)}%`;
    if (this.sbPan) this.sbPan.textContent = `Pan: ${Math.round(this.panX)}, ${Math.round(this.panY)}`;
    if (this.sbWorkspace) this.sbWorkspace.textContent = this.workspaceName;
  }
}

