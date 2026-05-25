export class ConfirmModal {
  private overlay: HTMLDivElement;
  private resolve: ((ok: boolean) => void) | null = null;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(message: string, confirmLabel = 'Delete', destructive = true) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay confirm';

    const box = document.createElement('div');
    box.className = 'modal';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', confirmLabel);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const msg = document.createElement('div');
    msg.className = 'confirm-modal-msg';
    msg.innerHTML = message.replace(/<(script|img|iframe|embed|object|link|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<(script|img|iframe|embed|object|link|style)\b[^>]*\/?>/gi, '').replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'confirm-cancel';
    cancelBtn.className = 'btn-ghost';
    cancelBtn.textContent = 'Cancel';

    const okBtn = document.createElement('button');
    okBtn.id = 'confirm-ok';
    okBtn.className = destructive ? 'btn-primary btn-ok-destructive' : 'btn-primary';
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
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }
    this.overlay.remove();
    this.resolve?.(ok);
  }

  open(): Promise<boolean> {
    this.overlay.style.display = 'flex';
    this.escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.done(false); };
    document.addEventListener('keydown', this.escHandler);
    (this.overlay.querySelector('#confirm-cancel') as HTMLButtonElement)?.focus();
    return new Promise(resolve => { this.resolve = resolve; });
  }
}
