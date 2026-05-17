export class ConfirmModal {
  private overlay: HTMLDivElement;
  private resolve: ((ok: boolean) => void) | null = null;

  constructor(message: string, confirmLabel = 'Delete') {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:300;display:flex;align-items:center;justify-content:center';

    const box = document.createElement('div');
    box.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:12px;min-width:300px;box-shadow:0 16px 48px rgba(0,0,0,0.3)';

    box.innerHTML = `
      <div style="padding:20px 24px 12px;font-size:13px;font-family:var(--font);color:var(--primary);line-height:1.5">${message}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;padding:8px 24px 16px">
        <button class="welcome-btn-secondary" id="confirm-cancel" style="margin:0">Cancel</button>
        <button class="welcome-btn" id="confirm-ok" style="margin:0">${confirmLabel}</button>
      </div>
    `;

    this.overlay.appendChild(box);
    document.body.appendChild(this.overlay);

    box.querySelector('#confirm-cancel')?.addEventListener('click', () => this.done(false));
    box.querySelector('#confirm-ok')?.addEventListener('click', () => this.done(true));
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.done(false); });
  }

  private done(ok: boolean): void {
    this.overlay.remove();
    this.resolve?.(ok);
  }

  open(): Promise<boolean> {
    return new Promise(resolve => { this.resolve = resolve; });
  }
}
