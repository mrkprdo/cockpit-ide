interface CardDef {
  id: string;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class PluginCard {
  private el: HTMLDivElement;
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private startX = 0;
  private startY = 0;

  constructor(private parent: HTMLElement, private def: CardDef, private getScale: () => number) {
    this.el = document.createElement('div');
    this.el.className = 'plugin-card';
    this.el.style.left = `${def.x}px`;
    this.el.style.top = `${def.y}px`;
    this.el.style.width = `${def.w}px`;
    this.el.style.height = `${def.h}px`;

    this.el.innerHTML = `
      <div class="plugin-card-header">
        <div class="plugin-card-title">${def.title}</div>
        <div class="plugin-card-subtitle">${def.subtitle}</div>
      </div>
      <div class="plugin-card-content">⏣</div>
    `;

    this.initDrag();
    this.parent.appendChild(this.el);
  }

  private initDrag(): void {
    const header = this.el.querySelector('.plugin-card-header') as HTMLElement;
    header.style.cursor = 'grab';

    header.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      this.isDragging = true;
      header.style.cursor = 'grabbing';
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
        header.style.cursor = 'grab';
        this.el.style.transition = '';
      }
    });
  }
}
