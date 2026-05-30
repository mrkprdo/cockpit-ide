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
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      setZoomLevel: vi.fn(),
      setVisualZoomLevelLimits: vi.fn(),
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
    writeText: vi.fn(),
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
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ plugins: [], zOrder: [], zoom: 1, panX: 0, panY: 0 }));

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
      const handler = handleMap.get('workspace:load')!;
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });

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

    it('workspace:addRecent adds path to recent list', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('workspace:addRecent')!;
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(['/ws1']));
      const writeSpy = vi.mocked(fs.writeFileSync);
      writeSpy.mockClear();
      writeSpy.mockImplementation(() => {});

      await handler({}, '/ws2');

      expect(writeSpy).toHaveBeenCalled();
      const written = JSON.parse(writeSpy.mock.calls[0][1] as string);
      expect(written).toEqual(['/ws2', '/ws1']);
    });

    it('workspace:addRecent caps list at 5 entries', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('workspace:addRecent')!;
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(['/ws1', '/ws2', '/ws3', '/ws4', '/ws5']));
      const writeSpy = vi.mocked(fs.writeFileSync);
      writeSpy.mockClear();
      writeSpy.mockImplementation(() => {});

      await handler({}, '/ws6');

      const written = JSON.parse(writeSpy.mock.calls[0][1] as string);
      expect(written).toEqual(['/ws6', '/ws1', '/ws2', '/ws3', '/ws4']);
      expect(written.length).toBe(5);
    });

    it('workspace:removeRecent removes path from recent list', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('workspace:removeRecent')!;
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(['/ws1', '/ws2', '/ws3']));
      const writeSpy = vi.mocked(fs.writeFileSync);
      writeSpy.mockClear();
      writeSpy.mockImplementation(() => {});

      await handler({}, '/ws2');

      expect(writeSpy).toHaveBeenCalled();
      const written = JSON.parse(writeSpy.mock.calls[0][1] as string);
      expect(written).toEqual(['/ws1', '/ws3']);
    });

    it('workspace:removeRecent handles missing path gracefully', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('workspace:removeRecent')!;
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(['/ws1', '/ws2']));
      const writeSpy = vi.mocked(fs.writeFileSync);
      writeSpy.mockClear();
      writeSpy.mockImplementation(() => {});

      await handler({}, '/nonexistent');

      const written = JSON.parse(writeSpy.mock.calls[0][1] as string);
      expect(written).toEqual(['/ws1', '/ws2']);
    });
  });

  describe('path security validation', () => {
    beforeAll(async () => {
      const main = await import('../main/main');
      main._testSetWorkspacePath('/safe/workspace');
    });

    it('fs:readDir rejects path outside workspace', async () => {
      const handler = handleMap.get('fs:readDir')!;
      const result = await handler({}, '/etc');
      expect(result).toBeNull();
    });

    it('fs:readDir allows path inside workspace', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:readDir')!;
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      const result = await handler({}, '/safe/workspace/src');
      expect(result).toEqual([]);
    });

    it('fs:readFile rejects path outside workspace', async () => {
      const handler = handleMap.get('fs:readFile')!;
      const result = await handler({}, '/etc/passwd');
      expect(result).toBeNull();
    });

    it('fs:readFile allows path inside workspace', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:readFile')!;
      vi.mocked(fs.readFileSync).mockReturnValue('safe content');
      const result = await handler({}, '/safe/workspace/file.txt');
      expect(result).toBe('safe content');
    });

    it('fs:writeFile rejects path outside workspace', async () => {
      const handler = handleMap.get('fs:writeFile')!;
      const result = await handler({}, '/etc/evil.sh', 'rm -rf /');
      expect(result).toBe(false);
    });

    it('fs:mkdir rejects path outside workspace', async () => {
      const handler = handleMap.get('fs:mkdir')!;
      const result = await handler({}, '/etc/evil');
      expect(result).toBe(false);
    });

    it('fs:delete rejects path outside workspace', async () => {
      const handler = handleMap.get('fs:delete')!;
      const result = await handler({}, '/etc');
      expect(result).toBe(false);
    });

    it('fs:copy rejects source outside workspace', async () => {
      const handler = handleMap.get('fs:copy')!;
      const result = await handler({}, '/etc/passwd', '/safe/workspace/copy');
      expect(result).toBe(false);
    });

    it('fs:copy rejects dest outside workspace', async () => {
      const handler = handleMap.get('fs:copy')!;
      const result = await handler({}, '/safe/workspace/file.txt', '/etc/evil');
      expect(result).toBe(false);
    });

    it('fs:rename rejects oldPath outside workspace', async () => {
      const handler = handleMap.get('fs:rename')!;
      const result = await handler({}, '/etc/passwd', '/safe/workspace/passwd');
      expect(result).toBe(false);
    });

    it('fs:rename rejects newPath outside workspace', async () => {
      const handler = handleMap.get('fs:rename')!;
      const result = await handler({}, '/safe/workspace/file.txt', '/etc/evil');
      expect(result).toBe(false);
    });

    it('workspace:load rejects explicit wsPath outside workspace', async () => {
      const handler = handleMap.get('workspace:load')!;
      const result = await handler({}, '/etc');
      expect(result).toBeNull();
    });

    it('workspace:save rejects explicit wsPath outside workspace', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const handler = handleMap.get('workspace:save')!;
      const result = await handler({}, { plugins: [] }, '/etc');
      expect(result).toBe(false);
      spy.mockRestore();
    });

    it('fs:mkdir creates directory inside workspace', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:mkdir')!;
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);

      const result = await handler({}, '/safe/workspace/newdir');
      expect(result).toBe(true);
      expect(fs.mkdirSync).toHaveBeenCalledWith('/safe/workspace/newdir', { recursive: true });
    });

    it('fs:mkdir returns false on error', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:mkdir')!;
      vi.mocked(fs.mkdirSync).mockImplementation(() => { throw new Error('EACCES'); });

      const result = await handler({}, '/safe/workspace/blocked');
      expect(result).toBe(false);
    });

    it('fs:copy copies file inside workspace', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:copy')!;
      vi.mocked(fs.cpSync).mockReturnValue(undefined);

      const result = await handler({}, '/safe/workspace/src', '/safe/workspace/dest');
      expect(result).toBe(true);
      expect(fs.cpSync).toHaveBeenCalledWith('/safe/workspace/src', '/safe/workspace/dest', { recursive: true });
    });

    it('fs:copy returns false on error', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:copy')!;
      vi.mocked(fs.cpSync).mockImplementation(() => { throw new Error('ENOENT'); });

      const result = await handler({}, '/safe/workspace/src', '/safe/workspace/dest');
      expect(result).toBe(false);
    });

    it('fs:rename renames file inside workspace', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:rename')!;
      vi.mocked(fs.renameSync).mockReturnValue(undefined);

      const result = await handler({}, '/safe/workspace/old', '/safe/workspace/new');
      expect(result).toBe(true);
      expect(fs.renameSync).toHaveBeenCalledWith('/safe/workspace/old', '/safe/workspace/new');
    });

    it('fs:rename returns false on error', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('fs:rename')!;
      vi.mocked(fs.renameSync).mockImplementation(() => { throw new Error('ENOENT'); });

      const result = await handler({}, '/safe/workspace/old', '/safe/workspace/new');
      expect(result).toBe(false);
    });

    it('file:watch starts watching and returns true', async () => {
      const handler = handleMap.get('file:watch')!;
      const result = await handler({}, '/safe/workspace');
      expect(result).toBe(true);
    });

    it('file:unwatch stops watching and returns true', async () => {
      const handler = handleMap.get('file:unwatch')!;
      const result = await handler({});
      expect(result).toBe(true);
    });
  });

  describe('shell:openExternal URL validation', () => {
    it('allows https URLs', async () => {
      const { shell } = await import('electron');
      vi.mocked(shell.openExternal).mockResolvedValue(undefined as any);
      const handler = handleMap.get('shell:openExternal')!;
      const result = await handler({}, 'https://github.com');
      expect(result).toBe(true);
    });

    it('allows http URLs', async () => {
      const { shell } = await import('electron');
      vi.mocked(shell.openExternal).mockResolvedValue(undefined as any);
      const handler = handleMap.get('shell:openExternal')!;
      const result = await handler({}, 'http://example.com');
      expect(result).toBe(true);
    });

    it('allows mailto URLs', async () => {
      const { shell } = await import('electron');
      vi.mocked(shell.openExternal).mockResolvedValue(undefined as any);
      const handler = handleMap.get('shell:openExternal')!;
      const result = await handler({}, 'mailto:test@example.com');
      expect(result).toBe(true);
    });

    it('rejects file URLs', async () => {
      const handler = handleMap.get('shell:openExternal')!;
      const result = await handler({}, 'file:///etc/passwd');
      expect(result).toBe(false);
    });

    it('rejects javascript URLs', async () => {
      const handler = handleMap.get('shell:openExternal')!;
      const result = await handler({}, 'javascript:alert(1)');
      expect(result).toBe(false);
    });

    it('rejects ftp URLs', async () => {
      const handler = handleMap.get('shell:openExternal')!;
      const result = await handler({}, 'ftp://evil.com');
      expect(result).toBe(false);
    });

    it('returns false for invalid URL strings', async () => {
      const handler = handleMap.get('shell:openExternal')!;
      const result = await handler({}, 'not-a-url');
      expect(result).toBe(false);
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

  describe('window:isMaximized behavior', () => {
    it('returns true when window is maximized', async () => {
      const { BrowserWindow } = await import('electron');
      (BrowserWindow as any).fromWebContents = vi.fn(() => ({
        isMaximized: () => true,
      }));
      const handler = handleMap.get('window:isMaximized')!;
      const result = await handler({ sender: {} });
      expect(result).toBe(true);
    });

    it('returns false when window is not maximized', async () => {
      const { BrowserWindow } = await import('electron');
      (BrowserWindow as any).fromWebContents = vi.fn(() => ({
        isMaximized: () => false,
      }));
      const handler = handleMap.get('window:isMaximized')!;
      const result = await handler({ sender: {} });
      expect(result).toBe(false);
    });

    it('returns false when no window found', async () => {
      const { BrowserWindow } = await import('electron');
      (BrowserWindow as any).fromWebContents = vi.fn(() => null);
      const handler = handleMap.get('window:isMaximized')!;
      const result = await handler({ sender: {} });
      expect(result).toBe(false);
    });
  });

  describe('clipboard:readText behavior', () => {
    it('returns clipboard text', async () => {
      const { clipboard } = await import('electron');
      vi.mocked(clipboard.readText).mockReturnValue('copied text');
      const handler = handleMap.get('clipboard:readText')!;
      const result = await handler({});
      expect(result).toBe('copied text');
    });

    it('returns empty string when clipboard is empty', async () => {
      const { clipboard } = await import('electron');
      vi.mocked(clipboard.readText).mockReturnValue('');
      const handler = handleMap.get('clipboard:readText')!;
      const result = await handler({});
      expect(result).toBe('');
    });
  });

  describe('terminal:create behavior', () => {
    it('spawns PTY and returns true', async () => {
      const handler = handleMap.get('terminal:create')!;
      const sender = { isDestroyed: () => false, send: vi.fn() };
      const result = await handler({ sender }, 'test-uuid-1');
      expect(result).toBe(true);
    });

    it('spawns PTY with platform shell', async () => {
      const nodePty = await import('node-pty');
      const spawnMock = vi.mocked(nodePty.spawn);
      spawnMock.mockClear();

      const handler = handleMap.get('terminal:create')!;
      const sender = { isDestroyed: () => false, send: vi.fn() };
      await handler({ sender }, 'test-uuid-2', '/some/cwd');

      expect(spawnMock).toHaveBeenCalled();
      const args = spawnMock.mock.calls[0];
      expect(args[0]).toBeTruthy();
    });

    it('returns false when spawn throws', async () => {
      const nodePty = await import('node-pty');
      const spawnMock = vi.mocked(nodePty.spawn);
      spawnMock.mockImplementationOnce(() => { throw new Error('spawn failed'); });

      const handler = handleMap.get('terminal:create')!;
      const sender = { isDestroyed: () => false, send: vi.fn() };
      const result = await handler({ sender }, 'test-uuid-3');
      expect(result).toBe(false);

      spawnMock.mockReset();
      (spawnMock as any).mockReturnValue({ onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn() });
    });
  });

  describe('terminal:write/resize/kill behavior', () => {
    let ptyMock: any;

    beforeEach(() => {
      ptyMock = { onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
    });

    it('terminal:write sends data to PTY', async () => {
      const nodePty = await import('node-pty');
      (nodePty.spawn as any).mockClear();
      (nodePty.spawn as any).mockReturnValue(ptyMock);

      const createHandler = handleMap.get('terminal:create')!;
      const sender = { isDestroyed: () => false, send: vi.fn() };
      await createHandler({ sender }, 'test-uuid-w');

      const writeHandler = onMap.get('terminal:write')!;
      writeHandler({}, 'test-uuid-w', 'echo hello');
      expect(ptyMock.write).toHaveBeenCalledWith('echo hello');
    });

    it('terminal:resize changes PTY dimensions', async () => {
      const nodePty = await import('node-pty');
      (nodePty.spawn as any).mockClear();
      (nodePty.spawn as any).mockReturnValue(ptyMock);

      const createHandler = handleMap.get('terminal:create')!;
      const sender = { isDestroyed: () => false, send: vi.fn() };
      await createHandler({ sender }, 'test-uuid-r');

      const resizeHandler = onMap.get('terminal:resize')!;
      resizeHandler({}, 'test-uuid-r', 100, 40);
      expect(ptyMock.resize).toHaveBeenCalledWith(100, 40);
    });

    it('terminal:kill terminates PTY and cleans up', async () => {
      const nodePty = await import('node-pty');
      (nodePty.spawn as any).mockClear();
      (nodePty.spawn as any).mockReturnValue(ptyMock);

      const createHandler = handleMap.get('terminal:create')!;
      const sender = { isDestroyed: () => false, send: vi.fn() };
      await createHandler({ sender }, 'test-uuid-k');

      const killHandler = onMap.get('terminal:kill')!;
      killHandler({}, 'test-uuid-k');
      expect(ptyMock.kill).toHaveBeenCalled();

      // Second kill should be a no-op (already removed)
      ptyMock.kill.mockClear();
      killHandler({}, 'test-uuid-k');
      expect(ptyMock.kill).not.toHaveBeenCalled();
    });

    it('terminal:write no-ops for unknown uuid', () => {
      const writeHandler = onMap.get('terminal:write')!;
      expect(() => writeHandler({}, 'unknown-uuid', 'data')).not.toThrow();
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

    it('workspace:removeRecent handler is registered', () => {
      expect(handleMap.has('workspace:removeRecent')).toBe(true);
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
