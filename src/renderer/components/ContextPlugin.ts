import { marked, Renderer } from 'marked';

interface Tab { filePath: string; name: string; }

export type ContextState = {
  openFiles: string[];
  activeFile: string;
  scrollTops: Record<string, number>;
} | null;

export class ContextPlugin {
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
    this.el.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;background:transparent;font-family:"Space Mono","Courier New",monospace';

    this.bar = document.createElement('div');
    this.bar.style.cssText = 'display:flex;align-items:center;font-size:11px;border-bottom:1px solid var(--border);flex-shrink:0;height:30px;overflow:hidden';

    this.tabContainer = document.createElement('div');
    this.tabContainer.style.cssText = 'display:flex;align-items:stretch;height:100%;flex:1;overflow-x:auto;overflow-y:hidden';

    this.bar.appendChild(this.tabContainer);
    this.el.appendChild(this.bar);

    this.preview = document.createElement('div');
    this.preview.style.cssText = 'flex:1;overflow-y:auto;padding:12px;font-size:13px;line-height:1.6;color:var(--primary)';
    this.preview.innerHTML = '<div style="color:var(--tertiary);font-size:12px">No file loaded</div>';

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

  getState(): ContextState {
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

  async restoreState(state: ContextState): Promise<void> {
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
        this.preview.innerHTML = '<div style="color:var(--tertiary);font-size:12px">No file loaded</div>';
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
      empty.style.cssText = 'padding:0 12px;color:var(--tertiary);font-size:10px;white-space:nowrap;line-height:30px';
      empty.textContent = 'No file loaded';
      this.tabContainer.appendChild(empty);
      return;
    }

    for (const tab of this.tabs) {
      const isActive = tab.filePath === this.activeTab;
      const tabEl = document.createElement('div');
      tabEl.style.cssText = `display:flex;align-items:center;gap:6px;padding:0 10px;cursor:pointer;border-right:1px solid var(--border);white-space:nowrap;font-size:11px;font-family:"Space Mono","Courier New",monospace;color:${isActive ? 'var(--primary)' : 'var(--tertiary)'};background:${isActive ? 'var(--panel)' : 'transparent'}`;
      tabEl.title = tab.filePath;

      const nameSpan = document.createElement('span');
      nameSpan.textContent = tab.name;
      tabEl.appendChild(nameSpan);

      const closeBtn = document.createElement('span');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'font-size:9px;cursor:pointer;opacity:0;transition:opacity 0.1s;padding:2px;border-radius:3px;color:var(--tertiary)';
      closeBtn.addEventListener('mouseenter', () => closeBtn.style.opacity = '1');
      closeBtn.addEventListener('mouseleave', () => closeBtn.style.opacity = isActive ? '1' : '0');
      tabEl.addEventListener('mouseenter', () => closeBtn.style.opacity = '1');
      tabEl.addEventListener('mouseleave', () => { if (!isActive) closeBtn.style.opacity = '0'; });
      if (isActive) closeBtn.style.opacity = '1';

      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(tab.filePath);
      });

      tabEl.addEventListener('click', () => this.switchTab(tab.filePath));
      tabEl.appendChild(closeBtn);
      this.tabContainer.appendChild(tabEl);
    }
  }

  private async reloadFile(filePath: string): Promise<void> {
    const lcPath = filePath.replace(/\\/g, '/').toLowerCase();
    const content = await window.electronAPI?.fs.readFile(lcPath);
    if (content === null || content === undefined) {
      this.preview.innerHTML = '<div style="color:var(--tertiary);font-size:12px">File deleted</div>';
      return;
    }
    this.renderPreview(content);
  }

  private renderPreview(text: string): void {
    if (!text.trim()) {
      this.preview.innerHTML = '<div style="color:var(--tertiary);font-size:12px">Empty file</div>';
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
      this.preview.innerHTML = '<div style="color:var(--red)">Render error</div>';
    }
  }

  private styleMarkdown(html: string): string {
    return `<div class="ctx-markdown">${html}</div>`;
  }
}
