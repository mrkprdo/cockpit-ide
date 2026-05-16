import { FileExplorerPlugin } from './FileExplorerPlugin';
import { MonacoEditorPlugin } from './MonacoEditorPlugin';

export class DevPlugin {
  editor: MonacoEditorPlugin;
  private splitEl: HTMLDivElement;
  private isDragging = false;
  private explorerCol: HTMLDivElement;
  private wsPath: string;

  constructor(container: HTMLElement, wsPath: string) {
    this.wsPath = wsPath;
    this.splitEl = document.createElement('div');
    this.splitEl.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:row;background:transparent';

    this.explorerCol = document.createElement('div');
    this.explorerCol.style.cssText = 'width:260px;height:100%;overflow:hidden;flex-shrink:0';

    let startX = 0;
    let startW = 260;
    resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.isDragging = true;
      startX = e.clientX;
      startW = this.explorerCol.offsetWidth;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - startX;
      const newW = Math.max(120, Math.min(600, startW + dx));
      this.explorerCol.style.width = newW + 'px';
    });
    document.addEventListener('mouseup', () => { this.isDragging = false; });

    const editorCol = document.createElement('div');
    editorCol.style.cssText = 'flex:1;height:100%;overflow:hidden;min-width:200px';

    this.splitEl.appendChild(this.explorerCol);
    this.splitEl.appendChild(resizeHandle);
    this.splitEl.appendChild(editorCol);
    container.appendChild(this.splitEl);

    // Init editor first so explorer can send files to it
    this.editor = new MonacoEditorPlugin(editorCol);

    const explorer = new FileExplorerPlugin(this.explorerCol, wsPath, (filePath) => {
      this.editor.openFile(filePath);
    });
    // Retry once after 1s in case DOM wasn't ready
    setTimeout(() => explorer.refresh(), 1000);
  }

  getEditorState(): { openFiles: string[]; activeFile: string } | null {
    // MonacoEditorPlugin stores open files in internal tabs array
    // We read via a window reference or expose the data
    const editor = this.editor as any;
    const tabs = editor.tabs as { filePath: string }[] | undefined;
    if (!tabs || tabs.length === 0) return null;
    return {
      openFiles: tabs.map((t: any) => t.filePath),
      activeFile: editor.activeTab || tabs[0].filePath,
    };
  }

  async restoreEditorState(state: { openFiles: string[]; activeFile: string } | null): Promise<void> {
    if (!state || !state.openFiles.length) return;
    for (const f of state.openFiles) {
      await this.editor.openFile(f);
    }
    // Switch to the active file (openFile opens tabs, last one is active)
    // We need to swap to the saved activeFile
    if (state.activeFile) {
      (this.editor as any).switchTab?.(state.activeFile);
    }
  }
}
