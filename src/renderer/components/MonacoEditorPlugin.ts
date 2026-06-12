import { ContextMenu } from './ContextMenu';
import { theme } from '../theme';

interface Tab { filePath: string; name: string; originalPath: string; }

// Shared across all instances — bootstraps Monaco globals (CSS, loader.js, themes) exactly once.
let monacoReady: Promise<any> | null = null;

export class MonacoEditorPlugin {
  onStateChange: (() => void) | null = null;

  private el: HTMLDivElement;
  private editorEl: HTMLDivElement;
  tabs: Tab[] = [];
  activeTab: string | null = null;
  private fileContents = new Map<string, string>();
  private dirtyFiles = new Set<string>();
  private suppressDirty = false;
  private editor: any = null;
  private bar: HTMLDivElement;
  private tabContainer: HTMLDivElement;
  private ready: Promise<void>;

  private unsubFileChanged: (() => void) | null = null;
  private ideDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'editor-wrap';

    this.bar = document.createElement('div');
    this.bar.className = 'editor-tab-bar';

    this.unsubFileChanged = window.electronAPI?.fs.onChanged((rawPath) => {
      const normalized = rawPath.replace(/\\/g, '/').toLowerCase();
      this.reloadIfOpen(normalized);
    }) || null;

    this.tabContainer = document.createElement('div');
    this.tabContainer.className = 'editor-tab-scroll';
    this.tabContainer.id = 'tab-container';

    // Clean up drag visual state when drag ends anywhere
    document.addEventListener('dragend', () => {
      this.tabContainer.querySelectorAll('.is-dragging, .is-dragover').forEach(el => {
        el.classList.remove('is-dragging', 'is-dragover');
      });
    });

    this.bar.appendChild(this.tabContainer);
    this.el.appendChild(this.bar);

    this.editorEl = document.createElement('div');
    this.editorEl.className = 'editor-area';
    this.editorEl.id = 'monaco-' + crypto.randomUUID();
    this.el.appendChild(this.editorEl);

    container.appendChild(this.el);
    this.initTabDummies();
    this.ready = this.initMonaco();
  }

  private initTabDummies(): void {
    const empty = document.createElement('span');
    empty.className = 'editor-empty';
    empty.textContent = 'No file selected';
    this.tabContainer.appendChild(empty);
  }

  private clearTabDummies(): void {
    this.tabContainer.querySelectorAll('span').forEach(s => {
      if (s.textContent === 'No file selected') s.remove();
    });
  }

  private renderTabs(): void {
    this.tabContainer.innerHTML = '';
    this.clearTabDummies();

    if (this.tabs.length === 0) {
      this.initTabDummies();
      return;
    }

    for (const tab of this.tabs) {
      const isActive = tab.filePath === this.activeTab;
      const isDirty = this.dirtyFiles.has(tab.filePath);
      const tabEl = document.createElement('div');
      tabEl.className = 'editor-tab' + (isActive ? ' is-active' : '') + (isDirty ? ' is-dirty' : '');
      tabEl.title = tab.filePath;
      tabEl.draggable = true;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'editor-tab-name';
      nameSpan.textContent = tab.name;
      tabEl.appendChild(nameSpan);

      const closeBtn = document.createElement('span');
      closeBtn.className = 'editor-tab-close';
      closeBtn.textContent = '✕';

      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(tab.filePath);
      });

      tabEl.addEventListener('click', () => this.switchTab(tab.filePath));

      // Middle-click to close
      tabEl.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          this.closeTab(tab.filePath);
        }
      });

      // Drag-and-drop reorder
      tabEl.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/plain', tab.filePath);
        tabEl.classList.add('is-dragging');
      });
      tabEl.addEventListener('dragover', (e) => { e.preventDefault(); });
      tabEl.addEventListener('dragenter', (e) => {
        e.preventDefault();
        tabEl.classList.add('is-dragover');
      });
      tabEl.addEventListener('dragleave', () => {
        tabEl.classList.remove('is-dragover');
      });
      tabEl.addEventListener('drop', (e) => {
        e.preventDefault();
        tabEl.classList.remove('is-dragover');
        const draggedPath = e.dataTransfer?.getData('text/plain');
        if (!draggedPath || draggedPath === tab.filePath) return;
        const fromIdx = this.tabs.findIndex(t => t.filePath === draggedPath);
        const toIdx = this.tabs.findIndex(t => t.filePath === tab.filePath);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = this.tabs.splice(fromIdx, 1);
        this.tabs.splice(toIdx, 0, moved);
        this.renderTabs();
        this.onStateChange?.();
      });

      // Right-click context menu
      tabEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        new ContextMenu([
          { label: 'Close', action: () => this.closeTab(tab.filePath) },
          { label: 'Close Others', action: () => this.closeOtherTabs(tab.filePath) },
          { label: 'Close All', action: () => this.closeAllTabs() },
          { separator: true },
          { label: 'Copy File Path', action: () => { window.electronAPI?.clipboard.writeText(tab.originalPath); } },
        ], e.clientX, e.clientY);
      });

      tabEl.appendChild(closeBtn);
      this.tabContainer.appendChild(tabEl);
    }

    // Auto-scroll active tab into view (manual scrollLeft to avoid ancestor overflow:hidden scroll)
    const activeEl = this.tabContainer.querySelector('.is-active') as HTMLElement;
    if (activeEl) {
      const container = this.tabContainer;
      const tabLeft = activeEl.offsetLeft;
      const tabRight = tabLeft + activeEl.offsetWidth;
      if (tabLeft < container.scrollLeft) {
        container.scrollLeft = tabLeft;
      } else if (tabRight > container.scrollLeft + container.clientWidth) {
        container.scrollLeft = tabRight - container.clientWidth;
      }
    }
  }

  private getLanguage(ext: string): string {
    const map: Record<string, string> = {
      ts: 'typescript', js: 'javascript', tsx: 'typescript', jsx: 'javascript',
      json: 'json', html: 'html', css: 'css', md: 'markdown',
      py: 'python', rs: 'rust', yaml: 'yaml', yml: 'yaml',
      xml: 'xml', svg: 'xml', sh: 'shell', bat: 'bat', ps1: 'powershell',
      cpp: 'cpp', c: 'c', cs: 'csharp', java: 'java',
      go: 'go', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
    };
    return map[ext] || 'plaintext';
  }

  /** Reload file content if this file is open in a tab */
  async reloadIfOpen(filePath: string): Promise<void> {
    const lcPath = filePath.toLowerCase();
    const tab = this.tabs.find(t => t.filePath === lcPath);
    if (!tab) return;
    const content = await window.electronAPI?.fs.readFile(tab.originalPath);
    if (content === null) {
      this.closeTab(lcPath);
    } else if (content !== undefined) {
      this.fileContents.set(lcPath, content);
      if (this.activeTab === lcPath && this.editor) {
        if (this.editor.getValue() !== content) {
          this.suppressDirty = true;
          this.editor.setValue(content);
          this.suppressDirty = false;
        }
      }
    }
  }

  async openFile(filePath: string): Promise<void> {
    await this.ready;
    const normalized = filePath.replace(/\\/g, '/');
    const lcPath = normalized.toLowerCase();
    const name = normalized.split('/').pop() || normalized;

    const existing = this.tabs.find(t => t.filePath === lcPath);
    if (existing) {
      this.switchTab(lcPath);
      return;
    }

    const content = await window.electronAPI?.fs.readFile(normalized) || '';
    this.fileContents.set(lcPath, content);

    this.tabs.push({ filePath: lcPath, name, originalPath: normalized });
    this.switchTab(lcPath);
    this.onStateChange?.();
  }

  private savedCursors: Record<string, { lineNumber: number; column: number; scrollTop: number }> = {};

  switchTab(filePath: string): void {
    const lcPath = filePath.replace(/\\/g, '/').toLowerCase();
    const tab = this.tabs.find(t => t.filePath === lcPath);
    if (!tab) return;

    if (this.editor) {
      if (this.editor.getValue && this.activeTab) {
        this.fileContents.set(this.activeTab, this.editor.getValue());
        const pos = this.editor.getPosition();
        if (pos) {
          this.savedCursors[this.activeTab] = {
            lineNumber: pos.lineNumber,
            column: pos.column,
            scrollTop: this.editor.getScrollTop() || 0,
          };
        }
      }
      this.activeTab = lcPath;

      const content = this.fileContents.get(lcPath) || '';
      this.suppressDirty = true;
      this.editor.setValue(content);
      this.suppressDirty = false;

      const saved = this.savedCursors[lcPath];
      if (saved) {
        this.editor.setPosition({ lineNumber: saved.lineNumber, column: saved.column });
        this.editor.setScrollTop(saved.scrollTop);
      }

      const ext = (tab.name.split('.').pop() || '').toLowerCase();
      const m = (window as any).monaco;
      if (m) {
        const model = this.editor.getModel();
        m.editor.setModelLanguage(model, this.getLanguage(ext));
      }
    }

    this.renderTabs();
    this.sendEditorState();
  }

  closeActiveTab(): void {
    if (this.activeTab) this.closeTab(this.activeTab);
  }

  private closeTab(filePath: string): void {
    const lcPath = filePath.replace(/\\/g, '/').toLowerCase();
    const idx = this.tabs.findIndex(t => t.filePath === lcPath);
    if (idx === -1) return;
    this.tabs.splice(idx, 1);
    this.fileContents.delete(lcPath);
    this.dirtyFiles.delete(lcPath);

    if (this.activeTab === lcPath) {
      if (this.tabs.length > 0) {
        const newIdx = Math.min(idx, this.tabs.length - 1);
        this.switchTab(this.tabs[newIdx].filePath);
      } else {
        this.activeTab = null;
        if (this.editor) { this.suppressDirty = true; this.editor.setValue(''); this.suppressDirty = false; }
        this.renderTabs();
      }
    } else {
      this.renderTabs();
    }
    this.sendEditorState();
    this.onStateChange?.();
  }

  private closeOtherTabs(filePath: string): void {
    const lcPath = filePath.replace(/\\/g, '/').toLowerCase();
    const keep = this.tabs.find(t => t.filePath === lcPath);
    if (!keep) return;
    this.tabs = [keep];
    const keptContent = this.fileContents.get(lcPath) || '';
    this.fileContents.clear();
    this.fileContents.set(lcPath, keptContent);
    this.dirtyFiles.clear();
    this.savedCursors = {};
    this.activeTab = lcPath;
    if (this.editor) { this.suppressDirty = true; this.editor.setValue(keptContent); this.suppressDirty = false; }
    this.renderTabs();
    this.sendEditorState();
    this.onStateChange?.();
  }

  private closeAllTabs(): void {
    this.tabs = [];
    this.fileContents.clear();
    this.dirtyFiles.clear();
    this.savedCursors = {};
    this.activeTab = null;
    if (this.editor) { this.suppressDirty = true; this.editor.setValue(''); this.suppressDirty = false; }
    this.renderTabs();
    this.sendEditorState();
    this.onStateChange?.();
  }

  private updateDirtyState(): void {
    const activeEl = this.tabContainer.querySelector('.editor-tab.is-active');
    if (activeEl && this.activeTab) {
      activeEl.classList.toggle('is-dirty', this.dirtyFiles.has(this.activeTab));
    }
  }

  getCurrentFile(): string { return this.activeTab || ''; }
  getContent(): string { return this.editor?.getValue() || ''; }

  private getActiveOriginalPath(): string | null {
    if (!this.activeTab) return null;
    const tab = this.tabs.find(t => t.filePath === this.activeTab);
    return tab ? tab.originalPath : null;
  }

  private sendEditorState(): void {
    if (this.ideDebounce) clearTimeout(this.ideDebounce);
    this.ideDebounce = setTimeout(() => {
      const api = window.electronAPI;
      if (!api?.ide) return;
      const filePath = this.getActiveOriginalPath();
      if (!filePath) {
        api.ide.editorState({ filePath: null, text: null, selection: null });
        return;
      }
      let selection: { startLine: number; startColumn: number; endLine: number; endColumn: number } | null = null;
      let text: string | null = null;
      if (this.editor) {
        const sel = this.editor.getSelection();
        if (sel) {
          const isCollapsed =
            sel.selectionStartLineNumber === sel.positionLineNumber &&
            sel.selectionStartColumn === sel.positionColumn;
          if (!isCollapsed) {
            selection = {
              startLine: sel.selectionStartLineNumber,
              startColumn: sel.selectionStartColumn,
              endLine: sel.positionLineNumber,
              endColumn: sel.positionColumn,
            };
            const model = this.editor.getModel();
            if (model) {
              text = model.getValueInRange({
                startLineNumber: sel.startLineNumber,
                startColumn: sel.startColumn,
                endLineNumber: sel.endLineNumber,
                endColumn: sel.endColumn,
              });
            }
          }
        }
      }
      api.ide.editorState({ filePath, text, selection });
    }, 150);
  }

  private isLight(): boolean {
    return !theme.isDark;
  }

  private cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  updateTheme(): void {
    const m = (window as any).monaco;
    if (!m || !this.editor) return;
    const light = this.isLight();
    m.editor.setTheme(light ? 'cockpit-light' : 'cockpit-dark');
  }

  private createEditorInstance(m: any): void {
    this.editor = m.editor.create(this.editorEl, {
      value: '',
      language: 'plaintext',
      theme: this.isLight() ? 'cockpit-light' : 'cockpit-dark',
      fontSize: 13,
      fontFamily: '"Space Mono", "Courier New", monospace',
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      wordWrap: 'on',
      tabSize: 2,
      renderWhitespace: 'selection',
      padding: { top: 8 },
    });

    this.editor.addAction({
      id: 'save-file',
      label: 'Save File',
      keybindings: [m.KeyMod.CtrlCmd | m.KeyCode.KeyS],
      run: () => this.saveCurrentFile(),
    });

    let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
    this.editor.onDidChangeModelContent(() => {
      if (this.activeTab && !this.suppressDirty) {
        this.dirtyFiles.add(this.activeTab);
        this.updateDirtyState();
      }
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => this.saveCurrentFile(), 1500);
    });

    this.editor.onDidChangeCursorSelection(() => {
      this.sendEditorState();
    });
  }

  private async initMonaco(): Promise<void> {
    // If another instance already bootstrapped globals, just create this instance's editor.
    if ((window as any).monaco) {
      this.createEditorInstance((window as any).monaco);
      return;
    }
    // Bootstrap once across all instances — loader.js declares top-level vars and
    // throws if injected twice.
    if (!monacoReady) {
      monacoReady = this.bootstrapMonaco();
    }
    const m = await monacoReady;
    if (m) this.createEditorInstance(m);
  }

  private async bootstrapMonaco(): Promise<any> {
    const vsBase = new URL('../vs', window.location.href).href.replace(/\/$/, '');

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '../vs/editor/editor.main.css';
    document.head.appendChild(link);

    // Relative URL resolves to file:// worker — file:// pages can create file:// workers,
    // and Electron transparently handles ASAR paths. Inside the worker, importScripts
    // with relative paths resolves correctly relative to the worker file.
    (window as any).MonacoEnvironment = {
      getWorkerUrl: (_moduleId: string, _label: string): string => {
        return '../vs/base/worker/workerMain.js';
      },
    };

    await this.loadScript('../vs/loader.js');

    return new Promise<any>((resolve) => {
      const r = (window as any).require;
      r.config({
        paths: { vs: vsBase },
        'vs/nls': { availableLanguages: { '*': '' } },
      });

      r(['vs/editor/editor.main'], () => {
        const m = (window as any).monaco;
        if (!m) { resolve(m); return; }

        m.editor.defineTheme('cockpit-dark', {
          base: 'vs-dark', inherit: true, rules: [],
          colors: {
            'editor.background': '#0A0E14',
            'editor.foreground': '#C8D6E5',
            'editorCursor.foreground': '#C8D6E5',
            'editor.selectionBackground': '#2A3A4A',
            'editorLineNumber.foreground': '#546E7A',
            'editorLineNumber.activeForeground': '#78909C',
            'editorWidget.background': '#121820',
            'editorWidget.border': '#2A3A4A',
            'input.background': '#1A2430',
            'input.border': '#2A3A4A',
            'focusBorder': '#2A3A4A',
          },
        });

        m.editor.defineTheme('cockpit-light', {
          base: 'vs', inherit: true, rules: [],
          colors: {
            'editor.background': '#f8f8f8',
            'editor.foreground': '#1a1a1a',
            'editorCursor.foreground': '#1a1a1a',
            'editor.selectionBackground': '#e0e0e0',
            'editorLineNumber.foreground': '#6a6a6a',
            'editorLineNumber.activeForeground': '#2a2a2a',
            'editorWidget.background': '#eeeeee',
            'editorWidget.border': '#1a1a1a',
            'input.background': '#ffffff',
            'input.border': '#1a1a1a',
            'focusBorder': '#1a1a1a',
          },
        });

        resolve(m);
      }, (err: any) => {
        console.error('Monaco failed to load:', err);
        resolve(null);
      });
    });
  }

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  saveCurrentFile(): void {
    if (!this.activeTab || !this.editor) return;
    const tab = this.tabs.find(t => t.filePath === this.activeTab);
    if (!tab) return;
    const content = this.editor.getValue();
    if (content === undefined) return;
    window.electronAPI?.fs.writeFile(tab.originalPath, content);
    this.dirtyFiles.delete(this.activeTab);
    this.updateDirtyState();
  }

  getState(): { openFiles: string[]; activeFile: string; explorerWidth: number; cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }> } | null {
    if (this.tabs.length === 0) return null;

    if (this.activeTab && this.editor) {
      const pos = this.editor.getPosition();
      if (pos) {
        this.savedCursors[this.activeTab] = {
          lineNumber: pos.lineNumber,
          column: pos.column,
          scrollTop: this.editor.getScrollTop() || 0,
        };
      }
    }

    return {
      openFiles: this.tabs.map(t => t.originalPath),
      activeFile: this.activeTab || '',
      explorerWidth: 260,
      cursors: { ...this.savedCursors },
    };
  }

  async restoreState(state: { openFiles: string[]; activeFile: string; explorerWidth?: number; cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }> }): Promise<void> {
    const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    const targetActive = norm(state.activeFile);
    const cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }> = {};
    for (const [k, v] of Object.entries(state.cursors)) cursors[norm(k)] = v;
    for (const f of state.openFiles) {
      await this.openFile(f);
    }
    if (targetActive && targetActive !== this.activeTab) {
      this.switchTab(targetActive);
    }
    requestAnimationFrame(() => {
      for (const [filePath, pos] of Object.entries(cursors)) {
        if (filePath === this.activeTab && this.editor) {
          this.editor.setPosition({ lineNumber: pos.lineNumber, column: pos.column });
          this.editor.setScrollTop(pos.scrollTop);
          this.editor.revealPositionInCenter({ lineNumber: pos.lineNumber, column: pos.column });
        }
      }
    });
  }
}
