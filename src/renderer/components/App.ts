import { TopBar } from './TopBar';
import { CanvasArea } from './CanvasArea';
import { PreferencesModal } from './PreferencesModal';

export class App {
  private canvas: CanvasArea;
  private prefs: PreferencesModal;

  constructor() {
    document.title = 'Cockpit IDE';

    this.canvas = new CanvasArea(document.getElementById('canvas')!);

    this.prefs = new PreferencesModal((style) => {
      this.canvas.setGridStyle(style);
    });

    new TopBar(document.getElementById('menu-bar')!, {
      onOpenPreferences: () => this.prefs.open(),
      onThemeToggle: () => this.canvas.refresh(),
      onOpenWorkspace: () => this.openWorkspace(),
    });

    this.initWindowControls();
    this.tryRestoreWorkspace();
  }

  private async tryRestoreWorkspace(): Promise<void> {
    const ws = window.electronAPI?.workspace;
    const path = await ws?.getPath();
    if (path) await this.loadWorkspace(path);
  }

  private async openWorkspace(): Promise<void> {
    const ws = window.electronAPI?.workspace;
    if (!ws) return;
    // Save current state before switching
    await this.saveWorkspace();
    const path = await ws.select();
    if (path) await this.loadWorkspace(path);
  }

  private async saveWorkspace(): Promise<void> {
    const ws = window.electronAPI?.workspace;
    if (!ws) return;
    const state = this.canvas.getSaveState();
    // Load existing state and merge saved plugins with current
    const existing = await ws.load() || { plugins: [] };
    existing.zoom = state.zoom;
    existing.panX = state.panX;
    existing.panY = state.panY;
    existing.plugins = state.plugins;
    await ws.save(existing);
  }

  private async loadWorkspace(path: string): Promise<void> {
    const ws = window.electronAPI?.workspace;
    if (!ws) return;
    const state = await ws.load();
    if (state) {
      this.canvas.setView({ zoom: state.zoom, panX: state.panX, panY: state.panY });
    }
    const name = path.split(/[\\/]/).pop() || path;
    this.canvas.workspaceName = name;
    this.canvas.refresh();
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
