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
      onNewExplorer: () => this.canvas.addExplorer(this.wsPath),
      onNewEditor: () => this.canvas.addEditor(),
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
    if (state) {
      this.canvas.setView({ zoom: state.zoom, panX: state.panX, panY: state.panY });
      this.canvas.restoreZOrder(state.zOrder);
    }
    this.canvas.workspaceName = path.split(/[\\/]/).pop() || path;
    this.canvas.addTerminal(path);
    this.canvas.addExplorer(path);
    this.canvas.addEditor();
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
