import { marked, Renderer } from 'marked';
import { ContextMenu } from './ContextMenu';

interface Tab { filePath: string; name: string; }

export type MarkdownState = {
  openFiles: string[];
  activeFile: string;
  scrollTops: Record<string, number>;
} | null;

export class MarkdownPlugin {
  title = '';
  onDestroy: (() => void) | null = null;
  private el: HTMLDivElement;
  private bar: HTMLDivElement;
  private tabContainer: HTMLDivElement;
  private preview: HTMLDivElement;
  private tabs: Tab[] = [];
  private activeTab: string | null = null;
  private scrollTops: Record<string, number> = {};
  private unsubFileChanged: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'editor-wrap';

    this.bar = document.createElement('div');
    this.bar.className = 'editor-tab-bar';

    this.tabContainer = document.createElement('div');
    this.tabContainer.className = 'editor-tab-scroll';

    // Clean up drag visual state when drag ends anywhere
    document.addEventListener('dragend', () => {
      this.tabContainer.querySelectorAll('.is-dragging, .is-dragover').forEach(el => {
        el.classList.remove('is-dragging', 'is-dragover');
      });
    });

    this.bar.appendChild(this.tabContainer);
    this.el.appendChild(this.bar);

    this.preview = document.createElement('div');
    this.preview.className = 'md-preview';
    this.preview.innerHTML = '<div class="md-status">No file loaded</div>';

    this.preview.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

    this.el.appendChild(this.preview);
    container.appendChild(this.el);

    // Watch for external file changes to reload preview
    this.unsubFileChanged = window.electronAPI?.fs.onChanged(async (rawPath: string) => {
      const changed = rawPath.replace(/\\/g, '/').toLowerCase();
      const match = this.tabs.find(t => t.filePath === changed || t.filePath.split('/').pop() === changed.split('/').pop());
      if (match) {
        const prevScroll = this.scrollTops[match.filePath] || 0;
        await this.reloadFile(match.filePath);
        this.scrollTops[match.filePath] = this.preview.scrollTop;
        if (this.activeTab === match.filePath) {
          this.preview.scrollTop = prevScroll;
        }
      }
    }) || null;
  }

  destroy(): void {
    this.unsubFileChanged?.();
    this.unsubFileChanged = null;
  }

  getState(): MarkdownState {
    if (this.tabs.length === 0) return null;
    // Save active tab's scroll before reading state
    if (this.activeTab) {
      this.scrollTops[this.activeTab] = this.preview.scrollTop;
    }
    return {
      openFiles: this.tabs.map(t => t.filePath),
      activeFile: this.activeTab || '',
      scrollTops: { ...this.scrollTops },
    };
  }

  async restoreState(state: MarkdownState): Promise<void> {
    if (!state) return;
    // Handle legacy single-file format
    if ('loadedFile' in state && typeof (state as any).loadedFile === 'string') {
      const legacy = state as any;
      const lcPath = legacy.loadedFile.replace(/\\/g, '/').toLowerCase();
      const name = lcPath.split('/').pop() || lcPath;
      this.tabs.push({ filePath: lcPath, name });
      this.scrollTops[lcPath] = legacy.scrollTop || 0;
      this.renderTabs();
      await this.switchTab(lcPath);
      return;
    }
    this.scrollTops = {};
    for (const [k, v] of Object.entries(state.scrollTops)) {
      this.scrollTops[k.toLowerCase().replace(/\\/g, '/')] = v;
    }
    const targetActive = state.activeFile.replace(/\\/g, '/').toLowerCase();
    for (const f of state.openFiles) {
      const normalized = f.replace(/\\/g, '/').toLowerCase();
      const name = normalized.split('/').pop() || normalized;
      this.tabs.push({ filePath: normalized, name });
    }
    this.renderTabs();
    if (targetActive) await this.switchTab(targetActive);
  }

  async loadFile(filePath: string): Promise<void> {
    const normalized = filePath.replace(/\\/g, '/');
    const lcPath = normalized.toLowerCase();
    const name = normalized.split('/').pop() || normalized;

    // If already open, just switch
    const existing = this.tabs.find(t => t.filePath === lcPath);
    if (existing) {
      await this.switchTab(lcPath);
      return;
    }

    // Load content and add tab
    const content = await window.electronAPI?.fs.readFile(lcPath);
    if (content === null || content === undefined) return;

    this.tabs.push({ filePath: lcPath, name });
    if (!this.scrollTops[lcPath]) this.scrollTops[lcPath] = 0;
    await this.switchTab(lcPath);
  }

  private async switchTab(filePath: string): Promise<void> {
    const lcPath = filePath.replace(/\\/g, '/').toLowerCase();
    const tab = this.tabs.find(t => t.filePath === lcPath);
    if (!tab) return;

    // Save current tab's scroll
    if (this.activeTab) {
      this.scrollTops[this.activeTab] = this.preview.scrollTop;
    }

    this.activeTab = lcPath;
    await this.reloadFile(lcPath);
    this.preview.scrollTop = this.scrollTops[lcPath] || 0;
    this.renderTabs();
  }

  private closeTab(filePath: string): void {
    const lcPath = filePath.replace(/\\/g, '/').toLowerCase();
    const idx = this.tabs.findIndex(t => t.filePath === lcPath);
    if (idx === -1) return;
    this.tabs.splice(idx, 1);
    delete this.scrollTops[lcPath];

    if (this.activeTab === lcPath) {
      if (this.tabs.length > 0) {
        const newIdx = Math.min(idx, this.tabs.length - 1);
        this.switchTab(this.tabs[newIdx].filePath);
      } else {
        this.activeTab = null;
        this.preview.innerHTML = '<div class="md-status">No file loaded</div>';
        this.renderTabs();
      }
    } else {
      this.renderTabs();
    }
  }

  private renderTabs(): void {
    this.tabContainer.innerHTML = '';

    if (this.tabs.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'editor-empty';
      empty.textContent = 'No file loaded';
      this.tabContainer.appendChild(empty);
      return;
    }

    for (const tab of this.tabs) {
      const isActive = tab.filePath === this.activeTab;
      const tabEl = document.createElement('div');
      tabEl.className = 'editor-tab' + (isActive ? ' is-active' : '');
      tabEl.title = tab.filePath;
      tabEl.draggable = true;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'editor-tab-name';
      nameSpan.textContent = tab.name;
      tabEl.appendChild(nameSpan);

      const closeBtn = document.createElement('span');
      closeBtn.className = 'editor-tab-close';
      closeBtn.textContent = '✕';
      if (isActive) closeBtn.style.opacity = '1';

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
          { label: 'Copy File Path', action: () => { window.electronAPI?.clipboard.writeText(tab.filePath); } },
        ], e.clientX, e.clientY);
      });

      tabEl.appendChild(closeBtn);
      this.tabContainer.appendChild(tabEl);
    }

    // Auto-scroll active tab into view
    const activeEl = this.tabContainer.querySelector('.is-active') as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  private closeOtherTabs(filePath: string): void {
    const lcPath = filePath.replace(/\\/g, '/').toLowerCase();
    const keep = this.tabs.find(t => t.filePath === lcPath);
    if (!keep) return;
    this.tabs = [keep];
    const keptScroll = this.scrollTops[lcPath] || 0;
    this.scrollTops = { [lcPath]: keptScroll };
    this.activeTab = lcPath;
    this.renderTabs();
    this.preview.scrollTop = keptScroll;
  }

  private closeAllTabs(): void {
    this.tabs = [];
    this.scrollTops = {};
    this.activeTab = null;
    this.preview.innerHTML = '<div class="md-status">No file loaded</div>';
    this.renderTabs();
  }

  private async reloadFile(filePath: string): Promise<void> {
    const lcPath = filePath.replace(/\\/g, '/').toLowerCase();
    const content = await window.electronAPI?.fs.readFile(lcPath);
    if (content === null || content === undefined) {
      this.preview.innerHTML = '<div class="md-status">File deleted</div>';
      return;
    }
    this.renderPreview(content);
  }

  private renderPreview(text: string): void {
    if (!text.trim()) {
      this.preview.innerHTML = '<div class="md-status">Empty file</div>';
      return;
    }
    try {
      const renderer = new Renderer();
      renderer.html = ({ text: rawHtml }: { text: string }) => {
        return rawHtml.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      };
      renderer.link = ({ href, text: linkText }: { href: string; text: string }) => {
        if (href && /^javascript:/i.test(href)) {
          return `<span>${linkText}</span>`;
        }
        return `<a href="${href}">${linkText}</a>`;
      };
      const html = marked.parse(text, { breaks: true, renderer }) as string;
      this.preview.innerHTML = this.styleMarkdown(html);
    } catch {
      this.preview.innerHTML = '<div class="md-status is-error">Render error</div>';
    }
  }

  private styleMarkdown(html: string): string {
    return `<div class="md-content">${html}</div>`;
  }
}
