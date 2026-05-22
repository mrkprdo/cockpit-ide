import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const BASE_FONT_SIZE = 13;

export class TerminalPlugin {
  readonly uuid: string;
  readonly element: HTMLDivElement;

  onExit: (() => void) | null = null;

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

    const term = new Terminal({
      fontSize: BASE_FONT_SIZE,
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      theme: {
        background: '#161C24',
        foreground: '#C8D6E5',
        cursor: '#00E5FF',
        selectionBackground: 'rgba(0,229,255,0.2)',
      },
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    (term as any).loadAddon?.(fitAddon);
    term.open(this.element);
    fitAddon.fit();

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
      if (id === uuid) this.onExit?.();
    }) ?? null;

    // Adapt cols/rows only when physical container dimensions change (card resize).
    // Canvas zoom is handled by CSS transform on PluginCard — no PTY resize needed.
    const ro = new ResizeObserver(() => {
      if (!this.destroyed) fitAddon.fit();
    });
    ro.observe(this.element);
    this.resizeObserver = ro;

    api.terminal.create(uuid, cwd)?.catch(() => {});
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
