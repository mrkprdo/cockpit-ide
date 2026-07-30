import { FileExplorerPlugin } from './FileExplorerPlugin';
import { MonacoEditorPlugin } from './MonacoEditorPlugin';
import { MarkdownPlugin, MarkdownState } from './MarkdownPlugin';
import { CommandPalette } from './CommandPalette';
import { SearchOverlay } from './SearchOverlay';

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
  markdownViewer: MarkdownPlugin;
  palette: CommandPalette | null = null;
  searchOverlay: SearchOverlay | null = null;
  private splitEl: HTMLDivElement;
  private isDragging = false;
  private explorerCol: HTMLDivElement;
  private editorArea: HTMLDivElement;
  private markdownArea: HTMLDivElement;
  private editorCol: HTMLDivElement;
  private activePane: 'editor' | 'markdown' = 'editor';
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
    this.markdownArea = document.createElement('div');
    this.markdownArea.style.cssText = 'width:100%;height:100%;display:none';
    this.editorCol.appendChild(this.editorArea);
    this.editorCol.appendChild(this.markdownArea);

    this.editor = new MonacoEditorPlugin(this.editorArea);
    this.editor.onStateChange = () => {
      this.syncVisibility();
      this.onStateChange?.();
    };
    this.editor.onFileActivated = (filePath) => {
      this.explorer.selectFile(filePath);
    };

    this.markdownViewer = new MarkdownPlugin(this.markdownArea);
    this.markdownViewer.onDestroy = () => {
      // Markdown instances don't have onStateChange built-in, so we use onDestroy to sync.
      // We wrap our own sync: the markdown plugin has getState method we can check.
    };

    this.explorer = new FileExplorerPlugin(this.explorerCol, wsPath, (filePath) => {
      this.openFile(filePath);
    });
    setTimeout(() => this.explorer.refresh(), 1000);
  }

  private syncVisibility(): void {
    const editorHasTabs = this.editor.tabs.length > 0;
    const mdHasTabs = this.markdownViewer.getState() !== null;

    if (!editorHasTabs && !mdHasTabs) {
      this.editorCol.style.display = 'none';
      return;
    }
    this.editorCol.style.display = '';

    if (editorHasTabs && mdHasTabs) {
      this.editorArea.style.display = this.activePane === 'editor' ? '' : 'none';
      this.markdownArea.style.display = this.activePane === 'markdown' ? '' : 'none';
    } else if (editorHasTabs) {
      this.editorArea.style.display = '';
      this.markdownArea.style.display = 'none';
    } else {
      this.editorArea.style.display = 'none';
      this.markdownArea.style.display = '';
    }
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
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext === 'md') {
      this.activePane = 'markdown';
      this.markdownViewer.loadFile(filePath);
    } else {
      this.activePane = 'editor';
      this.editor.openFile(filePath);
    }
    this.revealFile(filePath);
    this.syncVisibility();
  }

  closeActiveTab(): void {
    if (this.activePane === 'markdown') {
      this.markdownViewer.closeActiveTab();
    } else {
      this.editor.closeActiveTab();
    }
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
    const mdState = this.markdownViewer.getState();

    if (!editorState && !mdState) return null;

    const result: ExplorerEditorState = {
      openFiles: editorState?.openFiles || [],
      activeFile: editorState?.activeFile || '',
      explorerWidth: this.explorerCol.offsetWidth,
      cursors: editorState?.cursors || {},
    };

    if (mdState) {
      result.markdownOpenFiles = mdState.openFiles;
      result.markdownActiveFile = mdState.activeFile;
      result.markdownScrollTops = mdState.scrollTops;
    }

    return result;
  }

  async restoreEditorState(state: ExplorerEditorState | null): Promise<void> {
    if (!state) return;
    if (state.explorerWidth) {
      this.explorerCol.style.width = state.explorerWidth + 'px';
    }
    if (state.markdownOpenFiles && state.markdownOpenFiles.length > 0) {
      const mdState: MarkdownState = {
        openFiles: state.markdownOpenFiles,
        activeFile: state.markdownActiveFile || '',
        scrollTops: state.markdownScrollTops || {},
      };
      await this.markdownViewer.restoreState(mdState);
      if (mdState.activeFile) this.activePane = 'markdown';
    }
    if (state.openFiles && state.openFiles.length > 0) {
      await this.editor.restoreState(state as any);
    }
    this.syncVisibility();
  }
}
