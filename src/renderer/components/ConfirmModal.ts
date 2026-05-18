export class ConfirmModal {
  private overlay: HTMLDivElement;
  private resolve: ((ok: boolean) => void) | null = null;

  constructor(message: string, confirmLabel = 'Delete') {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay confirm';

    const box = document.createElement('div');
    box.className = 'modal';

    const body = document.createElement('div');
    body.className = 'modal-body';

    const msg = document.createElement('div');
    msg.setAttribute('style', 'padding:20px 24px 12px;font-size:13px;font-family:var(--font);color:var(--primary);line-height:1.5');
    msg.innerHTML = message;

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'confirm-cancel';
    cancelBtn.className = 'welcome-btn-secondary';
    cancelBtn.style.margin = '0';
    cancelBtn.textContent = 'Cancel';

    const okBtn = document.createElement('button');
    okBtn.id = 'confirm-ok';
    okBtn.className = 'welcome-btn';
    okBtn.style.cssText = 'display:inline-block;width:auto;margin:0;padding:8px 20px';
    okBtn.textContent = confirmLabel;

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    body.appendChild(msg);
    body.appendChild(actions);
    box.appendChild(body);
    this.overlay.appendChild(box);
    document.body.appendChild(this.overlay);

    cancelBtn.addEventListener('click', () => this.done(false));
    okBtn.addEventListener('click', () => this.done(true));
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.done(false); });
  }

  private done(ok: boolean): void {
    this.overlay.remove();
    this.resolve?.(ok);
  }

  open(): Promise<boolean> {
    this.overlay.style.display = 'flex';
    return new Promise(resolve => { this.resolve = resolve; });
  }
}
