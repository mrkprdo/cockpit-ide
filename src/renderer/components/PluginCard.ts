import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';
import { TextRenderer } from './TextRenderer';

export interface CardOptions {
  onDestroy?: () => void;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  onDragEnd?: (worldX: number, worldY: number) => void;
  onResizeEnd?: (width: number, height: number) => void;
  onFocus?: () => void;
  onHeaderContextMenu?: (e: MouseEvent) => void;
  onMinimize?: () => void;
  onFitViewport?: () => void;
  onTerminate?: () => void;
}

const SNAP = 28;

export class PluginCard {
  readonly el: HTMLDivElement;
  readonly opts: CardOptions;
  readonly uuid: string;
  onDestroy: (() => void) | null = null;
  private header: HTMLElement;
  private body: HTMLElement;
  private headerCanvas: HTMLCanvasElement;
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private startWorldX = 0;
  private startWorldY = 0;
  private startPanX = 0;
  private startPanY = 0;

  constructor(private parent: HTMLElement, opts: CardOptions, private getTransform: () => { scale: number; panX: number; panY: number }) {
    this.opts = opts;
    this.uuid = crypto.randomUUID();
    this.el = document.createElement('div');
    this.el.className = 'card';

    this.el.innerHTML = `
      <div class="card-header">
        <div class="card-title-area">
          <canvas class="card-title-canvas" height="28"></canvas>
        </div>
        <div class="card-controls">
          <button class="card-btn card-btn-minimize" title="Minimize">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <line x1="2" y1="8" x2="14" y2="8"/>
            </svg>
          </button>
          <button class="card-btn card-btn-fitview" title="Fit Viewport">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M2 5V3a1 1 0 0 1 1-1h2M2 11v2a1 1 0 0 0 1 1h2M14 5V3a1 1 0 0 0-1-1h-2M14 11v2a1 1 0 0 1-1 1h-2"/>
            </svg>
          </button>
          <button class="card-btn card-btn-terminate" title="Terminate">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <line x1="4" y1="4" x2="12" y2="12"/>
              <line x1="12" y1="4" x2="4" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="card-body"></div>
      <div class="card-edge card-edge-e"></div>
      <div class="card-edge card-edge-s"></div>
      <div class="card-edge card-edge-se"></div>
    `;

    this.el.style.left = `${opts.x}px`;
    this.el.style.top = `${opts.y}px`;
    this.el.style.width = `${opts.width}px`;
    this.el.style.height = `${opts.height}px`;

    this.header = this.el.querySelector('.card-header')!;
    this.body = this.el.querySelector('.card-body')!;
    this.headerCanvas = this.el.querySelector('.card-title-canvas')!;

    this.renderTitle();
    this.renderBody();
    this.initDrag();
    this.initResize();

    this.header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.opts.onHeaderContextMenu?.(e);
    });

    for (const btn of ['.card-btn-minimize', '.card-btn-fitview', '.card-btn-terminate']) {
      this.el.querySelector(btn)?.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
    }
    this.el.querySelector('.card-btn-minimize')?.addEventListener('click', () => {
      this.opts.onMinimize?.();
    });
    this.el.querySelector('.card-btn-fitview')?.addEventListener('click', () => {
      this.opts.onFitViewport?.();
    });
    this.el.querySelector('.card-btn-terminate')?.addEventListener('click', () => {
      this.opts.onTerminate?.();
    });

    this.el.addEventListener('mousedown', () => this.opts.onFocus?.(), true);

    parent.appendChild(this.el);
  }

  renderTitle(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.opts.width - 100;
    const h = 18;
    this.headerCanvas.width = w * dpr;
    this.headerCanvas.height = h * dpr;
    this.headerCanvas.style.width = `${w}px`;
    this.headerCanvas.style.height = `${h}px`;

    const ctx = this.headerCanvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const font = '700 13px "Space Mono", "Courier New", monospace';
    const prepared = prepareWithSegments(this.opts.title, font);
    const { lines } = layoutWithLines(prepared, w, 18);

    ctx.font = font;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    ctx.textBaseline = 'middle';
    const y = h / 2;

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i].text, 0, y + (i - (lines.length - 1) / 2) * 18);
    }
  }

  private renderBody(): void {
  }

  setContent(html: string): void {
    this.body.innerHTML = '';
    const canvas = TextRenderer.createCanvas(html, this.opts.width - 40, this.opts.height - 70, {
      font: '400 13px "Space Mono", "Courier New", monospace',
      color: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
      lineHeight: 20,
    });
    this.body.appendChild(canvas);
  }

  private snap(v: number): number {
    return Math.round(v / SNAP) * SNAP;
  }

  private initDrag(): void {
    this.header.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('.card-controls')) return;
      e.stopPropagation();
      this.isDragging = true;
      this.dragOffsetX = e.clientX;
      this.dragOffsetY = e.clientY;
      const t = this.getTransform();
      this.startWorldX = (this.el.offsetLeft - t.panX) / t.scale;
      this.startWorldY = (this.el.offsetTop - t.panY) / t.scale;
      this.startPanX = t.panX;
      this.startPanY = t.panY;
      this.el.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const t = this.getTransform();
      const worldRawX = this.startWorldX + (e.clientX - this.dragOffsetX - t.panX + this.startPanX) / t.scale;
      const worldRawY = this.startWorldY + (e.clientY - this.dragOffsetY - t.panY + this.startPanY) / t.scale;
      const snappedWorldX = Math.round(worldRawX / SNAP) * SNAP;
      const snappedWorldY = Math.round(worldRawY / SNAP) * SNAP;
      this.el.style.left = `${snappedWorldX * t.scale + t.panX}px`;
      this.el.style.top = `${snappedWorldY * t.scale + t.panY}px`;
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.el.style.transition = '';
        const t = this.getTransform();
        const left = parseFloat(this.el.style.left);
        const top = parseFloat(this.el.style.top);
        this.opts.onDragEnd?.(
          (left - t.panX) / t.scale,
          (top - t.panY) / t.scale,
        );
      }
    });
  }

  private initResize(): void {
    type Dir = 'e' | 's' | 'se';
    let dir: Dir = 'se';
    let resizing = false;
    let startW = 0, startH = 0, startX = 0, startY = 0;

    const handlers: Record<Dir, HTMLElement> = {
      e: this.el.querySelector('.card-edge-e')!,
      s: this.el.querySelector('.card-edge-s')!,
      se: this.el.querySelector('.card-edge-se')!,
    };

    for (const [d, h] of Object.entries(handlers)) {
      h.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        dir = d as Dir;
        resizing = true;
        startX = e.clientX;
        startY = e.clientY;
        const t = this.getTransform();
        startW = this.opts.width;
        startH = this.opts.height;
      });
    }

    document.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      const t = this.getTransform();
      const dw = (e.clientX - startX) / t.scale;
      const dh = (e.clientY - startY) / t.scale;
      let newW = this.opts.width;
      let newH = this.opts.height;
      if (dir === 'e' || dir === 'se') {
        newW = Math.max(SNAP * 10, Math.round((startW + dw) / SNAP) * SNAP);
      }
      if (dir === 's' || dir === 'se') {
        newH = Math.max(SNAP * 10, Math.round((startH + dh) / SNAP) * SNAP);
      }
      this.opts.width = newW;
      this.opts.height = newH;
      this.el.style.width = `${newW}px`;
      this.el.style.height = `${newH}px`;
    });

    document.addEventListener('mouseup', () => {
      if (resizing) {
        resizing = false;
        this.opts.onResizeEnd?.(this.opts.width, this.opts.height);
      }
    });
  }

  remove(): void {
    this.onDestroy?.();
    this.el.remove();
  }
}
