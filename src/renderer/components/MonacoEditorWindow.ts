import { ContextMenu } from './ContextMenu';
import { ConfirmModal } from './ConfirmModal';
import { theme } from '../theme';
import { initMonacoEditor } from './monaco-bootstrap';
import { renderMarkdownToHtml } from './markdown-render';
import { reportFailure } from '../health/monitor';
import { showToast } from './toast';
import { buildIdeEditorState, IdeStatePusher, type EditorTab as Tab } from './monaco-editor/ide-state';
import { languageForExtension } from './monaco-editor/languages';

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
  /** Lazily created on the first open — Monaco is ~3.8 MB, don't load it at boot. */
  private ready: Promise<void> | null = null;
  private placeholderEl: HTMLDivElement | null = null;
  private pendingCursor: { line: number; col: number } | null = null;
  private destroyed = false;

  private unsubFileChanged: (() => void) | null = null;
  private statePusher = new IdeStatePusher(() => buildIdeEditorState(this.tabs, this.activeTab, this.editor));
  private onDragEnd: (() => void) | null = null;
  private promptingFor = new Set<string>();

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
    this.onDragEnd = () => {
      this.tabContainer.querySelectorAll('.is-dragging, .is-dragover').forEach(el => {
        el.classList.remove('is-dragging', 'is-dragover');
      });
    };
    document.addEventListener('dragend', this.onDragEnd);

    this.bar.appendChild(this.tabContainer);
    this.el.appendChild(this.bar);

    this.editorEl = document.createElement('div');
    this.editorEl.className = 'editor-area';
    this.editorEl.id = 'monaco-' + crypto.randomUUID();
    this.el.appendChild(this.editorEl);

    this.placeholderEl = document.createElement('div');
    this.placeholderEl.className = 'editor-placeholder';
    this.placeholderEl.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--tertiary);font-size:var(--text-xs);pointer-events:none';
    this.placeholderEl.textContent = 'Open a file to start editing';
    this.editorEl.appendChild(this.placeholderEl);

    // Markdown preview — shown in place of the Monaco editor when a .md tab is
    // in markdown mode (View as Markdown). Shares the same tab bar as the editor.
    this.markdownPreviewEl = document.createElement('div');
    this.markdownPreviewEl.className = 'md-preview-area';
    this.markdownPreviewEl.style.cssText = 'position:absolute;left:0;right:0;top:30px;bottom:0;overflow:auto;display:none;';
    this.el.appendChild(this.markdownPreviewEl);

    container.appendChild(this.el);
    this.initTabDummies();
  }

  /** Boot Monaco on demand; every path that needs a live editor goes through here. */
  private ensureReady(): Promise<void> {
    if (!this.ready) this.ready = this.initEditor();
    return this.ready;
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
    return languageForExtension(ext);
  }

  /** Reload file content if this file is open in a tab. Never clobbers unsaved edits silently. */
  async reloadIfOpen(filePath: string): Promise<void> {
    if (this.destroyed) return;
    const lcPath = filePath.toLowerCase();
    const tab = this.tabs.find(t => t.filePath === lcPath);
    if (!tab) return;
    const content = await window.electronAPI?.fs.readFile(tab.originalPath);
    if (content === null) {
      // Gone from disk — a dirty buffer is the only copy left, so keep it.
      if (this.dirtyFiles.has(lcPath)) {
        showToast(`${tab.name} was deleted on disk — your unsaved buffer is kept`, 'warn');
        return;
      }
      await this.closeTab(lcPath);
      return;
    }
    if (content === undefined) return;

    const dirty = this.dirtyFiles.has(lcPath);
    // A watcher event for our own save carries the content we just wrote.
    if (dirty && content !== this.fileContents.get(lcPath)) {
      const reload = await this.confirmReload(tab);
      if (!reload) return;
      this.dirtyFiles.delete(lcPath);
      this.updateDirtyState();
    }
    this.fileContents.set(lcPath, content);
    this.applyDiskContent(tab, content);
  }

  /** Prompt before replacing a dirty buffer with the on-disk version. */
  private async confirmReload(tab: Tab): Promise<boolean> {
    if (this.promptingFor.has(tab.filePath)) return false;
    this.promptingFor.add(tab.filePath);
    try {
      const modal = new ConfirmModal(
        `<b>${tab.name}</b> changed on disk. Reload and discard your unsaved changes?`,
        'Reload',
      );
      return await modal.open();
    } finally {
      this.promptingFor.delete(tab.filePath);
    }
  }

  /** Paint freshly read disk content into the visible view for the given tab. */
  private applyDiskContent(tab: Tab, content: string): void {
    if (this.activeTab !== tab.filePath) return;
    if (tab.kind === 'markdown') {
      this.renderMarkdownPreview(content);
    } else if (this.editor && this.editor.getValue() !== content) {
      this.suppressDirty = true;
      this.editor.setValue(content);
      this.suppressDirty = false;
    }
  }

  async openFile(filePath: string): Promise<void> {
    if (this.destroyed) return;
    await this.ensureReady();
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
    if (this.destroyed) return;
    await this.ensureReady();
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
    if (this.activeTab) void this.closeTab(this.activeTab);
  }

  /**
   * Ask before throwing away unsaved buffers. Returns true immediately (no
   * microtask) when nothing is dirty, so clean closes stay synchronous.
   */
  private confirmDiscard(filePaths: string[]): boolean | Promise<boolean> {
    const dirty = filePaths.filter(p => this.dirtyFiles.has(p));
    if (dirty.length === 0) return true;
    const names = dirty.map(p => this.tabs.find(t => t.filePath === p)?.name || p);
    const subject = names.length === 1 ? `<b>${names[0]}</b> has` : `${names.length} files have`;
    return new ConfirmModal(`${subject} unsaved changes. Close without saving?`, 'Discard').open();
  }

  private async closeTab(filePath: string): Promise<void> {
    const lcPath = filePath.replace(/\\/g, '/').toLowerCase();
    if (!this.tabs.some(t => t.filePath === lcPath)) return;
    if (this.dirtyFiles.has(lcPath)) {
      const discard = await this.confirmDiscard([lcPath]);
      if (!discard) return;
    }
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

  private async closeOtherTabs(filePath: string): Promise<void> {
    const lcPath = filePath.replace(/\\/g, '/').toLowerCase();
    const keep = this.tabs.find(t => t.filePath === lcPath);
    if (!keep) return;
    const closing = this.tabs.filter(t => t.filePath !== lcPath).map(t => t.filePath);
    if (closing.some(p => this.dirtyFiles.has(p))) {
      const discard = await this.confirmDiscard(closing);
      if (!discard) return;
    }
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

  private async closeAllTabs(): Promise<void> {
    const all = this.tabs.map(t => t.filePath);
    if (all.some(p => this.dirtyFiles.has(p))) {
      const discard = await this.confirmDiscard(all);
      if (!discard) return;
    }
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
    if (!this.editor) {
      // Monaco not booted yet — stage into the buffer so initEditor paints it.
      if (this.activeTab) this.fileContents.set(this.activeTab, content);
      void this.ensureReady();
      return;
    }
    this.editor.setValue(content);
    this.editor.focus();
  }

  goToLine(line: number, col = 1): void {
    if (!this.editor) {
      this.pendingCursor = { line, col };
      void this.ensureReady();
      return;
    }
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
    this.statePusher.push();
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
    try {
      this.editor = await initMonacoEditor(this.editorEl, {
        getActiveTab: () => this.activeTab,
        isDirtySuppressed: () => this.suppressDirty,
        onDirty: (tab) => { this.dirtyFiles.add(tab); this.updateDirtyState(); },
        onCursorSelection: () => this.sendEditorState(),
        saveFile: () => this.saveCurrentFile(),
      });
    } catch (err) {
      reportFailure({ kind: 'window.crash', source: 'MonacoEditorWindow.initEditor', message: String(err) });
      this.editor = null;
    }
    this.placeholderEl?.remove();
    this.placeholderEl = null;
    if (this.destroyed) {
      this.disposeEditor();
      return;
    }
    // Paint whatever tab was opened while Monaco was still loading.
    const tab = this.activeTab ? this.tabs.find(t => t.filePath === this.activeTab) : null;
    if (tab) this.activateTabView(tab);
    const cursor = this.pendingCursor;
    this.pendingCursor = null;
    if (cursor && this.editor) {
      this.editor.setPosition({ lineNumber: cursor.line, column: cursor.col });
    }
  }

  /** Await the write before clearing the dirty flag — a silent failure is data loss. */
  async saveCurrentFile(): Promise<boolean> {
    if (!this.activeTab || !this.editor) return false;
    const tab = this.tabs.find(t => t.filePath === this.activeTab);
    if (!tab || tab.kind === 'markdown') return false;
    const content = this.editor.getValue();
    if (content === undefined) return false;
    const lcPath = this.activeTab;
    let ok = false;
    try {
      ok = await window.electronAPI?.fs.writeFile(tab.originalPath, content) ?? false;
    } catch (err) {
      reportFailure({ kind: 'ipc.handler-error', source: 'MonacoEditorWindow.saveCurrentFile', message: `writeFile threw for ${tab.originalPath}: ${String(err)}` });
    }
    if (!ok) {
      reportFailure({ kind: 'ipc.handler-error', source: 'MonacoEditorWindow.saveCurrentFile', message: `writeFile failed for ${tab.originalPath}` });
      showToast(`Could not save ${tab.name} — your changes are still in the buffer`, 'error');
      return false;
    }
    this.fileContents.set(lcPath, content);
    // Only clear the flag if the buffer did not move while the write was in flight.
    if (this.editor.getValue() === content) this.dirtyFiles.delete(lcPath);
    this.updateDirtyState();
    return true;
  }

  /** True when at least one open tab holds unsaved edits. */
  hasUnsavedChanges(): boolean { return this.dirtyFiles.size > 0; }

  getDirtyFileNames(): string[] {
    return [...this.dirtyFiles].map(p => this.tabs.find(t => t.filePath === p)?.name || p);
  }

  private disposeEditor(): void {
    if (!this.editor) return;
    const model = this.editor.getModel?.();
    try { this.editor.dispose?.(); } catch { /* already disposed */ }
    try { if (model && !model.isDisposed?.()) model.dispose?.(); } catch { /* already disposed */ }
    this.editor = null;
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubFileChanged?.();
    this.unsubFileChanged = null;
    if (this.onDragEnd) {
      document.removeEventListener('dragend', this.onDragEnd);
      this.onDragEnd = null;
    }
    this.statePusher.dispose();
    this.disposeEditor();
    this.tabs = [];
    this.fileContents.clear();
    this.dirtyFiles.clear();
    this.savedCursors = {};
    this.activeTab = null;
    this.el.remove();
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
