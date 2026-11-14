export interface ContextMenuItem {
  label?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export class ContextMenu {
  private el: HTMLDivElement;
  private static openMenus: ContextMenu[] = [];

  constructor(items: ContextMenuItem[], x: number, y: number) {
    // Close any existing context menus first
    for (const m of ContextMenu.openMenus) m.remove();
    ContextMenu.openMenus.length = 0;

    this.el = document.createElement('div');
    this.el.className = 'ctx-menu';
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
    this.el.setAttribute('role', 'menu');

    let firstItem: HTMLDivElement | null = null;
    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        sep.setAttribute('role', 'separator');
        this.el.appendChild(sep);
        continue;
      }
      const el = document.createElement('div');
      el.className = 'ctx-item' + (item.disabled ? ' ctx-disabled' : '');
      el.textContent = item.label ?? '';
      el.setAttribute('role', 'menuitem');
      if (!item.disabled) {
        el.tabIndex = 0;
        el.addEventListener('click', () => { item.action?.(); this.remove(); });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
        });
        firstItem ??= el;
      } else {
        el.setAttribute('aria-disabled', 'true');
      }
      this.el.appendChild(el);
    }

    document.body.appendChild(this.el);
    ContextMenu.openMenus.push(this);
    // Keep the menu inside the viewport. A right-click near the right or bottom
    // edge used to render it partly off-screen, with no way to reach the
    // clipped items.
    const box = this.el.getBoundingClientRect();
    const pad = 4;
    if (box.right > window.innerWidth - pad) {
      this.el.style.left = Math.max(pad, window.innerWidth - box.width - pad) + 'px';
    }
    if (box.bottom > window.innerHeight - pad) {
      this.el.style.top = Math.max(pad, window.innerHeight - box.height - pad) + 'px';
    }
    firstItem?.focus();
    document.addEventListener('keydown', this.onKeydown);
    setTimeout(() => document.addEventListener('click', this.outsideClick), 0);
  }

  private outsideClick = (): void => { this.remove(); };
  private onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { this.remove(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const items = Array.from(this.el.querySelectorAll<HTMLElement>('.ctx-item:not(.ctx-disabled)'));
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    let next = 0;
    if (e.key === 'ArrowDown') next = idx < 0 ? 0 : (idx + 1) % items.length;
    else if (e.key === 'ArrowUp') next = idx <= 0 ? items.length - 1 : idx - 1;
    else if (e.key === 'End') next = items.length - 1;
    items[next].focus();
  };

  onClose: (() => void) | null = null;

  remove(): void {
    document.removeEventListener('click', this.outsideClick);
    document.removeEventListener('keydown', this.onKeydown);
    const idx = ContextMenu.openMenus.indexOf(this);
    if (idx !== -1) ContextMenu.openMenus.splice(idx, 1);
    this.el.remove();
    this.onClose?.();
  }
}
