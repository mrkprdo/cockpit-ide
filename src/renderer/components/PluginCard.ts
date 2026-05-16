import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

export interface CardOptions {
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  onClose?: () => void;
}

export class PluginCard {
  readonly el: HTMLDivElement;
  readonly opts: CardOptions;
  private header: HTMLElement;
  private body: HTMLElement;
  private headerCanvas: HTMLCanvasElement;
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private startX = 0;
  private startY = 0;

  constructor(private parent: HTMLElement, opts: CardOptions, private getScale: () => number) {
    this.opts = opts;
    this.el = document.createElement('div');
    this.el.className = 'card';

    this.el.innerHTML = `
      <div class="card-header">
        <span class="card-dot"></span>
        <div class="card-title-area">
          <canvas class="card-title-canvas" height="28"></canvas>
        </div>
        <button class="card-close">✕</button>
      </div>
      <div class="card-body">${opts.content || '<span class="card-glyph">⏣</span>'}</div>
    `;

    this.el.style.left = `${opts.x}px`;
    this.el.style.top = `${opts.y}px`;
    this.el.style.width = `${opts.width}px`;
    this.el.style.height = `${opts.height}px`;

    this.header = this.el.querySelector('.card-header')!;
    this.body = this.el.querySelector('.card-body')!;
    this.headerCanvas = this.el.querySelector('.card-title-canvas')!;

    this.renderTitle();
    this.initDrag();

    this.el.querySelector('.card-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.remove();
      this.opts.onClose?.();
    });

    parent.appendChild(this.el);
  }

  private renderTitle(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.opts.width - 80;
    this.headerCanvas.width = w * dpr;
    this.headerCanvas.height = 28 * dpr;
    this.headerCanvas.style.width = `${w}px`;
    this.headerCanvas.style.height = '28px';

    const ctx = this.headerCanvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, 28);

    const font = '700 13px "Space Mono", "Courier New", monospace';
    const prepared = prepareWithSegments(this.opts.title, font);
    const { lines } = layoutWithLines(prepared, w, 18);

    ctx.font = font;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    ctx.textBaseline = 'top';

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i].text, 0, i * 18);
    }

    if (this.opts.subtitle) {
      const subFont = '400 9px "Space Mono", "Courier New", monospace';
      const subPrepared = prepareWithSegments(this.opts.subtitle, subFont);
      const { lines: subLines } = layoutWithLines(subPrepared, w, 14);

      ctx.font = subFont;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--tertiary').trim();
      for (let i = 0; i < subLines.length; i++) {
        ctx.fillText(subLines[i].text, 0, 18 + i * 14);
      }
    }
  }

  setContent(html: string): void {
    this.body.innerHTML = html;
  }

  private initDrag(): void {
    this.header.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      this.isDragging = true;
      this.dragOffsetX = e.clientX;
      this.dragOffsetY = e.clientY;
      this.startX = this.el.offsetLeft;
      this.startY = this.el.offsetTop;
      this.el.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const s = this.getScale();
      this.el.style.left = `${this.startX + (e.clientX - this.dragOffsetX) / s}px`;
      this.el.style.top = `${this.startY + (e.clientY - this.dragOffsetY) / s}px`;
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.el.style.transition = '';
      }
    });
  }

  remove(): void {
    this.el.remove();
  }
}
