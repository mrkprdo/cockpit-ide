import { marked } from 'marked';

export type ContextState = { loadedFile: string; scrollTop: number } | null;

export class ContextPlugin {
  title = '';
  onDestroy: (() => void) | null = null;
  private el: HTMLDivElement;
  private preview: HTMLDivElement;
  private loadedFile: string | null = null;
  private unsubFileChanged: (() => void) | null = null;
  private fileDeleted = false;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'width:100%;height:100%;display:flex;background:transparent;font-family:"Space Mono","Courier New",monospace';

    this.preview = document.createElement('div');
    this.preview.style.cssText = 'flex:1;overflow-y:auto;padding:12px;font-size:13px;line-height:1.6;color:var(--primary)';
    this.preview.innerHTML = '<div style="color:var(--tertiary);font-size:12px">No file loaded</div>';

    this.preview.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

    this.el.appendChild(this.preview);
    container.appendChild(this.el);

    // Watch for external file changes to reload preview
    this.unsubFileChanged = window.electronAPI?.fs.onChanged(async (rawPath: string) => {
      if (!this.loadedFile) return;
      const changed = rawPath.replace(/\\/g, '/').toLowerCase();
      if (this.loadedFile === changed || this.loadedFile.split('/').pop() === changed.split('/').pop()) {
        await this.reload();
      }
    }) || null;
  }

  destroy(): void {
    this.unsubFileChanged?.();
    this.unsubFileChanged = null;
  }

  getState(): ContextState {
    if (!this.loadedFile) return null;
    return { loadedFile: this.loadedFile, scrollTop: this.preview.scrollTop };
  }

  restoreState(state: ContextState): void {
    if (!state) return;
    this.loadedFile = state.loadedFile.replace(/\\/g, '/').toLowerCase();
    this.preview.scrollTop = state.scrollTop || 0;
    this.reload();
  }

  async loadFile(filePath: string): Promise<void> {
    this.loadedFile = filePath.replace(/\\/g, '/').toLowerCase();
    this.preview.scrollTop = 0;
    await this.reload();
  }

  private async reload(): Promise<void> {
    if (!this.loadedFile) return;
    const content = await window.electronAPI?.fs.readFile(this.loadedFile);
    if (content === null || content === undefined) {
      this.fileDeleted = true;
      this.preview.innerHTML = '<div style="color:var(--tertiary);font-size:12px">File deleted</div>';
      return;
    }
    const prevScroll = this.preview.scrollTop;
    this.fileDeleted = false;
    this.renderPreview(content);
    this.preview.scrollTop = prevScroll;
  }

  private renderPreview(text: string): void {
    if (!text.trim()) {
      this.preview.innerHTML = '<div style="color:var(--tertiary);font-size:12px">Empty file</div>';
      return;
    }
    try {
      const html = marked.parse(text, { breaks: true }) as string;
      this.preview.innerHTML = this.styleMarkdown(html);
    } catch {
      this.preview.innerHTML = '<div style="color:var(--red)">Render error</div>';
    }
  }

  private styleMarkdown(html: string): string {
    return `<div class="ctx-markdown">${html}</div>`;
  }
}
