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
    });

    this.initWindowControls();
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
