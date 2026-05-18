export class WelcomeModal {
  private el: HTMLDivElement;
  private overlay: HTMLDivElement;
  private resolve: ((path: string | null) => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.style.display = 'none';

    this.el = document.createElement('div');
    this.el.className = 'welcome-modal';
    this.el.innerHTML = `
      <div class="welcome-header">
        <div class="welcome-title">COCKPIT IDE</div>
        <div class="welcome-sub">Open a workspace to start</div>
      </div>
      <div class="welcome-body">
        <button class="welcome-btn" id="welcome-open">Open Workspace</button>
        <button class="welcome-btn-secondary" id="welcome-close">Close</button>
      </div>
      <div class="welcome-recent" id="welcome-recent"></div>
    `;

    this.overlay.appendChild(this.el);
    document.body.appendChild(this.overlay);

    this.el.querySelector('#welcome-open')?.addEventListener('click', async () => {
      const ws = window.electronAPI?.workspace;
      if (!ws) { this.close(null); return; }
      const path = await ws.select();
      this.close(path);
    });

    this.el.querySelector('#welcome-close')?.addEventListener('click', () => this.close(null));
  }

  async open(): Promise<string | null> {
    this.overlay.style.display = 'flex';
    // Load recent workspaces
    const recent = await window.electronAPI?.workspace.getRecent() || [];
    const container = this.el.querySelector('#welcome-recent') as HTMLElement;
    if (recent.length > 0) {
      container.style.display = 'block';
      container.innerHTML = '<div class="welcome-recent-title">Recent</div>';
      for (const p of recent) {
        const item = document.createElement('div');
        item.className = 'welcome-recent-item';
        item.textContent = p;
        item.addEventListener('click', () => { if (p) this.close(p); });
        container.appendChild(item);
      }
    } else {
      container.style.display = 'none';
    }
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  private close(path: string | null): void {
    this.overlay.style.display = 'none';
    this.resolve?.(path);
  }
}
