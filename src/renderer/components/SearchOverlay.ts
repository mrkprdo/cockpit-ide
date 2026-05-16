const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.exe', '.dll', '.so', '.dylib', '.o', '.obj', '.pyc', '.class',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv',
  '.wasm',
]);

interface SearchMatch {
  filePath: string;
  lineNumber: number;
  lineContent: string;
}

export class SearchOverlay {
  private overlay: HTMLDivElement;
  private paletteEl: HTMLDivElement;
  private input: HTMLInputElement;
  private toolbar: HTMLDivElement;
  private toggleBtns: Map<string, HTMLButtonElement> = new Map();
  private progressEl: HTMLDivElement;
  private resultsEl: HTMLDivElement;

  private allFiles: string[] = [];
  private results: SearchMatch[] = [];
  private selectedIndex = -1;
  private isOpen = false;
  private loading = false;
  private filesLoaded = false;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  private matchCase = false;
  private exactMatch = false;
  private useRegex = false;

  private onSelectMatch: (filePath: string, lineNumber: number) => void;
  private wsPath: string;

  constructor(wsPath: string, onSelect: (filePath: string, lineNumber: number) => void) {
    this.wsPath = wsPath;
    this.onSelectMatch = onSelect;

    this.overlay = document.createElement('div');
    this.overlay.className = 'palette-overlay search-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'Search across files');

    this.paletteEl = document.createElement('div');
    this.paletteEl.className = 'palette';

    this.input = document.createElement('input');
    this.input.className = 'palette-input';
    this.input.placeholder = 'Search across files...';
    this.input.setAttribute('aria-label', 'Search across files');
    this.input.setAttribute('autocomplete', 'off');
    this.input.setAttribute('spellcheck', 'false');

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'search-toolbar';
    this.toolbar.appendChild(this.makeToggle('matchCase', 'Aa', 'Match case'));
    this.toolbar.appendChild(this.makeToggle('exactMatch', '"ab"', 'Exact match'));
    this.toolbar.appendChild(this.makeToggle('regex', '.*', 'Regular expression'));

    this.progressEl = document.createElement('div');
    this.progressEl.className = 'palette-progress';
    this.progressEl.style.display = 'none';
    const bar = document.createElement('div');
    bar.className = 'palette-progress-bar';
    this.progressEl.appendChild(bar);

    this.resultsEl = document.createElement('div');
    this.resultsEl.className = 'palette-results';

    this.paletteEl.appendChild(this.input);
    this.paletteEl.appendChild(this.toolbar);
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

  private makeToggle(mode: string, label: string, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'search-toggle-btn';
    btn.dataset.mode = mode;
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('click', () => {
      btn.classList.toggle('is-active');
      switch (mode) {
        case 'matchCase': this.matchCase = btn.classList.contains('is-active'); break;
        case 'exactMatch': this.exactMatch = btn.classList.contains('is-active'); break;
        case 'regex': this.useRegex = btn.classList.contains('is-active'); break;
      }
      if (this.input.value.trim()) this.scheduleSearch();
    });
    this.toggleBtns.set(mode, btn);
    return btn;
  }

  open(): void {
    this.isOpen = true;
    this.overlay.classList.add('open');
    this.input.value = '';
    this.results = [];
    this.selectedIndex = -1;
    this.allFiles = [];
    this.filesLoaded = false;
    this.matchCase = false;
    this.exactMatch = false;
    this.useRegex = false;
    this.toggleBtns.forEach(b => b.classList.remove('is-active'));
    this.renderResults();
    setTimeout(() => this.input.focus(), 50);
  }

  close(): void {
    this.isOpen = false;
    this.overlay.classList.remove('open');
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  private onInput(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const val = this.input.value.trim();
    if (!val) {
      this.results = [];
      this.selectedIndex = -1;
      this.renderResults();
      return;
    }
    this.searchTimer = setTimeout(() => this.performSearch(val), 300);
  }

  private scheduleSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.performSearch(this.input.value.trim()), 300);
  }

  private async performSearch(pattern: string): Promise<void> {
    if (!pattern) { this.results = []; this.renderResults(); return; }

    if (this.useRegex) {
      try { new RegExp(pattern); } catch {
        this.resultsEl.innerHTML = '';
        const el = document.createElement('div');
        el.className = 'palette-empty';
        el.textContent = 'Invalid regular expression';
        this.resultsEl.appendChild(el);
        return;
      }
    }

    if (!this.filesLoaded) {
      this.loading = true;
      this.progressEl.style.display = '';
      this.renderResults();
      this.allFiles = await this.loadAllFiles();
      this.filesLoaded = true;
      this.loading = false;
      this.progressEl.style.display = 'none';
    }

    const flags = this.matchCase ? '' : 'i';
    const testLine = (line: string): boolean => {
      if (this.useRegex) {
        try { return new RegExp(pattern, flags).test(line); } catch { return false; }
      }
      const haystack = this.matchCase ? line : line.toLowerCase();
      if (this.exactMatch) {
        const needle = this.matchCase ? pattern.trim() : pattern.trim().toLowerCase();
        return haystack === needle || haystack.includes(needle);
      }
      const needle = pattern.toLowerCase();
      return haystack.includes(needle);
    };

    this.results = [];
    for (const fp of this.allFiles) {
      const ext = fp.slice(fp.lastIndexOf('.')).toLowerCase();
      if (BINARY_EXTS.has(ext)) continue;
      try {
        const content = await window.electronAPI?.fs.readFile(fp);
        if (!content) continue;
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (this.results.length >= 100) break;
          if (testLine(lines[i])) {
            this.results.push({ filePath: fp, lineNumber: i + 1, lineContent: lines[i] });
          }
        }
      } catch { continue; }
      if (this.results.length >= 100) break;
    }

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

  private highlightMatch(text: string, pattern: string): string {
    if (!text || !pattern) return this.escapeHtml(text || '');
    const raw = text;
    let searchPattern: RegExp;
    try {
      if (this.useRegex) {
        const flags = this.matchCase ? '' : 'i';
        searchPattern = new RegExp(pattern, flags);
      } else {
        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flags = this.matchCase ? '' : 'i';
        if (this.exactMatch) {
          searchPattern = new RegExp('(\\b' + escapedPattern + '\\b)', flags);
        } else {
          searchPattern = new RegExp('(' + escapedPattern + ')', flags);
        }
      }
      const result = raw.replace(searchPattern, '<mark>$1</mark>');
      return this.escapeHtml(result).replace(/&lt;mark&gt;(.*?)&lt;\/mark&gt;/g, '<mark>$1</mark>');
    } catch {
      return this.escapeHtml(text);
    }
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private renderResults(): void {
    this.resultsEl.innerHTML = '';
    const val = this.input.value.trim();

    if (!val) {
      const el = document.createElement('div');
      el.className = 'palette-empty';
      el.textContent = 'Type to search across files...';
      this.resultsEl.appendChild(el);
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
      el.textContent = 'No matching results';
      this.resultsEl.appendChild(el);
      return;
    }

    for (let i = 0; i < this.results.length; i++) {
      this.resultsEl.appendChild(this.createResultItem(this.results[i], i === this.selectedIndex));
    }

    if (this.selectedIndex >= 0) {
      const item = this.resultsEl.children[this.selectedIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }

  private createResultItem(match: SearchMatch, selected: boolean): HTMLElement {
    const el = document.createElement('div');
    el.className = 'search-result' + (selected ? ' is-selected' : '');

    const pathRow = document.createElement('div');
    pathRow.className = 'search-result-path';

    const name = match.filePath.split('/').pop() || '';
    const dir = match.filePath.slice(0, match.filePath.lastIndexOf('/'));
    const relDir = dir.startsWith(this.wsPath) ? dir.slice(this.wsPath.length + 1) : dir;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'search-result-name';
    nameSpan.textContent = name;

    const dirSpan = document.createElement('span');
    dirSpan.className = 'search-result-dir';
    dirSpan.textContent = relDir;

    pathRow.appendChild(nameSpan);
    pathRow.appendChild(dirSpan);

    const lineno = document.createElement('span');
    lineno.className = 'search-result-lineno';
    lineno.textContent = ':' + match.lineNumber;

    const lineEl = document.createElement('span');
    lineEl.className = 'search-result-line';
    lineEl.innerHTML = this.highlightMatch(match.lineContent.trim(), this.input.value.trim()) || '\u00A0';

    el.appendChild(pathRow);
    el.appendChild(lineno);
    el.appendChild(lineEl);

    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.selectMatch(match);
    });
    el.addEventListener('mouseenter', () => {
      const parent = el.parentElement;
      if (!parent) return;
      const items = Array.from(parent.querySelectorAll('.search-result'));
      const idx = items.indexOf(el);
      if (idx >= 0) {
        this.selectedIndex = idx;
        parent.querySelectorAll('.search-result').forEach((item, i) => {
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
    const items = this.resultsEl.querySelectorAll('.search-result');
    if (items.length === 0) return;
    this.selectedIndex = Math.max(0, Math.min(items.length - 1, this.selectedIndex + direction));
    items.forEach((item, i) => {
      (item as HTMLElement).classList.toggle('is-selected', i === this.selectedIndex);
    });
    items[this.selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  private confirmSelection(): void {
    if (this.results.length > 0 && this.selectedIndex >= 0) {
      this.selectMatch(this.results[this.selectedIndex]);
    }
  }

  private selectMatch(match: SearchMatch): void {
    this.close();
    this.onSelectMatch(match.filePath, match.lineNumber);
  }

  destroy(): void {
    this.overlay.remove();
  }
}
