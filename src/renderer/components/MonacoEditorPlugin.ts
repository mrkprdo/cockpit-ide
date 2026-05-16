interface Tab { filePath: string; name: string; }

export class MonacoEditorPlugin {
  private el: HTMLDivElement;
  private editorEl: HTMLDivElement;
  tabs: Tab[] = [];
  activeTab: string | null = null;
  private fileContents = new Map<string, string>();
  private editor: any = null;
  private bar: HTMLDivElement;
  private tabContainer: HTMLDivElement;
  private ready: Promise<void>;

  private unsubFileChanged: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;background:transparent';

    // Top bar with tabs
    this.bar = document.createElement('div');
    this.bar.style.cssText = 'display:flex;align-items:center;font-size:11px;font-family:"Space Mono","Courier New",monospace;border-bottom:1px solid var(--border);flex-shrink:0;height:30px;overflow:hidden';

    // Listen for external file changes
    this.unsubFileChanged = window.electronAPI?.fs.onChanged((filePath) => {
      this.reloadIfOpen(filePath);
    }) || null;

    this.tabContainer = document.createElement('div');
    this.tabContainer.style.cssText = 'display:flex;align-items:stretch;height:100%;flex:1;overflow-x:auto;overflow-y:hidden';
    this.tabContainer.id = 'tab-container';

    this.bar.appendChild(this.tabContainer);
    this.el.appendChild(this.bar);

    this.editorEl = document.createElement('div');
    this.editorEl.style.cssText = 'flex:1;overflow:hidden';
    this.editorEl.id = 'monaco-' + crypto.randomUUID();
    this.el.appendChild(this.editorEl);

    container.appendChild(this.el);
    this.initTabDummies();
    this.ready = this.initMonaco();
  }

  private initTabDummies(): void {
    const empty = document.createElement('span');
    empty.style.cssText = 'padding:0 12px;color:var(--tertiary);font-size:10px;white-space:nowrap';
    empty.textContent = 'No file selected';
    this.tabContainer.appendChild(empty);
  }

  private clearTabDummies(): void {
    this.tabContainer.querySelectorAll('span').forEach(s => {
      if (s.textContent === 'No file selected') s.remove();
    });
  }

  private renderTabs(): void {
    this.tabContainer.innerHTML = '';
    this.clearTabDummies();

    if (this.tabs.length === 0) {
      this.initTabDummies();
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

  private getLanguage(ext: string): string {
    const map: Record<string, string> = {
      ts: 'typescript', js: 'javascript', tsx: 'typescript', jsx: 'javascript',
      json: 'json', html: 'html', css: 'css', md: 'markdown',
      py: 'python', rs: 'rust', yaml: 'yaml', yml: 'yaml',
      xml: 'xml', svg: 'xml', sh: 'shell', bat: 'bat', ps1: 'powershell',
      cpp: 'cpp', c: 'c', cs: 'csharp', java: 'java',
      go: 'go', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
    };
    return map[ext] || 'plaintext';
  }

  /** Reload file content if this file is open in a tab */
  async reloadIfOpen(filePath: string): Promise<void> {
    const tab = this.tabs.find(t => t.filePath === filePath);
    if (!tab) return;
    const content = await window.electronAPI?.fs.readFile(filePath);
    if (content !== undefined) {
      this.fileContents.set(filePath, content);
      if (this.activeTab === filePath && this.editor) {
        this.editor.setValue(content);
      }
    }
  }

  async openFile(filePath: string): Promise<void> {
    await this.ready;
    const name = filePath.split(/[\\/]/).pop() || filePath;
    const ext = (name.split('.').pop() || '').toLowerCase();

    // If already open, just switch to it
    const existing = this.tabs.find(t => t.filePath === filePath);
    if (existing) {
      this.switchTab(filePath);
      return;
    }

    // Load content
    const content = await window.electronAPI?.fs.readFile(filePath) || '';
    this.fileContents.set(filePath, content);

    // Add tab
    this.tabs.push({ filePath, name });
    this.switchTab(filePath);
  }

  switchTab(filePath: string): void {
    const tab = this.tabs.find(t => t.filePath === filePath);
    if (!tab) return;

    if (this.editor) {
      // Save current content BEFORE switching activeTab
      if (this.editor.getValue && this.activeTab) {
        this.fileContents.set(this.activeTab, this.editor.getValue());
      }
      this.activeTab = filePath;

      const content = this.fileContents.get(filePath) || '';
      this.editor.setValue(content);

      const ext = (tab.name.split('.').pop() || '').toLowerCase();
      const m = (window as any).monaco;
      if (m) {
        const model = this.editor.getModel();
        m.editor.setModelLanguage(model, this.getLanguage(ext));
      }
    }

    this.renderTabs();
  }

  private closeTab(filePath: string): void {
    const idx = this.tabs.findIndex(t => t.filePath === filePath);
    if (idx === -1) return;
    this.tabs.splice(idx, 1);
    this.fileContents.delete(filePath);

    if (this.activeTab === filePath) {
      if (this.tabs.length > 0) {
        const newIdx = Math.min(idx, this.tabs.length - 1);
        this.switchTab(this.tabs[newIdx].filePath);
      } else {
        this.activeTab = null;
        if (this.editor) this.editor.setValue('');
        this.renderTabs();
      }
    } else {
      this.renderTabs();
    }
  }

  getCurrentFile(): string { return this.activeTab || ''; }
  getContent(): string { return this.editor?.getValue() || ''; }

  private async initMonaco(): Promise<void> {
    if ((window as any).monaco) return;
    const vsPath = '../vs';

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = vsPath + '/editor/editor.main.css';
    document.head.appendChild(link);

    await this.loadScript(vsPath + '/loader.js');
    return new Promise<void>((resolve) => {
      (window as any).require.config({ paths: { vs: vsPath }, baseUrl: undefined });
      (window as any).require(['vs/editor/editor.main'], () => {
        const m = (window as any).monaco;
        if (!m) { resolve(); return; }

        m.editor.defineTheme('cockpit-dark', {
          base: 'vs-dark', inherit: true, rules: [],
          colors: {
            'editor.background': '#0A0E14',
            'editor.foreground': '#C8D6E5',
            'editorCursor.foreground': '#C8D6E5',
            'editor.selectionBackground': '#2A3A4A',
            'editorLineNumber.foreground': '#546E7A',
            'editorLineNumber.activeForeground': '#78909C',
            'editorWidget.background': '#121820',
            'editorWidget.border': '#2A3A4A',
            'input.background': '#1A2430',
            'input.border': '#2A3A4A',
            'focusBorder': '#2A3A4A',
          },
        });

        this.editor = m.editor.create(this.editorEl, {
          value: '',
          language: 'plaintext',
          theme: 'cockpit-dark',
          fontSize: 13,
          fontFamily: '"Space Mono", "Courier New", monospace',
          lineNumbers: 'on',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: 'on',
          tabSize: 2,
          renderWhitespace: 'selection',
          padding: { top: 8 },
        });

        resolve();
      });
    });
  }

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
}
