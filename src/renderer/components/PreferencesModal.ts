import { GridStyle } from './CanvasArea';

export class PreferencesModal {
  private el: HTMLDivElement;
  private overlay: HTMLDivElement;
  private onGridChange: (style: GridStyle) => void;

  constructor(onGridChange: (style: GridStyle) => void) {
    this.onGridChange = onGridChange;

    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:100;display:none;align-items:center;justify-content:center';

    this.el = document.createElement('div');
    this.el.className = 'modal';
    this.el.innerHTML = `
      <div class="modal-header">
        <span>PREFERENCES</span>
        <button class="tb-btn modal-close" style="width:32px">✕</button>
      </div>
      <div class="modal-body">
        <div class="modal-section">
          <div class="modal-label">Canvas Background</div>
          <label class="modal-radio"><input type="radio" name="grid" value="dots" checked><span>● Dots</span></label>
          <label class="modal-radio"><input type="radio" name="grid" value="grid"><span>▦ Grid</span></label>
          <label class="modal-radio"><input type="radio" name="grid" value="none"><span>◌ None</span></label>
        </div>
      </div>
    `;

    this.overlay.appendChild(this.el);
    document.body.appendChild(this.overlay);

    this.el.querySelector('.modal-close')?.addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    this.el.querySelectorAll('input[name="grid"]').forEach(input => {
      input.addEventListener('change', () => {
        const val = (input as HTMLInputElement).value as GridStyle;
        this.onGridChange(val);
      });
    });
  }

  open(): void {
    this.overlay.style.display = 'flex';
  }

  close(): void {
    this.overlay.style.display = 'none';
  }
}
