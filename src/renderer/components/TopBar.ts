import { theme } from '../theme';

interface TopBarCallbacks {
  onOpenPreferences: () => void;
  onThemeToggle?: () => void;
  onOpenWorkspace?: () => void;
  onNewTerminal?: () => void;
  onNewExplorer?: () => void;
  onNewEditor?: () => void;
  onNewDev?: () => void;
  onFocusTerminal?: (uuid: string) => void;
  onReopenTerminal?: (uuid: string) => void;
}

interface TermItem { uuid: string; title: string; isOpen: boolean; }

export class TopBar {
  private callbacks: TopBarCallbacks;
  private termItems: TermItem[] = [];

  constructor(private el: HTMLElement, callbacks: TopBarCallbacks) {
    this.callbacks = callbacks;
    this.render();
  }

  setTerminalItems(items: TermItem[]): void {
    this.termItems = items;
    this.render();
  }

  private render(): void {
    const termSubHtml = this.termItems.length === 0
      ? '<div class="menu-dropdown-item" style="opacity:0.4;cursor:default">New</div>'
      : '<div class="menu-dropdown-item" id="menu-new-terminal">New</div>'
        + '<div class="menu-dropdown-separator"></div>'
        + this.termItems.map(t =>
            `<div class="menu-dropdown-item term-instance" data-term-uuid="${t.uuid}" data-term-open="${t.isOpen}" style="${t.isOpen ? '' : 'opacity:0.45'}">${t.title}</div>`
          ).join('');

    this.el.innerHTML = `
      <div class="menu-item">
        File
        <div class="menu-dropdown">
          <div class="menu-dropdown-item">New Project</div>
          <div class="menu-dropdown-item" id="menu-open-workspace">Open Workspace...</div>
          <div class="menu-dropdown-item">Save</div>
          <div class="menu-dropdown-separator"></div>
          <div class="menu-dropdown-item">Exit</div>
        </div>
      </div>
      <div class="menu-item">
        Edit
        <div class="menu-dropdown">
          <div class="menu-dropdown-item" id="menu-preferences">Preferences...</div>
        </div>
      </div>
      <div class="menu-item">
        View
        <div class="menu-dropdown">
          <div class="menu-item menu-item-nested" style="position:relative;padding:6px 12px;border-radius:4px;display:flex;align-items:center;justify-content:space-between">
            <span>Terminal</span><span style="color:var(--tertiary);font-size:10px">▸</span>
            <div class="menu-dropdown-nested" id="terminal-submenu">
              ${termSubHtml}
            </div>
          </div>
          <div class="menu-dropdown-item" id="menu-new-dev">Dev</div>
          <div class="menu-dropdown-separator"></div>
          <div class="menu-item menu-item-nested" style="position:relative;padding:6px 12px;border-radius:4px;display:flex;align-items:center;justify-content:space-between">
            <span>Zoom</span><span style="color:var(--tertiary);font-size:10px">▸</span>
            <div class="menu-dropdown-nested">
              <div class="menu-dropdown-item">Zoom In</div>
              <div class="menu-dropdown-item">Zoom Out</div>
              <div class="menu-dropdown-item">Reset View</div>
            </div>
          </div>
        </div>
      </div>
      <div class="menu-item">
        Help
        <div class="menu-dropdown">
          <div class="menu-dropdown-item">About Cockpit IDE</div>
        </div>
      </div>
      <div style="flex:1"></div>
      <button class="tb-btn" id="theme-toggle" style="width:36px;font-size:14px" title="Toggle theme">◐</button>
    `;

    this.el.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.menu-item.open').forEach(el => el.classList.remove('open'));
        item.classList.add('open');
      });
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.menu-item.open').forEach(el => el.classList.remove('open'));
    });

    document.getElementById('menu-preferences')?.addEventListener('click', () => {
      this.callbacks.onOpenPreferences();
    });

    document.getElementById('menu-open-workspace')?.addEventListener('click', () => {
      this.callbacks.onOpenWorkspace?.();
    });

    document.getElementById('menu-new-terminal')?.addEventListener('click', () => {
      this.callbacks.onNewTerminal?.();
    });

    document.getElementById('menu-new-dev')?.addEventListener('click', () => {
      this.callbacks.onNewDev?.();
    });

    // Terminal instances — click to focus (open) or reopen (closed)
    this.el.querySelectorAll('.term-instance').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const uuid = target.dataset.termUuid || '';
        const isOpen = target.dataset.termOpen === 'true';
        if (isOpen) {
          this.callbacks.onFocusTerminal?.(uuid);
        } else {
          this.callbacks.onReopenTerminal?.(uuid);
        }
      });
    });

    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      theme.toggle();
      this.callbacks.onThemeToggle?.();
    });
  }
}
