import { vi } from 'vitest';

// ─── Canvas mock for jsdom ───
// HTMLCanvasElement.getContext returns null by default in jsdom.
// We monkey-patch to return a real 2D context-like object via the `canvas` npm package.
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const canvasLib = await import('canvas');
const { createCanvas } = canvasLib;

HTMLCanvasElement.prototype.getContext = function (
  contextId: string,
  options?: any,
) {
  if (contextId === '2d') {
    // Use the actual canvas library to get a real 2D context
    const offCanvas = createCanvas(this.width || 100, this.height || 100);
    const ctx = offCanvas.getContext('2d');
    if (ctx) {
      // Override canvas reference so operations target the real canvas
      (ctx as any).canvas = this;
      return ctx;
    }
  }
  return originalGetContext.call(this, contextId, options);
} as typeof HTMLCanvasElement.prototype.getContext;

// toDataURL and toBlob
const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL = function (...args: any[]) {
  try {
    const offCanvas = createCanvas(this.width || 100, this.height || 100);
    const ctx = offCanvas.getContext('2d');
    return offCanvas.toDataURL(...args);
  } catch {
    return origToDataURL.call(this, ...args);
  }
};

// ─── Crypto (used by PluginCard for uuid) ───
if (!globalThis.crypto) {
  let counter = 0;
  (globalThis as any).crypto = {
    randomUUID: () =>
      `00000000-0000-0000-0000-${String(++counter).padStart(12, '0')}`,
  };
}

// ─── DOM environment stubs ───
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  const id = Math.random();
  setTimeout(() => cb(performance.now()), 0);
  return id;
});

// devicePixelRatio
Object.defineProperty(window, 'devicePixelRatio', { value: 1, writable: true });

// ─── Mock @chenglou/pretext ───
vi.mock('@chenglou/pretext', () => ({
  prepareWithSegments: (text: string) => ({ text, segments: [] }),
  layoutWithLines: (
    prepared: any,
    maxWidth: number,
    lineHeight: number,
  ) => ({
    lines: [{ text: prepared.text }],
    height: lineHeight,
  }),
}));

// ─── Mock @xterm/xterm ───
vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    open = vi.fn();
    write = vi.fn();
    focus = vi.fn();
    resize = vi.fn();
    dispose = vi.fn();
    paste = vi.fn();
    attachCustomKeyEventHandler = vi.fn();
    onData = vi.fn().mockReturnValue({ dispose: vi.fn() });
    onResize = vi.fn().mockReturnValue({ dispose: vi.fn() });
    constructor(_opts?: any) {}
  }
  return { Terminal: MockTerminal };
});

// ─── Mock electronAPI (window.electronAPI) ───
const mockElectronAPI = {
  platform: 'win32',
  versions: { node: '20.0.0', chrome: '120.0.0', electron: '42.0.0' },
  window: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn().mockResolvedValue(false),
  },
  terminal: {
    create: vi.fn().mockResolvedValue(true),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn().mockReturnValue(vi.fn()),
    onExit: vi.fn().mockReturnValue(vi.fn()),
  },
  clipboard: {
    readText: vi.fn().mockReturnValue(''),
  },
  workspace: {
    select: vi.fn().mockResolvedValue('/test/workspace'),
    getPath: vi.fn().mockResolvedValue('/test/workspace'),
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    getRecent: vi.fn().mockResolvedValue([]),
    addRecent: vi.fn().mockResolvedValue(undefined),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(true),
  },
  prefs: {
    load: vi.fn().mockResolvedValue({}),
    save: vi.fn().mockResolvedValue(true),
  },
  fs: {
    readDir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue('test content'),
    writeFile: vi.fn().mockResolvedValue(true),
    delete: vi.fn().mockResolvedValue(true),
    copy: vi.fn().mockResolvedValue(true),
    rename: vi.fn().mockResolvedValue(true),
    watch: vi.fn().mockResolvedValue(true),
    unwatch: vi.fn().mockResolvedValue(true),
    onChanged: vi.fn().mockReturnValue(vi.fn()),
  },
};

(window as any).electronAPI = mockElectronAPI;

// ─── CSS custom properties needed by theme/rendering ───
const rootStyle = document.documentElement.style;
rootStyle.setProperty('--bg', '#0A0E14');
rootStyle.setProperty('--surface', '#121820');
rootStyle.setProperty('--panel', '#1A2430');
rootStyle.setProperty('--primary', '#C8D6E5');
rootStyle.setProperty('--secondary', '#78909C');
rootStyle.setProperty('--tertiary', '#546E7A');
rootStyle.setProperty('--border', '#2A3A4A');
rootStyle.setProperty('--font', '"Space Mono", "Courier New", monospace');
rootStyle.setProperty('--accent', '#00E5FF');

// ─── DOM scaffolding for App (auto-executes new App() on import) ───
// App.ts line 157 runs `new App()` which needs these elements
const canvas = document.createElement('div');
canvas.id = 'canvas';
canvas.style.cssText = 'width:1920px;height:1080px;position:relative';
document.body.appendChild(canvas);

const menuBar = document.createElement('div');
menuBar.id = 'menu-bar';
document.body.appendChild(menuBar);

const statusbar = document.createElement('div');
statusbar.id = 'statusbar';
document.body.appendChild(statusbar);

const tbMin = document.createElement('button');
tbMin.id = 'tb-min';
document.body.appendChild(tbMin);

const tbMax = document.createElement('button');
tbMax.id = 'tb-max';
document.body.appendChild(tbMax);

const tbClose = document.createElement('button');
tbClose.id = 'tb-close';
document.body.appendChild(tbClose);

// Suppress window.close() since App may call it when workspace is null
(window as any).close = () => {};

// ─── Export for tests to access mocks ───
export { mockElectronAPI };
