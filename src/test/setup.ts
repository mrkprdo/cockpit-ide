import { vi } from 'vitest';

// ─── Module mocks (hoisted, so must be at top level) ───
vi.mock('@chenglou/pretext', () => ({
  prepareWithSegments: (text: string) => ({ text, segments: [] }),
  layoutWithLines: (
    _prepared: any,
    _maxWidth: number,
    lineHeight: number,
  ) => ({
    lines: [{ text: _prepared.text || '' }],
    height: lineHeight,
  }),
}));

vi.mock('@xterm/addon-fit', () => {
  class MockFitAddon {
    activate = vi.fn();
    fit = vi.fn();
    dispose = vi.fn();
    proposeDimensions = vi.fn();
  }
  return { FitAddon: MockFitAddon };
});

vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    options: any = {};
    open = vi.fn();
    write = vi.fn();
    focus = vi.fn();
    resize = vi.fn();
    dispose = vi.fn();
    loadAddon = vi.fn();
    onData = vi.fn().mockReturnValue({ dispose: vi.fn() });
    onResize = vi.fn().mockReturnValue({ dispose: vi.fn() });
    attachCustomKeyEventHandler = vi.fn();
    constructor(_opts?: any) {
      this.options = { ..._opts };
    }
  }
  return { Terminal: MockTerminal };
});

// ─── Crypto polyfill (works in both node and jsdom) ───
if (!globalThis.crypto) {
  let counter = 0;
  (globalThis as any).crypto = {
    randomUUID: () =>
      `00000000-0000-0000-0000-${String(++counter).padStart(12, '0')}`,
  };
}

// ─── DOM/jsdom-only stubs ───
const isDOM = typeof document !== 'undefined';

let mockElectronAPI: any = {};

if (isDOM) {
  // ─── Lightweight Canvas2D mock ───
  function createMockContext(): CanvasRenderingContext2D {
    return {
      canvas: null as any,
      fillStyle: '',
      strokeStyle: '',
      font: '',
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      globalAlpha: 1,
      lineWidth: 1,
      scale: vi.fn(),
      clearRect: vi.fn(),
      fillText: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(), width: 0, height: 0, colorSpace: 'srgb' }),
      putImageData: vi.fn(),
      createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(), width: 0, height: 0, colorSpace: 'srgb' }),
      createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      createPattern: vi.fn().mockReturnValue({}),
      measureText: vi.fn().mockReturnValue({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
      isPointInPath: vi.fn().mockReturnValue(false),
      isPointInStroke: vi.fn().mockReturnValue(false),
      setTransform: vi.fn(),
      transform: vi.fn(),
      resetTransform: vi.fn(),
      getContextAttributes: vi.fn().mockReturnValue({ alpha: true, desynchronized: false, colorSpace: 'srgb' }),
      getTransform: vi.fn().mockReturnValue({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      setLineDash: vi.fn(),
      getLineDash: vi.fn().mockReturnValue([]),
      lineDashOffset: 0,
      globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
      shadowBlur: 0,
      shadowColor: '',
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'low' as ImageSmoothingQuality,
      filter: 'none',
      roundRect: vi.fn(),
      reset: vi.fn(),
      letterSpacing: '',
      wordSpacing: '',
    } as unknown as CanvasRenderingContext2D;
  }

  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
    options?: any,
  ) {
    if (contextId === '2d') {
      const ctx = createMockContext();
      (ctx as any).canvas = this;
      return ctx;
    }
    return origGetContext.call(this, contextId, options);
  } as typeof HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.toDataURL = function () {
    return 'data:image/png;base64,mock';
  };

  // ResizeObserver polyfill
  class MockResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) { this.cb = cb; }
    observe(_target: Element) {}
    unobserve(_target: Element) {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', MockResizeObserver);

  // scrollIntoView polyfill (not implemented in jsdom)
  Element.prototype.scrollIntoView = vi.fn();

  // DOM environment stubs
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = Math.random();
    setTimeout(() => cb(performance.now()), 0);
    return id;
  });

  Object.defineProperty(window, 'devicePixelRatio', { value: 1, writable: true });

  // ─── Mock electronAPI on window ───
  mockElectronAPI = {
    platform: 'win32',
    versions: { node: '20.0.0', chrome: '120.0.0', electron: '42.0.0' },
    window: {
      newWindow: vi.fn().mockResolvedValue(true),
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      isMaximized: vi.fn().mockResolvedValue(false),
      reload: vi.fn(),
    },
    terminal: {
      create: vi.fn().mockResolvedValue(true),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      onData: vi.fn().mockReturnValue(vi.fn()),
      onExit: vi.fn().mockReturnValue(vi.fn()),
    },
    workspace: {
      select: vi.fn().mockResolvedValue('/test/workspace'),
      setPath: vi.fn().mockResolvedValue(true),
      getPath: vi.fn().mockResolvedValue('/test/workspace'),
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      getRecent: vi.fn().mockResolvedValue([]),
      addRecent: vi.fn().mockResolvedValue(undefined),
      removeRecent: vi.fn().mockResolvedValue(undefined),
    },
    git: {
      remotes: vi.fn().mockResolvedValue([]),
      branches: vi.fn().mockResolvedValue([]),
      checkout: vi.fn().mockResolvedValue(true),
      log: vi.fn().mockResolvedValue([]),
      showTree: vi.fn().mockResolvedValue([]),
      diff: vi.fn().mockResolvedValue(''),
      currentBranch: vi.fn().mockResolvedValue('main'),
      stagedFiles: vi.fn().mockResolvedValue([]),
      unstagedFiles: vi.fn().mockResolvedValue([]),
      stagedDiff: vi.fn().mockResolvedValue(''),
      unstagedDiff: vi.fn().mockResolvedValue(''),
      commitBody: vi.fn().mockResolvedValue('Initial commit\n\nThis is the description of the commit.'),
      stage: vi.fn().mockResolvedValue(true),
      unstage: vi.fn().mockResolvedValue(true),
      commit: vi.fn().mockResolvedValue(true),
      push: vi.fn().mockResolvedValue(true),
      checkAhead: vi.fn().mockResolvedValue(false),
    },
    shell: {
      openExternal: vi.fn().mockResolvedValue(true),
    },
    clipboard: {
      readText: vi.fn().mockReturnValue(''),
      writeText: vi.fn().mockResolvedValue(undefined),
    },
    prefs: {
      load: vi.fn().mockResolvedValue({}),
      save: vi.fn().mockResolvedValue(true),
    },
    memory: {
      loadGlobal: vi.fn().mockResolvedValue({ version: 1, updatedAt: '', entries: [] }),
      saveGlobal: vi.fn().mockResolvedValue(true),
      loadWorkspace: vi.fn().mockResolvedValue({ version: 1, updatedAt: '', entries: [] }),
      saveWorkspace: vi.fn().mockResolvedValue(true),
    },
    fs: {
      readDir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn().mockResolvedValue('test content'),
      writeFile: vi.fn().mockResolvedValue(true),
      mkdir: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(true),
      copy: vi.fn().mockResolvedValue(true),
      rename: vi.fn().mockResolvedValue(true),
      watch: vi.fn().mockResolvedValue(true),
      unwatch: vi.fn().mockResolvedValue(true),
      onChanged: vi.fn().mockReturnValue(vi.fn()),
    },
    ide: {
      editorState: vi.fn(),
      status: vi.fn().mockResolvedValue({ running: true, port: 58900, workspace: '/mock/workspace', lockPaths: ['/mock/lock'] }),
      onOpenFile: vi.fn().mockReturnValue(vi.fn()),
    },
    diagnostics: {
      reportError: vi.fn(),
    },
    health: {
      onMainFailure: vi.fn().mockReturnValue(vi.fn()),
    },
    log: {
      onPush: vi.fn().mockReturnValue(vi.fn()),
    },
    __trace: {
      subscribe: vi.fn().mockReturnValue(vi.fn()),
      getRecent: vi.fn().mockReturnValue([]),
    },
  };

  (window as any).electronAPI = mockElectronAPI;

  // CSS custom properties
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--bg', '#161C24');
  rootStyle.setProperty('--surface', '#1C2538');
  rootStyle.setProperty('--panel', '#243248');
  rootStyle.setProperty('--primary', '#C8D6E5');
  rootStyle.setProperty('--secondary', '#78909C');
  rootStyle.setProperty('--tertiary', '#546E7A');
  rootStyle.setProperty('--border', '#2A3A4A');
  rootStyle.setProperty('--font', '"Space Mono", "Courier New", monospace');
  rootStyle.setProperty('--accent', '#00E5FF');
  rootStyle.setProperty('--accent2', '#B388FF');

  // DOM scaffolding for App
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

  (window as any).close = () => {};
}

// ─── Export for tests to access mocks ───
export { mockElectronAPI };
