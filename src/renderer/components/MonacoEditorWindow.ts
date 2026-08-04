import { ContextMenu } from './ContextMenu';
import { theme } from '../theme';
import { initMonacoEditor } from './monaco-bootstrap';
import { renderMarkdownToHtml } from './markdown-render';

interface Tab { filePath: string; name: string; originalPath: string; kind?: 'markdown'; }

export class MonacoEditorWindow {
  onStateChange: (() => void) | null = null;
  onFileActivated: ((filePath: string) => void) | null = null;

  private el: HTMLDivElement;
  private editorEl: HTMLDivElement;
  private markdownPreviewEl: HTMLDivElement;
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
    this.el.style.position = 'relative';

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

    // Markdown preview — shown in place of the Monaco editor when a .md tab is
    // in markdown mode (View as Markdown). Shares the same tab bar as the editor.
    this.markdownPreviewEl = document.createElement('div');
    this.markdownPreviewEl.className = 'md-preview-area';
    this.markdownPreviewEl.style.cssText = 'position:absolute;left:0;right:0;top:30px;bottom:0;overflow:auto;display:none;';
    this.el.appendChild(this.markdownPreviewEl);

    container.appendChild(this.el);
    this.initTabDummies();
    this.ready = this.initEditor();
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
      tabEl.className = 'editor-tab' + (isActive ? ' is-active' : '') + (isDirty ? ' is-dirty' : '') + (tab.kind === 'markdown' ? ' is-markdown' : '');
      tabEl.title = tab.filePath;
      tabEl.draggable = true;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'editor-tab-name';
      nameSpan.textContent = (tab.kind === 'markdown' ? '◈ ' : '') + tab.name;
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
      if (this.activeTab === lcPath) {
        if (tab.kind === 'markdown') {
          this.renderMarkdownPreview(content);
        } else if (this.editor) {
          if (this.editor.getValue() !== content) {
            this.suppressDirty = true;
            this.editor.setValue(content);
            this.suppressDirty = false;
          }
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
      // Re-opening via the explorer switches a markdown-preview tab back to code.
      if (existing.kind === 'markdown') existing.kind = undefined;
      this.switchTab(lcPath);
      return;
    }

    const content = await window.electronAPI?.fs.readFile(normalized) || '';
    this.fileContents.set(lcPath, content);

    this.tabs.push({ filePath: lcPath, name, originalPath: normalized });
    this.switchTab(lcPath);
    this.onStateChange?.();
  }

  /** Open a Markdown file as a rendered preview tab (mixed into the same tab bar). */
  async openMarkdown(filePath: string): Promise<void> {
    await this.ready;
    const normalized = filePath.replace(/\\/g, '/');
    const lcPath = normalized.toLowerCase();
    const name = normalized.split('/').pop() || normalized;

    const existing = this.tabs.find(t => t.filePath === lcPath);
    if (existing) {
      existing.kind = 'markdown';
      this.switchTab(lcPath);
      return;
    }

    const content = await window.electronAPI?.fs.readFile(normalized) || '';
    this.fileContents.set(lcPath, content);

    this.tabs.push({ filePath: lcPath, name, originalPath: normalized, kind: 'markdown' });
    this.switchTab(lcPath);
    this.onStateChange?.();
  }

  private savedCursors: Record<string, { lineNumber: number; column: number; scrollTop: number }> = {};

  switchTab(filePath: string): void {
    const lcPath = filePath.replace(/\\/g, '/').toLowerCase();
    const tab = this.tabs.find(t => t.filePath === lcPath);
    if (!tab) return;

    // Persist the code editor's current state only when leaving a code tab —
    // the Monaco buffer doesn't hold markdown previews.
    const prev = this.activeTab ? this.tabs.find(t => t.filePath === this.activeTab) : null;
    if (this.editor && this.activeTab && (!prev || prev.kind !== 'markdown')) {
      if (this.editor.getValue && this.editor.getPosition) {
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
    }

    this.activeTab = lcPath;
    this.activateTabView(tab);

    if (tab.kind !== 'markdown' && this.editor) {
      const saved = this.savedCursors[lcPath];
      if (saved) {
        this.editor.setPosition({ lineNumber: saved.lineNumber, column: saved.column });
        this.editor.setScrollTop(saved.scrollTop);
      }
    }

    this.renderTabs();
    this.sendEditorState();
    this.onFileActivated?.(tab.originalPath || tab.filePath);
  }

  /** Show Monaco for code tabs, the rendered preview for markdown tabs. */
  private activateTabView(tab: Tab): void {
    if (tab.kind === 'markdown') {
      this.editorEl.style.display = 'none';
      this.renderMarkdownPreview(this.fileContents.get(tab.filePath) || '');
      this.markdownPreviewEl.style.display = '';
      return;
    }
    this.markdownPreviewEl.style.display = 'none';
    this.editorEl.style.display = '';
    if (this.editor) {
      const content = this.fileContents.get(tab.filePath) || '';
      this.suppressDirty = true;
      this.editor.setValue(content);
      this.suppressDirty = false;
      const ext = (tab.name.split('.').pop() || '').toLowerCase();
      const m = (window as any).monaco;
      if (m) {
        const model = this.editor.getModel();
        m.editor.setModelLanguage(model, this.getLanguage(ext));
      }
    }
  }

  private renderMarkdownPreview(text: string): void {
    this.markdownPreviewEl.innerHTML = renderMarkdownToHtml(text);
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
        this.markdownPreviewEl.style.display = 'none';
        this.editorEl.style.display = '';
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
    this.activateTabView(keep);
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
    this.markdownPreviewEl.style.display = 'none';
    this.editorEl.style.display = '';
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

  insertText(text: string): void {
    if (!this.editor) return;
    const sel = this.editor.getSelection();
    if (!sel) return;
    this.editor.executeEdits('ai-agent', [{ range: sel, text, forceMoveMarkers: true }]);
    this.editor.focus();
  }

  getSelectionText(): string {
    if (!this.editor) return '';
    const sel = this.editor.getSelection();
    if (!sel) return '';
    const model = this.editor.getModel();
    if (!model) return '';
    return model.getValueInRange(sel);
  }

  setContent(content: string): void {
    if (!this.editor) return;
    this.editor.setValue(content);
    this.editor.focus();
  }

  goToLine(line: number, col = 1): void {
    if (!this.editor) return;
    this.editor.setPosition({ lineNumber: line, column: col });
    this.editor.revealLineInCenter(line);
    this.editor.focus();
  }

  getAgentEditorState(): { activeFile: string; openFiles: string[]; cursorLine: number; cursorCol: number; selectedText: string } {
    const activeFile = this.activeTab || '';
    const openFiles = this.tabs.map(t => t.originalPath || t.filePath);
    let cursorLine = 0;
    let cursorCol = 0;
    let selectedText = '';
    if (this.editor) {
      const pos = this.editor.getPosition();
      if (pos) { cursorLine = pos.lineNumber; cursorCol = pos.column; }
      selectedText = this.getSelectionText();
    }
    return { activeFile, openFiles, cursorLine, cursorCol, selectedText };
  }

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
      const activeTab = this.tabs.find(t => t.filePath === this.activeTab);
      if (activeTab?.kind === 'markdown') {
        api.ide.editorState({ filePath, text: null, selection: null });
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

  private async initEditor(): Promise<void> {
    this.editor = await initMonacoEditor(this.editorEl, {
      getActiveTab: () => this.activeTab,
      isDirtySuppressed: () => this.suppressDirty,
      onDirty: (tab) => { this.dirtyFiles.add(tab); this.updateDirtyState(); },
      onCursorSelection: () => this.sendEditorState(),
      saveFile: () => this.saveCurrentFile(),
    });
  }

  saveCurrentFile(): void {
    if (!this.activeTab || !this.editor) return;
    const tab = this.tabs.find(t => t.filePath === this.activeTab);
    if (!tab || tab.kind === 'markdown') return;
    const content = this.editor.getValue();
    if (content === undefined) return;
    window.electronAPI?.fs.writeFile(tab.originalPath, content);
    this.dirtyFiles.delete(this.activeTab);
    this.updateDirtyState();
  }

  getState(): { openFiles: string[]; activeFile: string; explorerWidth: number; cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }>; markdownFiles: string[] } | null {
    if (this.tabs.length === 0) return null;

    if (this.activeTab && this.editor) {
      const activeTab = this.tabs.find(t => t.filePath === this.activeTab);
      if (!activeTab || activeTab.kind !== 'markdown') {
        const pos = this.editor.getPosition();
        if (pos) {
          this.savedCursors[this.activeTab] = {
            lineNumber: pos.lineNumber,
            column: pos.column,
            scrollTop: this.editor.getScrollTop() || 0,
          };
        }
      }
    }

    return {
      openFiles: this.tabs.map(t => t.originalPath),
      activeFile: this.activeTab || '',
      explorerWidth: 260,
      cursors: { ...this.savedCursors },
      markdownFiles: this.tabs.filter(t => t.kind === 'markdown').map(t => t.originalPath),
    };
  }

  async restoreState(state: { openFiles: string[]; activeFile: string; explorerWidth?: number; cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }>; markdownFiles?: string[] }): Promise<void> {
    const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    const targetActive = norm(state.activeFile);
    const cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }> = {};
    for (const [k, v] of Object.entries(state.cursors)) cursors[norm(k)] = v;
    for (const f of state.openFiles) {
      await this.openFile(f);
    }
    const md = new Set((state.markdownFiles || []).map(norm));
    for (const tab of this.tabs) {
      if (md.has(tab.filePath)) tab.kind = 'markdown';
    }
    const target = this.tabs.find(t => t.filePath === targetActive);
    if (target) this.switchTab(targetActive);
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
