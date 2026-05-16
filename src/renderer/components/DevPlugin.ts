import { FileExplorerPlugin } from './FileExplorerPlugin';
import { MonacoEditorPlugin } from './MonacoEditorPlugin';

export class DevPlugin {
  private editor: MonacoEditorPlugin;
  private splitEl: HTMLDivElement;
  private isDragging = false;

  constructor(container: HTMLElement, wsPath: string) {
    this.splitEl = document.createElement('div');
    this.splitEl.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:row;background:transparent';

    // Left: Explorer
    const explorerCol = document.createElement('div');
    explorerCol.style.cssText = 'width:260px;height:100%;overflow:hidden;flex-shrink:0';
    /**/
    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = 'width:4px;height:100%;cursor:col-resize;background:var(--border);flex-shrink:0';
    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.isDragging = true;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const newW = Math.max(120, Math.min(600, e.clientX - this.splitEl.getBoundingClientRect().left));
      explorerCol.style.width = newW + 'px';
    });
    document.addEventListener('mouseup', () => { this.isDragging = false; });

    // Right: Editor
    const editorCol = document.createElement('div');
    editorCol.style.cssText = 'flex:1;height:100%;overflow:hidden;min-width:200px';

    this.splitEl.appendChild(explorerCol);
    this.splitEl.appendChild(resizeHandle);
    this.splitEl.appendChild(editorCol);
    container.appendChild(this.splitEl);

    // Init explorer in left column
    new FileExplorerPlugin(explorerCol, wsPath, (filePath) => {
      this.editor.openFile(filePath);
    });

    // Init editor in right column
    this.editor = new MonacoEditorPlugin(editorCol);
  }
}
