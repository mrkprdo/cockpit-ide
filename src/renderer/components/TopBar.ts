import { theme } from '../theme';

type GridStyle = 'none' | 'dots' | 'grid';

interface TopBarCallbacks {
  onOpenPreferences: () => void;
  onThemeToggle?: () => void;
  onOpenWorkspace?: () => void;
  onNewTerminal?: () => void;
  onNewExplorer?: () => void;
  onNewEditor?: () => void;
  onNewDev?: () => void;
  onNewContext?: () => void;
  onFocusTerminal?: (uuid: string) => void;
  onReopenTerminal?: (uuid: string) => void;
  onFocusDev?: (uuid: string) => void;
  onReopenDev?: (uuid: string) => void;
  onFocusContext?: (uuid: string) => void;
  onReopenContext?: (uuid: string) => void;
  onAbout?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
}

interface TermItem { uuid: string; title: string; isOpen: boolean; }

export class TopBar {
  private callbacks: TopBarCallbacks;
  private termItems: TermItem[] = [];
  private devItems: TermItem[] = [];
  private ctxItems: TermItem[] = [];

  constructor(private el: HTMLElement, callbacks: TopBarCallbacks) {
    this.callbacks = callbacks;
    this.render();
  }

  setTerminalItems(items: TermItem[]): void {
    this.termItems = items;
    this.render();
  }

  setDevItems(items: TermItem[]): void {
    this.devItems = items;
    this.render();
  }

  setContextItems(items: TermItem[]): void {
    this.ctxItems = items;
    this.render();
  }

  setGridStyle(style: GridStyle): void {
    this.gridStyle = style;
    this.render();
  }

  private render(): void {
    const hideStyle = (isOpen: boolean) => isOpen ? '' : 'opacity:0.45';

    const ctxSubHtml = '<div class="menu-dropdown-item" id="menu-new-context">New</div>'
      + '<div class="menu-dropdown-separator"></div>'
      + (this.ctxItems.length === 0
        ? '<div class="menu-dropdown-item" style="opacity:0.4;cursor:default">(none)</div>'
        : this.ctxItems.map(t =>
            `<div class="menu-dropdown-item ctx-instance" data-ctx-uuid="${t.uuid}" data-ctx-open="${t.isOpen}" style="${hideStyle(t.isOpen)}">${t.title}</div>`
          ).join(''));

    const termSubHtml = '<div class="menu-dropdown-item" id="menu-new-terminal">New</div>'
      + '<div class="menu-dropdown-separator"></div>'
      + (this.termItems.length === 0
        ? '<div class="menu-dropdown-item" style="opacity:0.4;cursor:default">(none)</div>'
        : this.termItems.map(t =>
            `<div class="menu-dropdown-item term-instance" data-term-uuid="${t.uuid}" data-term-open="${t.isOpen}" style="${hideStyle(t.isOpen)}">${t.title}</div>`
          ).join(''));

    this.el.innerHTML = `
      <div class="menu-item">
        File
        <div class="menu-dropdown">
          <div class="menu-dropdown-item" id="menu-open-workspace">Open Workspace</div>
          <div class="menu-dropdown-separator"></div>
          <div class="menu-dropdown-item">Exit</div>
        </div>
      </div>
      <div class="menu-item">
        View
        <div class="menu-dropdown">
          <div class="menu-item-nested">
            <span>Terminal</span><span class="arrow">▸</span>
            <div class="menu-dropdown-nested" id="terminal-submenu">
              ${termSubHtml}
            </div>
          </div>
          <div class="menu-item-nested">
            <span>Dev</span><span class="arrow">▸</span>
            <div class="menu-dropdown-nested">
              <div class="menu-dropdown-item" id="menu-new-dev">New</div>
              <div class="menu-dropdown-separator"></div>
              ${this.devItems.length === 0
                ? '<div class="menu-dropdown-item" style="opacity:0.4;cursor:default">(none)</div>'
                : this.devItems.map(d => `<div class="menu-dropdown-item dev-instance" data-dev-uuid="${d.uuid}" data-dev-open="${d.isOpen}" style="${d.isOpen ? '' : 'opacity:0.45'}">${d.title}</div>`).join('')
              }
            </div>
          </div>
          <div class="menu-item-nested">
            <span>Context</span><span class="arrow">▸</span>
            <div class="menu-dropdown-nested">
              ${ctxSubHtml}
            </div>
          </div>
          <div class="menu-dropdown-separator"></div>
          <div class="menu-item-nested">
            <span>Canvas</span><span class="arrow">▸</span>
            <div class="menu-dropdown-nested">
              <div class="menu-dropdown-item" data-grid="dots">${this.gridStyle === 'dots' ? '✓ ' : ''}Dot</div>
              <div class="menu-dropdown-item" data-grid="grid">${this.gridStyle === 'grid' ? '✓ ' : ''}Grid</div>
              <div class="menu-dropdown-item" data-grid="none">${this.gridStyle === 'none' ? '✓ ' : ''}None</div>
            </div>
          </div>
          <div class="menu-dropdown-separator"></div>
          <div class="menu-item-nested">
            <span>Zoom</span><span class="arrow">▸</span>
            <div class="menu-dropdown-nested">
              <div class="menu-dropdown-item" id="menu-zoom-in">Zoom In</div>
              <div class="menu-dropdown-item" id="menu-zoom-out">Zoom Out</div>
              <div class="menu-dropdown-item" id="menu-reset-view">Reset View</div>
            </div>
          </div>
        </div>
      </div>
      <div class="menu-item">
        Help
        <div class="menu-dropdown">
          <div class="menu-dropdown-item" id="menu-about">About Cockpit IDE</div>
        </div>
      </div>
      <div style="flex:1"></div>
      <button class="tb-btn" id="theme-toggle" style="width:36px;font-size:14px" title="Toggle theme">◐</button>
    `;

    // Hover-based menus with close timer
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    const closeAll = () => {
      document.querySelectorAll('.menu-item.open').forEach(el => el.classList.remove('open'));
    };
    const scheduleClose = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(closeAll, 300);
    };
    const cancelClose = () => { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } };

    this.el.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        cancelClose();
        closeAll();
        item.classList.add('open');
      });
      item.addEventListener('mouseleave', () => {
        scheduleClose();
      });
    });

    // Keep menu open when hovering over the dropdown
    document.querySelectorAll('.menu-dropdown').forEach(dd => {
      dd.addEventListener('mouseenter', cancelClose);
      dd.addEventListener('mouseleave', scheduleClose);
    });

    // Close on click outside
    document.addEventListener('click', () => closeAll());

    document.getElementById('menu-open-workspace')?.addEventListener('click', () => {
      this.callbacks.onOpenWorkspace?.();
    });

    document.getElementById('menu-new-terminal')?.addEventListener('click', () => {
      this.callbacks.onNewTerminal?.();
    });

    document.getElementById('menu-new-dev')?.addEventListener('click', () => {
      this.callbacks.onNewDev?.();
    });

    document.getElementById('menu-about')?.addEventListener('click', () => {
      this.callbacks.onAbout?.();
    });

    document.getElementById('menu-zoom-in')?.addEventListener('click', () => {
      this.callbacks.onZoomIn?.();
    });

    document.getElementById('menu-zoom-out')?.addEventListener('click', () => {
      this.callbacks.onZoomOut?.();
    });

    document.getElementById('menu-reset-view')?.addEventListener('click', () => {
      this.callbacks.onResetView?.();
    });

    this.el.querySelectorAll('[data-grid]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = (e.currentTarget as HTMLElement).dataset.grid as GridStyle;
        this.gridStyle = val;
        this.callbacks.onGridChange(val);
        this.render();
      });
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

    // Dev instances — click to focus (open) or reopen (closed)
    this.el.querySelectorAll('.dev-instance').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const uuid = target.dataset.devUuid || '';
        const isOpen = target.dataset.devOpen === 'true';
        if (isOpen) {
          this.callbacks.onFocusDev?.(uuid);
        } else {
          this.callbacks.onReopenDev?.(uuid);
        }
      });
    });

    // Context instances
    this.el.querySelectorAll('.ctx-instance').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const uuid = target.dataset.ctxUuid || '';
        const isOpen = target.dataset.ctxOpen === 'true';
        if (isOpen) this.callbacks.onFocusContext?.(uuid);
        else this.callbacks.onReopenContext?.(uuid);
      });
    });

    // "New" in context submenu
    document.getElementById('menu-new-context')?.addEventListener('click', () => {
      this.callbacks.onNewContext?.();
    });

    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      theme.toggle();
      this.callbacks.onThemeToggle?.();
    });
  }
}
