export class CommandPalette {
  private overlay: HTMLDivElement;
  private paletteEl: HTMLDivElement;
  private input: HTMLInputElement;
  private resultsEl: HTMLDivElement;
  private progressEl: HTMLDivElement;

  private allFiles: string[] = [];
  private results: string[] = [];
  private recentFiles: string[] = [];
  private selectedIndex = -1;
  private isOpen = false;
  private loading = false;
  private filesLoaded = false;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  private onSelectFile: (filePath: string) => void;
  private wsPath: string;

  private readonly RECENT_KEY = 'cockpit-recent-files';
  private readonly MAX_RECENT = 10;

  constructor(wsPath: string, onSelect: (filePath: string) => void) {
    this.wsPath = wsPath;
    this.onSelectFile = onSelect;
    this.loadRecent();

    this.overlay = document.createElement('div');
    this.overlay.className = 'palette-overlay';

    this.paletteEl = document.createElement('div');
    this.paletteEl.className = 'palette';

    this.input = document.createElement('input');
    this.input.className = 'palette-input';
    this.input.placeholder = 'Search files by name...';

    this.progressEl = document.createElement('div');
    this.progressEl.className = 'palette-progress';
    this.progressEl.style.display = 'none';
    const bar = document.createElement('div');
    bar.className = 'palette-progress-bar';
    this.progressEl.appendChild(bar);

    this.resultsEl = document.createElement('div');
    this.resultsEl.className = 'palette-results';

    this.paletteEl.appendChild(this.input);
    this.paletteEl.appendChild(this.progressEl);
    this.paletteEl.appendChild(this.resultsEl);
    this.overlay.appendChild(this.paletteEl);
    document.body.appendChild(this.overlay);

    this.input.addEventListener('input', () => this.onInput());
    this.input.addEventListener('keydown', (e) => this.handleKeydown(e));

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
  }

  open(): void {
    this.isOpen = true;
    this.overlay.classList.add('open');
    this.input.value = '';
    this.results = [];
    this.selectedIndex = -1;
    this.allFiles = [];
    this.filesLoaded = false;
    this.renderResults();
    setTimeout(() => this.input.focus(), 50);
  }

  close(): void {
    this.isOpen = false;
    this.overlay.classList.remove('open');
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  private async onInput(): Promise<void> {
    const val = this.input.value.trim();
    if (this.searchTimer) clearTimeout(this.searchTimer);

    if (!val) {
      this.results = [];
      this.selectedIndex = -1;
      this.renderResults();
      return;
    }

    this.searchTimer = setTimeout(() => this.performSearch(val), 150);
  }

  private async performSearch(pattern: string): Promise<void> {
    if (!this.filesLoaded) {
      this.loading = true;
      this.progressEl.style.display = '';
      this.renderResults();

      this.allFiles = await this.loadAllFiles();
      this.filesLoaded = true;
      this.loading = false;
      this.progressEl.style.display = 'none';
    }

    const lower = pattern.toLowerCase();
    this.results = this.allFiles.filter(f => {
      const name = f.split('/').pop()?.toLowerCase() || '';
      const path = f.toLowerCase();
      return name.includes(lower) || path.includes(lower);
    }).slice(0, 50);

    this.selectedIndex = this.results.length > 0 ? 0 : -1;
    this.renderResults();
  }

  private async loadAllFiles(): Promise<string[]> {
    const files: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      const entries = await window.electronAPI?.fs.readDir(dir);
      if (!entries) return;
      for (const e of entries) {
        if (e.name === '.git' || e.name === 'node_modules' || e.name === '.cockpit') continue;
        const full = (dir.endsWith('/') ? dir : dir + '/') + e.name;
        if (e.isDirectory) await walk(full);
        else files.push(full);
      }
    };
    await walk(this.wsPath);
    return files.sort((a, b) => a.localeCompare(b));
  }

  private renderResults(): void {
    this.resultsEl.innerHTML = '';

    if (this.input.value.trim() === '') {
      this.renderRecent();
      return;
    }

    if (this.loading) {
      const el = document.createElement('div');
      el.className = 'palette-empty';
      el.textContent = 'Searching files...';
      this.resultsEl.appendChild(el);
      return;
    }

    if (this.results.length === 0) {
      const el = document.createElement('div');
      el.className = 'palette-empty';
      el.textContent = 'No matching files';
      this.resultsEl.appendChild(el);
      return;
    }

    for (let i = 0; i < this.results.length; i++) {
      this.resultsEl.appendChild(this.createItem(this.results[i], i === this.selectedIndex));
    }

    if (this.selectedIndex >= 0) {
      const item = this.resultsEl.children[this.selectedIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }

  private renderRecent(): void {
    if (this.recentFiles.length === 0) {
      const el = document.createElement('div');
      el.className = 'palette-empty';
      el.textContent = 'No recent files. Start typing to search.';
      this.resultsEl.appendChild(el);
      return;
    }

    const header = document.createElement('div');
    header.className = 'palette-section-header';
    header.textContent = 'RECENT FILES';
    this.resultsEl.appendChild(header);

    for (let i = 0; i < this.recentFiles.length; i++) {
      this.resultsEl.appendChild(this.createItem(this.recentFiles[i], i === this.selectedIndex));
    }
  }

  private createItem(filePath: string, selected: boolean): HTMLElement {
    const el = document.createElement('div');
    el.className = 'palette-item' + (selected ? ' is-selected' : '');

    const name = filePath.split('/').pop() || '';
    const dir = filePath.slice(0, filePath.lastIndexOf('/'));
    const relDir = dir.startsWith(this.wsPath) ? dir.slice(this.wsPath.length + 1) : dir;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'palette-item-name';
    nameSpan.textContent = name;

    const dirSpan = document.createElement('span');
    dirSpan.className = 'palette-item-dir';
    dirSpan.textContent = relDir;

    el.appendChild(nameSpan);
    el.appendChild(dirSpan);

    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.selectFile(filePath);
    });

    el.addEventListener('mouseenter', () => {
      const parent = el.parentElement;
      if (!parent) return;
      const items = Array.from(parent.querySelectorAll('.palette-item'));
      const idx = items.indexOf(el);
      if (idx >= 0) {
        this.selectedIndex = idx;
        parent.querySelectorAll('.palette-item').forEach((item, i) => {
          (item as HTMLElement).classList.toggle('is-selected', i === idx);
        });
      }
    });

    return el;
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.moveSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.moveSelection(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.confirmSelection();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  private moveSelection(direction: number): void {
    const items = this.resultsEl.querySelectorAll('.palette-item');
    if (items.length === 0) return;

    this.selectedIndex = Math.max(0, Math.min(items.length - 1, this.selectedIndex + direction));
    items.forEach((item, i) => {
      (item as HTMLElement).classList.toggle('is-selected', i === this.selectedIndex);
    });
    items[this.selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  private confirmSelection(): void {
    const query = this.input.value.trim();
    if (query === '' && this.recentFiles.length > 0) {
      const idx = this.selectedIndex >= 0 ? Math.min(this.selectedIndex, this.recentFiles.length - 1) : 0;
      if (idx >= 0) this.selectFile(this.recentFiles[idx]);
    } else if (this.results.length > 0 && this.selectedIndex >= 0) {
      this.selectFile(this.results[this.selectedIndex]);
    }
  }

  private selectFile(filePath: string): void {
    this.addRecent(filePath);
    this.close();
    this.onSelectFile(filePath);
  }

  private loadRecent(): void {
    try {
      const raw = localStorage.getItem(this.RECENT_KEY);
      if (raw) this.recentFiles = JSON.parse(raw);
      if (!Array.isArray(this.recentFiles)) this.recentFiles = [];
    } catch { this.recentFiles = []; }
  }

  private saveRecent(): void {
    try {
      localStorage.setItem(this.RECENT_KEY, JSON.stringify(this.recentFiles));
    } catch {}
  }

  private addRecent(filePath: string): void {
    this.recentFiles = this.recentFiles.filter(f => f !== filePath);
    this.recentFiles.unshift(filePath);
    if (this.recentFiles.length > this.MAX_RECENT) {
      this.recentFiles = this.recentFiles.slice(0, this.MAX_RECENT);
    }
    this.saveRecent();
  }

  destroy(): void {
    this.overlay.remove();
  }
}
