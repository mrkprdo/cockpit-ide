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
  onFocusGit?: (uuid: string) => void;
  onReopenGit?: (uuid: string) => void;
  onFocusMarkdown?: (uuid: string) => void;
  onReopenMarkdown?: (uuid: string) => void;
  onNewSpecsmap?: () => void;
  onFocusSpecsmap?: (uuid: string) => void;
  onReopenSpecsmap?: (uuid: string) => void;
  onAbout?: () => void;
  onTheme?: () => void;
  onAi?: () => void;
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
    this.el.setAttribute('role', 'menubar');
    this.el.setAttribute('aria-label', 'Main menu');
    this.render();
  }

  setTerminalItems(items: TermItem[]): void {
    this.termItems = items;
    this.patchSubmenu('terminal-submenu', this.termSubHtml());
  }

  setGitItems(items: TermItem[]): void {
    this.gitItems = items;
    this.patchSubmenu('git-submenu', this.gitSubHtml());
  }

  setSpecsmapItems(items: TermItem[]): void {
    this.specsmapItems = items;
    this.patchSubmenu('specsmap-submenu', this.specsmapSubHtml());
  }

  setGridStyle(style: GridStyle): void {
    this.gridStyle = style;
    this.render();
  }

  setZoomLocked(locked: boolean): void {
    this.zoomLocked = locked;
    this.render();
  }

  private termSubHtml(): string {
    const closedCls = (isOpen: boolean) => isOpen ? '' : ' is-closed';
    return (this.termItems.length === 0
      ? '<div class="menu-dropdown-item is-disabled" role="menuitem" tabindex="-1">(none)</div>'
      : this.termItems.map(t =>
          `<div class="menu-dropdown-item term-instance${closedCls(t.isOpen)}" role="menuitem" tabindex="-1" data-term-uuid="${t.uuid}" data-term-open="${t.isOpen}">${t.title}</div>`
        ).join(''));
  }

  private gitSubHtml(): string {
    const closedCls = (isOpen: boolean) => isOpen ? '' : ' is-closed';
    return (this.gitItems.length === 0
      ? '<div class="menu-dropdown-item is-disabled" role="menuitem" tabindex="-1">(none)</div>'
      : this.gitItems.map(t =>
          `<div class="menu-dropdown-item git-instance${closedCls(t.isOpen)}" role="menuitem" tabindex="-1" data-git-uuid="${t.uuid}" data-git-open="${t.isOpen}">${t.title}</div>`
        ).join(''));
  }

  private specsmapSubHtml(): string {
    const closedCls = (isOpen: boolean) => isOpen ? '' : ' is-closed';
    return (this.specsmapItems.length === 0
      ? '<div class="menu-dropdown-item is-disabled" role="menuitem" tabindex="-1">(none)</div>'
      : this.specsmapItems.map(t =>
          `<div class="menu-dropdown-item specsmap-instance${closedCls(t.isOpen)}" role="menuitem" tabindex="-1" data-specsmap-uuid="${t.uuid}" data-specsmap-open="${t.isOpen}">${t.title}</div>`
        ).join(''));
  }

  private patchSubmenu(id: string, html: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    this.bindSubmenuItemListeners(el);
  }

  private bindSubmenuItemListeners(el: HTMLElement): void {
    const closeAll = () => {
      this.el.querySelectorAll('.menu-item.open').forEach(el => el.classList.remove('open'));
    };

    el.querySelectorAll('.term-instance').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const uuid = target.dataset.termUuid || '';
        const isOpen = target.dataset.termOpen === 'true';
        if (isOpen) this.callbacks.onFocusTerminal?.(uuid);
        else this.callbacks.onReopenTerminal?.(uuid);
        closeAll();
      });
    });

    el.querySelectorAll('.git-instance').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const uuid = target.dataset.gitUuid || '';
        const isOpen = target.dataset.gitOpen === 'true';
        if (isOpen) this.callbacks.onFocusGit?.(uuid);
        else this.callbacks.onReopenGit?.(uuid);
        closeAll();
      });
    });

    el.querySelectorAll('.specsmap-instance').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const uuid = target.dataset.specsmapUuid || '';
        const isOpen = target.dataset.specsmapOpen === 'true';
        if (isOpen) this.callbacks.onFocusSpecsmap?.(uuid);
        else this.callbacks.onReopenSpecsmap?.(uuid);
        closeAll();
      });
    });
  }

  private render(): void {
    this.el.innerHTML = `
      <div class="menu-item" role="menuitem" tabindex="0" aria-haspopup="true" aria-expanded="false">
        File
        <div class="menu-dropdown" role="menu">
          <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-open-workspace">Open Workspace&nbsp;<span class="menu-shortcut">Ctrl+O</span></div>
          <div class="menu-dropdown-separator" role="separator"></div>
          <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-exit">Exit</div>
        </div>
      </div>
      <div class="menu-item" role="menuitem" tabindex="0" aria-haspopup="true" aria-expanded="false">
        View
        <div class="menu-dropdown" role="menu">
          <div class="menu-item-nested" role="menuitem" tabindex="-1" aria-haspopup="true">
            <span>Terminal</span><span class="arrow">▸</span>
            <div class="menu-dropdown-nested" role="menu" id="terminal-submenu">
              <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-new-terminal">New&nbsp;<span class="menu-shortcut">Ctrl+J</span></div>
              <div class="menu-dropdown-separator" role="separator"></div>
              ${this.termItems.length === 0
                ? '<div class="menu-dropdown-item is-disabled" role="menuitem" tabindex="-1">(none)</div>'
                : this.termItems.map(t => {
                    const closedCls = t.isOpen ? '' : ' is-closed';
                    return `<div class="menu-dropdown-item term-instance${closedCls}" role="menuitem" tabindex="-1" data-term-uuid="${t.uuid}" data-term-open="${t.isOpen}">${t.title}</div>`;
                  }).join('')
              }
            </div>
          </div>
          <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-new-explorer">Explorer</div>
          <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-new-git">Git</div>
          <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-new-markdown">Markdown</div>
          <div class="menu-dropdown-separator" role="separator"></div>
          <div class="menu-item-nested" role="menuitem" tabindex="-1" aria-haspopup="true">
            <span>Canvas</span><span class="arrow">▸</span>
            <div class="menu-dropdown-nested" role="menu">
              <div class="menu-dropdown-item" role="menuitem" tabindex="-1" data-grid="dots">${this.gridStyle === 'dots' ? '<span class="menu-check">✓</span> ' : ''}Dot</div>
              <div class="menu-dropdown-item" role="menuitem" tabindex="-1" data-grid="grid">${this.gridStyle === 'grid' ? '<span class="menu-check">✓</span> ' : ''}Grid</div>
              <div class="menu-dropdown-item" role="menuitem" tabindex="-1" data-grid="none">${this.gridStyle === 'none' ? '<span class="menu-check">✓</span> ' : ''}None</div>
            </div>
          </div>
          <div class="menu-dropdown-separator" role="separator"></div>
          <div class="menu-item-nested" role="menuitem" tabindex="-1" aria-haspopup="true">
            <span>Zoom</span><span class="arrow">▸</span>
            <div class="menu-dropdown-nested" role="menu">
              <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-zoom-in">Zoom In&nbsp;<span class="menu-shortcut">Ctrl+</span></div>
              <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-zoom-out">Zoom Out&nbsp;<span class="menu-shortcut">Ctrl-</span></div>
              <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-reset-view">Reset View</div>
              <div class="menu-dropdown-separator" role="separator"></div>
              <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-zoom-lock">${this.zoomLocked ? '<span class="menu-check">✓</span> ' : ''}Lock</div>
            </div>
          </div>
        </div>
      </div>
      <div class="menu-item" role="menuitem" tabindex="0" aria-haspopup="true" aria-expanded="false">
        Tools
        <div class="menu-dropdown" role="menu">
          <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-new-specsmap">SpecsMap</div>
          <div class="menu-dropdown-separator" role="separator"></div>
          <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-ai">AI</div>
          <div class="menu-dropdown-separator" role="separator"></div>
          <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-theme">Theme</div>
        </div>
      </div>
      <div class="menu-item" role="menuitem" tabindex="0" aria-haspopup="true" aria-expanded="false">
        Help
        <div class="menu-dropdown" role="menu">
          <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-tutorial">Tutorial</div>
          <div class="menu-dropdown-separator" role="separator"></div>
          <div class="menu-dropdown-item" role="menuitem" tabindex="-1" id="menu-about">About Cockpit IDE</div>
        </div>
      </div>
      <div class="menu-spacer"></div>
      <button class="tb-btn tb-btn--wide" id="theme-toggle" title="Toggle theme">◐</button>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    const menuItems = this.el.querySelectorAll<HTMLElement>('.menu-item');
    const closeTimer: { current: ReturnType<typeof setTimeout> | null } = { current: null };

    const closeAll = () => {
      (window as any).__closeAllMenus?.();
    };

    const scheduleClose = () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(closeAll, 300);
    };

    const cancelClose = () => {
      if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    };

    // Expose closeAll globally for submenu click handlers
    const closeAllMenus = () => {
      this.el.querySelectorAll('.menu-item.open').forEach(el => el.classList.remove('open'));
    };
    (window as any).__closeAllMenus = closeAllMenus;

    // --- Hover behavior (additive) ---
    menuItems.forEach(item => {
      item.addEventListener('mouseenter', () => {
        cancelClose();
        closeAllMenus();
        item.classList.add('open');
      });
      item.addEventListener('mouseleave', () => {
        scheduleClose();
      });
    });

    this.el.querySelectorAll('.menu-dropdown').forEach(dd => {
      dd.addEventListener('mouseenter', cancelClose);
      dd.addEventListener('mouseleave', scheduleClose);
    });

    // --- Keyboard navigation ---
    this.el.addEventListener('keydown', (e) => {
      const topItems = Array.from(this.el.querySelectorAll<HTMLElement>(':scope > .menu-item'));
      const currentIdx = topItems.indexOf(document.activeElement as HTMLElement);
      const openMenu = this.el.querySelector('.menu-item.open');

      if (e.key === 'ArrowRight' && currentIdx !== -1) {
        e.preventDefault();
        closeAllMenus();
        const next = (currentIdx + 1) % topItems.length;
        (topItems[next] as HTMLElement).focus();
        return;
      }
      if (e.key === 'ArrowLeft' && currentIdx !== -1) {
        e.preventDefault();
        closeAllMenus();
        const next = (currentIdx - 1 + topItems.length) % topItems.length;
        (topItems[next] as HTMLElement).focus();
        return;
      }

      if (openMenu) {
        const dropdown = openMenu.querySelector<HTMLElement>('.menu-dropdown, .menu-dropdown-nested');
        const items = dropdown ? Array.from(dropdown.querySelectorAll<HTMLElement>('[role="menuitem"]:not(.is-disabled)')) : [];
        let itemIdx = items.indexOf(document.activeElement as HTMLElement);

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          itemIdx = (itemIdx + 1) % items.length;
          items[itemIdx]?.focus();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          itemIdx = (itemIdx - 1 + items.length) % items.length;
          items[itemIdx]?.focus();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeAllMenus();
          // Return focus to parent menu item
          (openMenu as HTMLElement).focus();
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          if (itemIdx !== -1 && document.activeElement === items[itemIdx]) {
            e.preventDefault();
            items[itemIdx].click();
            return;
          }
        }
      }

      // Open menu on Enter/Space/ArrowDown when a top-level menuitem is focused
      if ((e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') && currentIdx !== -1 && !openMenu) {
        e.preventDefault();
        closeAllMenus();
        topItems[currentIdx].classList.add('open');
        cancelClose();
        // Focus first item in dropdown
        const dropdown = topItems[currentIdx].querySelector<HTMLElement>('.menu-dropdown');
        if (dropdown) {
          const first = dropdown.querySelector<HTMLElement>('[role="menuitem"]:not(.is-disabled)');
          first?.focus();
        }
        return;
      }
    });

    // Focus top-level menu items on click to enable keyboard flow
    menuItems.forEach(item => {
      item.addEventListener('mousedown', (e) => {
        // Don't prevent submenu item clicks
        if ((e.target as HTMLElement).closest('.menu-dropdown-item')) return;
        item.focus();
      });
    });

    // Update aria-expanded on open/close (MutationObserver would be overkill — do it inline)
    const updateAria = () => {
      this.el.querySelectorAll('.menu-item').forEach(item => {
        item.setAttribute('aria-expanded', String(item.classList.contains('open')));
      });
    };

    // Close on click outside
    if (this.docClickHandler) document.removeEventListener('click', this.docClickHandler);
    this.docClickHandler = () => { closeAllMenus(); updateAria(); };
    document.addEventListener('click', this.docClickHandler);

    // --- Click handlers for leaf items ---
    document.getElementById('menu-open-workspace')?.addEventListener('click', () => {
      closeAllMenus();
      this.callbacks.onOpenWorkspace?.();
    });

    document.getElementById('menu-new-terminal')?.addEventListener('click', () => {
      closeAllMenus();
      this.callbacks.onNewTerminal?.();
    });

    document.getElementById('menu-new-explorer')?.addEventListener('click', () => {
      closeAllMenus();
      this.callbacks.onNewExplorer?.();
    });

    document.getElementById('menu-new-git')?.addEventListener('click', () => {
      closeAllMenus();
      this.callbacks.onNewGit?.();
    });

    document.getElementById('menu-new-markdown')?.addEventListener('click', () => {
      closeAllMenus();
      this.callbacks.onNewMarkdown?.();
    });

    document.getElementById('menu-tutorial')?.addEventListener('click', () => {
      closeAllMenus();
      this.callbacks.onTutorial?.();
    });

    document.getElementById('menu-about')?.addEventListener('click', () => {
      closeAllMenus();
      this.callbacks.onAbout?.();
    });

    document.getElementById('menu-zoom-in')?.addEventListener('click', () => {
      closeAllMenus();
      this.callbacks.onZoomIn?.();
    });

    document.getElementById('menu-zoom-out')?.addEventListener('click', () => {
      closeAllMenus();
      this.callbacks.onZoomOut?.();
    });

    document.getElementById('menu-reset-view')?.addEventListener('click', () => {
      closeAllMenus();
      this.callbacks.onResetView?.();
    });

    document.getElementById('menu-zoom-lock')?.addEventListener('click', () => {
      closeAllMenus();
      this.callbacks.onZoomLock?.(!this.zoomLocked);
    });

    document.getElementById('menu-theme')?.addEventListener('click', () => {
      closeAllMenus();
      this.callbacks.onTheme?.();
    });

    document.getElementById('menu-ai')?.addEventListener('click', () => {
      closeAllMenus();
      this.callbacks.onAi?.();
    });

    document.getElementById('menu-new-specsmap')?.addEventListener('click', () => {
      closeAllMenus();
      this.callbacks.onNewSpecsmap?.();
    });

    this.el.querySelectorAll('[data-grid]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = (e.currentTarget as HTMLElement).dataset.grid as GridStyle;
        this.gridStyle = val;
        this.callbacks.onGridChange?.(val);
        closeAllMenus();
        this.render();
      });
    });

    // Terminal / Git / SpecsMap instance click handlers are bound via the HTML rendered above
    this.el.querySelectorAll('.term-instance').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const uuid = target.dataset.termUuid || '';
        const isOpen = target.dataset.termOpen === 'true';
        if (isOpen) this.callbacks.onFocusTerminal?.(uuid);
        else this.callbacks.onReopenTerminal?.(uuid);
        closeAllMenus();
      });
    });

    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      theme.toggle();
      this.callbacks.onThemeToggle?.();
    });
  }
}
