import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { createLogger } from '../logging/logger';

const BASE_FONT_SIZE = 13;
/** Explicit scrollback cap: the default (1000) is small for agent runs, but
 *  unbounded is a memory leak across long-lived cards. */
const SCROLLBACK_LINES = 2000;
/** Trailing debounce for the resize → fit → PTY-resize path. */
const FIT_DEBOUNCE_MS = 120;
const log = createLogger('terminal');

export class TerminalWindow {
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
  private fitTimer: ReturnType<typeof setTimeout> | null = null;
  private exitBanner: HTMLDivElement | null = null;
  private readonly cwd: string | undefined;

  constructor(container: HTMLElement, uuid: string, cwd?: string) {
    this.uuid = uuid;
    this.cwd = cwd;
    this.element = document.createElement('div');
    // position:relative anchors the exit banner over the terminal surface.
    this.element.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden';
    container.appendChild(this.element);

    const api = (window as any).electronAPI;
    if (!api) {
      this.ready = Promise.resolve(uuid);
      return;
    }

    const termTheme = TerminalWindow.readTheme();
    const term = new Terminal({
      fontSize: BASE_FONT_SIZE,
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      theme: termTheme,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: SCROLLBACK_LINES,
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

    this.unlistenExit = api.terminal.onExit((id: string, exitCode?: number) => {
      if (id === uuid) {
        log.info('terminal exited', uuid);
        // The card is NOT destroyed on exit any more - keep the scrollback and
        // offer a restart in place (contract with the canvas slice).
        this.showExitState(exitCode);
        this.onExit?.();
      }
    }) ?? null;

    // Adapt cols/rows only when physical container dimensions change (card resize).
    // Canvas zoom is handled by CSS transform on WindowCard — no PTY resize needed.
    // A drag fires this at ~60 Hz; fitting per callback reflowed the whole buffer
    // and forwarded a PTY resize per frame. Trailing-debounce to one fit per gesture.
    const ro = new ResizeObserver(() => {
      this.scheduleFit();
    });
    ro.observe(this.element);
    this.resizeObserver = ro;

    requestAnimationFrame(() => {
      if (!this.destroyed) fitAddon.fit();
    });

    this.ready = api.terminal.create(uuid, cwd)
      .then((ok: boolean) => {
        log.info('terminal created', uuid, ok ? '' : '(failed)');
        this.syncPtySize();
        return uuid;
      })
      .catch(() => uuid);
  }

  /**
   * Push the current grid size to the PTY once it exists. The first fit runs a
   * frame after `open()`, often before `terminal:create` has registered a pty —
   * that resize would be dropped and the shell would stay at 80×24.
   */
  private syncPtySize(): void {
    const api = (window as any).electronAPI;
    const cols = (this.xterm as any)?.cols;
    const rows = (this.xterm as any)?.rows;
    if (!api || !cols || !rows) return;
    api.terminal.resize(this.uuid, cols, rows);
  }

  /** Trailing debounce: one fit once the resize gesture settles. */
  private scheduleFit(): void {
    if (this.destroyed) return;
    if (this.fitTimer) clearTimeout(this.fitTimer);
    this.fitTimer = setTimeout(() => {
      this.fitTimer = null;
      if (!this.destroyed) this.fitAddon?.fit();
    }, FIT_DEBOUNCE_MS);
  }

  /**
   * In-card exit state: a banner over the (still readable) scrollback with a
   * Restart control that re-creates the PTY under the same uuid.
   */
  private showExitState(code?: number): void {
    if (this.destroyed || this.exitBanner) return;
    const banner = document.createElement('div');
    banner.className = 'terminal-exit-banner';
    banner.style.cssText = 'position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;'
      + 'gap:8px;padding:6px 8px;background:var(--surface);border-top:1px dashed var(--border);'
      + 'font-family:var(--font);font-size:12px;color:var(--secondary);z-index:2';

    const label = document.createElement('span');
    // `terminal:exit` currently carries the uuid only; the code renders when the
    // main-process payload grows one (this stays the single place to wire it).
    label.textContent = typeof code === 'number' ? `process exited (code ${code})` : 'process exited';
    banner.appendChild(label);

    const restart = document.createElement('button');
    restart.className = 'terminal-restart-btn';
    restart.textContent = 'Restart';
    restart.style.cssText = 'margin-left:auto;padding:3px 10px;';
    restart.addEventListener('click', () => this.restart());
    banner.appendChild(restart);

    this.element.appendChild(banner);
    this.exitBanner = banner;
  }

  /**
   * Re-create the PTY for the same uuid and keep the existing scrollback. The
   * main-process handler re-registers the pty under the uuid, and the data/exit
   * listeners bound in the constructor keep working.
   */
  async restart(): Promise<boolean> {
    const api = (window as any).electronAPI;
    if (!api || this.destroyed) return false;
    this.exitBanner?.remove();
    this.exitBanner = null;
    this.xterm?.write('\r\n\x1b[90m—— process restarted ——\x1b[0m\r\n');
    try {
      const ok: boolean = await api.terminal.create(this.uuid, this.cwd);
      if (!ok) this.showExitState();
      else this.syncPtySize();
      this.scheduleFit();
      return ok;
    } catch {
      this.showExitState();
      return false;
    }
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
    this.xterm.options.theme = TerminalWindow.readTheme();
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
    // WindowCard applies transform: scale() for canvas zoom — no fontSize change needed here.
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

    if (this.fitTimer) { clearTimeout(this.fitTimer); this.fitTimer = null; }
    this.exitBanner?.remove();
    this.exitBanner = null;

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.fitAddon?.dispose();
    this.xterm?.dispose();
    this.fitAddon = null;
    this.xterm = null;

    this.element.remove();
  }
}
