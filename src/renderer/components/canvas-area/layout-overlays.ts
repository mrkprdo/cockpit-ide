import type { Viewport } from './viewport';
import type { CardState } from './types';

export interface LayoutOverlaysHost {
  getCards(): CardState[];
  getLocked(): boolean;
  getOverlayLeft(): number;
  getOnStateChange(): (() => void) | null;
  positionCard(cs: CardState): void;
  fitAll(): void;
  getTileW(): string;
  getTileH(): string;
}

export class LayoutOverlays {
  readonly layoutOverlays: HTMLElement[] = [];
  lastDragX = 0;
  lastDragY = 0;

  constructor(private el: HTMLElement, private viewport: Viewport, private host: LayoutOverlaysHost) {
    this.createLayoutOverlays();
  }

  setDragPos(clientX: number, clientY: number): void {
    this.lastDragX = clientX;
    this.lastDragY = clientY;
  }

  /** FLIP: record where cards were, let `fn` move them (left/top written straight
   *  away), then offset them back with a transform and release it next frame so
   *  the browser interpolates transform only — no per-frame relayout.
   *  The previous version added the class and removed it on the next rAF, which
   *  cancelled the transition before it ever painted. */
  private animateArrange(cards: CardState[], fn: () => void): void {
    const before = cards.map(cs => ({ cs, x: cs.worldX, y: cs.worldY }));
    fn();
    const moved = before.filter(b => b.x !== b.cs.worldX || b.y !== b.cs.worldY);
    for (const b of moved) {
      b.cs.card.el.style.transform = `translate3d(${b.x - b.cs.worldX}px, ${b.y - b.cs.worldY}px, 0)`;
    }
    requestAnimationFrame(() => {
      for (const b of moved) {
        b.cs.card.el.classList.add('card-arranging');
        b.cs.card.el.style.transform = '';
      }
      window.setTimeout(() => {
        for (const b of moved) b.cs.card.el.classList.remove('card-arranging');
      }, 260);
    });
  }

  autoArrange(): void {
    const open = this.host.getCards().filter(c => c.isOpen);
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
      const ox = this.viewport.snap(-Math.round(maxX / 2));
      const oy = this.viewport.snap(-Math.round(maxY / 2));
      for (const p of pos) {
        p.cs.worldX = p.rx + ox;
        p.cs.worldY = p.ry + oy;
        p.cs.savedWX = p.cs.worldX;
        p.cs.savedWY = p.cs.worldY;
        this.host.positionCard(p.cs);
      }
      this.host.getOnStateChange()?.();
    });
    this.host.fitAll();
  }

  tileWindows(): void {
    const open = this.host.getCards().filter(c => c.isOpen);
    if (open.length === 0) return;

    this.animateArrange(open, () => {
      const gap = 28;

      let cellW: number, cellH: number;
      let cols: number, rows: number;
      const pw = Math.min(2000, parseInt(this.host.getTileW()) * 28);
      const ph = Math.min(2000, parseInt(this.host.getTileH()) * 28);
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
      const ox = this.viewport.snap(-Math.round(totalW / 2));
      const oy = this.viewport.snap(-Math.round(totalH / 2));

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
          this.host.positionCard(cs);
          cs.terminalWindow?.fit();
          idx++;
        }
      }
      this.host.getOnStateChange()?.();
    });
    this.host.fitAll();
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

  showLayoutOverlays(): void {
    if (!this.host.getLocked() || this.viewport.scale !== 1) return;
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

  hideLayoutOverlays(): void {
    for (const el of this.layoutOverlays) {
      el.style.display = 'none';
    }
  }

  getDropZone(clientX: number, clientY: number): string | null {
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

  applyDropZone(zone: string, cs: CardState): void {
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
        worldX = snap(-this.viewport.panX); worldY = snap(-this.viewport.panY); w = W2; h = H2; break;
      case 'top':
        worldX = snap(-this.viewport.panX); worldY = snap(-this.viewport.panY); w = W; h = H2; break;
      case 'top-right':
        worldX = snap(-this.viewport.panX + W2); worldY = snap(-this.viewport.panY); w = W2; h = H2; break;
      case 'left':
        worldX = snap(-this.viewport.panX); worldY = snap(-this.viewport.panY); w = W2; h = H; break;
      case 'right':
        worldX = snap(-this.viewport.panX + W2); worldY = snap(-this.viewport.panY); w = W2; h = H; break;
      case 'bottom-left':
        worldX = snap(-this.viewport.panX); worldY = snap(-this.viewport.panY + H2); w = W2; h = H2; break;
      case 'bottom':
        worldX = snap(-this.viewport.panX); worldY = snap(-this.viewport.panY + H2); w = W; h = H2; break;
      case 'bottom-right':
        worldX = snap(-this.viewport.panX + W2); worldY = snap(-this.viewport.panY + H2); w = W2; h = H2; break;
    }
    w = Math.max(28 * 10, w);
    h = Math.max(28 * 10, h);
    cs.worldX = this.viewport.clampWorld(worldX, 'x');
    cs.worldY = this.viewport.clampWorld(worldY, 'y');
    cs.savedWidth = w;
    cs.savedHeight = h;
    cs.savedWX = cs.worldX;
    cs.savedWY = cs.worldY;
    cs.card.opts.width = w;
    cs.card.opts.height = h;
    cs.card.el.style.width = `${w}px`;
    cs.card.el.style.height = `${h}px`;
    this.host.positionCard(cs);
    cs.onCardResize?.();
    this.host.getOnStateChange()?.();
  }

  private overlaps(
    ax: number, ay: number, aw: number, ah: number,
    bx: number, by: number, bw: number, bh: number
  ): boolean {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  moveToNonOverlapping(cs: CardState): void {
    const others = this.host.getCards().filter(c => c !== cs && c.isOpen);
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
        const nx = this.viewport.clampWorld(this.viewport.snap(cs.worldX + dx), 'x');
        const ny = this.viewport.clampWorld(this.viewport.snap(cs.worldY + dy), 'y');
        if (!others.some(o =>
          this.overlaps(nx, ny, cs.savedWidth, cs.savedHeight, o.worldX, o.worldY, o.savedWidth, o.savedHeight)
        )) {
          cs.worldX = nx;
          cs.worldY = ny;
          cs.savedWX = nx;
          cs.savedWY = ny;
          this.host.positionCard(cs);
          return;
        }
      }
    }
  }
}
