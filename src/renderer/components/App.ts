import { TopBar } from './TopBar';
import { CanvasArea, SaveState } from './CanvasArea';
import { PreferencesModal } from './PreferencesModal';
import { WelcomeModal } from './WelcomeModal';

export class App {
  private canvas: CanvasArea;
  private prefs: PreferencesModal;
  private topBar: TopBar;
  private lastSaved = '';
  private wsPath = '';

  constructor() {
    document.title = 'Cockpit IDE';

    this.canvas = new CanvasArea(document.getElementById('canvas')!);

    this.canvas.onStateChange = () => this.trySave();
    this.canvas.onTerminalsChanged = (items) => this.topBar.setTerminalItems(items);

    this.prefs = new PreferencesModal((style) => {
      this.canvas.setGridStyle(style);
      this.saveNow();
    });

    this.topBar = new TopBar(document.getElementById('menu-bar')!, {
      onOpenPreferences: () => this.prefs.open(),
      onThemeToggle: () => this.canvas.refresh(),
      onOpenWorkspace: () => this.openWorkspace(),
      onNewTerminal: () => this.canvas.addTerminal(this.wsPath),
      onNewDev: () => this.canvas.addDev(this.wsPath),
      onFocusTerminal: (uuid) => this.canvas.focusTerminal(uuid),
      onReopenTerminal: (uuid) => this.canvas.reopenTerminal(uuid),
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
    await ws.save(state);
  }

  private async promptWorkspace(): Promise<void> {
    const ws = window.electronAPI?.workspace;
    if (!ws) return;
    const savedPath = await ws.getPath();
    if (savedPath) {
      await this.loadWorkspace(savedPath);
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
    const state = await ws.load();

    // Start file watcher
    window.electronAPI?.fs.watch(path);

    if (state && state.plugins && state.plugins.length > 0) {
      // Restore saved plugins with positions
      this.canvas.restorePlugins(state, path);
    } else {
      // First time — create default plugins
      this.canvas.addDev(path);
      this.canvas.addTerminal(path);
    }

    if (state) {
      this.canvas.setView({ zoom: state.zoom, panX: state.panX, panY: state.panY });
    } else {
      this.canvas.centerView();
    }

    // Restore editor state (open files, active tab, cursor positions)
    if (state?.editor) {
      const tryRestore = () => {
        if (this.canvas.devPlugin) {
          this.canvas.devPlugin.restoreEditorState(state.editor);
        }
      };
      tryRestore();
      setTimeout(tryRestore, 500);
    }

    this.canvas.workspaceName = path.split(/[\\/]/).pop() || path;
    this.canvas.refresh();
    this.saveNow();
  }

  private initWindowControls(): void {
    const api = window.electronAPI?.window;
    if (!api) return;
    document.getElementById('tb-min')!.onclick = () => api.minimize();
    document.getElementById('tb-max')!.onclick = () => api.maximize();
    document.getElementById('tb-close')!.onclick = () => api.close();
  }
}

new App();
