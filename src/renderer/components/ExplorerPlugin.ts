import { FileExplorerPlugin } from './FileExplorerPlugin';
import { MonacoEditorPlugin } from './MonacoEditorPlugin';
import { CommandPalette } from './CommandPalette';
import { SearchOverlay } from './SearchOverlay';
import { createLogger } from '../logging/logger';

const log = createLogger('explorer');

export type ExplorerEditorState = {
  openFiles: string[];
  activeFile: string;
  explorerWidth: number;
  cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }>;
  markdownOpenFiles?: string[];
  markdownActiveFile?: string;
  markdownScrollTops?: Record<string, number>;
};

export class ExplorerPlugin {
  onStateChange: (() => void) | null = null;
  editor: MonacoEditorPlugin;
  palette: CommandPalette | null = null;
  searchOverlay: SearchOverlay | null = null;
  private splitEl: HTMLDivElement;
  private isDragging = false;
  private explorerCol: HTMLDivElement;
  private editorArea: HTMLDivElement;
  private editorCol: HTMLDivElement;
  private wsPath: string;
  private explorer: FileExplorerPlugin;

  constructor(container: HTMLElement, wsPath: string) {
    this.wsPath = wsPath;
    this.splitEl = document.createElement('div');
    this.splitEl.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:row;background:transparent';

    this.explorerCol = document.createElement('div');
    this.explorerCol.style.cssText = 'width:260px;height:100%;overflow:hidden;flex-shrink:0';

    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = 'width:2px;height:100%;cursor:col-resize;background:var(--border);flex-shrink:0;transition:background 0.15s,opacity 0.15s';

    let startX = 0;
    let startW = 260;
    resizeHandle.addEventListener('mouseenter', () => {
      if (!this.isDragging) { resizeHandle.style.background = 'var(--accent)'; resizeHandle.style.opacity = '0.5'; }
    });
    resizeHandle.addEventListener('mouseleave', () => {
      if (!this.isDragging) { resizeHandle.style.background = 'var(--border)'; resizeHandle.style.opacity = ''; }
    });
    resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.isDragging = true;
      startX = e.clientX;
      startW = this.explorerCol.offsetWidth;
      resizeHandle.style.background = 'var(--accent)';
      resizeHandle.style.opacity = '0.8';
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - startX;
      const newW = Math.max(120, Math.min(600, startW + dx));
      this.explorerCol.style.width = newW + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.onStateChange?.();
        resizeHandle.style.background = 'var(--border)';
        resizeHandle.style.opacity = '';
      }
    });

    this.editorCol = document.createElement('div');
    this.editorCol.style.cssText = 'flex:1;height:100%;overflow:hidden;min-width:200px;display:none';

    this.splitEl.appendChild(this.explorerCol);
    this.splitEl.appendChild(resizeHandle);
    this.splitEl.appendChild(this.editorCol);
    container.appendChild(this.splitEl);

    this.editorArea = document.createElement('div');
    this.editorArea.style.cssText = 'width:100%;height:100%;';
    this.editorCol.appendChild(this.editorArea);

    this.editor = new MonacoEditorPlugin(this.editorArea);
    this.editor.onStateChange = () => {
      this.syncVisibility();
      this.onStateChange?.();
    };
    this.editor.onFileActivated = (filePath) => {
      this.explorer.selectFile(filePath);
    };

    this.explorer = new FileExplorerPlugin(this.explorerCol, wsPath, (filePath) => {
      this.openFile(filePath);
    });
    this.explorer.onViewMarkdown = (filePath) => this.openInMarkdown(filePath);
    setTimeout(() => this.explorer.refresh(), 1000);
  }

  private syncVisibility(): void {
    this.editorCol.style.display = this.editor.tabs.length > 0 ? '' : 'none';
  }

  private isHidden(): boolean {
    let el: HTMLElement | null = this.splitEl;
    while (el) {
      if (el.style.display === 'none') return true;
      el = el.parentElement;
    }
    return false;
  }

  revealFile(filePath: string): void {
    this.explorer.selectFile(filePath);
  }

  insertText(text: string): void { this.editor.insertText(text); }
  getSelectionText(): string { return this.editor.getSelectionText(); }
  setEditorContent(content: string): void { this.editor.setContent(content); }
  goToLine(line: number, col?: number): void { this.editor.goToLine(line, col); }
  getAgentEditorState() { return this.editor.getAgentEditorState(); }

  openFile(filePath: string): void {
    log.debug('open file', filePath);
    this.editor.openFile(filePath);
    this.revealFile(filePath);
    this.syncVisibility();
  }

  /** Open a Markdown file as a rendered preview tab in the same tab bar. */
  openInMarkdown(filePath: string): void {
    log.debug('open markdown preview', filePath);
    this.editor.openMarkdown(filePath);
    this.revealFile(filePath);
    this.syncVisibility();
  }

  closeActiveTab(): void {
    this.editor.closeActiveTab();
    this.syncVisibility();
  }

  openFileSearch(): void {
    if (this.isHidden()) return;
    if (!this.palette) {
      this.palette = new CommandPalette(this.wsPath, (filePath) => {
        this.openFile(filePath);
      });
    }
    this.palette.open();
  }

  openSearch(ensureExplorer: () => Promise<ExplorerPlugin>): void {
    if (this.isHidden()) return;
    ensureExplorer().then(() => {
      if (!this.searchOverlay) {
        this.searchOverlay = new SearchOverlay(this.wsPath, (filePath, lineNumber) => {
          this.openFile(filePath);
          setTimeout(() => this.editor.goToLine(lineNumber), 100);
        });
      }
      this.searchOverlay.open();
    });
  }

  updateTheme(): void {
    this.editor.updateTheme?.();
  }

  getEditorState(): ExplorerEditorState | null {
    const editorState = this.editor.getState();

    if (!editorState) return null;

    const result: ExplorerEditorState = {
      openFiles: editorState.openFiles,
      activeFile: editorState.activeFile,
      explorerWidth: this.explorerCol.offsetWidth,
      cursors: editorState.cursors,
    };

    if (editorState.markdownFiles.length > 0) {
      result.markdownOpenFiles = editorState.markdownFiles;
      result.markdownActiveFile = editorState.activeFile;
    }

    return result;
  }

  async restoreEditorState(state: ExplorerEditorState | null): Promise<void> {
    if (!state) return;
    if (state.explorerWidth) {
      this.explorerCol.style.width = state.explorerWidth + 'px';
    }
    const openFiles = [...(state.openFiles || [])];
    const mdFiles = state.markdownOpenFiles || [];
    // Legacy state: markdown tabs lived in a separate list — fold them in.
    const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    for (const f of mdFiles) {
      if (!openFiles.some(p => norm(p) === norm(f))) openFiles.push(f);
    }
    const activeFile = state.activeFile || state.markdownActiveFile || '';
    await this.editor.restoreState({
      openFiles,
      activeFile,
      cursors: state.cursors || {},
      markdownFiles: mdFiles,
    });
    this.syncVisibility();
  }
}
