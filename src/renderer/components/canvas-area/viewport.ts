import type { WindowCard } from '../WindowCard';
import type { StatusBar } from '../canvas-statusbar';
import { applyViewTransform } from '../canvas-grid';
import type { CardState } from './types';

export const WORLD_BOUNDS_X = 4000; // 8000 px wide
export const WORLD_BOUNDS_Y = 2250; // 4500 px tall (16:9)

export interface ViewportHost {
  getOverlayLeft(): number;
  getLocked(): boolean;
  getWorkspaceName(): string;
  isPanning(): boolean;
  getOnStateChange(): (() => void) | null;
  getOnLockToggle(): (() => void) | null;
  getStatusBar(): StatusBar;
  getCards(): CardState[];
  onRepositionAll(): void;
  bringToFront(card: WindowCard): void;
  moveToNonOverlapping(cs: CardState): void;
  positionCard(cs: CardState): void;
  animatePan(targetX: number, targetY: number, duration?: number): void;
}

export class Viewport {
  scale = 1;
  panX = 0;
  panY = 0;

  private patternSize = 28;
  private rafId = 0;
  private panAnimId = 0;
  private navIdleTimer = 0;
  private navigating = false;
  private flushChrome = false;

  constructor(private el: HTMLElement, private worldEl: HTMLDivElement, private host: ViewportHost) {}

  clampWorld(v: number, axis: 'x' | 'y'): number {
    const bound = axis === 'x' ? WORLD_BOUNDS_X : WORLD_BOUNDS_Y;
    return Math.max(-bound, Math.min(bound, Math.round(v)));
  }

  clampScale(cw: number, ch: number): void {
    const min = Math.max(cw / (WORLD_BOUNDS_X * 2), ch / (WORLD_BOUNDS_Y * 2));
    this.scale = Math.max(min, Math.min(5, this.scale));
  }

  clampView(cw: number, ch: number): void {
    const boundX = WORLD_BOUNDS_X * this.scale;
    const boundY = WORLD_BOUNDS_Y * this.scale;
    // Keep the viewport inside the canvas bounds. The allowed pan range is the
    // interval between the near edge (bound) and far edge (viewport - bound).
    // When the canvas is smaller than the viewport those values are inverted,
    // so we take the min/max to always get the valid range.
    this.panX = Math.max(Math.min(boundX, cw - boundX), Math.min(Math.max(boundX, cw - boundX), this.panX));
    this.panY = Math.max(Math.min(boundY, ch - boundY), Math.min(Math.max(boundY, ch - boundY), this.panY));
  }

  snap(v: number): number {
    return Math.round(v / this.patternSize) * this.patternSize;
  }

  snapSize(v: number): number {
    return Math.max(this.patternSize, Math.round(v / this.patternSize) * this.patternSize);
  }

  applyWorldTransform(): void {
    applyViewTransform(this.worldEl, this.scale, this.panX, this.panY);
  }

  beginNavigating(): void {
    if (!this.navigating) {
      this.navigating = true;
      this.worldEl.classList.add('is-navigating');
      document.body.classList.add('canvas-busy');
    }
    if (this.navIdleTimer) clearTimeout(this.navIdleTimer);
    this.navIdleTimer = window.setTimeout(() => this.endNavigating(), 120);
  }

  endNavigating(): void {
    if (this.navIdleTimer) {
      clearTimeout(this.navIdleTimer);
      this.navIdleTimer = 0;
    }
    // Keep cheap frames while the mouse button is still down for pan.
    if (this.host.isPanning()) return;
    if (!this.navigating) {
      this.scheduleTransform(true);
      return;
    }
    this.navigating = false;
    this.worldEl.classList.remove('is-navigating');
    document.body.classList.remove('canvas-busy');
    this.scheduleTransform(true);
  }

  animatePan(targetX: number, targetY: number, duration = 300): void {
    const id = ++this.panAnimId;
    const startX = this.panX;
    const startY = this.panY;
    const startTime = performance.now();
    this.beginNavigating();
    const animate = (now: number) => {
      if (id !== this.panAnimId) return;
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.panX = startX + (targetX - startX) * ease;
      this.panY = startY + (targetY - startY) * ease;
      if (t < 1) {
        this.beginNavigating();
        this.scheduleTransform();
        requestAnimationFrame(animate);
      } else {
        this.endNavigating();
      }
    };
    requestAnimationFrame(animate);
  }

  snapOrigin(): void {
    this.panX = Math.round(this.panX / this.patternSize) * this.patternSize;
    this.panY = Math.round(this.panY / this.patternSize) * this.patternSize;
    this.scheduleTransform();
  }

  centerView(): void {
    const avW = this.el.clientWidth - this.host.getOverlayLeft();
    this.panX = this.host.getOverlayLeft() + avW / 2;
    this.panY = this.el.clientHeight / 2;
    this.scheduleTransform();
  }

  zoomIn(): void {
    this.scale = Math.min(5, this.scale * 1.3);
    this.scheduleTransform();
  }

  zoomOut(): void {
    this.scale = Math.max(this.el.clientWidth / (WORLD_BOUNDS_X * 2), this.el.clientHeight / (WORLD_BOUNDS_Y * 2), this.scale / 1.3);
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
    const cw = this.el.clientWidth;
    const ch = this.el.clientHeight;
    this.clampScale(cw, ch);
    this.clampView(cw, ch);
    this.scheduleTransform();
  }

  setViewAnimated(panX: number, panY: number, zoom?: number): void {
    if (zoom !== undefined) this.scale = Math.max(this.el.clientWidth / (WORLD_BOUNDS_X * 2), this.el.clientHeight / (WORLD_BOUNDS_Y * 2), Math.min(5, zoom));
    this.host.animatePan(panX, panY);
  }

  refresh(): void { this.scheduleTransform(true); }

  destroy(): void {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
    if (this.navIdleTimer) { clearTimeout(this.navIdleTimer); this.navIdleTimer = 0; }
    if (this.navigating) { this.navigating = false; document.body.classList.remove('canvas-busy'); }
  }

  scheduleTransform(flushChrome = false): void {
    if (flushChrome) this.flushChrome = true;
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      const cw = this.el.clientWidth;
      const ch = this.el.clientHeight;
      this.clampScale(cw, ch);
      this.clampView(cw, ch);
      this.applyWorldTransform();
      const chrome = this.flushChrome || !this.navigating;
      this.flushChrome = false;
      if (chrome) {
        this.host.getStatusBar().update(this.host.getLocked(), this.scale, this.host.getWorkspaceName(), this.host.getOnLockToggle(), () => this.fitAll(), () => { this.scale = 1; this.scheduleTransform(true); });
        this.host.getOnStateChange()?.();
      }
    });
  }

  fitAll(): void {
    const open = this.host.getCards().filter(c => c.isOpen);
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
    const avW = cw - this.host.getOverlayLeft();
    const avCX = this.host.getOverlayLeft() + avW / 2;

    if (this.host.getLocked()) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      this.host.animatePan(avCX - cx * this.scale, ch / 2 - cy * this.scale);
      return;
    }

    const worldW = maxX - minX;
    const worldH = maxY - minY;
    const margin = 80;
    const fitX = (avW - margin) / worldW;
    const fitY = (ch - margin) / worldH;
    this.scale = Math.max(this.el.clientWidth / (WORLD_BOUNDS_X * 2), this.el.clientHeight / (WORLD_BOUNDS_Y * 2), Math.min(fitX, fitY, 1));

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.host.animatePan(avCX - cx * this.scale, ch / 2 - cy * this.scale);
  }

  fitViewport(cs: CardState): void {
    const cw = this.el.clientWidth;
    const h = this.el.clientHeight;
    const avW = cw - this.host.getOverlayLeft();
    const avCX = this.host.getOverlayLeft() + avW / 2;

    cs.savedWidth = avW;
    cs.savedHeight = h;
    cs.card.opts.width = avW;
    cs.card.opts.height = h;
    cs.card.el.style.width = `${avW}px`;
    cs.card.el.style.height = `${h}px`;
    cs.onCardResize?.();

    if (this.host.getLocked()) {
      this.host.moveToNonOverlapping(cs);
      const targetX = avCX - (cs.worldX + cs.savedWidth / 2) * this.scale;
      const targetY = h / 2 - (cs.worldY + cs.savedHeight / 2) * this.scale;
      this.host.animatePan(targetX, targetY);
      this.host.getOnStateChange()?.();
      return;
    }

    // Arrange open cards in a grid (replicating autoArrange without fitAll)
    const open = this.host.getCards().filter(c => c.isOpen);
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
        this.host.positionCard(p.cs);
      }
    }
    this.scale = 1;
    const targetX = avCX - (cs.worldX + cs.savedWidth / 2);
    const targetY = h / 2 - (cs.worldY + cs.savedHeight / 2);
    this.host.animatePan(targetX, targetY);
    this.host.getOnStateChange()?.();
  }

  panToCard(cs: CardState): void {
    const cw = this.el.clientWidth;
    const ch = this.el.clientHeight;
    const avW = cw - this.host.getOverlayLeft();
    const avCX = this.host.getOverlayLeft() + avW / 2;

    if (this.host.getLocked()) {
      const targetX = avCX - (cs.worldX + cs.savedWidth / 2) * this.scale;
      const targetY = ch / 2 - (cs.worldY + cs.savedHeight / 2) * this.scale;
      this.host.animatePan(targetX, targetY);
      return;
    }

    const margin = 80;
    const fitX = (avW - margin) / cs.savedWidth;
    const fitY = (ch - margin) / cs.savedHeight;
    const targetScale = Math.min(fitX, fitY, 1);
    this.scale = Math.max(this.el.clientWidth / (WORLD_BOUNDS_X * 2), this.el.clientHeight / (WORLD_BOUNDS_Y * 2), targetScale);

    const targetX = avCX - (cs.worldX + cs.savedWidth / 2) * this.scale;
    const targetY = ch / 2 - (cs.worldY + cs.savedHeight / 2) * this.scale;
    this.host.animatePan(targetX, targetY);
  }

  snapToCorner(cs: CardState): void {
    const targetX = -cs.worldX * this.scale;
    const targetY = -cs.worldY * this.scale;
    this.host.animatePan(targetX, targetY);
  }

  fitCardToViewport(title: string): boolean {
    const cs = this.host.getCards().find(c => c.savedTitle === title && c.isOpen);
    if (!cs) return false;
    this.fitViewport(cs);
    this.host.bringToFront(cs.card);
    cs.card.el.focus();
    return true;
  }
}
