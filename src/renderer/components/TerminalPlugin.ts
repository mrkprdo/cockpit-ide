import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export class TerminalPlugin {
  readonly uuid: string;
  onExit: (() => void) | null = null;
  private term: Terminal;
  private fitAddon: FitAddon;
  private el: HTMLDivElement;
  private ro: ResizeObserver;
  private cleanup: (() => void) | null = null;
  private exitCleanup: (() => void) | null = null;
  private cwd: string | undefined;

  constructor(container: HTMLElement, uuid: string, cwd?: string) {
    this.uuid = uuid;
    this.cwd = cwd;
    this.el = document.createElement('div');
    this.el.style.cssText = 'width:100%;height:100%;background:#0A0E14';
    container.appendChild(this.el);

    this.fitAddon = new FitAddon();
    this.term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: '"Space Mono", "Courier New", monospace',
      theme: {
        background: '#0A0E14',
        foreground: '#C8D6E5',
        cursor: '#C8D6E5',
        selectionBackground: '#2A3A4A',
        black: '#0A0E14',
        red: '#FF1744',
        green: '#00E676',
        yellow: '#FFAB00',
        blue: '#00E5FF',
        magenta: '#7C4DFF',
        cyan: '#00E5FF',
        white: '#C8D6E5',
        brightBlack: '#546E7A',
        brightRed: '#FF1744',
        brightGreen: '#00E676',
        brightYellow: '#FFAB00',
        brightBlue: '#00E5FF',
        brightMagenta: '#7C4DFF',
        brightCyan: '#00E5FF',
        brightWhite: '#ECEFF1',
      },
    });

    this.fitAddon.activate(this.term);
    this.term.open(this.el);
    this.term.focus();

    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.el);

    this.term.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && e.key.toLowerCase() === 'v' && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
        const text = window.electronAPI?.clipboard.readText();
        if (text) this.term.paste(text);
        return false;
      }
      if (e.type === 'keydown' && e.key.toLowerCase() === 'v' && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        const text = window.electronAPI?.clipboard.readText();
        if (text) this.term.paste(text);
        return false;
      }
      return true;
    });

    this.init();
  }

  private async init(): Promise<void> {
    const api = window.electronAPI?.terminal;
    if (!api) return;

    await api.create(this.uuid, this.cwd);

    this.cleanup = api.onData((termUuid, data) => {
      if (termUuid === this.uuid) this.term.write(data);
    });

    this.exitCleanup = api.onExit((termUuid) => {
      if (termUuid === this.uuid) {
        this.term.write('\r\n\x1b[31m[Process exited]\x1b[0m\r\n');
        this.onExit?.();
      }
    });

    this.term.onData((data) => {
      api.write(this.uuid, data);
    });

    this.term.onResize(({ cols, rows }) => {
      api.resize(this.uuid, cols, rows);
    });

    // Fit on next frame
    requestAnimationFrame(() => this.fit());
  }

  fit(): void {
    try {
      this.fitAddon.fit();
    } catch {
      // fit may throw if terminal or container isn't rendered yet
    }
  }

  destroy(): void {
    this.ro.disconnect();
    this.cleanup?.();
    this.exitCleanup?.();
    window.electronAPI?.terminal.kill(this.uuid);
    this.fitAddon.dispose();
    this.term.dispose();
  }
}
