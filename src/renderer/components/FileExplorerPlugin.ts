import { ContextMenu } from './ContextMenu';
import { ConfirmModal } from './ConfirmModal';

export class FileExplorerPlugin {
  private el: HTMLDivElement;
  private treeEl: HTMLDivElement;
  private expanded = new Set<string>();
  private copiedPath: string | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubFiles: (() => void) | null = null;
  selectedPath: string | null = null;
  private markdownLabels: string[] = [];
  private onOpenInMarkdown: ((filePath: string, label: string) => void) | null = null;

  constructor(container: HTMLElement, private rootPath: string, private onFileOpen: (path: string) => void) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'width:100%;height:100%;overflow:hidden;display:flex;flex-direction:column;background:transparent;font-family:"Space Mono","Courier New",monospace;font-size:12px';

    const header = document.createElement('div');
    const rootName = rootPath.split(/[\\/]/).filter(Boolean).pop() ?? 'WORKSPACE';
    header.style.cssText = 'padding:5px 12px 4px;font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--accent);flex-shrink:0;border-bottom:1px solid var(--border);user-select:none';
    header.textContent = rootName.toUpperCase();
    this.el.appendChild(header);

    this.treeEl = document.createElement('div');
    this.treeEl.style.cssText = 'flex:1;overflow:auto';
    this.treeEl.innerHTML = '<div style="padding:8px;color:var(--tertiary);font-size:11px">Loading...</div>';
    this.el.appendChild(this.treeEl);
    container.appendChild(this.el);

    // Stop wheel propagation so canvas doesn't zoom when scrolling the tree
    this.treeEl.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

    // Context menu on empty area: New File + Paste
    this.el.addEventListener('contextmenu', (e) => {
      if (e.target === this.el || e.target === this.treeEl) {
        e.preventDefault();
        new ContextMenu([
          { label: 'New File', action: () => this.createFile(this.rootPath) },
          { label: 'New Folder', action: () => this.createFolder(this.rootPath) },
          { separator: true },
          { label: 'Paste', action: () => this.pasteHere(this.rootPath), disabled: !this.copiedPath },
        ], e.clientX, e.clientY);
      }
    });

    this.loadDir(rootPath, this.treeEl, 0);

    // Watch for external file changes and refresh tree
    this.unsubFiles = window.electronAPI?.fs.onChanged(() => {
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => this.reload(), 500);
    }) || null;
  }

  private normalize(p: string): string { return p.replace(/\\/g, '/'); }

  private getFileColor(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return 'var(--accent)';
    if (['css', 'scss', 'sass', 'less'].includes(ext)) return 'var(--accent2)';
    if (['json', 'yaml', 'yml', 'toml', 'env'].includes(ext)) return 'var(--amber)';
    if (['md', 'txt', 'rst', 'mdx'].includes(ext)) return 'var(--green)';
    return 'var(--secondary)';
  }

  setMarkdownOpeners(labels: string[], callback: (filePath: string, label: string) => void): void {
    this.markdownLabels = labels;
    this.onOpenInMarkdown = callback;
  }

  async selectFile(filePath: string): Promise<void> {
    filePath = this.normalize(filePath);
    this.selectedPath = filePath;

    const root = this.normalize(this.rootPath) + '/';
    if (!filePath.startsWith(root)) return;

    const relative = filePath.slice(root.length);
    const parts = relative.split('/');

    let needsReload = false;
    let current = this.normalize(this.rootPath);
    for (let i = 0; i < parts.length - 1; i++) {
      current += '/' + parts[i];
      if (!this.expanded.has(current)) {
        this.expanded.add(current);
        needsReload = true;
      }
    }

    if (needsReload) await this.reload();

    this.treeEl.querySelectorAll('.is-file-selected').forEach(e => e.classList.remove('is-file-selected'));
    const el = this.treeEl.querySelector(`[data-path="${filePath.replace(/"/g, '\\"')}"]`) as HTMLElement | null;
    if (el) {
      el.classList.add('is-file-selected');
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  async refresh(): Promise<void> {
    this.treeEl.innerHTML = '<div style="padding:8px;color:var(--tertiary);font-size:11px">Loading...</div>';
    this.expanded.clear();
    const temp = document.createElement('div');
    await this.loadDir(this.rootPath, temp, 0);
    this.treeEl.innerHTML = '';
    while (temp.firstChild) this.treeEl.appendChild(temp.firstChild);
  }

  private async reload(): Promise<void> {
    const temp = document.createElement('div');
    await this.loadDir(this.rootPath, temp, 0);
    this.treeEl.innerHTML = '';
    while (temp.firstChild) this.treeEl.appendChild(temp.firstChild);
    if (this.selectedPath) {
      const el = this.treeEl.querySelector(`[data-path="${this.selectedPath.replace(/"/g, '\\"')}"]`) as HTMLElement | null;
      if (el) el.classList.add('is-file-selected');
    }
  }

  private showInlineInput(parentDir: string, isFolder: boolean, afterEl?: HTMLElement, childContainer?: HTMLElement): void {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:2px 4px';
    row.style.paddingLeft = '12px';

    const input = document.createElement('input');
    input.style.cssText = 'flex:1;border:1px solid var(--border);outline:none;background:var(--panel);font-size:12px;font-family:"Space Mono","Courier New",monospace;color:var(--primary);padding:1px 4px;border-radius:3px';
    input.placeholder = isFolder ? 'folder name' : 'file name';
    input.autofocus = true;

    const icon = document.createElement('span');
    icon.textContent = isFolder ? '▸' : ' ';
    icon.style.cssText = 'color:var(--tertiary);width:12px;flex-shrink:0';

    row.appendChild(icon);
    row.appendChild(input);
    if (afterEl) {
      const target = childContainer && childContainer.parentNode ? childContainer : afterEl;
      target.parentNode!.insertBefore(row, target.nextSibling);
      row.style.paddingLeft = `${parseInt(afterEl.style.paddingLeft) + 16}px`;
    } else {
      this.treeEl.appendChild(row);
    }
    input.focus();

    const commit = async () => {
      const name = input.value.trim();
      if (!name) { row.remove(); return; }
      const fullPath = parentDir + '/' + name;
      if (isFolder) {
        await window.electronAPI?.fs.mkdir(fullPath);
      } else {
        await window.electronAPI?.fs.writeFile(fullPath, '');
      }
      row.remove();
      this.reload();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); row.remove(); }
    });
    // Blur also commits
    input.addEventListener('blur', () => commit());
  }

  private createFile(parentDir: string, afterEl?: HTMLElement, childContainer?: HTMLElement): void {
    this.showInlineInput(parentDir, false, afterEl, childContainer);
  }

  private createFolder(parentDir: string, afterEl?: HTMLElement, childContainer?: HTMLElement): void {
    this.showInlineInput(parentDir, true, afterEl, childContainer);
  }

  private async deletePath(targetPath: string): Promise<void> {
    const name = targetPath.split(/[\\/]/).pop() || 'this item';
    const modal = new ConfirmModal(`Delete <b>${name}</b>?`, 'Delete');
    const ok = await modal.open();
    if (!ok) return;
    try {
      const result = await window.electronAPI?.fs.delete(targetPath);
      if (!result) {
        window.alert(`Failed to delete ${name}. The item may be in use or you may lack permission.`);
      }
    } catch (e) {
      console.error('deletePath error:', e);
      window.alert(`Failed to delete ${name}. An unexpected error occurred.`);
    }
    await this.refresh();
  }

  private renameItem(item: HTMLElement, fullPath: string): void {
    const originalName = fullPath.split(/[\\/]/).pop() || '';
    const sep = fullPath.lastIndexOf('/');
    const parentDir = fullPath.substring(0, sep);
    const originalDisplay = item.style.display;
    item.style.display = 'none';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:2px 4px';
    row.style.paddingLeft = item.style.paddingLeft;

    const input = document.createElement('input');
    input.value = originalName;
    input.style.cssText =
      'flex:1;border:1px solid var(--border);outline:none;background:var(--panel);font-size:12px;font-family:"Space Mono","Courier New",monospace;color:var(--primary);padding:1px 4px;border-radius:3px';
    input.autofocus = true;

    row.appendChild(input);
    item.parentNode?.insertBefore(row, item.nextSibling);

    input.focus();
    input.select();

    const commit = async () => {
      const newName = input.value.trim();
      if (!newName || newName === originalName) {
        row.remove();
        item.style.display = originalDisplay;
        return;
      }
      const newPath = parentDir + '/' + newName;
      try {
        const ok = await window.electronAPI?.fs.rename(fullPath, newPath);
        if (!ok) {
          window.alert(`Failed to rename ${originalName}.`);
          row.remove();
          item.style.display = originalDisplay;
          return;
        }
      } catch (e) {
        console.error('renameItem error:', e);
        window.alert(`Failed to rename ${originalName}. An unexpected error occurred.`);
        row.remove();
        item.style.display = originalDisplay;
        return;
      }
      row.remove();
      this.reload();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); row.remove(); item.style.display = originalDisplay; }
    });
    input.addEventListener('blur', () => commit());
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
      if (entry.name === '.gitkeep' || entry.name === '.git') continue;
      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:4px;padding:2px 4px;cursor:pointer;border-radius:3px;color:var(--primary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis';
      item.style.paddingLeft = `${12 + depth * 16}px`;
      item.addEventListener('mouseenter', () => item.style.background = 'var(--panel)');
      item.addEventListener('mouseleave', () => item.style.background = 'transparent');

      const fullPath = dirPath + '/' + entry.name;
      item.dataset.path = fullPath;
      const isExpanded = this.expanded.has(fullPath);
      const iconSpan = document.createElement('span');
      iconSpan.style.cssText = 'width:12px;flex-shrink:0';
      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;display:block';
      nameSpan.textContent = entry.name;
      if (entry.isDirectory) {
        iconSpan.textContent = isExpanded ? '▾' : '▸';
        iconSpan.style.color = 'var(--amber)';
      } else {
        const fc = this.getFileColor(entry.name);
        iconSpan.textContent = '·';
        iconSpan.style.color = fc;
        iconSpan.style.opacity = '0.6';
        nameSpan.style.color = fc;
      }
      item.appendChild(iconSpan);
      item.appendChild(nameSpan);

      if (entry.isDirectory) {
        const childContainer = document.createElement('div');
        const isExpanded = this.expanded.has(fullPath);
        childContainer.style.display = isExpanded ? '' : 'none';

        // Pre-load children if already expanded
        if (isExpanded) {
          await this.loadDir(fullPath, childContainer, depth + 1);
        }

        // Context menu on directory
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const items: any[] = [
            { label: 'New File', action: () => this.createFile(fullPath, item, childContainer) },
            { label: 'New Folder', action: () => this.createFolder(fullPath, item, childContainer) },
            { separator: true },
            { label: 'Copy', action: () => { this.copiedPath = fullPath; } },
            { label: 'Paste', action: () => this.pasteHere(fullPath), disabled: !this.copiedPath },
            { separator: true },
            { label: 'Rename', action: () => this.renameItem(item, fullPath) },
            { separator: true },
            { label: 'Delete', action: () => this.deletePath(fullPath) },
          ];
          new ContextMenu(items, e.clientX, e.clientY);
        });

        item.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (this.expanded.has(fullPath)) {
            this.expanded.delete(fullPath);
            childContainer.style.display = 'none';
            const iconSpan = item.children[0] as HTMLElement;
            if (iconSpan) iconSpan.textContent = '▸';
          } else {
            this.expanded.add(fullPath);
            childContainer.innerHTML = '';
            try {
              await this.loadDir(fullPath, childContainer, depth + 1);
            } catch {}
            childContainer.style.display = childContainer.children.length > 0 ? '' : 'none';
            if (!childContainer.parentNode) item.parentNode?.insertBefore(childContainer, item.nextSibling);
            const iconSpan = item.children[0] as HTMLElement;
            if (iconSpan) iconSpan.textContent = '▾';
          }
        });
        parentEl.appendChild(item);
        if (isExpanded) {
          parentEl.insertBefore(childContainer, item.nextSibling);
        }
      } else {
        // Context menu on file
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const items: any[] = [
            { label: 'Copy', action: () => { this.copiedPath = fullPath; } },
            { label: 'Paste', action: () => this.pasteHere(dirPath), disabled: !this.copiedPath },
          ];
          // If .md file, add markdown plugin options
          const ext = entry.name.split('.').pop()?.toLowerCase();
          if (ext === 'md') {
            items.push({ separator: true });
            if (this.markdownLabels.length > 0) {
              for (const label of this.markdownLabels) {
                items.push({
                  label: `Open to ${label}`,
                  action: () => this.onOpenInMarkdown?.(fullPath, label),
                });
              }
            } else {
              items.push({
                label: 'View in Markdown',
                action: () => this.onOpenInMarkdown?.(fullPath, ''),
              });
            }
          }
          items.push({ separator: true });
          items.push({ label: 'Rename', action: () => this.renameItem(item, fullPath) });
          items.push({ separator: true });
          items.push({ label: 'Delete', action: () => this.deletePath(fullPath) });
          new ContextMenu(items, e.clientX, e.clientY);
        });

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onFileOpen(fullPath);
          requestAnimationFrame(() => this.selectFile(fullPath));
        });
        parentEl.appendChild(item);
      }
    }
  }
}
