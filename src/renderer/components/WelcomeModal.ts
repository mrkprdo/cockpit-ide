export class WelcomeModal {
  private el: HTMLDivElement;
  private overlay: HTMLDivElement;
  private resolve: ((path: string | null) => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200;display:none;align-items:center;justify-content:center';

    this.el = document.createElement('div');
    this.el.className = 'welcome-modal';
    this.el.innerHTML = `
      <div class="welcome-header">
        <button class="welcome-x" id="welcome-close">✕</button>
        <div class="welcome-title">COCKPIT IDE</div>
        <div class="welcome-sub">Open a workspace to start</div>
      </div>
      <div class="welcome-body">
        <button class="welcome-btn" id="welcome-open">Open Workspace</button>
      </div>
    `;

    this.overlay.appendChild(this.el);
    document.body.appendChild(this.overlay);

    this.el.querySelector('#welcome-open')?.addEventListener('click', async () => {
      const ws = window.electronAPI?.workspace;
      if (!ws) return;
      const path = await ws.select();
      if (path) this.close(path);
    });

    this.el.querySelector('#welcome-close')?.addEventListener('click', () => this.close(null));
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(null); });
  }

  open(): Promise<string | null> {
    this.overlay.style.display = 'flex';
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  private close(path: string | null): void {
    this.overlay.style.display = 'none';
    this.resolve?.(path);
  }
}
