export class MonacoEditorPlugin {
  private el: HTMLDivElement;
  private editorEl: HTMLDivElement;
  private filePath = '';
  private editor: any = null;
  private ready: Promise<void>;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;background:transparent';

    const bar = document.createElement('div');
    bar.style.cssText = 'padding:4px 8px;font-size:10px;color:var(--tertiary);font-family:"Space Mono","Courier New",monospace;border-bottom:1px solid var(--border);flex-shrink:0';
    bar.id = 'editor-bar';
    bar.textContent = 'No file selected';
    this.el.appendChild(bar);

    this.editorEl = document.createElement('div');
    this.editorEl.style.cssText = 'flex:1;overflow:hidden';
    this.editorEl.id = 'monaco-' + crypto.randomUUID();
    this.el.appendChild(this.editorEl);

    container.appendChild(this.el);
    this.ready = this.initMonaco();
  }

  private async initMonaco(): Promise<void> {
    // Check if Monaco is already loaded
    if ((window as any).monaco) return;

    // Monaco is deployed to dist/vs/ (relative to dist/renderer/ → ../vs/)
    const vsPath = '../vs';

    // Load the CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = vsPath + '/editor/editor.main.css';
    document.head.appendChild(link);

    // Load the AMD loader
    await this.loadScript(vsPath + '/loader.js');

    // Configure base URL and load editor
    return new Promise<void>((resolve) => {
      (window as any).require.config({
        paths: { vs: vsPath },
        baseUrl: undefined,
      });

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

  async openFile(filePath: string): Promise<void> {
    await this.ready;
    this.filePath = filePath;
    const name = filePath.split(/[\\/]/).pop() || filePath;
    const ext = (name.split('.').pop() || '').toLowerCase();
    const langMap: Record<string, string> = {
      ts: 'typescript', js: 'javascript', tsx: 'typescript', jsx: 'javascript',
      json: 'json', html: 'html', css: 'css', md: 'markdown',
      py: 'python', rs: 'rust', yaml: 'yaml', yml: 'yaml',
      xml: 'xml', svg: 'xml', sh: 'shell', bat: 'bat', ps1: 'powershell',
      cpp: 'cpp', c: 'c', cs: 'csharp', java: 'java',
      go: 'go', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
    };

    const bar = this.el.querySelector('#editor-bar')!;
    bar.textContent = `  ${name}`;

    const content = await window.electronAPI?.fs.readFile(filePath);
    if (this.editor) {
      this.editor.setValue(content || '');
      const m = (window as any).monaco;
      if (m) {
        const model = this.editor.getModel();
        m.editor.setModelLanguage(model, langMap[ext] || 'plaintext');
      }
    }
  }

  getCurrentFile(): string { return this.filePath; }
  getContent(): string { return this.editor?.getValue() || ''; }
}
