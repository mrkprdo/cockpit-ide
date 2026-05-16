interface TutorialStep {
  title: string;
  description: string;
  target?: string;
  overflowHidden?: boolean;
  renderExtra?: (container: HTMLElement) => void;
  onEnter?: () => void;
  onLeave?: () => void;
}

let _tutorialOpenedAiDrawer = false;

const STEPS: TutorialStep[] = [
  {
    title: 'Welcome to Cockpit IDE',
    description: 'Spatial IDE — float IDE plugins & tools on a wide canvas.\n\nLet us show you around.',
  },
  {
    title: 'Wide Canvas',
    description: 'Your workspace. Left-click drag to pan (hold Ctrl over cards). Scroll up/down to zoom.',
    target: '#canvas',
    overflowHidden: true,
  },
  {
    title: 'Menu Bar',
    description: 'File, View, Help — open workspaces, create plugins, toggle grid, zoom, and help. Hover to open.',
    target: '.menu-bar',
  },
  {
    title: 'Terminal Tool',
    description: 'Full PTY terminal. View > Terminal > New. Multiple instances.',
    target: '.menu-bar',
  },
  {
    title: 'Explorer',
    description: 'Split-pane: file tree + Monaco editor. View > Explorer. 30+ languages, multi-tab. Singleton instance.',
    target: '.menu-bar',
  },
  {
    title: 'File Search',
    description: 'Ctrl+P to fuzzy-find files. Type to filter, arrows to navigate, Enter to open.',
  },
  {
    title: 'Markdown Viewer',
    description: 'Tabbed markdown preview. Right-click .md files → "Open to Markdown". Great for docs and notes.',
    target: '.menu-bar',
  },
  {
    title: 'SpecsMap',
    description: 'Visual dependency graph. Tools > SpecsMap. See how features connect.',
    target: '.menu-bar',
  },
  {
    title: 'Cockpit Agent',
    description: 'Built-in AI assistant. Ask it to open files, write code, run terminal commands, or rearrange your canvas — all in natural language.\n\nOpen via the AI chip on the left edge, Tools > AI, or Ctrl+Space. Close with the × in the panel header.',
    target: '.ai-drawer',
    onEnter: () => {
      const el = document.querySelector('.ai-drawer') as HTMLElement | null;
      const notch = document.querySelector('.ai-drawer-notch') as HTMLElement | null;
      if (!el || el.classList.contains('is-open')) return;
      _tutorialOpenedAiDrawer = true;
      el.style.transition = 'none';
      el.style.width = '420px';
      el.classList.add('is-open');
      notch?.classList.add('is-open');
      void el.getBoundingClientRect();
    },
    onLeave: () => {
      if (!_tutorialOpenedAiDrawer) return;
      _tutorialOpenedAiDrawer = false;
      const el = document.querySelector('.ai-drawer') as HTMLElement | null;
      const notch = document.querySelector('.ai-drawer-notch') as HTMLElement | null;
      el?.style.removeProperty('transition');
      if (el?.classList.contains('is-open')) { el.style.width = '0'; el.classList.remove('is-open'); }
      notch?.classList.remove('is-open');
    },
  },
  {
    title: 'Theme',
    description: 'Dark/light toggle. Tools > Theme or the ◐ button.',
    target: '#theme-toggle',
  },
  {
    title: 'Plugin Cards',
    description: 'Drag header to move. Resize via edge handles. Snaps to 28px grid.',
  },
  {
    title: 'Plugin List',
    description: 'See all open plugins. Hover lower-left to open, click to focus.',
    target: '.pli-zone',
    onEnter: () => {
      const p = document.querySelector('.plugin-list-panel') as HTMLElement;
      if (p) p.style.display = 'block';
    },
    onLeave: () => {
      const p = document.querySelector('.plugin-list-panel') as HTMLElement;
      if (p) p.style.display = '';
    },
  },
  {
    title: 'Arrange',
    description: 'Auto-arrange or tile cards. Hover lower-right to open, set grid unit sizes.',
    target: '.prr-zone',
    onEnter: () => {
      const p = document.querySelector('.arr-panel') as HTMLElement;
      if (p) p.style.display = 'block';
    },
    onLeave: () => {
      const p = document.querySelector('.arr-panel') as HTMLElement;
      if (p) p.style.display = '';
    },
  },
  {
    title: 'Keyboard Shortcuts',
    description: [
      'Ctrl+Shift+N — New window',
      'Ctrl+Tab — Cycle cards forward',
      'Ctrl+Shift+Tab — Cycle cards backward',
      'Ctrl+S — Save file (editor)',
      'Scroll up/down — Zoom canvas',
    ].join('\n'),
  },
  {
    title: 'Stay Connected',
    description: 'Bug? Feature? Check the repo:',
    renderExtra: (container) => {
      const links = document.createElement('div');
      links.className = 'tutorial-links';
      const items: [string, string][] = [
        ['Report issue', 'https://github.com/mrkprdo/cockpit-ide/issues'],
        ['Check updates', 'https://github.com/mrkprdo/cockpit-ide/releases'],
        ['View on GitHub', 'https://github.com/mrkprdo/cockpit-ide'],
      ];
      for (const [label, url] of items) {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = label;
        a.className = 'tutorial-link';
        a.addEventListener('click', (e) => {
          e.preventDefault();
          window.electronAPI?.shell.openExternal(url);
        });
        links.appendChild(a);
      }
      container.appendChild(links);
    },
  },
  {
    title: 'Thank You',
    description: 'You are ready. Drag tools, arrange, code spatially.',
    renderExtra: (container) => {
      const label = document.createElement('label');
      label.className = 'tutorial-cb-label';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      label.appendChild(cb);
      label.appendChild(document.createTextNode('Do not show this again'));
      container.appendChild(label);
    },
  },
];

export class Tutorial {
  private overlay: HTMLDivElement;
  private tooltip: HTMLDivElement;
  private ring: HTMLDivElement;
  private stepIdx = 0;
  private onCloseCb: (() => void) | null = null;
  private showOnLaunch = true;
  private prevOnLeave: (() => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'tutorial-overlay';
    this.overlay.style.display = 'none';

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tutorial-tooltip';
    this.tooltip.style.display = 'none';

    this.ring = document.createElement('div');
    this.ring.className = 'tutorial-ring';
    this.ring.style.display = 'none';

    document.addEventListener('keydown', this.onKeydown);
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.tooltip);
    document.body.appendChild(this.ring);
  }

  private onKeydown = (e: KeyboardEvent) => {
    if (this.overlay.style.display === 'none') return;
    if (e.key === 'Escape') this.close();
    if (e.key === 'ArrowRight' || e.key === 'Enter') this.next();
    if (e.key === 'ArrowLeft') this.prev();
  };

  start(onClose?: () => void): void {
    this.onCloseCb = onClose ?? null;
    this.stepIdx = 0;
    this.overlay.style.display = 'flex';
    this.tooltip.style.display = '';
    this.showStep();
  }

  getShowOnLaunch(): boolean {
    return this.showOnLaunch;
  }

  private showStep(): void {
    if (this.prevOnLeave) this.prevOnLeave();
    this.prevOnLeave = null;
    this.clearHighlight();
    const step = STEPS[this.stepIdx];
    const isFirst = this.stepIdx === 0;
    const isLast = this.stepIdx === STEPS.length - 1;

    if (step.onEnter) step.onEnter();
    if (step.onLeave) this.prevOnLeave = step.onLeave;

    this.tooltip.innerHTML = '';

    if (step.target) {
      this.applyHighlight(step.target, !!step.overflowHidden);
    }

    const header = document.createElement('div');
    header.className = 'tutorial-step-header';
    header.textContent = step.title;

    const body = document.createElement('div');
    body.className = 'tutorial-step-body';
    body.textContent = step.description;

    const extra = document.createElement('div');
    if (step.renderExtra) {
      step.renderExtra(extra);
    }

    const nav = document.createElement('div');
    nav.className = 'tutorial-nav';

    const dots = document.createElement('div');
    dots.className = 'tutorial-dots';
    for (let i = 0; i < STEPS.length; i++) {
      const dot = document.createElement('span');
      dot.className = 'tutorial-dot' + (i === this.stepIdx ? ' active' : '');
      dots.appendChild(dot);
    }

    const btnRow = document.createElement('div');
    btnRow.className = 'tutorial-btn-row';

    if (!isFirst) {
      const backBtn = document.createElement('button');
      backBtn.className = 'tutorial-btn tutorial-btn-back';
      backBtn.textContent = '← Back';
      backBtn.addEventListener('click', () => this.prev());
      btnRow.appendChild(backBtn);
    } else {
      const spacer = document.createElement('div');
      spacer.style.flex = '1';
      btnRow.appendChild(spacer);
    }

    if (isLast) {
      const doneBtn = document.createElement('button');
      doneBtn.className = 'tutorial-btn tutorial-btn-done';
      doneBtn.textContent = 'Done';
      doneBtn.addEventListener('click', () => {
        this.showOnLaunch = (extra.querySelector('input[type="checkbox"]') as HTMLInputElement | null)?.checked !== true;
        this.close();
      });
      btnRow.appendChild(doneBtn);
    } else {
      const nextBtn = document.createElement('button');
      nextBtn.className = 'tutorial-btn tutorial-btn-next';
      nextBtn.textContent = 'Next →';
      nextBtn.addEventListener('click', () => this.next());
      btnRow.appendChild(nextBtn);
    }

    nav.appendChild(dots);
    nav.appendChild(btnRow);

    this.tooltip.appendChild(header);
    this.tooltip.appendChild(body);
    if (extra.children.length > 0) {
      this.tooltip.appendChild(extra);
    }
    this.tooltip.appendChild(nav);

    if (!step.target) {
      this.tooltip.style.top = '50%';
      this.tooltip.style.left = '50%';
      this.tooltip.style.transform = 'translate(-50%, -50%)';
      this.tooltip.style.removeProperty('bottom');
      this.tooltip.style.removeProperty('right');
    } else {
      this.positionTooltip(step.target);
    }

  }

  private applyHighlight(selector: string, overflowHidden?: boolean): void {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    this.ring.style.left = rect.left + 'px';
    this.ring.style.top = rect.top + 'px';
    this.ring.style.width = rect.width + 'px';
    this.ring.style.height = rect.height + 'px';
    this.ring.style.display = 'block';
    if (overflowHidden) {
      el.style.overflow = 'hidden';
    }
  }

  private clearHighlight(): void {
    this.ring.style.display = 'none';
  }

  private positionTooltip(selector?: string): void {
    if (!selector) return;
    const target = document.querySelector(selector) as HTMLElement | null;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const ttW = Math.min(360, vw - 40);

    this.tooltip.style.transform = '';
    this.tooltip.style.left = '';
    this.tooltip.style.right = '';
    this.tooltip.style.top = '';
    this.tooltip.style.bottom = '';
    this.tooltip.style.width = ttW + 'px';

    const centerX = rect.left + rect.width / 2;
    const spaceAbove = rect.top;
    const spaceBelow = vh - rect.bottom;
    const spaceLeft = rect.left;
    const spaceRight = vw - rect.right;

    if (spaceBelow > 280) {
      this.tooltip.style.top = (rect.bottom + 12) + 'px';
      this.tooltip.style.left = Math.max(8, Math.min(centerX - ttW / 2, vw - ttW - 8)) + 'px';
    } else if (spaceAbove > 280) {
      this.tooltip.style.bottom = (vh - rect.top + 12) + 'px';
      this.tooltip.style.left = Math.max(8, Math.min(centerX - ttW / 2, vw - ttW - 8)) + 'px';
    } else if (spaceRight > ttW + 20) {
      this.tooltip.style.left = (rect.right + 12) + 'px';
      this.tooltip.style.top = Math.max(8, Math.min(rect.top, vh - 280 - 8)) + 'px';
    } else if (spaceLeft > ttW + 20) {
      this.tooltip.style.right = (vw - rect.left + 12) + 'px';
      this.tooltip.style.top = Math.max(8, Math.min(rect.top, vh - 280 - 8)) + 'px';
    } else {
      this.tooltip.style.top = '50%';
      this.tooltip.style.left = '50%';
      this.tooltip.style.transform = 'translate(-50%, -50%)';
    }
  }

  private next(): void {
    if (this.stepIdx < STEPS.length - 1) {
      this.stepIdx++;
      this.showStep();
    }
  }

  private prev(): void {
    if (this.stepIdx > 0) {
      this.stepIdx--;
      this.showStep();
    }
  }

  private close(): void {
    if (this.prevOnLeave) this.prevOnLeave();
    this.prevOnLeave = null;
    this.clearHighlight();
    this.overlay.style.display = 'none';
    this.tooltip.style.display = 'none';
    this.onCloseCb?.();
    this.onCloseCb = null;
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKeydown);
    if (this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
    if (this.tooltip.parentNode) this.tooltip.parentNode.removeChild(this.tooltip);
    if (this.ring.parentNode) this.ring.parentNode.removeChild(this.ring);
  }
}
