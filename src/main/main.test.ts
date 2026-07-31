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
  safeStorage: {
    // Default to "unavailable" — matches a CI/headless box with no OS keychain
    // — so prefs round-trip as plaintext JSON unless a test opts in.
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn((s: string) => Buffer.from(`ENC:${s}`)),
    decryptString: vi.fn((b: Buffer) => b.toString('utf-8').replace(/^ENC:/, '')),
  },
  session: {
    defaultSession: {
      setPermissionRequestHandler: vi.fn(),
    },
  },
}));

vi.mock('fs', () => ({
  default: {},
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
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

const execFileMock = vi.fn((_cmd: string, _args: string[], _opts: any, cb: (...a: any[]) => void) => cb(null, '', ''));
vi.mock('child_process', () => ({ execFile: (...args: any[]) => (execFileMock as any)(...args) }));

// workspace:select/workspace:setPath call ideServer.start/stop, which would
// otherwise bind a real HTTP+WebSocket server during tests.
vi.mock('./ide-server', () => ({
  ideServer: {
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(),
    onOpenFile: null,
    updateEditorState: vi.fn(),
    getPort: vi.fn(() => 0),
    getLockPaths: vi.fn(() => []),
  },
}));

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
      const main = await import('../main/main');
      main._testTrustPath('/test');
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
      const main = await import('../main/main');
      main._testTrustPath('/test/file.txt');
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
      const main = await import('../main/main');
      main._testTrustPath('/test/dir');
      const fs = await import('fs');
      const handler = handleMap.get('fs:delete')!;

      const result = await handler({}, '/test/dir');
      expect(result).toBe(true);
      expect(fs.rmSync).toHaveBeenCalledWith('/test/dir', { recursive: true, force: true });
    });

    it('retries after a transient failure instead of aborting the loop', async () => {
      const main = await import('../main/main');
      main._testTrustPath('/test/locked-dir');
      const fs = await import('fs');
      const handler = handleMap.get('fs:delete')!;
      const rm = vi.mocked(fs.rmSync);
      rm.mockReset();
      let calls = 0;
      rm.mockImplementation(() => {
        calls++;
        if (calls < 3) throw new Error('EBUSY');
      });

      const result = await handler({}, '/test/locked-dir');
      expect(result).toBe(true);
      expect(calls).toBe(3);

      rm.mockReset();
      rm.mockImplementation(() => {});
    });

    it('returns false after exhausting all retries', async () => {
      const main = await import('../main/main');
      main._testTrustPath('/test/stuck-dir');
      const fs = await import('fs');
      const handler = handleMap.get('fs:delete')!;
      const rm = vi.mocked(fs.rmSync);
      rm.mockReset();
      rm.mockImplementation(() => { throw new Error('EBUSY'); });

      const result = await handler({}, '/test/stuck-dir');
      expect(result).toBe(false);

      rm.mockReset();
      rm.mockImplementation(() => {});
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
      const main = await import('../main/main');
      main._testTrustPath('/custom/workspace');
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
      const main = await import('../main/main');
      main._testTrustPath('/ws2');
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
      const main = await import('../main/main');
      main._testTrustPath('/ws6');
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(['/ws1', '/ws2', '/ws3', '/ws4', '/ws5']));
      const writeSpy = vi.mocked(fs.writeFileSync);
      writeSpy.mockClear();
      writeSpy.mockImplementation(() => {});

      await handler({}, '/ws6');

      const written = JSON.parse(writeSpy.mock.calls[0][1] as string);
      expect(written).toEqual(['/ws6', '/ws1', '/ws2', '/ws3', '/ws4']);
      expect(written.length).toBe(5);
    });

    it('workspace:addRecent rejects an untrusted path (no dialog/CLI origin)', async () => {
      const fs = await import('fs');
      const handler = handleMap.get('workspace:addRecent')!;
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(['/ws1']));
      const writeSpy = vi.mocked(fs.writeFileSync);
      writeSpy.mockClear();
      writeSpy.mockImplementation(() => {});

      await handler({}, '/attacker/planted/path');

      expect(writeSpy).not.toHaveBeenCalled();
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

  describe('diagnostics:rendererError', () => {
    it('appends the renderer error to crash.log', async () => {
      const fs = await import('fs');
      const handler = onMap.get('diagnostics:rendererError')!;
      const appendSpy = vi.mocked(fs.appendFileSync);
      appendSpy.mockClear();

      handler({}, 'window.onerror', 'TypeError: boom');

      expect(appendSpy).toHaveBeenCalled();
      const line = appendSpy.mock.calls[0][1] as string;
      expect(line).toContain('renderer:window.onerror');
      expect(line).toContain('TypeError: boom');
    });
  });

  describe('workspace:setPath trust boundary', () => {
    it('rejects an arbitrary untrusted path even if it is a real directory', async () => {
      const fs = await import('fs');
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      const handler = handleMap.get('workspace:setPath')!;

      const result = await handler({ sender: {} }, 'C:\\');
      expect(result).toBe(false);
    });

    it('accepts a path already trusted via the OS dialog (workspace:select)', async () => {
      const { dialog, BrowserWindow } = await import('electron');
      (BrowserWindow as any).fromWebContents = vi.fn(() => null);
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['/picked/workspace'] } as any);
      const selectHandler = handleMap.get('workspace:select')!;
      const picked = await selectHandler({ sender: {} });
      expect(picked).toBe('/picked/workspace');

      const fs = await import('fs');
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      const setPathHandler = handleMap.get('workspace:setPath')!;
      const result = await setPathHandler({ sender: {} }, '/picked/workspace');
      expect(result).toBe(true);
    });

    it('fs:readDir with no per-window workspace denies an untrusted path', async () => {
      const handler = handleMap.get('fs:readDir')!;
      const result = await handler({}, '/some/random/untrusted/path');
      expect(result).toBeNull();
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

  describe('git argument-injection guards', () => {
    beforeEach(() => { execFileMock.mockClear(); });

    it('git:checkout rejects a branch name starting with "-"', async () => {
      const handler = handleMap.get('git:checkout')!;
      const result = await handler({}, '/safe/workspace', '--upload-pack=/bin/sh');
      expect(result.ok).toBe(false);
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('git:checkout allows an ordinary branch name', async () => {
      const handler = handleMap.get('git:checkout')!;
      const result = await handler({}, '/safe/workspace', 'main');
      expect(result.ok).toBe(true);
      expect(execFileMock).toHaveBeenCalledWith('git', ['checkout', 'main'], expect.anything(), expect.any(Function));
    });

    it('git:showTree rejects a commit arg starting with "-"', async () => {
      const handler = handleMap.get('git:showTree')!;
      const result = await handler({}, '/safe/workspace', '--exec=evil');
      expect(result).toEqual([]);
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('git:diff rejects a commit arg starting with "-" and separates filePath with --', async () => {
      const handler = handleMap.get('git:diff')!;
      const rejected = await handler({}, '/safe/workspace', '--evil', undefined);
      expect(rejected).toBe('');
      expect(execFileMock).not.toHaveBeenCalled();

      const result = await handler({}, '/safe/workspace', 'HEAD', 'some-file.ts');
      expect(result).toBe('');
      expect(execFileMock).toHaveBeenCalledWith(
        'git', ['show', '--no-color', 'HEAD', '--', 'some-file.ts'], expect.anything(), expect.any(Function),
      );
    });

    it('git:commitBody rejects a commit arg starting with "-"', async () => {
      const handler = handleMap.get('git:commitBody')!;
      const result = await handler({}, '/safe/workspace', '--evil');
      expect(result).toBe('');
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('git:stage separates filePath with -- so a leading "-" is never a flag', async () => {
      const handler = handleMap.get('git:stage')!;
      await handler({}, '/safe/workspace', '-weird-file.ts');
      expect(execFileMock).toHaveBeenCalledWith(
        'git', ['add', '--', '-weird-file.ts'], expect.anything(), expect.any(Function),
      );
    });

    it('git:unstage separates filePath with -- so a leading "-" is never a flag', async () => {
      const handler = handleMap.get('git:unstage')!;
      await handler({}, '/safe/workspace', '-weird-file.ts');
      expect(execFileMock).toHaveBeenCalledWith(
        'git', ['restore', '--staged', '--', '-weird-file.ts'], expect.anything(), expect.any(Function),
      );
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

    it('prefs:save encrypts via safeStorage when a keychain is available', async () => {
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);
      const fs = await import('fs');
      const writeSpy = vi.mocked(fs.writeFileSync);
      writeSpy.mockClear();
      writeSpy.mockReturnValue(undefined);
      const handler = handleMap.get('prefs:save')!;

      const result = await handler({}, { apiKey: 'sk-secret' });
      expect(result).toBe(true);
      expect(safeStorage.encryptString).toHaveBeenCalledWith(JSON.stringify({ apiKey: 'sk-secret' }, null, 2));
      const written = writeSpy.mock.calls[0][1];
      expect(Buffer.isBuffer(written)).toBe(true);
      expect(written).toEqual(vi.mocked(safeStorage.encryptString).mock.results[0].value);

      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);
    });

    it('prefs:load decrypts a safeStorage-encrypted file', async () => {
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);
      const fs = await import('fs');
      const encrypted = Buffer.from(`ENC:${JSON.stringify({ apiKey: 'sk-secret' })}`);
      vi.mocked(fs.readFileSync).mockReturnValue(encrypted as any);
      const handler = handleMap.get('prefs:load')!;

      const result = await handler({});
      expect(result).toEqual({ apiKey: 'sk-secret' });

      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);
    });

    it('prefs:load still reads legacy plaintext prefs written before encryption was added', async () => {
      const fs = await import('fs');
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ theme: 'dark' }) as any);
      const handler = handleMap.get('prefs:load')!;

      const result = await handler({});
      expect(result).toEqual({ theme: 'dark' });
    });
  });

  describe('memory behavior', () => {
    it('memory:loadGlobal creates base file when missing', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      const handler = handleMap.get('memory:loadGlobal')!;
      const result = await handler({});
      expect(result.version).toBe(1);
      expect(result.entries).toEqual([]);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('memory:loadGlobal returns parsed file', async () => {
      const fs = await import('fs');
      const data = { version: 1, updatedAt: 't', entries: [{ id: '1', key: 'k', tags: [], body: 'b', updatedAt: 't' }] };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(data));
      const handler = handleMap.get('memory:loadGlobal')!;
      const result = await handler({});
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].key).toBe('k');
    });

    it('memory:saveGlobal writes JSON', async () => {
      const fs = await import('fs');
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined as any);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      const handler = handleMap.get('memory:saveGlobal')!;
      const ok = await handler({}, { version: 1, entries: [] });
      expect(ok).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
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
      const handler = onMap.get('clipboard:readText')!;
      const event = {} as any;
      handler(event);
      expect(event.returnValue).toBe('copied text');
    });

    it('returns empty string when clipboard is empty', async () => {
      const { clipboard } = await import('electron');
      vi.mocked(clipboard.readText).mockReturnValue('');
      const handler = onMap.get('clipboard:readText')!;
      const event = {} as any;
      handler(event);
      expect(event.returnValue).toBe('');
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
      writeHandler({ sender }, 'test-uuid-w', 'echo hello');
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
      resizeHandler({ sender }, 'test-uuid-r', 100, 40);
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
      killHandler({ sender }, 'test-uuid-k');
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

    it('memory handlers are registered', () => {
      expect(handleMap.has('memory:loadGlobal')).toBe(true);
      expect(handleMap.has('memory:saveGlobal')).toBe(true);
      expect(handleMap.has('memory:loadWorkspace')).toBe(true);
      expect(handleMap.has('memory:saveWorkspace')).toBe(true);
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

  describe('zoom controls (Ctrl +/-/0)', () => {
    // Spin up a fresh window and grab its before-input-event handler + webContents.
    async function freshZoom() {
      const { BrowserWindow } = await import('electron');
      const fs = await import('fs');
      vi.mocked(fs.readFileSync).mockReturnValue(''); // readZoom → NaN → starts at 0
      (BrowserWindow as any).mockClear();
      await handleMap.get('window:new')!({});
      const wc = (BrowserWindow as any).mock.instances[0].webContents;
      const call = wc.on.mock.calls.find((c: any[]) => c[0] === 'before-input-event');
      return { wc, onInput: call[1] as (e: any, input: any) => void };
    }
    const keyDown = (key: string) => ({ type: 'keyDown', control: true, key });

    it('pins visual zoom and installs the key handler', async () => {
      const { wc } = await freshZoom();
      expect(wc.setVisualZoomLevelLimits).toHaveBeenCalledWith(1, 1);
      expect(wc.on.mock.calls.some((c: any[]) => c[0] === 'before-input-event')).toBe(true);
    });

    it('Ctrl+= and Ctrl++ zoom in one step', async () => {
      for (const key of ['=', '+']) {
        const { wc, onInput } = await freshZoom();
        const e = { preventDefault: vi.fn() };
        onInput(e, keyDown(key));
        expect(e.preventDefault).toHaveBeenCalled();
        expect(wc.setZoomLevel).toHaveBeenLastCalledWith(0.5);
      }
    });

    it('Ctrl+- zooms out one step', async () => {
      const { wc, onInput } = await freshZoom();
      onInput({ preventDefault: vi.fn() }, keyDown('-'));
      expect(wc.setZoomLevel).toHaveBeenLastCalledWith(-0.5);
    });

    it('Ctrl+0 resets to 0', async () => {
      const { wc, onInput } = await freshZoom();
      onInput({ preventDefault: vi.fn() }, keyDown('='));
      onInput({ preventDefault: vi.fn() }, keyDown('0'));
      expect(wc.setZoomLevel).toHaveBeenLastCalledWith(0);
    });

    it('clamps at the max (4) and min (-2)', async () => {
      const hi = await freshZoom();
      for (let i = 0; i < 12; i++) hi.onInput({ preventDefault: vi.fn() }, keyDown('='));
      expect(hi.wc.setZoomLevel).toHaveBeenLastCalledWith(4);
      const lo = await freshZoom();
      for (let i = 0; i < 12; i++) lo.onInput({ preventDefault: vi.fn() }, keyDown('-'));
      expect(lo.wc.setZoomLevel).toHaveBeenLastCalledWith(-2);
    });

    it('persists the level to zoom-level.txt', async () => {
      const fs = await import('fs');
      const { onInput } = await freshZoom();
      vi.mocked(fs.writeFileSync).mockClear();
      onInput({ preventDefault: vi.fn() }, keyDown('='));
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('zoom-level.txt'), '0.5');
    });

    it('ignores key-up and non-Ctrl presses', async () => {
      const { wc, onInput } = await freshZoom();
      const before = wc.setZoomLevel.mock.calls.length;
      onInput({ preventDefault: vi.fn() }, { type: 'keyUp', control: true, key: '=' });
      onInput({ preventDefault: vi.fn() }, { type: 'keyDown', control: false, key: '=' });
      expect(wc.setZoomLevel.mock.calls.length).toBe(before);
    });
  });

  describe('git handler registration', () => {
    const gitChannels = [
      'git:remotes', 'git:branches', 'git:checkout', 'git:log',
      'git:showTree', 'git:diff', 'git:currentBranch', 'git:stagedFiles',
      'git:unstagedFiles', 'git:stagedDiff', 'git:unstagedDiff',
      'git:commitBody', 'git:stage', 'git:unstage', 'git:commit',
      'git:push', 'git:checkAhead',
    ];

    it('all 17 git handlers are registered', () => {
      for (const ch of gitChannels) {
        expect(handleMap.has(ch)).toBe(true);
      }
      expect(gitChannels.length).toBe(17);
    });
  });

  describe('clipboard:writeText handler', () => {
    it('clipboard:writeText handler is registered', () => {
      expect(handleMap.has('clipboard:writeText')).toBe(true);
    });

    it('clipboard:writeText calls electron clipboard.writeText', async () => {
      const { clipboard } = await import('electron');
      const handler = handleMap.get('clipboard:writeText')!;
      await handler({}, 'hello');
      expect(clipboard.writeText).toHaveBeenCalledWith('hello');
    });
  });

  describe('permission request handler', () => {
    it('denies all permission requests by default', async () => {
      const { session } = await import('electron');
      expect(session.defaultSession.setPermissionRequestHandler).toHaveBeenCalled();
      const registeredHandler = vi.mocked(session.defaultSession.setPermissionRequestHandler).mock.calls[0][0]!;
      const callback = vi.fn();
      registeredHandler({} as any, 'camera' as any, callback, {} as any);
      expect(callback).toHaveBeenCalledWith(false);
    });
  });
});
