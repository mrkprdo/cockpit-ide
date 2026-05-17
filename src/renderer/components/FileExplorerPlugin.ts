import { ContextMenu } from './ContextMenu';

export class FileExplorerPlugin {
  private el: HTMLDivElement;
  private treeEl: HTMLDivElement;
  private expanded = new Set<string>();
  private copiedPath: string | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement, private rootPath: string, private onFileOpen: (path: string) => void) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'width:100%;height:100%;overflow:auto;background:transparent;font-family:"Space Mono","Courier New",monospace;font-size:12px';
    this.treeEl = document.createElement('div');
    this.treeEl.innerHTML = '<div style="padding:8px;color:var(--tertiary);font-size:11px">Loading...</div>';
    this.el.appendChild(this.treeEl);
    container.appendChild(this.el);

    // Context menu on empty area: New File
    this.el.addEventListener('contextmenu', (e) => {
      if (e.target === this.el || e.target === this.treeEl) {
        e.preventDefault();
        new ContextMenu([
          { label: 'New File', action: () => this.createFile(this.rootPath) },
          { label: 'New Folder', action: () => this.createFolder(this.rootPath) },
        ], e.clientX, e.clientY);
      }
    });

    this.loadDir(rootPath, this.treeEl, 0);

    // Watch for external file changes and refresh tree
    window.electronAPI?.fs.onChanged(() => {
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => {
        this.treeEl.innerHTML = '';
        this.loadDir(this.rootPath, this.treeEl, 0);
      }, 500);
    });
  }

  private normalize(p: string): string { return p.replace(/\\/g, '/'); }

  refresh(): void {
    this.treeEl.innerHTML = '<div style="padding:8px;color:var(--tertiary);font-size:11px">Loading...</div>';
    this.expanded.clear();
    this.loadDir(this.rootPath, this.treeEl, 0);
  }

  private async createFile(parentDir: string): Promise<void> {
    const name = prompt('File name:');
    if (!name) return;
    const fullPath = parentDir + '/' + name;
    await window.electronAPI?.fs.writeFile(fullPath, '');
    this.refresh();
  }

  private async createFolder(parentDir: string): Promise<void> {
    const name = prompt('Folder name:');
    if (!name) return;
    const fullPath = parentDir + '/' + name;
    await window.electronAPI?.fs.writeFile(fullPath + '/.gitkeep', '');
    this.refresh();
  }

  private async deletePath(targetPath: string): Promise<void> {
    if (!confirm(`Delete ${targetPath.split(/[\\/]/).pop()}?`)) return;
    await window.electronAPI?.fs.delete(targetPath);
    this.refresh();
  }

  private async pasteHere(targetDir: string): Promise<void> {
    if (!this.copiedPath) return;
    const baseName = this.copiedPath.split(/[\\/]/).pop() || 'file';
    const ext = baseName.includes('.') ? '.' + baseName.split('.').pop() : '';
    const stem = ext ? baseName.slice(0, -ext.length) : baseName;
    // Try _copy_1, _copy_2, etc.
    for (let i = 1; i <= 999; i++) {
      const dest = targetDir + '/' + stem + '_copy_' + i + ext;
      const exists = await window.electronAPI?.fs.readDir(targetDir);
      if (exists && !exists.some(e => e.name === dest.split(/[\\/]/).pop())) {
        await window.electronAPI?.fs.copy(this.copiedPath, dest);
        this.refresh();
        return;
      }
    }
  }

  private async loadDir(dirPath: string, parentEl: HTMLElement, depth: number): Promise<void> {
    dirPath = this.normalize(dirPath);
    if (depth === 0) parentEl.innerHTML = '';
    if (depth === 0 && !dirPath) {
      parentEl.innerHTML = '<div style="padding:8px;color:var(--tertiary);font-size:11px">No workspace</div>';
      return;
    }
    const entries = await window.electronAPI?.fs.readDir(dirPath);
    if (!entries) {
      if (depth === 0) parentEl.innerHTML = '<div style="padding:8px;color:var(--tertiary);font-size:11px">Unable to read directory</div>';
      return;
    }
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (entry.name.startsWith('.gitkeep')) continue;
      if (entry.name.startsWith('.')) continue;
      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:4px;padding:2px 4px;cursor:pointer;border-radius:3px;color:var(--primary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis';
      item.style.paddingLeft = `${12 + depth * 16}px`;
      item.addEventListener('mouseenter', () => item.style.background = 'var(--panel)');
      item.addEventListener('mouseleave', () => item.style.background = 'transparent');

      const fullKey = dirPath + '/' + entry.name;
      const icon = entry.isDirectory ? (this.expanded.has(fullKey) ? '▾' : '▸') : ' ';
      const nameStyle = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;display:block';
      item.innerHTML = `<span style="color:var(--tertiary);width:12px;flex-shrink:0">${icon}</span><span style="${nameStyle}">${entry.name}</span>`;

      const fullPath = dirPath + '/' + entry.name;

      // Context menu on file/directory
      if (entry.isDirectory) {
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const items: any[] = [
            { label: 'New File', action: () => this.createFile(fullPath) },
            { label: 'New Folder', action: () => this.createFolder(fullPath) },
            { separator: true },
            { label: 'Copy', action: () => { this.copiedPath = fullPath; } },
            { label: 'Paste', action: () => this.pasteHere(fullPath), disabled: !this.copiedPath },
            { separator: true },
            { label: 'Delete', action: () => this.deletePath(fullPath) },
          ];
          new ContextMenu(items, e.clientX, e.clientY);
        });
      } else {
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const items: any[] = [
            { label: 'Copy', action: () => { this.copiedPath = fullPath; } },
            { label: 'Paste', action: () => this.pasteHere(dirPath), disabled: !this.copiedPath },
            { separator: true },
            { label: 'Delete', action: () => this.deletePath(fullPath) },
          ];
          new ContextMenu(items, e.clientX, e.clientY);
        });
      }

      if (entry.isDirectory) {
        const childContainer = document.createElement('div');
        childContainer.style.display = this.expanded.has(fullKey) ? '' : 'none';
        item.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (this.expanded.has(fullKey)) {
            this.expanded.delete(fullKey);
            childContainer.style.display = 'none';
            item.innerHTML = `<span style="color:var(--tertiary);width:12px;flex-shrink:0">▸</span><span style="${nameStyle}">${entry.name}</span>`;
          } else {
            this.expanded.add(fullKey);
            childContainer.innerHTML = '';
            await this.loadDir(fullPath, childContainer, depth + 1);
            childContainer.style.display = '';
            item.innerHTML = `<span style="color:var(--tertiary);width:12px;flex-shrink:0">▾</span><span style="${nameStyle}">${entry.name}</span>`;
          }
        });
        parentEl.appendChild(item);
        if (this.expanded.has(fullKey)) {
          parentEl.appendChild(childContainer);
        }
      } else {
        const isText = /\.(ts|js|json|html|css|md|txt|py|rs|toml|yaml|yml|xml|svg|sh|bat|ps1)$/i.test(entry.name);
        (item as HTMLElement).style.opacity = isText ? '1' : '0.4';
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onFileOpen(fullPath);
        });
        parentEl.appendChild(item);
      }
    }
  }
}
