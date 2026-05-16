import { TopBar } from './TopBar';
import { CanvasArea } from './CanvasArea';
import { PreferencesModal } from './PreferencesModal';
import { WelcomeModal } from './WelcomeModal';

export class App {
  private canvas: CanvasArea;
  private prefs: PreferencesModal;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    document.title = 'Cockpit IDE';

    this.canvas = new CanvasArea(document.getElementById('canvas')!);

    this.canvas.onStateChange = () => this.scheduleSave();

    this.prefs = new PreferencesModal((style) => {
      this.canvas.setGridStyle(style);
    });

    new TopBar(document.getElementById('menu-bar')!, {
      onOpenPreferences: () => this.prefs.open(),
      onThemeToggle: () => this.canvas.refresh(),
      onOpenWorkspace: () => this.openWorkspace(),
    });

    this.initWindowControls();
    this.promptWorkspace();
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveWorkspace(), 500);
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
    await this.saveWorkspace();
    const path = await ws.select();
    if (path) await this.loadWorkspace(path);
  }

  private async saveWorkspace(): Promise<void> {
    const ws = window.electronAPI?.workspace;
    if (!ws) return;
    const state = this.canvas.getSaveState();
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
    this.canvas.workspaceName = path.split(/[\\/]/).pop() || path;
    this.canvas.addTerminal(path);
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
