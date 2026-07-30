/**
 * @vitest-environment node
 *
 * Tests for preload bridge — verifies API shape and correct IPC wiring.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ─── Capture IPC calls ───
const { handleCalls, onCalls, sendCalls, invokeCalls, sendSyncCalls } = vi.hoisted(() => {
  const handleCalls: [string, ...any[]][] = [];
  const onCalls: [string, ...any[]][] = [];
  const sendCalls: [string, ...any[]][] = [];
  const invokeCalls: [string, ...any[]][] = [];
  const sendSyncCalls: [string, ...any[]][] = [];
  return { handleCalls, onCalls, sendCalls, invokeCalls, sendSyncCalls };
});

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((_key: string, api: any) => {
      (globalThis as any).__exposedAPI = api;
    }),
  },
  ipcRenderer: {
    sendSync: vi.fn((channel: string, ...args: any[]) => {
      sendSyncCalls.push([channel, ...args]);
      if (channel === 'app:version') return '0.0.0';
      return null;
    }),
    invoke: vi.fn((channel: string, ...args: any[]) => {
      invokeCalls.push([channel, ...args]);
      return Promise.resolve(null);
    }),
    on: vi.fn((channel: string, handler: (...args: any[]) => void) => {
      onCalls.push([channel, handler]);
      return () => {};
    }),
    send: vi.fn((channel: string, ...args: any[]) => {
      sendCalls.push([channel, ...args]);
    }),
    removeListener: vi.fn(),
  },
}));

// Mock process for platform detection
vi.stubGlobal('process', {
  platform: 'win32',
  versions: {
    node: '20.0.0',
    chrome: '120.0.0',
    electron: '42.0.0',
  },
  env: {},
});

let api: any;

beforeAll(async () => {
  await import('../preload/preload');
  api = (globalThis as any).__exposedAPI;
});

describe('preload.ts — exposed API shape', () => {
  it('exposes platform string', () => {
    expect(api.platform).toBe('win32');
  });

  it('exposes version info', () => {
    expect(api.versions).toEqual({
      node: '20.0.0',
      chrome: '120.0.0',
      electron: '42.0.0',
      app: '0.0.0', // from sendSync('app:version') mock
    });
  });

  it('exposes window namespace', () => {
    expect(api.window).toBeDefined();
    expect(typeof api.window.newWindow).toBe('function');
    expect(typeof api.window.minimize).toBe('function');
    expect(typeof api.window.maximize).toBe('function');
    expect(typeof api.window.close).toBe('function');
    expect(typeof api.window.isMaximized).toBe('function');
  });

  it('exposes clipboard namespace', () => {
    expect(api.clipboard).toBeDefined();
    expect(typeof api.clipboard.readText).toBe('function');
  });

  it('exposes terminal namespace', () => {
    expect(api.terminal).toBeDefined();
    expect(typeof api.terminal.create).toBe('function');
    expect(typeof api.terminal.write).toBe('function');
    expect(typeof api.terminal.resize).toBe('function');
    expect(typeof api.terminal.kill).toBe('function');
    expect(typeof api.terminal.onData).toBe('function');
    expect(typeof api.terminal.onExit).toBe('function');
  });

  it('exposes workspace namespace', () => {
    expect(api.workspace).toBeDefined();
    expect(typeof api.workspace.select).toBe('function');
    expect(typeof api.workspace.getPath).toBe('function');
    expect(typeof api.workspace.load).toBe('function');
    expect(typeof api.workspace.save).toBe('function');
    expect(typeof api.workspace.getRecent).toBe('function');
    expect(typeof api.workspace.addRecent).toBe('function');
    expect(typeof api.workspace.removeRecent).toBe('function');
  });

  it('exposes shell namespace', () => {
    expect(api.shell).toBeDefined();
    expect(typeof api.shell.openExternal).toBe('function');
  });

  it('exposes prefs namespace', () => {
    expect(api.prefs).toBeDefined();
    expect(typeof api.prefs.load).toBe('function');
    expect(typeof api.prefs.save).toBe('function');
  });

  it('exposes fs namespace', () => {
    expect(api.fs).toBeDefined();
    expect(typeof api.fs.readDir).toBe('function');
    expect(typeof api.fs.readFile).toBe('function');
    expect(typeof api.fs.writeFile).toBe('function');
    expect(typeof api.fs.mkdir).toBe('function');
    expect(typeof api.fs.delete).toBe('function');
    expect(typeof api.fs.copy).toBe('function');
    expect(typeof api.fs.rename).toBe('function');
    expect(typeof api.fs.watch).toBe('function');
    expect(typeof api.fs.unwatch).toBe('function');
    expect(typeof api.fs.onChanged).toBe('function');
  });

  it('exposes git namespace with all 17 methods', () => {
    expect(api.git).toBeDefined();
    expect(typeof api.git.remotes).toBe('function');
    expect(typeof api.git.branches).toBe('function');
    expect(typeof api.git.checkout).toBe('function');
    expect(typeof api.git.log).toBe('function');
    expect(typeof api.git.showTree).toBe('function');
    expect(typeof api.git.diff).toBe('function');
    expect(typeof api.git.currentBranch).toBe('function');
    expect(typeof api.git.stagedFiles).toBe('function');
    expect(typeof api.git.unstagedFiles).toBe('function');
    expect(typeof api.git.stagedDiff).toBe('function');
    expect(typeof api.git.unstagedDiff).toBe('function');
    expect(typeof api.git.commitBody).toBe('function');
    expect(typeof api.git.stage).toBe('function');
    expect(typeof api.git.unstage).toBe('function');
    expect(typeof api.git.commit).toBe('function');
    expect(typeof api.git.push).toBe('function');
    expect(typeof api.git.checkAhead).toBe('function');
  });
});

describe('preload.ts — IPC wiring (invoke-based)', () => {
  it('window.newWindow invokes window:new', () => {
    invokeCalls.length = 0;
    api.window.newWindow();
    expect(invokeCalls.some(c => c[0] === 'window:new')).toBe(true);
  });

  it('window.minimize sends correct IPC', () => {
    invokeCalls.length = 0;
    sendCalls.length = 0;
    api.window.minimize();
    expect(sendCalls.some(c => c[0] === 'window:minimize')).toBe(true);
  });

  it('window.maximize sends correct IPC', () => {
    sendCalls.length = 0;
    api.window.maximize();
    expect(sendCalls.some(c => c[0] === 'window:maximize')).toBe(true);
  });

  it('fs.readDir invokes fs:readDir', () => {
    invokeCalls.length = 0;
    api.fs.readDir('/test');
    expect(invokeCalls.some(c => c[0] === 'fs:readDir' && c[1] === '/test')).toBe(true);
  });

  it('fs.readFile invokes fs:readFile', () => {
    invokeCalls.length = 0;
    api.fs.readFile('/test/file.txt');
    expect(invokeCalls.some(c => c[0] === 'fs:readFile' && c[1] === '/test/file.txt')).toBe(true);
  });

  it('fs.writeFile invokes fs:writeFile with content', () => {
    invokeCalls.length = 0;
    api.fs.writeFile('/test/file.txt', 'hello');
    expect(invokeCalls.some(c =>
      c[0] === 'fs:writeFile' && c[1] === '/test/file.txt' && c[2] === 'hello'
    )).toBe(true);
  });

  it('fs.delete invokes fs:delete', () => {
    invokeCalls.length = 0;
    api.fs.delete('/test/dir');
    expect(invokeCalls.some(c => c[0] === 'fs:delete' && c[1] === '/test/dir')).toBe(true);
  });

  it('fs.copy invokes fs:copy', () => {
    invokeCalls.length = 0;
    api.fs.copy('/src', '/dest');
    expect(invokeCalls.some(c => c[0] === 'fs:copy' && c[1] === '/src' && c[2] === '/dest')).toBe(true);
  });

  it('fs.rename invokes fs:rename', () => {
    invokeCalls.length = 0;
    api.fs.rename('/old', '/new');
    expect(invokeCalls.some(c => c[0] === 'fs:rename' && c[1] === '/old' && c[2] === '/new')).toBe(true);
  });

  it('shell.openExternal invokes shell:openExternal', () => {
    invokeCalls.length = 0;
    api.shell.openExternal('https://example.com');
    expect(invokeCalls.some(c => c[0] === 'shell:openExternal' && c[1] === 'https://example.com')).toBe(true);
  });

  it('prefs.load invokes prefs:load', () => {
    invokeCalls.length = 0;
    api.prefs.load();
    expect(invokeCalls.some(c => c[0] === 'prefs:load')).toBe(true);
  });

  it('prefs.save invokes prefs:save with data', () => {
    invokeCalls.length = 0;
    api.prefs.save({ theme: 'dark' });
    expect(invokeCalls.some(c => c[0] === 'prefs:save' && c[1].theme === 'dark')).toBe(true);
  });

  it('memory.loadGlobal invokes memory:loadGlobal', () => {
    invokeCalls.length = 0;
    api.memory.loadGlobal();
    expect(invokeCalls.some(c => c[0] === 'memory:loadGlobal')).toBe(true);
  });

  it('memory.saveGlobal invokes memory:saveGlobal', () => {
    invokeCalls.length = 0;
    api.memory.saveGlobal({ version: 1, entries: [] });
    expect(invokeCalls.some(c => c[0] === 'memory:saveGlobal')).toBe(true);
  });

  it('memory.loadWorkspace invokes memory:loadWorkspace with path', () => {
    invokeCalls.length = 0;
    api.memory.loadWorkspace('/ws');
    expect(invokeCalls.some(c => c[0] === 'memory:loadWorkspace' && c[1] === '/ws')).toBe(true);
  });

  it('memory.saveWorkspace invokes memory:saveWorkspace with path and data', () => {
    invokeCalls.length = 0;
    api.memory.saveWorkspace('/ws', { version: 1, entries: [] });
    expect(invokeCalls.some(c => c[0] === 'memory:saveWorkspace' && c[1] === '/ws')).toBe(true);
  });

  it('workspace.select invokes workspace:select', () => {
    invokeCalls.length = 0;
    api.workspace.select();
    expect(invokeCalls.some(c => c[0] === 'workspace:select')).toBe(true);
  });

  it('workspace.save invokes workspace:save with state', () => {
    invokeCalls.length = 0;
    api.workspace.save({ plugins: [] });
    expect(invokeCalls.some(c => c[0] === 'workspace:save' && c[1].plugins)).toBe(true);
  });

  it('workspace.load passes path argument to workspace:load', () => {
    invokeCalls.length = 0;
    api.workspace.load('/my/workspace');
    expect(invokeCalls.some(c => c[0] === 'workspace:load' && c[1] === '/my/workspace')).toBe(true);
  });

  it('workspace.load works without path argument', () => {
    invokeCalls.length = 0;
    api.workspace.load();
    const call = invokeCalls.find(c => c[0] === 'workspace:load');
    expect(call).toBeTruthy();
    expect(call![1]).toBeUndefined();
  });

  it('window.close sends window:close', () => {
    sendCalls.length = 0;
    api.window.close();
    expect(sendCalls.some(c => c[0] === 'window:close')).toBe(true);
  });

  it('window.isMaximized invokes window:isMaximized', () => {
    invokeCalls.length = 0;
    api.window.isMaximized();
    expect(invokeCalls.some(c => c[0] === 'window:isMaximized')).toBe(true);
  });

  it('clipboard.readText invokes clipboard:readText', () => {
    sendSyncCalls.length = 0;
    api.clipboard.readText();
    expect(sendSyncCalls.some(c => c[0] === 'clipboard:readText')).toBe(true);
  });

  it('terminal.create invokes terminal:create with uuid', () => {
    invokeCalls.length = 0;
    api.terminal.create('term-1');
    expect(invokeCalls.some(c => c[0] === 'terminal:create' && c[1] === 'term-1')).toBe(true);
  });

  it('terminal.create passes optional cwd', () => {
    invokeCalls.length = 0;
    api.terminal.create('term-2', '/workspace');
    expect(invokeCalls.some(c => c[0] === 'terminal:create' && c[1] === 'term-2' && c[2] === '/workspace')).toBe(true);
  });

  it('terminal.write sends terminal:write with uuid and data', () => {
    sendCalls.length = 0;
    api.terminal.write('term-1', 'echo hi');
    expect(sendCalls.some(c => c[0] === 'terminal:write' && c[1] === 'term-1' && c[2] === 'echo hi')).toBe(true);
  });

  it('terminal.resize sends terminal:resize with cols and rows', () => {
    sendCalls.length = 0;
    api.terminal.resize('term-1', 120, 40);
    expect(sendCalls.some(c => c[0] === 'terminal:resize' && c[1] === 'term-1' && c[2] === 120 && c[3] === 40)).toBe(true);
  });

  it('terminal.kill sends terminal:kill with uuid', () => {
    sendCalls.length = 0;
    api.terminal.kill('term-1');
    expect(sendCalls.some(c => c[0] === 'terminal:kill' && c[1] === 'term-1')).toBe(true);
  });

  it('workspace.getPath invokes workspace:getPath', () => {
    invokeCalls.length = 0;
    api.workspace.getPath();
    expect(invokeCalls.some(c => c[0] === 'workspace:getPath')).toBe(true);
  });

  it('workspace.addRecent invokes workspace:addRecent', () => {
    invokeCalls.length = 0;
    api.workspace.addRecent('/ws');
    expect(invokeCalls.some(c => c[0] === 'workspace:addRecent' && c[1] === '/ws')).toBe(true);
  });

  it('workspace.removeRecent invokes workspace:removeRecent', () => {
    invokeCalls.length = 0;
    api.workspace.removeRecent('/ws');
    expect(invokeCalls.some(c => c[0] === 'workspace:removeRecent' && c[1] === '/ws')).toBe(true);
  });

  it('fs.mkdir invokes fs:mkdir', () => {
    invokeCalls.length = 0;
    api.fs.mkdir('/new/dir');
    expect(invokeCalls.some(c => c[0] === 'fs:mkdir' && c[1] === '/new/dir')).toBe(true);
  });

  it('fs.watch invokes file:watch', () => {
    invokeCalls.length = 0;
    api.fs.watch('/workspace');
    expect(invokeCalls.some(c => c[0] === 'file:watch' && c[1] === '/workspace')).toBe(true);
  });

  it('fs.unwatch invokes file:unwatch', () => {
    invokeCalls.length = 0;
    api.fs.unwatch();
    expect(invokeCalls.some(c => c[0] === 'file:unwatch')).toBe(true);
  });

  it('git.remotes invokes git:remotes with repoPath', () => {
    invokeCalls.length = 0;
    api.git.remotes('/repo');
    expect(invokeCalls.some(c => c[0] === 'git:remotes' && c[1] === '/repo')).toBe(true);
  });

  it('git.branches invokes git:branches', () => {
    invokeCalls.length = 0;
    api.git.branches('/repo');
    expect(invokeCalls.some(c => c[0] === 'git:branches' && c[1] === '/repo')).toBe(true);
  });

  it('git.checkout invokes git:checkout with repoPath and branch', () => {
    invokeCalls.length = 0;
    api.git.checkout('/repo', 'main');
    expect(invokeCalls.some(c => c[0] === 'git:checkout' && c[1] === '/repo' && c[2] === 'main')).toBe(true);
  });

  it('git.log invokes git:log with repoPath and optional maxCount', () => {
    invokeCalls.length = 0;
    api.git.log('/repo', 30);
    expect(invokeCalls.some(c => c[0] === 'git:log' && c[1] === '/repo' && c[2] === 30)).toBe(true);
  });

  it('git.stage invokes git:stage', () => {
    invokeCalls.length = 0;
    api.git.stage('/repo', 'file.ts');
    expect(invokeCalls.some(c => c[0] === 'git:stage' && c[1] === '/repo' && c[2] === 'file.ts')).toBe(true);
  });

  it('git.unstage invokes git:unstage', () => {
    invokeCalls.length = 0;
    api.git.unstage('/repo', 'file.ts');
    expect(invokeCalls.some(c => c[0] === 'git:unstage' && c[1] === '/repo' && c[2] === 'file.ts')).toBe(true);
  });

  it('git.commit invokes git:commit', () => {
    invokeCalls.length = 0;
    api.git.commit('/repo', 'msg');
    expect(invokeCalls.some(c => c[0] === 'git:commit' && c[1] === '/repo' && c[2] === 'msg')).toBe(true);
  });

  it('git.push invokes git:push', () => {
    invokeCalls.length = 0;
    api.git.push('/repo');
    expect(invokeCalls.some(c => c[0] === 'git:push' && c[1] === '/repo')).toBe(true);
  });

  it('git.checkAhead invokes git:checkAhead', () => {
    invokeCalls.length = 0;
    api.git.checkAhead('/repo');
    expect(invokeCalls.some(c => c[0] === 'git:checkAhead' && c[1] === '/repo')).toBe(true);
  });
});

describe('preload.ts — onChanged wiring', () => {
  it('onChanged registers ipcRenderer.on for file:changed', () => {
    onCalls.length = 0;
    const callback = vi.fn();
    api.fs.onChanged(callback);

    const fileChangedReg = onCalls.find(c => c[0] === 'file:changed');
    expect(fileChangedReg).toBeTruthy();

    // Simulate file change event
    const ipcHandler = fileChangedReg![1] as (event: any, filePath: string) => void;
    ipcHandler({}, '/test/file.txt');
    expect(callback).toHaveBeenCalledWith('/test/file.txt');
  });

  it('onChanged returns an unsubscribe function', () => {
    const unsub = api.fs.onChanged(vi.fn());
    expect(typeof unsub).toBe('function');
  });
});

describe('preload.ts — terminal onData/onExit wiring', () => {
  it('onData registers ipcRenderer.on for terminal:data', () => {
    onCalls.length = 0;
    const callback = vi.fn();
    api.terminal.onData(callback);

    const reg = onCalls.find(c => c[0] === 'terminal:data');
    expect(reg).toBeTruthy();

    const ipcHandler = reg![1] as (event: any, uuid: string, data: string) => void;
    ipcHandler({}, 'term-123', 'hello');
    expect(callback).toHaveBeenCalledWith('term-123', 'hello');
  });

  it('onExit registers ipcRenderer.on for terminal:exit', () => {
    onCalls.length = 0;
    const callback = vi.fn();
    api.terminal.onExit(callback);

    const reg = onCalls.find(c => c[0] === 'terminal:exit');
    expect(reg).toBeTruthy();

    const ipcHandler = reg![1] as (event: any, uuid: string) => void;
    ipcHandler({}, 'term-123');
    expect(callback).toHaveBeenCalledWith('term-123');
  });
});
