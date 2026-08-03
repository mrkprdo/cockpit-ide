import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { createLogger } from '../logging/logger';

const BASE_FONT_SIZE = 13;
const log = createLogger('terminal');

export class TerminalPlugin {
  readonly uuid: string;
  readonly element: HTMLDivElement;

  onExit: (() => void) | null = null;
  readonly ready: Promise<string>;

  private xterm: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private unlistenData: (() => void) | null = null;
  private unlistenExit: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;

  constructor(container: HTMLElement, uuid: string, cwd?: string) {
    this.uuid = uuid;
    this.element = document.createElement('div');
    this.element.style.cssText = 'width:100%;height:100%;overflow:hidden';
    container.appendChild(this.element);

    const api = (window as any).electronAPI;
    if (!api) return;

    const termTheme = TerminalPlugin.readTheme();
    const term = new Terminal({
      fontSize: BASE_FONT_SIZE,
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      theme: termTheme,
      cursorBlink: true,
      allowProposedApi: true,
    });

    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.type !== 'keydown') return true;
      const { ctrlKey, shiftKey, key } = event;

      // Ctrl+Shift+C → copy selection
      if (ctrlKey && shiftKey && (key === 'C' || key === 'c')) {
        const selection = term.getSelection();
        if (selection) {
          api.clipboard.writeText(selection).catch(() => {});
        }
        return false;
      }

      // Ctrl+Shift+V → paste (write to PTY only; PTY echo renders it — avoids double-paste from local echo + host echo)
      if (ctrlKey && shiftKey && (key === 'V' || key === 'v')) {
        const text = api.clipboard.readText();
        if (text) api.terminal.write(uuid, text);
        return false;
      }

      return true;
    });

    const fitAddon = new FitAddon();
    (term as any).loadAddon?.(fitAddon);
    term.open(this.element);

    this.xterm = term;
    this.fitAddon = fitAddon;

    term.onData((data: string) => {
      api.terminal.write(uuid, data);
    });

    term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      api.terminal.resize(uuid, cols, rows);
    });

    this.unlistenData = api.terminal.onData((id: string, data: string) => {
      if (id === uuid) term.write(data);
    }) ?? null;

    this.unlistenExit = api.terminal.onExit((id: string) => {
      if (id === uuid) {
        log.info('terminal exited', uuid);
        this.onExit?.();
      }
    }) ?? null;

    // Adapt cols/rows only when physical container dimensions change (card resize).
    // Canvas zoom is handled by CSS transform on PluginCard — no PTY resize needed.
    const ro = new ResizeObserver(() => {
      if (!this.destroyed) fitAddon.fit();
    });
    ro.observe(this.element);
    this.resizeObserver = ro;

    requestAnimationFrame(() => {
      if (!this.destroyed) fitAddon.fit();
    });

    this.ready = api.terminal.create(uuid, cwd)
      .then((ok) => {
        log.info('terminal created', uuid, ok ? '' : '(failed)');
        return uuid;
      })
      .catch(() => uuid);
  }

  static readTheme(): { background: string; foreground: string; cursor: string; selectionBackground: string } {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#161C24';
    const fg = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#C8D6E5';
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00E5FF';
    const selBg = accent + '33';
    return { background: bg, foreground: fg, cursor: accent, selectionBackground: selBg };
  }

  updateTheme(): void {
    if (!this.xterm) return;
    this.xterm.options.theme = TerminalPlugin.readTheme();
  }

  getScreenBuffer(maxLines = 200): string {
    if (!this.xterm) return '';
    const buffer = this.xterm.buffer.active;
    const start = Math.max(0, buffer.length - maxLines);
    const lines: string[] = [];
    for (let i = start; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.join('\n').trimEnd();
  }

  fit(): void {
    this.fitAddon?.fit();
  }

  setScale(_scale: number): void {
    // PluginCard applies transform: scale() for canvas zoom — no fontSize change needed here.
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    const api = (window as any).electronAPI;
    if (api) api.terminal.kill(this.uuid);

    this.unlistenData?.();
    this.unlistenExit?.();
    this.unlistenData = null;
    this.unlistenExit = null;

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.fitAddon?.dispose();
    this.xterm?.dispose();
    this.fitAddon = null;
    this.xterm = null;

    this.element.remove();
  }
}
