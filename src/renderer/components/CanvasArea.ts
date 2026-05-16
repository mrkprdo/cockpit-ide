export type GridStyle = 'none' | 'dots' | 'grid';

import { PluginCard } from './PluginCard';

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

  constructor(private el: HTMLElement) {
    this.generatePattern();
    this.applyGrid();
    this.initZoomPan();
    this.updateStatusBar();

    this.addCard('TERMINAL', 'shell', 80, 80, 480, 320);
  }

  setGridStyle(style: GridStyle): void {
    this.gridStyle = style;
    this.generatePattern();
    this.applyGrid();
  }

  private addCard(title: string, subtitle: string, x: number, y: number, w: number, h: number): void {
    const card = new PluginCard(this.el, { title, subtitle, x: 0, y: 0, width: w, height: h, onClose: () => {
      const i = this.cards.findIndex(c => c.card === card);
      if (i !== -1) this.cards.splice(i, 1);
    }}, () => this.scale);
    this.cards.push({ card, worldX: x, worldY: y });
    this.positionCard(this.cards[this.cards.length - 1]);
  }

  private positionCard(cs: CardState): void {
    cs.card.el.style.left = `${cs.worldX * this.scale + this.panX}px`;
    cs.card.el.style.top = `${cs.worldY * this.scale + this.panY}px`;
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
  }

  private scheduleTransform(): void {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.repositionAllCards();
      this.applyGrid();
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
    sb.innerHTML = `
      <span class="status-item">Zoom: ${Math.round(this.scale * 100)}%</span>
      <span class="status-sep"></span>
      <span class="status-item">Pan: (${Math.round(this.panX)}, ${Math.round(this.panY)})</span>
      <span class="status-sep"></span>
      <span class="status-item">COCKPIT IDE v1.0</span>
      <span style="flex:1"></span>
    `;
  }
}
