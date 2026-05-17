export interface ContextMenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export class ContextMenu {
  private el: HTMLDivElement;

  constructor(items: ContextMenuItem[], x: number, y: number) {
    this.el = document.createElement('div');
    this.el.className = 'ctx-menu';
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        this.el.appendChild(sep);
        continue;
      }
      const el = document.createElement('div');
      el.className = 'ctx-item' + (item.disabled ? ' ctx-disabled' : '');
      el.textContent = item.label;
      if (!item.disabled) {
        el.addEventListener('click', () => { item.action(); this.remove(); });
      }
      this.el.appendChild(el);
    }

    document.body.appendChild(this.el);
    // Close on click outside
    setTimeout(() => document.addEventListener('click', this.outsideClick), 0);
  }

  private outsideClick = (): void => { this.remove(); };

  private remove(): void {
    document.removeEventListener('click', this.outsideClick);
    this.el.remove();
  }
}
