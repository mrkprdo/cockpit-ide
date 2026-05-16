export type GridStyle = 'none' | 'dots' | 'grid';
export type SaveState = { plugins: { title: string; x: number; y: number; width: number; height: number }[]; zoom: number; panX: number; panY: number };

import { PluginCard } from './PluginCard';
import { TextRenderer } from './TextRenderer';

interface CardState {
  card: PluginCard;
  worldX: number;
  worldY: number;
}

export class CanvasArea {
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
  workspaceName = 'no workspace';

  constructor(private el: HTMLElement) {
    this.originDot = document.createElement('div');
    this.originDot.style.cssText = 'position:absolute;width:6px;height:6px;border-radius:50%;border:1px solid #FF1744;background:transparent;z-index:5;pointer-events:none;transform:translate(-50%,-50%)';
    this.el.appendChild(this.originDot);
    this.generatePattern();
    this.applyGrid();
    this.initZoomPan();
    this.updateStatusBar();

    requestAnimationFrame(() => {
      this.panX = this.el.clientWidth / 2;
      this.panY = this.el.clientHeight / 2;
      this.scheduleTransform();
    });
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
        const i = this.cards.findIndex(c => c.card === card);
        if (i !== -1) this.cards.splice(i, 1);
      },
      onDragEnd: (worldX: number, worldY: number) => {
        const cs = this.cards.find(c => c.card === card);
        if (cs) { cs.worldX = worldX; cs.worldY = worldY; }
      },
    }, () => ({ scale: this.scale, panX: this.panX, panY: this.panY }));
    const cs: CardState = { card, worldX: sx, worldY: sy };
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
    return {
      plugins: this.cards.map(c => ({ title: c.card.opts.title, x: c.worldX, y: c.worldY, width: c.card.opts.width, height: c.card.opts.height })),
      zoom: this.scale, panX: this.panX, panY: this.panY,
    };
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

  private updateStatusBar(): void {
    const sb = document.getElementById('statusbar');
    if (!sb) return;

    const col = getComputedStyle(document.documentElement).getPropertyValue('--tertiary').trim();
    const font = '400 10px "Space Mono", "Courier New", monospace';

    const zoomText = `Zoom: ${Math.round(this.scale * 100)}%`;
    const panText = `Pan: (${Math.round(this.panX)}, ${Math.round(this.panY)})`;

    const c1 = TextRenderer.createCanvas(zoomText, 140, 20, { font, color: col, lineHeight: 18 });
    const c2 = TextRenderer.createCanvas(panText, 200, 20, { font, color: col, lineHeight: 18 });
    const c3 = TextRenderer.createCanvas(this.workspaceName, 200, 20, { font, color: col, lineHeight: 18 });

    c1.style.cssText = 'height:20px;flex-shrink:0';
    c2.style.cssText = 'height:20px;flex-shrink:0';
    c3.style.cssText = 'height:20px;flex-shrink:0';

    sb.innerHTML = '';
    sb.appendChild(c1);
    const sep1 = document.createElement('span'); sep1.className = 'status-sep'; sb.appendChild(sep1);
    sb.appendChild(c2);
    const sep2 = document.createElement('span'); sep2.className = 'status-sep'; sb.appendChild(sep2);
    sb.appendChild(c3);
    const fill = document.createElement('span'); fill.style.cssText = 'flex:1'; sb.appendChild(fill);
  }
}
