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
      <div class="welcome-head">
        <div class="welcome-name">COCKPIT IDE</div>
        <div class="welcome-sub">Select a workspace</div>
      </div>
      <div class="welcome-sep"></div>
      <div class="welcome-actions">
        <button class="welcome-btn" id="welcome-open">Open Workspace</button>
        <button class="welcome-btn-secondary" id="welcome-close">Close</button>
      </div>
      <div class="welcome-recent" id="welcome-recent"></div>
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
  }

  async open(): Promise<string | null> {
    this.overlay.style.display = 'flex';
    const recent = await window.electronAPI?.workspace.getRecent() || [];
    const container = this.el.querySelector('#welcome-recent') as HTMLElement;
    if (recent.length > 0) {
      container.style.display = 'block';
      container.innerHTML = '<div class="welcome-recent-title">Recent</div>';
      for (const p of recent) {
        const item = document.createElement('div');
        item.className = 'welcome-recent-item';

        const pathSpan = document.createElement('span');
        pathSpan.className = 'welcome-recent-item-path';
        pathSpan.textContent = p;

        const exists = await window.electronAPI?.fs.readDir(p);
        if (!exists) {
          pathSpan.classList.add('welcome-recent-item-missing');
        }

        item.appendChild(pathSpan);
        item.addEventListener('click', () => { if (p && exists) this.close(p); });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'welcome-recent-item-remove';
        removeBtn.textContent = '×';
        removeBtn.setAttribute('aria-label', `Remove ${p} from recent`);
        removeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await window.electronAPI?.workspace.removeRecent(p);
          item.remove();
          if (!container.querySelector('.welcome-recent-item')) {
            container.style.display = 'none';
          }
        });
        item.appendChild(removeBtn);

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
