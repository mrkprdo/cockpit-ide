/**
 * @vitest-environment node
 *
 * Tests for Electron main process IPC handlers.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ─── Handler maps hoisted first ───
const { handleMap, onMap } = vi.hoisted(() => {
  const handleMap = new Map<string, (...args: any[]) => any>();
  const onMap = new Map<string, (...args: any[]) => any>();
  return { handleMap, onMap };
});

// ─── Mock electron ───
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn((p: string) => `/mock/userdata/${p}`),
    getAppPath: vi.fn(() => '/mock/app'),
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    quit: vi.fn(),
    setAppUserModelId: vi.fn(),
  },
  BrowserWindow: vi.fn(function (this: any, _opts: any) {
    this.maximize = vi.fn();
    this.show = vi.fn();
    this.loadFile = vi.fn();
    this.minimize = vi.fn();
    this.unmaximize = vi.fn();
    this.close = vi.fn();
    this.isMaximized = vi.fn(() => false);
    this.on = vi.fn();
    this.webContents = {
      openDevTools: vi.fn(),
      send: vi.fn(),
    };
  }),
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      handleMap.set(channel, handler);
    }),
    on: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      onMap.set(channel, handler);
    }),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
  clipboard: {
    readText: vi.fn(() => ''),
  },
}));

vi.mock('fs', () => ({
  default: {},
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
  cpSync: vi.fn(),
  renameSync: vi.fn(),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isDirectory: () => false })),
}));

vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>();
  return { ...actual };
});

vi.mock('electron-reload', () => ({ default: vi.fn() }));

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  })),
}));

// Prevent chokidar dynamic require
vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
}));

describe('main.ts IPC handlers', () => {
  beforeAll(async () => {
    // Import main.ts to trigger all handler registrations
    await import('../main/main');
    // Wait for app.whenReady() promise chain to complete
    await new Promise(r => setTimeout(r, 100));
  });

  // ─── Behavioral tests: call handlers with real mocked fs ───

  describe('fs:readDir behavior', () => {
    it('returns mapped entries on success', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:readDir')!;
      const mockDirent = (name: string, isDir: boolean) => ({
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
        isSymbolicLink: () => false,
      });
      vi.mocked(fs.readdirSync).mockReturnValue([
        mockDirent('src', true),
        mockDirent('README.md', false),
      ] as any);

      const result = await handler({}, '/test');
      expect(result).toEqual([
        { name: 'src', isDirectory: true },
        { name: 'README.md', isDirectory: false },
      ]);
    });

    it('returns null on ENOENT', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:readDir')!;
      vi.mocked(fs.readdirSync).mockImplementation(() => { throw new Error('ENOENT'); });

      const result = await handler({}, '/nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('fs:readFile behavior', () => {
    it('returns file content on success', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:readFile')!;
      vi.mocked(fs.readFileSync).mockReturnValue('hello world');

      const result = await handler({}, '/test/file.txt');
      expect(result).toBe('hello world');
      expect(fs.readFileSync).toHaveBeenCalledWith('/test/file.txt', 'utf-8');
    });

    it('returns null on error', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:readFile')!;
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

      const result = await handler({}, '/missing.txt');
      expect(result).toBeNull();
    });
  });

  describe('fs:writeFile behavior', () => {
    it('writes and returns true', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:writeFile')!;
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const result = await handler({}, '/test/file.txt', 'content');
      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith('/test/file.txt', 'content', 'utf-8');
    });

    it('returns false on error', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:writeFile')!;
      vi.mocked(fs.writeFileSync).mockImplementation(() => { throw new Error('EACCES'); });

      const result = await handler({}, '/readonly/file.txt', 'content');
      expect(result).toBe(false);
    });
  });

  describe('fs:delete behavior', () => {
    it('deletes and returns true', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:delete')!;

      const result = await handler({}, '/test/dir');
      expect(result).toBe(true);
      expect(fs.rmSync).toHaveBeenCalledWith('/test/dir', { recursive: true, force: true });
    });
  });

  describe('window:new behavior', () => {
    it('creates a new BrowserWindow', async () => {
      const { BrowserWindow } = await import('electron');
      const handler = handleMap.get('window:new')!;
      (BrowserWindow as any).mockClear();

      const result = await handler({});
      expect(result).toBe(true);
      expect(BrowserWindow).toHaveBeenCalled();
    });
  });

  describe('workspace behavior', () => {
    it('workspace:load returns null when no workspace', async () => {
      const handler = handleMap.get('workspace:load')!;
      const result = await handler({});
      expect(result).toBeNull();
    });

    it('workspace:load with explicit path reads from that path', async () => {
      const fs = await import('fs');
      vi.mocked(fs.readFileSync).mockClear();
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ plugins: [], zOrder: [], zoom: 1, panX: 0, panY: 0, isDark: false }));

      const handler = handleMap.get('workspace:load')!;
      const result = await handler({}, '/custom/workspace');
      expect(result).not.toBeNull();
      if (result) {
        expect(result.plugins).toEqual([]);
      }
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('custom'),
        'utf-8',
      );
    });

    it('workspace:load returns null when explicit path is invalid', async () => {
      const fs = await import('fs');
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

      const handler = handleMap.get('workspace:load')!;
      const result = await handler({}, '/nonexistent/path');
      expect(result).toBeNull();
    });

    it('workspace:save returns false without workspacePath', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const handler = handleMap.get('workspace:save')!;

      const result = await handler({}, { plugins: [] });
      expect(result).toBe(false);
      spy.mockRestore();
    });

    it('workspace:getRecent returns parsed recent list', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('workspace:getRecent')!;
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(['/ws1', '/ws2']));

      const result = await handler({});
      expect(result).toEqual(['/ws1', '/ws2']);
    });

    it('workspace:getRecent returns [] on error', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('workspace:getRecent')!;
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

      const result = await handler({});
      expect(result).toEqual([]);
    });
  });

  describe('preferences behavior', () => {
    it('prefs:load returns parsed JSON', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('prefs:load')!;
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ theme: 'dark' }));

      const result = await handler({});
      expect(result).toEqual({ theme: 'dark' });
    });

    it('prefs:load returns {} on error', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('prefs:load')!;
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

      const result = await handler({});
      expect(result).toEqual({});
    });

    it('prefs:save writes and returns true', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('prefs:save')!;
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const result = await handler({}, { theme: 'dark' });
      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify({ theme: 'dark' }, null, 2),
      );
    });
  });

  describe('shell:openExternal behavior', () => {
    it('returns true on success', async () => {
      const { shell } = await import('electron');
      vi.mocked(shell.openExternal).mockResolvedValue(undefined as any);

      const handler = handleMap.get('shell:openExternal')!;
      const result = await handler({}, 'https://example.com');
      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      const { shell } = await import('electron');
      vi.mocked(shell.openExternal).mockRejectedValue(new Error('failed'));

      const handler = handleMap.get('shell:openExternal')!;
      const result = await handler({}, 'bad://url');
      expect(result).toBe(false);
    });
  });

  // ─── Registration tests (verify all channels exist) ───
  describe('filesystem handlers (module-level)', () => {
    it('fs:readDir handler is registered', () => {
      expect(handleMap.has('fs:readDir')).toBe(true);
    });

    it('fs:readFile handler is registered', () => {
      expect(handleMap.has('fs:readFile')).toBe(true);
    });

    it('fs:writeFile handler is registered', () => {
      expect(handleMap.has('fs:writeFile')).toBe(true);
    });

    it('fs:delete handler is registered', () => {
      expect(handleMap.has('fs:delete')).toBe(true);
    });

    it('fs:copy handler is registered', () => {
      expect(handleMap.has('fs:copy')).toBe(true);
    });

    it('fs:rename handler is registered', () => {
      expect(handleMap.has('fs:rename')).toBe(true);
    });
  });

  describe('workspace handlers (whenReady)', () => {
    it('workspace:getPath handler is registered', () => {
      expect(handleMap.has('workspace:getPath')).toBe(true);
    });

    it('workspace:load handler is registered', () => {
      expect(handleMap.has('workspace:load')).toBe(true);
    });

    it('workspace:save handler is registered', () => {
      expect(handleMap.has('workspace:save')).toBe(true);
    });

    it('workspace:getRecent handler is registered', () => {
      expect(handleMap.has('workspace:getRecent')).toBe(true);
    });

    it('workspace:addRecent handler is registered', () => {
      expect(handleMap.has('workspace:addRecent')).toBe(true);
    });
  });

  describe('shell, prefs, watcher handlers', () => {
    it('shell:openExternal handler is registered', () => {
      expect(handleMap.has('shell:openExternal')).toBe(true);
    });

    it('prefs:load handler is registered', () => {
      expect(handleMap.has('prefs:load')).toBe(true);
    });

    it('prefs:save handler is registered', () => {
      expect(handleMap.has('prefs:save')).toBe(true);
    });

    it('file:watch handler is registered', () => {
      expect(handleMap.has('file:watch')).toBe(true);
    });

    it('file:unwatch handler is registered', () => {
      expect(handleMap.has('file:unwatch')).toBe(true);
    });
  });

  describe('terminal handlers', () => {
    it('terminal:create handler is registered', () => {
      expect(handleMap.has('terminal:create')).toBe(true);
    });
  });

  describe('window lifecycle IPC handlers', () => {
    it('window:new handler is registered', () => {
      expect(handleMap.has('window:new')).toBe(true);
    });

    it('window:minimize listener is registered', () => {
      expect(onMap.has('window:minimize')).toBe(true);
    });

    it('window:maximize listener is registered', () => {
      expect(onMap.has('window:maximize')).toBe(true);
    });

    it('window:close listener is registered', () => {
      expect(onMap.has('window:close')).toBe(true);
    });

    it('terminal:write listener is registered', () => {
      expect(onMap.has('terminal:write')).toBe(true);
    });

    it('terminal:resize listener is registered', () => {
      expect(onMap.has('terminal:resize')).toBe(true);
    });

    it('terminal:kill listener is registered', () => {
      expect(onMap.has('terminal:kill')).toBe(true);
    });
  });
});
