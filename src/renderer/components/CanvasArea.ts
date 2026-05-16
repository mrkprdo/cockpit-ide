export type GridStyle = 'none' | 'dots' | 'grid';

export class CanvasArea {
  private world: HTMLElement;
  private canvasBg: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;

  private scale = 1;
  private panX = 0;
  private panY = 0;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartPanX = 0;
  private panStartPanY = 0;
  private spaceDown = false;
  private rafId = 0;
  private gridStyle: GridStyle = 'dots';

  constructor(private el: HTMLElement) {
    this.world = document.createElement('div');
    this.world.className = 'canvas-world';
    this.el.appendChild(this.world);

    this.canvasBg = document.createElement('canvas');
    this.canvasBg.className = 'canvas-bg';
    this.canvasBg.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0';
    this.el.prepend(this.canvasBg);
    this.ctx = this.canvasBg.getContext('2d');

    this.initZoomPan();
    this.resizeCanvas();
    this.drawGrid();
    this.updateStatusBar();

    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.drawGrid();
    });
  }

  setGridStyle(style: GridStyle): void {
    this.gridStyle = style;
    this.drawGrid();
  }

  private resizeCanvas(): void {
    this.canvasBg.width = this.el.clientWidth * devicePixelRatio;
    this.canvasBg.height = this.el.clientHeight * devicePixelRatio;
    this.canvasBg.style.width = this.el.clientWidth + 'px';
    this.canvasBg.style.height = this.el.clientHeight + 'px';
    if (this.ctx) this.ctx.scale(devicePixelRatio, devicePixelRatio);
  }

  private drawGrid(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    ctx.clearRect(0, 0, w, h);

    if (this.gridStyle === 'none') return;

    const spacing = 28;
    const borderCol = 'var(--border)';

    if (this.gridStyle === 'dots') {
      ctx.fillStyle = borderCol;
      for (let x = spacing; x < w; x += spacing) {
        for (let y = spacing; y < h; y += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (this.gridStyle === 'grid') {
      ctx.strokeStyle = borderCol;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.3;
      for (let x = spacing; x < w; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = spacing; y < h; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  private scheduleTransform(): void {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.world.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
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
      if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
        e.preventDefault();
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

    document.addEventListener('mouseup', (e) => {
      if (e.button === 1 || e.button === 0) {
        this.isPanning = false;
        if (!this.spaceDown) this.el.style.cursor = '';
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        this.spaceDown = true;
        this.el.style.cursor = 'grab';
        e.preventDefault();
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        if (!this.isPanning) this.el.style.cursor = '';
      }
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
