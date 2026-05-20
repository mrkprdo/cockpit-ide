export class DashPanel {
  private overlay: HTMLDivElement;
  private panel: HTMLDivElement;
  private body: HTMLDivElement;
  private input: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;
  private resolve: (() => void) | null = null;
  private _open = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  onSend: ((text: string) => void) | null = null;
  get isOpen(): boolean { return this._open; }

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'dashpanel-overlay';

    this.panel = document.createElement('div');
    this.panel.className = 'dashpanel';

    const header = document.createElement('div');
    header.className = 'dashpanel-header';

    const title = document.createElement('span');
    title.className = 'dashpanel-title';
    title.textContent = 'Chat';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'dashpanel-close';
    closeBtn.textContent = '?';
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);

    this.body = document.createElement('div');
    this.body.className = 'dashpanel-body';

    const footer = document.createElement('div');
    footer.className = 'dashpanel-footer';

    this.input = document.createElement('input');
    this.input.className = 'dashpanel-input';
    this.input.type = 'text';
    this.input.placeholder = 'Ask anything...';

    this.sendBtn = document.createElement('button');
    this.sendBtn.className = 'dashpanel-send';
    this.sendBtn.textContent = '?';
    this.sendBtn.addEventListener('click', () => this.send());

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.send();
    });

    footer.appendChild(this.input);
    footer.appendChild(this.sendBtn);

    this.panel.appendChild(header);
    this.panel.appendChild(this.body);
    this.panel.appendChild(footer);
    this.overlay.appendChild(this.panel);
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
  }

  addMessage(role: 'user' | 'assistant', text: string): void {
    const row = document.createElement('div');
    row.className = 'chat-msg ' + role;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;

    row.appendChild(bubble);
    this.body.appendChild(row);
    this.body.scrollTop = this.body.scrollHeight;
  }

  private send(): void {
    const text = this.input.value.trim();
    if (!text) return;
    this.addMessage('user', text);
    this.onSend?.(text);
    this.input.value = '';
  }

  toggle(): void {
    if (this._open) this.close();
    else this.open();
  }

  open(): Promise<void> {
    if (this._open) return Promise.resolve();
    this._open = true;
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.overlay.classList.add('open');
    this.input.focus();

    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this.escHandler);

    return new Promise(resolve => { this.resolve = resolve; });
  }

  close(): void {
    if (!this._open) return;
    this._open = false;
    this.overlay.classList.remove('open');
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }
    this.closeTimer = setTimeout(() => {
      this.resolve?.();
      this.resolve = null;
      this.closeTimer = null;
    }, 200);
  }

  destroy(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.close();
    this.overlay.remove();
  }
}
