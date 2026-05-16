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
      container.innerHTML = '<div class="welcome-recent-title">Recent</div>'
        + recent.map(p => {
          const name = p.split(/[\\/]/).pop() || p;
          return `<div class="welcome-recent-item" data-path="${p}">${name}</div>`;
        }).join('');
      container.querySelectorAll('.welcome-recent-item').forEach(item => {
        item.addEventListener('click', async () => {
          const path = (item as HTMLElement).dataset.path || '';
          if (path) this.close(path);
        });
      });
    }
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  private close(path: string | null): void {
    this.overlay.style.display = 'none';
    this.resolve?.(path);
  }
}
