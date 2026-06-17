export interface CardOptions {
  onDestroy?: () => void;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  onDragStart?: (clientX: number, clientY: number) => void;
  onDragMove?: (clientX: number, clientY: number) => void;
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
  private titleEl: HTMLElement;
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
          <div class="card-title-text"></div>
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
          <button class="card-btn card-btn-terminate" title="Close">
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
    this.titleEl = this.el.querySelector('.card-title-text')!;
    this.header.setAttribute('aria-label', opts.title);

    this.renderTitle();
    this.renderBody();
    this.initDrag();
    this.initResize();

    this.header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.opts.onHeaderContextMenu?.(e);
    });

    this.header.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.card-controls')) return;
      e.stopPropagation();
      this.opts.onFitViewport?.();
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
    if (this.titleEl.textContent !== this.opts.title) {
      this.titleEl.textContent = this.opts.title;
    }
  }

  private renderBody(): void {
  }

  setContent(html: string): void {
    this.body.innerHTML = '';
    const content = document.createElement('div');
    content.className = 'card-content-text';
    content.innerHTML = html;
    this.body.appendChild(content);
  }

  private snap(v: number): number {
    return Math.round(v / SNAP) * SNAP;
  }

  private dragHandlers: { mousemove: (e: MouseEvent) => void; mouseup: () => void } | null = null;

  private initDrag(): void {
    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging) return;
      const t = this.getTransform();
      const worldRawX = this.startWorldX + (e.clientX - this.dragOffsetX - t.panX + this.startPanX) / t.scale;
      const worldRawY = this.startWorldY + (e.clientY - this.dragOffsetY - t.panY + this.startPanY) / t.scale;
      const snappedWorldX = Math.round(worldRawX / SNAP) * SNAP;
      const snappedWorldY = Math.round(worldRawY / SNAP) * SNAP;
      this.el.style.left = `${snappedWorldX * t.scale + t.panX}px`;
      this.el.style.top = `${snappedWorldY * t.scale + t.panY}px`;
      this.opts.onDragMove?.(e.clientX, e.clientY);
    };

    const onMouseUp = () => {
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
    };

    this.dragHandlers = { mousemove: onMouseMove, mouseup: onMouseUp };

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
      this.opts.onDragStart?.(e.clientX, e.clientY);
    });

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  private resizeHandlers: { mousemove: (e: MouseEvent) => void; mouseup: () => void } | null = null;

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

    const onMouseMove = (e: MouseEvent) => {
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
    };

    const onMouseUp = () => {
      if (resizing) {
        resizing = false;
        this.opts.onResizeEnd?.(this.opts.width, this.opts.height);
      }
    };

    this.resizeHandlers = { mousemove: onMouseMove, mouseup: onMouseUp };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  remove(): void {
    if (this.dragHandlers) {
      document.removeEventListener('mousemove', this.dragHandlers.mousemove);
      document.removeEventListener('mouseup', this.dragHandlers.mouseup);
      this.dragHandlers = null;
    }
    if (this.resizeHandlers) {
      document.removeEventListener('mousemove', this.resizeHandlers.mousemove);
      document.removeEventListener('mouseup', this.resizeHandlers.mouseup);
      this.resizeHandlers = null;
    }
    this.onDestroy?.();
    this.el.remove();
  }
}
