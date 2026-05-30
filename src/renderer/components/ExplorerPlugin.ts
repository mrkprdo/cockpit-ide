import { FileExplorerPlugin } from './FileExplorerPlugin';
import { MonacoEditorPlugin } from './MonacoEditorPlugin';
import { CommandPalette } from './CommandPalette';

export class ExplorerPlugin {
  onStateChange: (() => void) | null = null;
  editor: MonacoEditorPlugin;
  palette: CommandPalette | null = null;
  private splitEl: HTMLDivElement;
  private isDragging = false;
  private explorerCol: HTMLDivElement;
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

    const editorCol = document.createElement('div');
    editorCol.style.cssText = 'flex:1;height:100%;overflow:hidden;min-width:200px;display:none';

    this.splitEl.appendChild(this.explorerCol);
    this.splitEl.appendChild(resizeHandle);
    this.splitEl.appendChild(editorCol);
    container.appendChild(this.splitEl);

    // Init editor first so explorer can send files to it
    this.editor = new MonacoEditorPlugin(editorCol);
    this.editor.onStateChange = () => {
      editorCol.style.display = this.editor.tabs.length > 0 ? '' : 'none';
      this.onStateChange?.();
    };

    this.explorer = new FileExplorerPlugin(this.explorerCol, wsPath, (filePath) => {
      this.editor.openFile(filePath);
    });
    // Retry once after 1s in case DOM wasn't ready
    setTimeout(() => this.explorer.refresh(), 1000);
  }

  private isHidden(): boolean {
    let el: HTMLElement | null = this.splitEl;
    while (el) {
      if (el.style.display === 'none') return true;
      el = el.parentElement;
    }
    return false;
  }

  openFile(filePath: string): void {
    this.editor.openFile(filePath);
  }

  openFileSearch(): void {
    if (this.isHidden()) return;
    if (!this.palette) {
      this.palette = new CommandPalette(this.wsPath, (filePath) => {
        this.editor.openFile(filePath);
      });
    }
    this.palette.open();
  }

  setMarkdownOpeners(labels: string[], callback: (filePath: string, label: string) => void): void {
    this.explorer.setMarkdownOpeners(labels, callback);
  }

  updateTheme(): void {
    this.editor.updateTheme?.();
  }

  getEditorState(): { openFiles: string[]; activeFile: string; explorerWidth: number; cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }> } | null {
    const editorState = this.editor.getState();
    if (!editorState) return null;
    return { ...editorState, explorerWidth: this.explorerCol.offsetWidth };
  }

  async restoreEditorState(state: { openFiles: string[]; activeFile: string; explorerWidth: number; cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }> } | null): Promise<void> {
    if (!state || !state.openFiles.length) return;
    if (state.explorerWidth) {
      this.explorerCol.style.width = state.explorerWidth + 'px';
    }
    await this.editor.restoreState(state);
  }
}
