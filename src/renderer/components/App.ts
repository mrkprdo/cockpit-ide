import { TopBar } from './TopBar';
import { CanvasArea, SaveState } from './CanvasArea';
import { WelcomeModal } from './WelcomeModal';
import { AboutModal } from './AboutModal';
import { Tutorial } from './Tutorial';
import { theme } from '../theme';

export class App {
  private canvas: CanvasArea;
  private topBar: TopBar;
  private about: AboutModal;
  private tutorial: Tutorial;
  private lastSaved = '';
  private wsPath = '';

  constructor() {
    document.title = 'Cockpit IDE';

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+N / Cmd+Shift+N — new window
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        window.electronAPI?.window.newWindow();
      }
      // Disable Ctrl+W (browser close tab shortcut)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        this.canvas.cycleCard(e.shiftKey ? -1 : 1);
      }
    });

    this.canvas = new CanvasArea(document.getElementById('canvas')!);

    this.canvas.onStateChange = () => this.trySave();
    this.canvas.onTerminalsChanged = (items) => this.topBar.setTerminalItems(items);
    this.canvas.onDevsChanged = (items) => this.topBar.setDevItems(items);
    this.canvas.onContextsChanged = (items) => this.topBar.setContextItems(items);

    this.about = new AboutModal();
    this.tutorial = new Tutorial();

    this.topBar = new TopBar(document.getElementById('menu-bar')!, {
      onGridChange: async (style) => {
        this.canvas.setGridStyle(style);
        const prefs = (await window.electronAPI?.prefs.load()) || {};
        prefs.gridStyle = style;
        window.electronAPI?.prefs.save(prefs);
      },
      onThemeToggle: async () => {
        this.canvas.refresh();
        this.canvas.devPlugin?.updateTheme();
        const prefs = (await window.electronAPI?.prefs.load()) || {};
        prefs.isDark = theme.isDark;
        window.electronAPI?.prefs.save(prefs);
      },
      onOpenWorkspace: () => this.openWorkspace(),
      onNewTerminal: () => this.canvas.addTerminal(this.wsPath),
      onNewDev: () => this.canvas.addDev(this.wsPath),
      onNewContext: () => this.canvas.addContext(),
      onFocusTerminal: (uuid) => this.canvas.focusTerminal(uuid),
      onReopenTerminal: (uuid) => this.canvas.reopenTerminal(uuid),
      onFocusDev: (uuid) => this.canvas.focusDev(uuid),
      onReopenDev: (uuid) => this.canvas.reopenDev(uuid),
      onFocusContext: (uuid) => this.canvas.focusContext(uuid),
      onReopenContext: (uuid) => this.canvas.reopenContext(uuid),
      onAbout: () => {
        this.canvas.locked = true;
        this.about.open(() => { this.canvas.locked = false; });
      },
      onTutorial: () => {
        this.tutorial.start();
      },
      onZoomIn: () => this.canvas.zoomIn(),
      onZoomOut: () => this.canvas.zoomOut(),
      onResetView: () => this.canvas.resetView(),
    });

    this.initWindowControls();
    this.promptWorkspace();
  }

  private trySave(): void {
    if (!this.wsPath) return;
    const state = this.canvas.getSaveState();
    const key = JSON.stringify(state);
    if (key === this.lastSaved) return;
    this.lastSaved = key;
    this.saveNow();
  }

  private async saveNow(): Promise<void> {
    if (!this.wsPath) return;
    const ws = window.electronAPI?.workspace;
    if (!ws) return;
    const state = this.canvas.getSaveState();
    await ws.save(state, this.wsPath);
  }

  private async promptWorkspace(): Promise<void> {
    const ws = window.electronAPI?.workspace;
    if (!ws) return;

    const cliPath = await ws.getPath();
    if (cliPath) {
      await this.loadWorkspace(cliPath);
      return;
    }

    const modal = new WelcomeModal();
    const path = await modal.open();
    if (!path) {
      window.close();
      return;
    }
    await this.loadWorkspace(path);
  }

  private async openWorkspace(): Promise<void> {
    const ws = window.electronAPI?.workspace;
    if (!ws) return;
    await this.saveNow();
    const path = await ws.select();
    if (path) await this.loadWorkspace(path);
  }

  private async loadWorkspace(path: string): Promise<void> {
    this.wsPath = path;
    const ws = window.electronAPI?.workspace;
    if (!ws) return;
    const state = await ws.load(path);

    // Start file watcher
    window.electronAPI?.fs.watch(path);

    if (state && state.plugins && state.plugins.length > 0) {
      // Restore saved plugins with positions
      this.canvas.restorePlugins(state, path);
    } else {
      // First time — create default plugins and auto arrange
      this.canvas.addDev(path);
      this.canvas.addTerminal(path);
      this.canvas.autoArrange();
    }

    if (state) {
      this.canvas.setView({ zoom: state.zoom, panX: state.panX, panY: state.panY });
      // Restore theme
      if (state.isDark !== undefined) {
        theme.setDark(state.isDark);
        this.canvas.devPlugin?.updateTheme();
      }
    } else {
      this.canvas.centerView();
    }

    // Restore user preferences
    const prefs = await window.electronAPI?.prefs.load();
    if (prefs?.gridStyle) {
      this.canvas.setGridStyle(prefs.gridStyle);
      this.topBar.setGridStyle(prefs.gridStyle);
    }
    if (prefs?.isDark !== undefined) {
      theme.setDark(prefs.isDark);
      this.canvas.devPlugin?.updateTheme();
    }

    this.canvas.workspaceName = path;
    this.canvas.refresh();
    this.saveNow();

    if (prefs?.showTutorial !== false) {
      this.tutorial.start();
    }
  }

  private initWindowControls(): void {
    const api = window.electronAPI?.window;
    if (!api) return;
    document.getElementById('tb-min')!.onclick = () => api.minimize();
    document.getElementById('tb-max')!.onclick = () => api.maximize();
    document.getElementById('tb-close')!.onclick = () => api.close();
  }
}
