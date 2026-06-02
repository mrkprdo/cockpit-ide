export type EditorState = { openFiles: string[]; activeFile: string; explorerWidth: number; cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }> };
export type PluginEntry = { uuid: string; title: string; x: number; y: number; width: number; height: number; isOpen: boolean; editorState?: EditorState; markdownState?: MarkdownState; gitState?: GitState };
export type SaveState = { plugins: PluginEntry[]; zOrder: string[]; zoom: number; panX: number; panY: number; locked?: boolean };

import { GridStyle, generateGridPattern, applyGridToElement } from './canvas-grid';
import { StatusBar } from './canvas-statusbar';
import { PluginCard } from './PluginCard';
import { TerminalPlugin } from './TerminalPlugin';
import { MonacoEditorPlugin } from './MonacoEditorPlugin';
import { ExplorerPlugin } from './ExplorerPlugin';
import { GitPlugin, GitState } from './GitPlugin';
import { ContextMenu } from './ContextMenu';
import { MarkdownPlugin, MarkdownState } from './MarkdownPlugin';

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
  explorerPlugin: ExplorerPlugin | null;
  gitPlugin: GitPlugin | null;
  onCardResize?: () => void;
}

export class CanvasArea {
  onStateChange: (() => void) | null = null;
  onTerminalsChanged: ((items: { uuid: string; title: string; isOpen: boolean }[]) => void) | null = null;
  onExplorersChanged: ((items: { uuid: string; title: string; isOpen: boolean }[]) => void) | null = null;
  onGitChanged: ((items: { uuid: string; title: string; isOpen: boolean }[]) => void) | null = null;
  onMarkdownChanged: ((items: { uuid: string; title: string; isOpen: boolean }[]) => void) | null = null;
  onLockToggle: (() => void) | null = null;
  private _locked = false;
  get locked(): boolean { return this._locked; }
  set locked(v: boolean) {
    this._locked = v;
    this.statusBar.update(this._locked, this.scale, this.workspaceName, this.onLockToggle, () => this.fitAll(), () => { this.scale = 1; this.scheduleTransform(); });
    this.onStateChange?.();
  }
  private patternSize = 28;
  private patternDataURL = '';
  private cards: CardState[] = [];

  private statusBar = new StatusBar();

  private markdownPlugins: MarkdownPlugin[] = [];
  private scale = 1;
  private panX = 0;
  private panY = 0;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartPanX = 0;
  private panStartPanY = 0;
  private rafId = 0;
  private originDot: HTMLDivElement;
  private gridStyle: GridStyle = 'dots';
  private terminalCounter = 0;
  private explorerCounter = 0;
  private gitCounter = 0;
  private markdownCounter = 0;
  workspaceName = 'no workspace';

  private pluginListPanel: HTMLDivElement;
  private arrPanel: HTMLDivElement;
  private tileW = '23';
  private tileH = '17';

  private contextMenuOpen = false;

  private layoutOverlays: HTMLElement[] = [];
  private lastDragX = 0;
  private lastDragY = 0;

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
    this.pluginListPanel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
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
    this.arrPanel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.arrPanel.addEventListener('mouseenter', () => { this.arrPanel.style.display = 'block'; });
    this.arrPanel.addEventListener('mouseleave', () => {
      if (!arrZone.matches(':hover')) this.arrPanel.style.display = 'none';
    });

    this.originDot = document.createElement('div');
    this.originDot.className = 'origin-dot';
    this.el.appendChild(this.originDot);

    this.createLayoutOverlays();

    this.patternDataURL = generateGridPattern(this.gridStyle, this.patternSize);
    applyGridToElement(this.el, this.gridStyle, this.patternDataURL, this.patternSize, this.scale, this.panX, this.panY);
    this.initZoomPan();
    this.statusBar.init();
    this.statusBar.update(this._locked, this.scale, this.workspaceName, this.onLockToggle, () => this.fitAll(), () => { this.scale = 1; this.scheduleTransform(); });
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

  snapOrigin(): void {
    this.panX = Math.round(this.panX / this.patternSize) * this.patternSize;
    this.panY = Math.round(this.panY / this.patternSize) * this.patternSize;
    this.scheduleTransform();
  }

  private showArrPanel(): void {
    const panel = this.arrPanel;
    panel.innerHTML = '';

    const items: { label: string; action: () => void }[] = [
      { label: 'Auto Arrange', action: () => this.autoArrange() },
      { label: 'Tile Plugins', action: () => this.tilePlugins() },
      { label: 'Snap Origin', action: () => this.snapOrigin() },
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
      const pos: { cs: CardState; rx: number; ry: number }[] = [];
      let rx = 0, ry = 0, rowH = 0;
      for (const cs of open) {
        pos.push({ cs, rx, ry });
        rx += cs.savedWidth + gap;
        rowH = Math.max(rowH, cs.savedHeight);
        if (rx > 1400) {
          rx = 0;
          ry += rowH + gap;
          rowH = 0;
        }
      }
      let maxX = 0, maxY = 0;
      for (const p of pos) {
        maxX = Math.max(maxX, p.rx + p.cs.savedWidth);
        maxY = Math.max(maxY, p.ry + p.cs.savedHeight);
      }
      const ox = this.snap(-Math.round(maxX / 2));
      const oy = this.snap(-Math.round(maxY / 2));
      for (const p of pos) {
        p.cs.worldX = p.rx + ox;
        p.cs.worldY = p.ry + oy;
        p.cs.savedWX = p.cs.worldX;
        p.cs.savedWY = p.cs.worldY;
        this.positionCard(p.cs);
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

      const totalW = cols * (cellW + gap) - gap;
      const totalH = rows * (cellH + gap) - gap;
      const ox = this.snap(-Math.round(totalW / 2));
      const oy = this.snap(-Math.round(totalH / 2));

      let idx = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols && idx < open.length; c++) {
          const cs = open[idx];
          cs.worldX = Math.round(c * (cellW + gap)) + ox;
          cs.worldY = Math.round(r * (cellH + gap)) + oy;
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
    this.patternDataURL = generateGridPattern(this.gridStyle, this.patternSize);
    applyGridToElement(this.el, this.gridStyle, this.patternDataURL, this.patternSize, this.scale, this.panX, this.panY);
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
      onMinimize: () => {
        const cs = this.cards.find(c => c.card === card);
        if (cs) {
          cs.isOpen = false;
          cs.card.el.style.display = 'none';
          this.notifyTerminalsChanged();
          this.notifyExplorersChanged();
          this.notifyGitChanged();
          this.notifyMarkdownChanged();
          this.onStateChange?.();
        }
      },
      onFitViewport: () => {
        const cs = this.cards.find(c => c.card === card);
        if (cs) this.fitViewport(cs);
      },
      onTerminate: () => {
        const cs = this.cards.find(c => c.card === card);
        if (cs) this.terminateCard(cs);
      },
      onDragStart: (clientX, clientY) => {
        this.lastDragX = clientX;
        this.lastDragY = clientY;
        this.showLayoutOverlays();
      },
      onDragMove: (clientX, clientY) => {
        this.lastDragX = clientX;
        this.lastDragY = clientY;
      },
      onDragEnd: (worldX: number, worldY: number) => {
        const cs = this.cards.find(c => c.card === card);
        if (cs) {
          const zone = this.getDropZone(this.lastDragX, this.lastDragY);
          if (zone) {
            this.applyDropZone(zone, cs);
          } else {
            cs.worldX = this.clampWorld(worldX);
            cs.worldY = this.clampWorld(worldY);
          }
        }
        this.hideLayoutOverlays();
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
          { label: 'Fit Viewport', action: () => this.fitViewport(cs) },
          ...(cs.isOpen ? [{ label: 'Minimize', action: () => {
            cs.isOpen = false;
            cs.card.el.style.display = 'none';
            this.notifyTerminalsChanged();
            this.notifyExplorersChanged();
            this.notifyGitChanged();
            this.notifyMarkdownChanged();
            this.onStateChange?.();
          }}] : []),
          { label: 'Terminate', action: () => this.terminateCard(cs) },
        ], e.clientX, e.clientY);
        menu.onClose = () => { this.contextMenuOpen = false; };
      },
    }, () => ({ scale: this.scale, panX: this.panX, panY: this.panY }));
    const cs: CardState = { card, worldX: sx, worldY: sy, isOpen: true, savedTitle: title, savedWidth: sw, savedHeight: sh, savedWX: sx, savedWY: sy, terminalPlugin: null, explorerPlugin: null, gitPlugin: null };
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

  private overlaySVG(zone: string): string {
    const a = 'fill="var(--accent)" opacity="0.4"';
    const b = 'stroke="var(--border)" stroke-width="1.2" fill="none"';
    const hl = (x: number, y: number, w: number, h: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a}/>`;
    switch (zone) {
      case 'top-left': return `<svg viewBox="0 0 32 24" width="32" height="24"><rect x="0" y="0" width="32" height="24" ${b}/>${hl(0,0,16,12)}<line x1="16" y1="0" x2="16" y2="24" stroke="var(--border)" stroke-width="1"/><line x1="0" y1="12" x2="32" y2="12" stroke="var(--border)" stroke-width="1"/></svg>`;
      case 'top': return `<svg viewBox="0 0 32 24" width="32" height="24"><rect x="0" y="0" width="32" height="24" ${b}/>${hl(0,0,32,12)}<line x1="0" y1="12" x2="32" y2="12" stroke="var(--border)" stroke-width="1"/></svg>`;
      case 'top-right': return `<svg viewBox="0 0 32 24" width="32" height="24"><rect x="0" y="0" width="32" height="24" ${b}/>${hl(16,0,16,12)}<line x1="16" y1="0" x2="16" y2="24" stroke="var(--border)" stroke-width="1"/><line x1="0" y1="12" x2="32" y2="12" stroke="var(--border)" stroke-width="1"/></svg>`;
      case 'left': return `<svg viewBox="0 0 32 24" width="32" height="24"><rect x="0" y="0" width="32" height="24" ${b}/>${hl(0,0,16,24)}<line x1="16" y1="0" x2="16" y2="24" stroke="var(--border)" stroke-width="1"/></svg>`;
      case 'right': return `<svg viewBox="0 0 32 24" width="32" height="24"><rect x="0" y="0" width="32" height="24" ${b}/>${hl(16,0,16,24)}<line x1="16" y1="0" x2="16" y2="24" stroke="var(--border)" stroke-width="1"/></svg>`;
      case 'bottom-left': return `<svg viewBox="0 0 32 24" width="32" height="24"><rect x="0" y="0" width="32" height="24" ${b}/>${hl(0,12,16,12)}<line x1="16" y1="0" x2="16" y2="24" stroke="var(--border)" stroke-width="1"/><line x1="0" y1="12" x2="32" y2="12" stroke="var(--border)" stroke-width="1"/></svg>`;
      case 'bottom': return `<svg viewBox="0 0 32 24" width="32" height="24"><rect x="0" y="0" width="32" height="24" ${b}/>${hl(0,12,32,12)}<line x1="0" y1="12" x2="32" y2="12" stroke="var(--border)" stroke-width="1"/></svg>`;
      case 'bottom-right': return `<svg viewBox="0 0 32 24" width="32" height="24"><rect x="0" y="0" width="32" height="24" ${b}/>${hl(16,12,16,12)}<line x1="16" y1="0" x2="16" y2="24" stroke="var(--border)" stroke-width="1"/><line x1="0" y1="12" x2="32" y2="12" stroke="var(--border)" stroke-width="1"/></svg>`;
      default: return '<svg viewBox="0 0 32 24" width="32" height="24"><rect x="0" y="0" width="32" height="24" stroke="var(--border)" stroke-width="1" fill="none"/></svg>';
    }
  }

  private createLayoutOverlays(): void {
    const zones = ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'];
    for (const zone of zones) {
      const el = document.createElement('div');
      el.className = 'layout-overlay';
      el.dataset.zone = zone;
      el.innerHTML = this.overlaySVG(zone);
      el.style.display = 'none';
      this.el.appendChild(el);
      this.layoutOverlays.push(el);
    }
  }

  private showLayoutOverlays(): void {
    if (!this._locked || this.scale !== 1) return;
    const cw = this.el.clientWidth;
    const ch = this.el.clientHeight;
    const M = 8;
    const OV_W = 48, OV_H = 36;
    const positions: Record<string, { left: number; top: number }> = {
      'top-left': { left: M, top: M },
      'top': { left: Math.round(cw / 2 - OV_W / 2), top: M },
      'top-right': { left: cw - OV_W - M, top: M },
      'left': { left: M, top: Math.round(ch / 2 - OV_H / 2) },
      'right': { left: cw - OV_W - M, top: Math.round(ch / 2 - OV_H / 2) },
      'bottom-left': { left: M, top: ch - OV_H - M },
      'bottom': { left: Math.round(cw / 2 - OV_W / 2), top: ch - OV_H - M },
      'bottom-right': { left: cw - OV_W - M, top: ch - OV_H - M },
    };
    for (const el of this.layoutOverlays) {
      const pos = positions[el.dataset.zone || ''];
      if (pos) {
        el.style.left = `${pos.left}px`;
        el.style.top = `${pos.top}px`;
        el.style.display = 'flex';
      }
    }
  }

  private hideLayoutOverlays(): void {
    for (const el of this.layoutOverlays) {
      el.style.display = 'none';
    }
  }

  private getDropZone(clientX: number, clientY: number): string | null {
    const canvasRect = this.el.getBoundingClientRect();
    for (const el of this.layoutOverlays) {
      if (el.style.display === 'none') continue;
      const rect = el.getBoundingClientRect();
      const pad = 8;
      if (
        clientX >= rect.left - pad &&
        clientX <= rect.right + pad &&
        clientY >= rect.top - pad &&
        clientY <= rect.bottom + pad
      ) {
        return el.dataset.zone || null;
      }
    }
    return null;
  }

  private applyDropZone(zone: string, cs: CardState): void {
    const cw = this.el.clientWidth;
    const ch = this.el.clientHeight;
    const W2 = Math.round(cw / 56) * 28;
    const H2 = Math.round(ch / 56) * 28;
    const W = Math.round(cw / 28) * 28;
    const H = Math.round(ch / 28) * 28;
    const snap = (v: number) => Math.round(v / 28) * 28;
    let worldX = 0, worldY = 0, w = 0, h = 0;
    switch (zone) {
      case 'top-left':
        worldX = snap(-this.panX); worldY = snap(-this.panY); w = W2; h = H2; break;
      case 'top':
        worldX = snap(-this.panX); worldY = snap(-this.panY); w = W; h = H2; break;
      case 'top-right':
        worldX = snap(-this.panX + W2); worldY = snap(-this.panY); w = W2; h = H2; break;
      case 'left':
        worldX = snap(-this.panX); worldY = snap(-this.panY); w = W2; h = H; break;
      case 'right':
        worldX = snap(-this.panX + W2); worldY = snap(-this.panY); w = W2; h = H; break;
      case 'bottom-left':
        worldX = snap(-this.panX); worldY = snap(-this.panY + H2); w = W2; h = H2; break;
      case 'bottom':
        worldX = snap(-this.panX); worldY = snap(-this.panY + H2); w = W; h = H2; break;
      case 'bottom-right':
        worldX = snap(-this.panX + W2); worldY = snap(-this.panY + H2); w = W2; h = H2; break;
    }
    w = Math.max(28 * 10, w);
    h = Math.max(28 * 10, h);
    cs.worldX = this.clampWorld(worldX);
    cs.worldY = this.clampWorld(worldY);
    cs.savedWidth = w;
    cs.savedHeight = h;
    cs.savedWX = cs.worldX;
    cs.savedWY = cs.worldY;
    cs.card.opts.width = w;
    cs.card.opts.height = h;
    cs.card.el.style.width = `${w}px`;
    cs.card.el.style.height = `${h}px`;
    this.positionCard(cs);
    cs.onCardResize?.();
    this.onStateChange?.();
  }

  getSaveState(): SaveState {
    // Sort by current z-index to get bottom-to-top order
    const byZ = [...this.cards].sort((a, b) => parseInt(a.card.el.style.zIndex || '1') - parseInt(b.card.el.style.zIndex || '1'));
    return {
      plugins: this.cards.map(c => {
        // Always read actual DOM dimensions as authoritative source
        const w = parseFloat(c.card.el.style.width) || c.savedWidth;
        const h = parseFloat(c.card.el.style.height) || c.savedHeight;
        c.savedWidth = w;
        c.savedHeight = h;
        const base: PluginEntry = { uuid: c.card.uuid, title: c.savedTitle, x: c.worldX, y: c.worldY, width: w, height: h, isOpen: c.isOpen };
        const editorState = c.explorerPlugin ? c.explorerPlugin.getEditorState() : null;
        if (c.savedTitle === 'Explorer' && editorState) base.editorState = editorState;
        if (c.savedTitle === 'Markdown') {
          const ctx = this.markdownPlugins.find(p => p.title === c.savedTitle);
          if (ctx) base.markdownState = ctx.getState();
        }
        if (c.savedTitle === 'Git' && c.gitPlugin) {
          base.gitState = c.gitPlugin.getState();
        }
        return base;
      }),
      zOrder: byZ.map(c => c.card.uuid),
      zoom: this.scale, panX: this.panX, panY: this.panY,
      locked: this._locked,
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
  private wsPath = '';

  getActiveExplorerPlugin(): ExplorerPlugin | null {
    const sorted = [...this.cards].sort((a, b) =>
      parseInt(b.card.el.style.zIndex || '0') - parseInt(a.card.el.style.zIndex || '0')
    );
    for (const cs of sorted) {
      if (cs.explorerPlugin && cs.isOpen) return cs.explorerPlugin;
    }
    return null;
  }

  private createCardFromDef(p: { uuid?: string; title: string; x: number; y: number; width: number; height: number; isOpen: boolean }, callbacks: { onMinimize?: () => void; onFitViewport?: () => void; onTerminate?: () => void }): CardState {
    const card = new PluginCard(this.el, {
      title: p.title, subtitle: '', x: 0, y: 0, width: p.width, height: p.height,
      onMinimize: callbacks.onMinimize,
      onFitViewport: callbacks.onFitViewport,
      onTerminate: callbacks.onTerminate,
      onDragStart: (clientX, clientY) => {
        this.lastDragX = clientX;
        this.lastDragY = clientY;
        this.showLayoutOverlays();
      },
      onDragMove: (clientX, clientY) => {
        this.lastDragX = clientX;
        this.lastDragY = clientY;
      },
      onDragEnd: (worldX, worldY) => {
        const cs = this.cards.find(c => c.card === card);
        if (cs) {
          const zone = this.getDropZone(this.lastDragX, this.lastDragY);
          if (zone) {
            this.applyDropZone(zone, cs);
          } else {
            cs.worldX = this.clampWorld(worldX); cs.worldY = this.clampWorld(worldY);
          }
        }
        this.hideLayoutOverlays();
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
          { label: 'Fit Viewport', action: () => this.fitViewport(cs) },
          ...(cs.isOpen ? [{ label: 'Minimize', action: () => {
            cs.isOpen = false;
            cs.card.el.style.display = 'none';
            this.notifyTerminalsChanged();
            this.notifyExplorersChanged();
            this.notifyGitChanged();
            this.notifyMarkdownChanged();
            this.onStateChange?.();
          }}] : []),
          { label: 'Terminate', action: () => this.terminateCard(cs) },
        ], e.clientX, e.clientY);
        menu.onClose = () => { this.contextMenuOpen = false; };
      },
    }, () => ({ scale: this.scale, panX: this.panX, panY: this.panY }));

    const cx = this.clampWorld(p.x);
    const cy = this.clampWorld(p.y);
    const cs: CardState = { card, worldX: cx, worldY: cy, isOpen: p.isOpen, savedTitle: p.title, savedWidth: p.width, savedHeight: p.height, savedWX: cx, savedWY: cy, terminalPlugin: null, explorerPlugin: null, gitPlugin: null };
    this.cards.push(cs);

    if (!p.isOpen) card.el.style.display = 'none';
    return cs;
  }

  restorePlugins(state: SaveState, wsPath: string): void {
    this.wsPath = wsPath;
    for (const cs of [...this.cards]) cs.card.el.remove();
    this.cards = [];
    this.terminalCounter = 0;
    this.explorerCounter = 0;
    this.markdownCounter = 0;

    // Find highest numbers for counters
    let highestTerm = 0;
    for (const p of state.plugins) {
      const tm = p.title.match(/^Terminal (\d+)$/);
      if (tm) highestTerm = Math.max(highestTerm, parseInt(tm[1]));
    }
    this.terminalCounter = highestTerm;

    // Normalize old "Dev" / "Explorer N" titles to "Explorer"
    let seenExplorer = false;
    let seenMarkdown = false;
    for (const p of state.plugins) {
      if (p.title === 'Dev' || /^Explorer \d+$/.test(p.title)) {
        p.title = 'Explorer';
      }
      if (/^Markdown \d+$/.test(p.title)) {
        p.title = 'Markdown';
      }
    }
    // Deduplicate Explorer and Markdown (keep only first entry each)
    state.plugins = state.plugins.filter(p => {
      if (p.title === 'Explorer') {
        if (seenExplorer) return false;
        seenExplorer = true;
      }
      if (p.title === 'Markdown') {
        if (seenMarkdown) return false;
        seenMarkdown = true;
      }
      return true;
    });

    for (const p of state.plugins) {
      if (p.title.startsWith('Terminal')) {
        const cs = this.createCardFromDef(p, {
          onMinimize: () => {
            cs.isOpen = false;
            cs.card.el.style.display = 'none';
            this.notifyTerminalsChanged();
          },
          onFitViewport: () => this.fitViewport(cs),
          onTerminate: () => this.terminateCard(cs),
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
              cs.onCardResize = () => { term.setScale(this.scale); term.fit(); };
              term.setScale(this.scale);
            }
            this.notifyTerminalsChanged();
          });
        }
      } else if (p.title === 'Explorer') {
        const cs = this.createCardFromDef(p, {
          onMinimize: () => { cs.isOpen = false; cs.card.el.style.display = 'none'; },
          onFitViewport: () => this.fitViewport(cs),
          onTerminate: () => this.terminateCard(cs),
        });

        if (p.isOpen) {
          const body = cs.card.el.querySelector('.card-body') as HTMLElement;
          if (body) {
            body.style.padding = '0';
            body.style.alignItems = 'stretch';
            body.style.justifyContent = 'stretch';
            const dev = new ExplorerPlugin(body, wsPath);
            dev.onStateChange = () => this.onStateChange?.();
            cs.explorerPlugin = dev;
            dev.setMarkdownOpeners(this.getMarkdownLabels(), (filePath, label) => this.openInMarkdown(filePath, label));
            // Restore editor state from plugin entry
            if (p.editorState) {
              const es = p.editorState;
              setTimeout(() => dev.restoreEditorState(es), 500);
            }
          }
        }
      } else if (p.title === 'Git') {
        const cs = this.createCardFromDef(p, {
          onMinimize: () => { cs.isOpen = false; cs.card.el.style.display = 'none'; this.notifyGitChanged(); },
          onFitViewport: () => this.fitViewport(cs),
          onTerminate: () => this.terminateCard(cs),
        });

        if (p.isOpen) {
          const body = cs.card.el.querySelector('.card-body') as HTMLElement;
          if (body) {
            body.style.padding = '0';
            body.style.alignItems = 'stretch';
            body.style.justifyContent = 'stretch';
            const git = new GitPlugin(body, wsPath);
            git.onStateChange = () => this.onStateChange?.();
            git.onFileOpen = (filePath) => this.getActiveExplorerPlugin()?.openFile(filePath);
            cs.gitPlugin = git;
            cs.card.onDestroy = () => git.destroy();
            if (p.gitState) {
              git.applyLayout(p.gitState);
              setTimeout(() => git.restoreState(p.gitState), 500);
            }
          }
        }
      } else if (p.title === 'Markdown') {
        const cs = this.createCardFromDef(p, {
          onMinimize: () => { cs.isOpen = false; cs.card.el.style.display = 'none'; this.notifyMarkdownChanged(); },
          onFitViewport: () => this.fitViewport(cs),
          onTerminate: () => this.terminateCard(cs),
        });

        if (p.isOpen) {
          requestAnimationFrame(async () => {
            const body = cs.card.el.querySelector('.card-body') as HTMLElement;
            if (body) {
              body.style.padding = '0';
              body.style.alignItems = 'stretch';
              body.style.justifyContent = 'stretch';
              const ctx = new MarkdownPlugin(body);
              ctx.title = p.title;
              this.markdownPlugins.push(ctx);
              await ctx.restoreState(p.markdownState || null);
              cs.card.onDestroy = () => {
                ctx.destroy();
                const i = this.markdownPlugins.indexOf(ctx);
                if (i !== -1) this.markdownPlugins.splice(i, 1);
              };
            }
            this.notifyMarkdownChanged();
          });
        }
      }
    }

    this.restoreZOrder(state.zOrder);
    this.terminalCounter = highestTerm;
    this.repositionAllCards();
    this.notifyExplorersChanged();
    this.notifyGitChanged();
    this.notifyMarkdownChanged();
  }

  addEditor(): void {
    const cs = this.addCard('EDITOR', '', -250, -210, 500, 420);
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

  addExplorer(wsPath: string): void {
    this.wsPath = wsPath;
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
        const dev = new ExplorerPlugin(body, wsPath);
        dev.onStateChange = () => this.onStateChange?.();
        existing.explorerPlugin = dev;
        dev.setMarkdownOpeners(this.getMarkdownLabels(), (filePath, label) => this.openInMarkdown(filePath, label));
      }
      this.bringToFront(existing.card);
      this.panToCard(existing);
      this.notifyExplorersChanged();
      return;
    }
    const cs = this.addCard('Explorer', '', -400, -250, 800, 500);
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const dev = new ExplorerPlugin(body, wsPath);
        dev.onStateChange = () => this.onStateChange?.();
        cs.explorerPlugin = dev;
        dev.setMarkdownOpeners(this.getMarkdownLabels(), (filePath, label) => this.openInMarkdown(filePath, label));
        this.notifyExplorersChanged();
        this.bringToFront(cs.card);
        this.panToCard(cs);
      }
    });
  }

  addGit(wsPath: string): void {
    // Only one Git plugin instance allowed
    const existing = this.cards.find(c => c.savedTitle === 'Git');
    if (existing) {
      existing.isOpen = true;
      existing.card.el.style.display = '';
      existing.worldX = existing.savedWX;
      existing.worldY = existing.savedWY;
      this.positionCard(existing);
      this.bringToFront(existing.card);
      this.panToCard(existing);
      this.notifyGitChanged();
      return;
    }
    this.gitCounter = 1;
    const cs = this.addCard('Git', '', -400, -250, 800, 500);
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const git = new GitPlugin(body, wsPath);
        git.onStateChange = () => this.onStateChange?.();
        git.onFileOpen = (filePath) => this.getActiveExplorerPlugin()?.openFile(filePath);
        cs.gitPlugin = git;
        cs.card.onDestroy = () => git.destroy();
        this.notifyGitChanged();
        this.bringToFront(cs.card);
        this.panToCard(cs);
      }
    });
  }

  addMarkdown(): Promise<MarkdownPlugin | null> {
    const existing = this.cards.find(c => c.savedTitle === 'Markdown');
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
        const ctx = new MarkdownPlugin(body);
        ctx.title = 'Markdown';
        this.markdownPlugins.push(ctx);
        existing.card.onDestroy = () => {
          ctx.destroy();
          const i = this.markdownPlugins.indexOf(ctx);
          if (i !== -1) this.markdownPlugins.splice(i, 1);
        };
      }
      this.bringToFront(existing.card);
      this.panToCard(existing);
      this.notifyMarkdownChanged();
      return Promise.resolve(this.markdownPlugins[0] || null);
    }
    const cs = this.addCard('Markdown', '', -350, -250, 700, 500);
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        const body = cs.card.el.querySelector('.card-body') as HTMLElement;
        if (body) {
          body.style.padding = '0';
          body.style.alignItems = 'stretch';
          body.style.justifyContent = 'stretch';
          const ctx = new MarkdownPlugin(body);
          ctx.title = 'Markdown';
          this.markdownPlugins.push(ctx);
          cs.card.onDestroy = () => {
            ctx.destroy();
            const i = this.markdownPlugins.indexOf(ctx);
            if (i !== -1) this.markdownPlugins.splice(i, 1);
          };
          this.notifyMarkdownChanged();
          this.bringToFront(cs.card);
          this.panToCard(cs);
          resolve(ctx);
        } else {
          resolve(null);
        }
      });
    });
  }

  getMarkdownLabels(): string[] {
    return this.markdownPlugins.length > 0 ? ['Markdown'] : [];
  }

  async openInMarkdown(filePath: string, label?: string): Promise<void> {
    let target: MarkdownPlugin | null | undefined = this.markdownPlugins[0];
    if (!target) {
      target = await this.addMarkdown();
    }
    target?.loadFile(filePath);
  }

  addTerminal(cwd?: string): void {
    this.terminalCounter++;
    const name = `Terminal ${this.terminalCounter}`;
    const cs = this.addCard(name, '', -280, -210, 560, 420);
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
        cs.onCardResize = () => { term.setScale(this.scale); term.fit(); };
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

  focusExplorer(uuid: string): void {
    const cs = this.cards.find(c => c.card.uuid === uuid && c.isOpen);
    if (cs) { this.focusCard(cs.card.opts.title); this.panToCard(cs); }
  }

  focusGit(uuid: string): void {
    const cs = this.cards.find(c => c.card.uuid === uuid && c.isOpen);
    if (cs) { this.focusCard(cs.card.opts.title); this.panToCard(cs); }
  }

  focusMarkdown(uuid: string): void {
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

  reopenExplorer(uuid: string): void {
    const cs = this.cards.find(c => c.card.uuid === uuid && !c.isOpen);
    if (cs) { this.reopenCard(cs); this.notifyExplorersChanged(); }
  }

  reopenGit(uuid: string): void {
    const cs = this.cards.find(c => c.card.uuid === uuid && !c.isOpen);
    if (cs) this.reopenCard(cs);
  }

  reopenMarkdown(uuid: string): void {
    const cs = this.cards.find(c => c.card.uuid === uuid && !c.isOpen);
    if (cs) this.reopenCard(cs);
  }

  reopenCard(cs: CardState): void {
    if (cs.isOpen) return;
    if (cs.savedTitle.startsWith('Terminal')) {
      this.reopenTerminal(cs.card.uuid);
    } else if (cs.savedTitle === 'Explorer') {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body && !body.hasChildNodes()) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const dev = new ExplorerPlugin(body, this.wsPath);
        dev.onStateChange = () => this.onStateChange?.();
        cs.explorerPlugin = dev;
        dev.setMarkdownOpeners(this.getMarkdownLabels(), (filePath, label) => this.openInMarkdown(filePath, label));
      }
      cs.isOpen = true;
      cs.card.el.style.display = '';
      cs.worldX = cs.savedWX;
      cs.worldY = cs.savedWY;
      this.positionCard(cs);
      this.notifyExplorersChanged();
      this.onStateChange?.();
    } else if (cs.savedTitle === 'Git') {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body && !body.hasChildNodes()) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const git = new GitPlugin(body, this.wsPath);
        git.onStateChange = () => this.onStateChange?.();
        git.onFileOpen = (filePath) => this.getActiveExplorerPlugin()?.openFile(filePath);
        cs.gitPlugin = git;
        cs.card.onDestroy = () => git.destroy();
      }
      cs.isOpen = true;
      cs.card.el.style.display = '';
      cs.worldX = cs.savedWX;
      cs.worldY = cs.savedWY;
      this.positionCard(cs);
      this.notifyGitChanged();
      this.onStateChange?.();
    } else if (cs.savedTitle === 'Markdown') {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body && !body.hasChildNodes()) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const ctx = new MarkdownPlugin(body);
        ctx.title = cs.savedTitle;
        this.markdownPlugins.push(ctx);
        cs.card.onDestroy = () => {
          ctx.destroy();
          const i = this.markdownPlugins.indexOf(ctx);
          if (i !== -1) this.markdownPlugins.splice(i, 1);
        };
      }
      cs.isOpen = true;
      cs.card.el.style.display = '';
      cs.worldX = cs.savedWX;
      cs.worldY = cs.savedWY;
      this.positionCard(cs);
      this.notifyMarkdownChanged();
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
    this.notifyExplorersChanged();
    this.notifyGitChanged();
    this.notifyMarkdownChanged();
    this.onStateChange?.();
  }

  private notifyTerminalsChanged(): void {
    const list = this.cards.filter(c => c.savedTitle.startsWith('Terminal'))
      .map(c => ({ uuid: c.card.uuid, title: c.savedTitle, isOpen: c.isOpen }));
    this.onTerminalsChanged?.(list);
  }

  private notifyExplorersChanged(): void {
    const list = this.cards.filter(c => c.savedTitle === 'Explorer')
      .map(c => ({ uuid: c.card.uuid, title: c.savedTitle, isOpen: c.isOpen }));
    this.onExplorersChanged?.(list);
  }

  private notifyGitChanged(): void {
    const list = this.cards.filter(c => c.savedTitle === 'Git')
      .map(c => ({ uuid: c.card.uuid, title: c.savedTitle, isOpen: c.isOpen }));
    this.onGitChanged?.(list);
  }

  private notifyMarkdownChanged(): void {
    const list = this.cards.filter(c => c.savedTitle === 'Markdown')
      .map(c => ({ uuid: c.card.uuid, title: c.savedTitle, isOpen: c.isOpen }));
    this.onMarkdownChanged?.(list);
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

  private overlaps(
    ax: number, ay: number, aw: number, ah: number,
    bx: number, by: number, bw: number, bh: number
  ): boolean {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  private moveToNonOverlapping(cs: CardState): void {
    const others = this.cards.filter(c => c !== cs && c.isOpen);
    if (others.length === 0) return;

    const step = 28;
    if (!others.some(o =>
      this.overlaps(cs.worldX, cs.worldY, cs.savedWidth, cs.savedHeight, o.worldX, o.worldY, o.savedWidth, o.savedHeight)
    )) return;

    for (let offset = step; offset < 10000; offset += step) {
      const candidates = [
        [offset, 0], [-offset, 0], [0, offset], [0, -offset],
        [offset, offset], [-offset, offset], [offset, -offset], [-offset, -offset],
      ];
      for (const [dx, dy] of candidates) {
        const nx = this.clampWorld(this.snap(cs.worldX + dx));
        const ny = this.clampWorld(this.snap(cs.worldY + dy));
        if (!others.some(o =>
          this.overlaps(nx, ny, cs.savedWidth, cs.savedHeight, o.worldX, o.worldY, o.savedWidth, o.savedHeight)
        )) {
          cs.worldX = nx;
          cs.worldY = ny;
          cs.savedWX = nx;
          cs.savedWY = ny;
          this.positionCard(cs);
          return;
        }
      }
    }
  }

  private fitViewport(cs: CardState): void {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    cs.savedWidth = w;
    cs.savedHeight = h;
    cs.card.opts.width = w;
    cs.card.opts.height = h;
    cs.card.el.style.width = `${w}px`;
    cs.card.el.style.height = `${h}px`;
    cs.onCardResize?.();

    if (this._locked) {
      this.moveToNonOverlapping(cs);
      const targetX = w / 2 - (cs.worldX + cs.savedWidth / 2) * this.scale;
      const targetY = h / 2 - (cs.worldY + cs.savedHeight / 2) * this.scale;
      this.animatePan(targetX, targetY);
      this.onStateChange?.();
      return;
    }

    // Arrange open cards in a grid (replicating autoArrange without fitAll)
    const open = this.cards.filter(c => c.isOpen);
    if (open.length > 1) {
      const gap = 28;
      const pos: { cs: CardState; rx: number; ry: number }[] = [];
      let rx = 0, ry = 0, rowH = 0;
      for (const c of open) {
        pos.push({ cs: c, rx, ry });
        rx += c.savedWidth + gap;
        rowH = Math.max(rowH, c.savedHeight);
        if (rx > 1400) { rx = 0; ry += rowH + gap; rowH = 0; }
      }
      let maxX = 0, maxY = 0;
      for (const p of pos) { maxX = Math.max(maxX, p.rx + p.cs.savedWidth); maxY = Math.max(maxY, p.ry + p.cs.savedHeight); }
      const ox = this.snap(-Math.round(maxX / 2));
      const oy = this.snap(-Math.round(maxY / 2));
      for (const p of pos) {
        p.cs.worldX = p.rx + ox;
        p.cs.worldY = p.ry + oy;
        p.cs.savedWX = p.cs.worldX;
        p.cs.savedWY = p.cs.worldY;
      }
    }
    this.scale = 1;
    const targetX = w / 2 - (cs.worldX + cs.savedWidth / 2);
    const targetY = h / 2 - (cs.worldY + cs.savedHeight / 2);
    this.animatePan(targetX, targetY);
    this.onStateChange?.();
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
      applyGridToElement(this.el, this.gridStyle, this.patternDataURL, this.patternSize, this.scale, this.panX, this.panY);
      for (const cs of this.cards) cs.card.renderTitle();
      const half = this.patternSize / 2;
      this.originDot.style.left = `${this.panX - 3}px`;
      this.originDot.style.top = `${this.panY - 3}px`;
      this.originDot.style.transform = `scale(${this.scale})`;

      this.statusBar.update(this._locked, this.scale, this.workspaceName, this.onLockToggle, () => this.fitAll(), () => { this.scale = 1; this.scheduleTransform(); });
      this.onStateChange?.();
    });
  }

  private initZoomPan(): void {
    // Canvas wheel zoom (only when over empty canvas area, not over cards)
    this.el.addEventListener('wheel', (e) => {
      if (this.locked || e.ctrlKey) return;
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
      if (!this.isPanning) return;
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

    const cw = this.el.clientWidth;
    const ch = this.el.clientHeight;

    if (this.locked) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      this.animatePan(cw / 2 - cx * this.scale, ch / 2 - cy * this.scale);
      return;
    }

    const worldW = maxX - minX;
    const worldH = maxY - minY;
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

    if (this.locked) {
      // Center on card without changing zoom
      const targetX = cw / 2 - (cs.worldX + cs.savedWidth / 2) * this.scale;
      const targetY = ch / 2 - (cs.worldY + cs.savedHeight / 2) * this.scale;
      this.animatePan(targetX, targetY);
      return;
    }

    const margin = 80;
    const fitX = (cw - margin) / cs.savedWidth;
    const fitY = (ch - margin) / cs.savedHeight;
    const targetScale = Math.min(fitX, fitY, 1);
    this.scale = Math.max(0.1, targetScale);

    const targetX = cw / 2 - (cs.worldX + cs.savedWidth / 2) * this.scale;
    const targetY = ch / 2 - (cs.worldY + cs.savedHeight / 2) * this.scale;
    this.animatePan(targetX, targetY);
  }


}

