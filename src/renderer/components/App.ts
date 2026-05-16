import { TopBar } from './TopBar';
import { CanvasArea, SaveState } from './CanvasArea';
import { WelcomeModal } from './WelcomeModal';
import { AboutModal } from './AboutModal';
import { ThemeModal } from './ThemeModal';
import { AiDrawer } from './AiDrawer';
import { Tutorial } from './Tutorial';
import { theme } from '../theme';

export class App {
  private canvas: CanvasArea;
  private topBar: TopBar;
  private about: AboutModal;
  private themeModal: ThemeModal;
  private aiDrawer: AiDrawer;
  private tutorial: Tutorial;
  private lastSaved = '';
  private wsPath = '';

  constructor() {
    document.title = 'Cockpit IDE';

    // Load persisted theme preference before any UI renders
    this.loadThemePref();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+N / Cmd+Shift+N — new window
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        window.electronAPI?.window.newWindow();
      }
      // Ctrl+W / Cmd+W — close active editor tab
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        this.canvas.getActiveExplorerPlugin()?.closeActiveTab();
      }
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        this.canvas.cycleCard(e.shiftKey ? -1 : 1);
      }
      // Ctrl+P / Cmd+P — open file search palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        this.canvas.getActiveExplorerPlugin()?.openFileSearch();
      }
      // Ctrl+Shift+F / Cmd+Shift+F — search across files
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        this.canvas.ensureExplorer().then(exp => exp.openSearch(() => this.canvas.ensureExplorer()));
      }
      // Ctrl+J / Cmd+J — new terminal
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        this.canvas.addTerminal(this.wsPath);
      }
      // Ctrl+O / Cmd+O — open workspace
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        this.openWorkspace();
      }
      // Ctrl+Space — toggle AI agent in detached mode
      if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
        e.preventDefault();
        if (!this.aiDrawer.isDetached) this.aiDrawer.detach();
        this.aiDrawer.toggle();
      }
    });

    this.canvas = new CanvasArea(document.getElementById('canvas')!);

    window.electronAPI?.ide.onOpenFile((filePath) => {
      this.canvas.openFileAndReveal(filePath);
    });

    this.canvas.onStateChange = () => this.trySave();
    this.canvas.onTerminalsChanged = (items) => this.topBar.setTerminalItems(items);

    this.canvas.onGitChanged = (items) => this.topBar.setGitItems(items);
    this.canvas.onSpecsmapChanged = (items) => this.topBar.setSpecsmapItems(items);

    this.canvas.onLockToggle = async () => {
      this.canvas.locked = !this.canvas.locked;
      this.topBar.setZoomLocked(this.canvas.locked);
      const prefs = (await window.electronAPI?.prefs.load()) || {};
      prefs.zoomLocked = this.canvas.locked;
      window.electronAPI?.prefs.save(prefs);
    };

    this.about = new AboutModal();
    this.themeModal = new ThemeModal();
    this.aiDrawer = new AiDrawer();
    this.aiDrawer.onDetachChange = () => this.trySave();
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
        this.canvas.updateAllThemes();
        const prefs = (await window.electronAPI?.prefs.load()) || {};
        prefs.themeName = theme.themeName;
        prefs.baseTheme = theme.base;
        prefs.themeMode = theme.mode;
        window.electronAPI?.prefs.save(prefs);
      },
      onOpenWorkspace: () => this.openWorkspace(),
      onNewTerminal: () => this.canvas.addTerminal(this.wsPath),
      onNewExplorer: () => this.canvas.addExplorer(this.wsPath),
      onNewGit: () => this.canvas.addGit(this.wsPath),
      onNewMarkdown: () => this.canvas.addMarkdown(),
      onFocusTerminal: (uuid) => this.canvas.focusTerminal(uuid),
      onReopenTerminal: (uuid) => this.canvas.reopenTerminal(uuid),
      onFocusExplorer: (uuid) => this.canvas.focusExplorer(uuid),
      onReopenExplorer: (uuid) => this.canvas.reopenExplorer(uuid),
      onFocusMarkdown: (uuid) => this.canvas.focusMarkdown(uuid),
      onReopenMarkdown: (uuid) => this.canvas.reopenMarkdown(uuid),
      onNewSpecsmap: () => this.canvas.addSpecsmap(this.wsPath),
      onFocusSpecsmap: (uuid) => this.canvas.focusSpecsmap(uuid),
      onReopenSpecsmap: (uuid) => this.canvas.reopenSpecsmap(uuid),
      onAbout: () => {
        this.canvas.locked = true;
        this.about.open(() => { this.canvas.locked = false; });
      },
      onTheme: () => {
        this.canvas.locked = true;
        this.themeModal.open(async () => {
          this.canvas.locked = false;
          this.canvas.refresh();
          this.canvas.updateAllThemes();
          const prefs = (await window.electronAPI?.prefs.load()) || {};
          prefs.themeName = theme.themeName;
          prefs.baseTheme = theme.base;
          prefs.themeMode = theme.mode;
          window.electronAPI?.prefs.save(prefs);
        });
      },
      onAi: () => {
        this.aiDrawer.toggle();
      },
      onTutorial: () => {
        this.startTutorial();
      },
      onZoomIn: () => this.canvas.zoomIn(),
      onZoomOut: () => this.canvas.zoomOut(),
      onResetView: () => this.canvas.resetView(),
      onZoomLock: async (locked) => {
        this.canvas.locked = locked;
        this.topBar.setZoomLocked(locked);
        const prefs = (await window.electronAPI?.prefs.load()) || {};
        prefs.zoomLocked = locked;
        window.electronAPI?.prefs.save(prefs);
      },
    });

    this.initWindowControls();
    this.promptWorkspace();
  }

  private trySave(): void {
    if (!this.wsPath) return;
    const state = this.canvas.getSaveState();
    state.aiDrawerDetached = this.aiDrawer.isDetached;
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
    state.aiDrawerDetached = this.aiDrawer.isDetached;
    await ws.save(state, this.wsPath);
  }

  private async loadThemePref(): Promise<void> {
    try {
      const prefs = await window.electronAPI?.prefs.load();
      if (prefs?.baseTheme && prefs?.themeMode) {
        theme.setTheme(prefs.baseTheme, prefs.themeMode);
      } else if (prefs?.themeName) {
        theme.setTheme(prefs.themeName);
      } else if (prefs?.isDark !== undefined) {
        theme.setDark(prefs.isDark);
      }
    } catch {
      // fall back to default dark
    }
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

  private registerCockpitGlobal(): void {
    (window as any).__cockpit = {
      getCanvasState: () => this.canvas.getSaveState(),
      getWorkspacePath: () => this.wsPath,
      openFile: async (p: string) => { const e = await this.canvas.ensureExplorer(); e.openFile(p); },
      addPlugin: (type: string) => {
        switch (type) {
          case 'terminal': this.canvas.addTerminal(this.wsPath); break;
          case 'explorer': this.canvas.addExplorer(this.wsPath); break;
          case 'git': this.canvas.addGit(this.wsPath); break;
          case 'markdown': this.canvas.addMarkdown(); break;
          case 'specsmap': this.canvas.addSpecsmap(this.wsPath); break;
        }
      },
      addTerminal: () => this.canvas.addTerminal(this.wsPath),
      focusCard: (title: string) => this.canvas.focusCardByTitle(title),
      closeCard: (title: string) => this.canvas.closeCard(title),
      minimizeCard: (title: string) => this.canvas.minimizeCard(title),
      moveCard: (title: string, x: number, y: number) => this.canvas.offsetCard(title, x, y),
      resizeCard: (title: string, w: number, h: number) => this.canvas.resizeCard(title, w, h),
      autoArrange: () => this.canvas.autoArrange(),
      fitCardToViewport: (title: string) => this.canvas.fitCardToViewport(title),
      writeToTerminal: (uuid: string, command: string) => {
        window.electronAPI?.terminal.write(uuid, command + '\r');
        this.canvas.panToCardByUuid(uuid);
      },
      sendKeyToTerminal: (uuid: string, sequence: string) => {
        window.electronAPI?.terminal.write(uuid, sequence);
        this.canvas.panToCardByUuid(uuid);
      },
      insertInEditor: async (text: string) => { const e = await this.canvas.ensureExplorer(); e.insertText(text); },
      readTerminal: (uuid: string) => {
        return this.canvas.getTerminalPlugin(uuid)?.getScreenBuffer() ?? 'Terminal not found';
      },
      readEditor: async () => { const e = await this.canvas.ensureExplorer(); return e.editor.getContent() ?? ''; },
      getEditorState: async () => { const e = await this.canvas.ensureExplorer(); return e.getAgentEditorState() ?? null; },
      getSelectionText: async () => { const e = await this.canvas.ensureExplorer(); return e.getSelectionText() ?? ''; },
      setEditorContent: async (content: string) => { const e = await this.canvas.ensureExplorer(); e.setEditorContent(content); },
      goToLine: async (line: number, col?: number) => { const e = await this.canvas.ensureExplorer(); e.goToLine(line, col); },
      reopenCard: (title: string) => {
        const ok = this.canvas.reopenCardByTitle(title);
        if (ok) this.canvas.focusCardByTitle(title);
        return ok;
      },
      resetView: () => this.canvas.resetView(),
      panToCard: (title: string) => this.canvas.focusCardByTitle(title),
      setView: (panX: number, panY: number, zoom?: number) => this.canvas.setViewAnimated(panX, panY, zoom),
      setCanvasOverlay: (left: number) => { this.canvas.overlayLeft = left; },
      zoomIn: () => this.canvas.zoomIn(),
      zoomOut: () => this.canvas.zoomOut(),
      openInMarkdown: (filePath: string) => this.canvas.openInMarkdown(filePath),
      revealFile: async (filePath: string) => { const e = await this.canvas.ensureExplorer(); e.revealFile(filePath); },
      killTerminal: (uuid: string) => {
        window.electronAPI?.terminal.kill(uuid);
      },
      exploreSpecsMap: async (query: string) => {
        const sm = await this.canvas.ensureSpecsmap();
        if (!sm) return 'Unable to open specs map.';
        return sm.explore(query);
      },
      validateSpecsMap: async () => {
        const sm = await this.canvas.ensureSpecsmap();
        if (!sm) return 'Unable to open specs map.';
        return sm.validateSpecs();
      },
      reconcileSpecsMap: async (mode: 'report' | 'structural', createSkeletons: boolean) => {
        const sm = await this.canvas.ensureSpecsmap();
        if (!sm) return 'Unable to open specs map.';
        return sm.reconcileSpecs(mode, createSkeletons);
      },
      reloadSpecsMap: async () => {
        const sm = await this.canvas.ensureSpecsmap();
        if (!sm) return 'Unable to open specs map.';
        return sm.reloadSpecs();
      },
    };
  }

  private async loadWorkspace(path: string): Promise<void> {
    this.wsPath = path;
    this.registerCockpitGlobal();
    this.aiDrawer.resetSessions();
    const ws = window.electronAPI?.workspace;
    if (!ws) return;

    // Register workspace with main process (sets per-window workspacePath, starts watcher + ide-server)
    await ws.setPath(path);

    const state = await ws.load(path);

    if (state && state.plugins && state.plugins.length > 0) {
      // Restore saved plugins with positions
      this.canvas.restorePlugins(state, path);
    } else {
      // First time — create default plugins and auto arrange
      this.canvas.addExplorer(path);
      this.canvas.addTerminal(path);
      this.canvas.autoArrange();
    }

    if (state) {
      this.canvas.setView({ zoom: state.zoom, panX: state.panX, panY: state.panY });
      if (state.locked) {
        this.canvas.locked = true;
        this.topBar.setZoomLocked(true);
      }
    } else {
      this.canvas.centerView();
    }

    // Restore user preferences (fallback for zoomLocked prefs before window.json stored it)
    const prefs = await window.electronAPI?.prefs.load();
    if (prefs?.gridStyle) {
      this.canvas.setGridStyle(prefs.gridStyle);
      this.topBar.setGridStyle(prefs.gridStyle);
    }
    if (prefs?.zoomLocked && !this.canvas.locked) {
      this.canvas.locked = true;
      this.topBar.setZoomLocked(true);
    }

    this.canvas.workspaceName = path;
    this.canvas.refresh();
    this.saveNow();

    if (state?.aiDrawerDetached) {
      this.aiDrawer.detach();
    }

    if (prefs?.showTutorial !== false) {
      this.startTutorial();
    }
  }

  private async startTutorial(): Promise<void> {
    this.tutorial.start(async () => {
      const prefs = (await window.electronAPI?.prefs.load()) || {};
      prefs.showTutorial = this.tutorial.getShowOnLaunch();
      await window.electronAPI?.prefs.save(prefs);
    });
  }

  private initWindowControls(): void {
    const api = window.electronAPI?.window;
    if (!api) return;
    document.getElementById('tb-min')!.onclick = () => api.minimize();
    document.getElementById('tb-max')!.onclick = () => api.maximize();
    document.getElementById('tb-close')!.onclick = () => api.close();
  }
}

