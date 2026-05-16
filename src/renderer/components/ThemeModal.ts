import { theme } from '../theme';

const baseOptions = [
  { value: 'default', label: 'Default' },
  { value: 'monokai', label: 'Monokai' },
  { value: 'idol', label: 'Idol' },
];

const modeOptions = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

export class ThemeModal {
  private overlay: HTMLDivElement;
  private el: HTMLDivElement;
  private onCloseCb: (() => void) | null = null;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.style.display = 'none';

    this.el = document.createElement('div');
    this.el.className = 'modal';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'Theme');

    this.render();
    this.overlay.appendChild(this.el);
    document.body.appendChild(this.overlay);

    this.el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'theme-apply') this.apply();
      if (target.id === 'theme-cancel') this.close();
    });
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
  }

  private render(): void {
    this.el.innerHTML = `
      <div class="modal-header">THEME</div>
      <div class="modal-body">
        <div class="modal-section">
          <div class="modal-label">THEMES</div>
          ${baseOptions.map(o => `
            <label class="modal-radio">
              <input type="radio" name="theme-base" value="${o.value}" ${theme.base === o.value ? 'checked' : ''}>
              ${o.label}
            </label>
          `).join('')}
        </div>
        <div class="modal-section">
          <div class="modal-label">LIGHT / DARK</div>
          ${modeOptions.map(o => `
            <label class="modal-radio">
              <input type="radio" name="theme-mode" value="${o.value}" ${theme.mode === o.value ? 'checked' : ''}>
              ${o.label}
            </label>
          `).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn-ghost" id="theme-cancel">Cancel</button>
          <button class="btn-primary" id="theme-apply">Apply</button>
        </div>
      </div>
    `;
  }

  open(onClose?: () => void): void {
    this.render();
    this.onCloseCb = onClose ?? null;
    this.overlay.style.display = 'flex';
    this.escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this.escHandler);
  }

  private apply(): void {
    const base = (this.el.querySelector('input[name="theme-base"]:checked') as HTMLInputElement)?.value;
    const mode = (this.el.querySelector('input[name="theme-mode"]:checked') as HTMLInputElement)?.value;
    if (base && mode) {
      theme.setTheme(base, mode);
    }
    this.close();
  }

  private close(): void {
    this.overlay.style.display = 'none';
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }
    this.onCloseCb?.();
    this.onCloseCb = null;
  }
}
