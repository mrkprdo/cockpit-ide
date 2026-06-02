import { theme } from '../theme';

type GridStyle = 'none' | 'dots' | 'grid';

interface TopBarCallbacks {
  onGridChange?: (style: GridStyle) => void;
  onThemeToggle?: () => void;
  onOpenWorkspace?: () => void;
  onNewTerminal?: () => void;
  onNewExplorer?: () => void;
  onNewGit?: () => void;
  onNewMarkdown?: () => void;
  onFocusTerminal?: (uuid: string) => void;
  onReopenTerminal?: (uuid: string) => void;
  onFocusExplorer?: (uuid: string) => void;
  onReopenExplorer?: (uuid: string) => void;
  onFocusMarkdown?: (uuid: string) => void;
  onReopenMarkdown?: (uuid: string) => void;
  onNewSpecsmap?: () => void;
  onFocusSpecsmap?: (uuid: string) => void;
  onReopenSpecsmap?: (uuid: string) => void;
  onAbout?: () => void;
  onTutorial?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  onZoomLock?: (locked: boolean) => void;
}

interface TermItem { uuid: string; title: string; isOpen: boolean; }

export class TopBar {
  private callbacks: TopBarCallbacks;
  private gridStyle: GridStyle = 'dots';
  private zoomLocked = false;
  private termItems: TermItem[] = [];

  private gitItems: TermItem[] = [];

  private specsmapItems: TermItem[] = [];

  private docClickHandler: (() => void) | null = null;

  constructor(private el: HTMLElement, callbacks: TopBarCallbacks) {
    this.callbacks = callbacks;
    this.render();
  }

  setTerminalItems(items: TermItem[]): void {
    this.termItems = items;
    this.render();
  }

  setGitItems(items: TermItem[]): void {
    this.gitItems = items;
    this.render();
  }

  setSpecsmapItems(items: TermItem[]): void {
    this.specsmapItems = items;
    this.render();
  }

  setGridStyle(style: GridStyle): void {
    this.gridStyle = style;
    this.render();
  }

  setZoomLocked(locked: boolean): void {
    this.zoomLocked = locked;
    this.render();
  }

  private render(): void {
    const closedCls = (isOpen: boolean) => isOpen ? '' : ' is-closed';

    const termSubHtml = '<div class="menu-dropdown-item" id="menu-new-terminal">New</div>'
      + '<div class="menu-dropdown-separator"></div>'
      + (this.termItems.length === 0
        ? '<div class="menu-dropdown-item is-disabled">(none)</div>'
        : this.termItems.map(t =>
            `<div class="menu-dropdown-item term-instance${closedCls(t.isOpen)}" data-term-uuid="${t.uuid}" data-term-open="${t.isOpen}">${t.title}</div>`
          ).join(''));

    this.el.innerHTML = `
      <div class="menu-item">
        File
        <div class="menu-dropdown">
          <div class="menu-dropdown-item" id="menu-open-workspace">Open Workspace</div>
          <div class="menu-dropdown-separator"></div>
          <div class="menu-dropdown-item" id="menu-exit">Exit</div>
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
          <div class="menu-dropdown-item" id="menu-new-explorer">Explorer</div>
          <div class="menu-dropdown-item" id="menu-new-git">Git</div>
          <div class="menu-dropdown-item" id="menu-new-markdown">Markdown</div>
          <div class="menu-dropdown-separator"></div>
          <div class="menu-item-nested">
            <span>Canvas</span><span class="arrow">▸</span>
            <div class="menu-dropdown-nested">
              <div class="menu-dropdown-item" data-grid="dots">${this.gridStyle === 'dots' ? '<span class="menu-check">✓</span> ' : ''}Dot</div>
              <div class="menu-dropdown-item" data-grid="grid">${this.gridStyle === 'grid' ? '<span class="menu-check">✓</span> ' : ''}Grid</div>
              <div class="menu-dropdown-item" data-grid="none">${this.gridStyle === 'none' ? '<span class="menu-check">✓</span> ' : ''}None</div>
            </div>
          </div>
          <div class="menu-dropdown-separator"></div>
          <div class="menu-item-nested">
            <span>Zoom</span><span class="arrow">▸</span>
            <div class="menu-dropdown-nested">
              <div class="menu-dropdown-item" id="menu-zoom-in">Zoom In</div>
              <div class="menu-dropdown-item" id="menu-zoom-out">Zoom Out</div>
              <div class="menu-dropdown-item" id="menu-reset-view">Reset View</div>
              <div class="menu-dropdown-separator"></div>
              <div class="menu-dropdown-item" id="menu-zoom-lock">${this.zoomLocked ? '<span class="menu-check">✓</span> ' : ''}Lock</div>
            </div>
          </div>
        </div>
      </div>
      <div class="menu-item">
        Tools
        <div class="menu-dropdown">
          <div class="menu-dropdown-item" id="menu-new-specsmap">SpecsMap</div>
        </div>
      </div>
      <div class="menu-item">
        Help
        <div class="menu-dropdown">
          <div class="menu-dropdown-item" id="menu-tutorial">Tutorial</div>
          <div class="menu-dropdown-separator"></div>
          <div class="menu-dropdown-item" id="menu-about">About Cockpit IDE</div>
        </div>
      </div>
      <div class="menu-spacer"></div>
      <button class="tb-btn tb-btn--wide" id="theme-toggle" title="Toggle theme">◐</button>
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
    this.el.querySelectorAll('.menu-dropdown').forEach(dd => {
      dd.addEventListener('mouseenter', cancelClose);
      dd.addEventListener('mouseleave', scheduleClose);
    });

    // Close on click outside — remove previous handler first to prevent accumulation
    if (this.docClickHandler) document.removeEventListener('click', this.docClickHandler);
    this.docClickHandler = () => closeAll();
    document.addEventListener('click', this.docClickHandler);

    document.getElementById('menu-open-workspace')?.addEventListener('click', () => {
      this.callbacks.onOpenWorkspace?.();
    });

    document.getElementById('menu-new-terminal')?.addEventListener('click', () => {
      this.callbacks.onNewTerminal?.();
    });

    document.getElementById('menu-new-explorer')?.addEventListener('click', () => {
      this.callbacks.onNewExplorer?.();
    });

    document.getElementById('menu-tutorial')?.addEventListener('click', () => {
      this.callbacks.onTutorial?.();
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

    document.getElementById('menu-zoom-lock')?.addEventListener('click', () => {
      this.callbacks.onZoomLock?.(!this.zoomLocked);
    });

    this.el.querySelectorAll('[data-grid]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = (e.currentTarget as HTMLElement).dataset.grid as GridStyle;
        this.gridStyle = val;
        this.callbacks.onGridChange?.(val);
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

    document.getElementById('menu-new-git')?.addEventListener('click', () => {
      this.callbacks.onNewGit?.();
    });

    document.getElementById('menu-new-markdown')?.addEventListener('click', () => {
      this.callbacks.onNewMarkdown?.();
    });

    document.getElementById('menu-new-specsmap')?.addEventListener('click', () => {
      this.callbacks.onNewSpecsmap?.();
    });

    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      theme.toggle();
      this.callbacks.onThemeToggle?.();
    });
  }
}
