export class EditorPlugin {
  private el: HTMLDivElement;
  private textarea: HTMLTextAreaElement;
  private filePath = '';

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;background:transparent';

    const bar = document.createElement('div');
    bar.style.cssText = 'padding:4px 8px;font-size:10px;color:var(--tertiary);font-family:"Space Mono","Courier New",monospace;border-bottom:1px solid var(--border);flex-shrink:0';
    bar.id = 'editor-bar';
    bar.textContent = 'No file selected';
    this.el.appendChild(bar);

    this.textarea = document.createElement('textarea');
    this.textarea.style.cssText = 'flex:1;border:none;outline:none;resize:none;padding:8px;font-size:13px;font-family:"Space Mono","Courier New",monospace;background:transparent;color:var(--primary);tab-size:2';
    this.textarea.spellcheck = false;
    this.textarea.placeholder = 'Select a file to edit';
    this.el.appendChild(this.textarea);

    container.appendChild(this.el);
  }

  async openFile(filePath: string): Promise<void> {
    this.filePath = filePath;
    const name = filePath.split(/[\\/]/).pop() || filePath;
    const bar = this.el.querySelector('#editor-bar')!;
    bar.textContent = `  ${name}`;
    const content = await window.electronAPI?.fs.readFile(filePath);
    this.textarea.value = content || '';
  }

  getCurrentFile(): string { return this.filePath; }
  getContent(): string { return this.textarea.value; }
}
