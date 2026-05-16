import { theme } from '../theme';

interface TopBarCallbacks {
  onOpenPreferences: () => void;
}

export class TopBar {
  private callbacks: TopBarCallbacks;

  constructor(private el: HTMLElement, callbacks: TopBarCallbacks) {
    this.callbacks = callbacks;
    this.render();
  }

  private render(): void {
    this.el.innerHTML = `
      <div class="menu-item">
        File
        <div class="menu-dropdown">
          <div class="menu-dropdown-item">New Project</div>
          <div class="menu-dropdown-item">Open...</div>
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
          <div class="menu-dropdown-item">Zoom In</div>
          <div class="menu-dropdown-item">Zoom Out</div>
          <div class="menu-dropdown-item">Reset View</div>
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

    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      theme.toggle();
    });
  }
}
