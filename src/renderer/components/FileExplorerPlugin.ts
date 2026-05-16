import { TextRenderer } from './TextRenderer';

export class FileExplorerPlugin {
  private el: HTMLDivElement;
  private treeEl: HTMLDivElement;
  private expanded = new Set<string>();

  constructor(container: HTMLElement, private rootPath: string, private onFileOpen: (path: string) => void) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'width:100%;height:100%;overflow:auto;background:transparent;font-family:"Space Mono","Courier New",monospace;font-size:12px';
    this.treeEl = document.createElement('div');
    this.treeEl.innerHTML = '<div style="padding:8px;color:var(--tertiary);font-size:11px">Loading...</div>';
    this.el.appendChild(this.treeEl);
    container.appendChild(this.el);
    this.loadDir(rootPath, this.treeEl, 0);
  }

  private normalize(p: string): string { return p.replace(/\\/g, '/'); }

  refresh(): void {
    this.treeEl.innerHTML = '<div style="padding:8px;color:var(--tertiary);font-size:11px">Loading...</div>';
    this.expanded.clear();
    this.loadDir(this.rootPath, this.treeEl, 0);
  }

  private async loadDir(dirPath: string, parentEl: HTMLElement, depth: number): Promise<void> {
    dirPath = this.normalize(dirPath);
    if (depth === 0) parentEl.innerHTML = ''; // Clear loading text
    // For root level, validate path
    if (depth === 0 && !dirPath) {
      parentEl.innerHTML = '<div style="padding:8px;color:var(--tertiary);font-size:11px">No workspace</div>';
      return;
    }
    const entries = await window.electronAPI?.fs.readDir(dirPath);
    if (!entries) {
      if (depth === 0) {
        parentEl.innerHTML = '<div style="padding:8px;color:var(--tertiary);font-size:11px">Unable to read directory</div>';
      }
      return;
    }
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const item = document.createElement('div');
      item.style.cssText = `display:flex;align-items:center;gap:4px;padding:2px 4px;cursor:pointer;border-radius:3px;color:var(--primary)`;
      item.style.paddingLeft = `${12 + depth * 16}px`;
      item.addEventListener('mouseenter', () => item.style.background = 'var(--panel)');
      item.addEventListener('mouseleave', () => item.style.background = 'transparent');

      const fullKey = dirPath + '/' + entry.name;
      const icon = entry.isDirectory ? (this.expanded.has(fullKey) ? '▾' : '▸') : ' ';
      item.innerHTML = `<span style="color:var(--tertiary);width:12px">${icon}</span><span>${entry.name}</span>`;

      if (entry.isDirectory) {
        const childContainer = document.createElement('div');
        childContainer.style.display = this.expanded.has(fullKey) ? '' : 'none';
        item.addEventListener('click', async (e) => {
          e.stopPropagation();
          const fullPath = this.normalize(dirPath + '/' + entry.name);
          if (this.expanded.has(fullPath)) {
            this.expanded.delete(fullPath);
            childContainer.style.display = 'none';
            item.innerHTML = `<span style="color:var(--tertiary);width:12px">▸</span><span>${entry.name}</span>`;
          } else {
            this.expanded.add(fullPath);
            childContainer.innerHTML = '';
            await this.loadDir(fullPath, childContainer, depth + 1);
            childContainer.style.display = '';
            if (!childContainer.parentNode) {
              parentEl.insertBefore(childContainer, item.nextSibling);
            }
            item.innerHTML = `<span style="color:var(--tertiary);width:12px">▾</span><span>${entry.name}</span>`;
          }
        });
        parentEl.appendChild(item);
        if (this.expanded.has(fullKey)) {
          parentEl.insertBefore(childContainer, item.nextSibling);
        }
      } else {
        const isText = /\.(ts|js|json|html|css|md|txt|py|rs|toml|yaml|yml|xml|svg|sh|bat|ps1)$/i.test(entry.name);
        (item as HTMLElement).style.opacity = isText ? '1' : '0.4';
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onFileOpen(this.normalize(dirPath + '/' + entry.name));
        });
        parentEl.appendChild(item);
      }
    }
  }
}
