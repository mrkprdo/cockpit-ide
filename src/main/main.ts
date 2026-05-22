import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

process.noDeprecation = true;

function resolveCliWorkspace(): string | null {
  const userArgs = app.isPackaged ? process.argv.slice(1) : process.argv.slice(2);
  for (const arg of userArgs) {
    if (arg.startsWith('-')) continue;
    try {
      const resolved = path.resolve(arg);
      if (fs.statSync(resolved).isDirectory()) return resolved;
    } catch {}
  }
  return null;
}

let mainWindow: BrowserWindow | null = null;
const ptyProcesses = new Map<string, any>();
const terminalSenders = new Map<string, any>();
let workspacePath: string | null = null;

// ─── Path security ───
const ALLOWED_ENV_KEYS = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'SHELL', 'COMSPEC',
  'TEMP', 'TMP', 'HOMEDRIVE', 'HOMEPATH',
  'USERNAME', 'COMPUTERNAME', 'TERM', 'TERMINFO',
  'LC_ALL', 'LANG', 'LC_CTYPE',
  'PATHEXT', 'PROMPT', 'PS1',
  'APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'SystemRoot',
  'NODE_PATH', 'npm_config_user_agent',
]);

function isPathSafe(targetPath: string): boolean {
  if (!workspacePath) return true;
  const resolved = path.resolve(targetPath);
  const ws = path.resolve(workspacePath);
  if (!resolved.startsWith(ws + path.sep) && resolved !== ws) return false;
  try {
    const real = fs.realpathSync(resolved);
    if (!real.startsWith(ws + path.sep) && real !== ws) return false;
  } catch { }
  return true;
}

function filterEnv(): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of ALLOWED_ENV_KEYS) {
    if (process.env[key]) safe[key] = process.env[key]!;
  }
  return safe;
}

ipcMain.on('app:version', (e) => { e.returnValue = app.getVersion(); });

// File system IPC
ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
  if (!isPathSafe(dirPath)) return null;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
  } catch { return null; }
});

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  if (!isPathSafe(filePath)) return null;
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
});

ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  if (!isPathSafe(filePath)) return false;
  try { fs.writeFileSync(filePath, content, 'utf-8'); return true; } catch { return false; }
});

ipcMain.handle('fs:mkdir', async (_event, dirPath: string) => {
  if (!isPathSafe(dirPath)) return false;
  try { fs.mkdirSync(dirPath, { recursive: true }); return true; } catch { return false; }
});

ipcMain.handle('fs:delete', async (_event, targetPath: string) => {
  if (!isPathSafe(targetPath)) return false;
  let watcherStopped = false;
  try { fs.rmSync(targetPath, { recursive: true, force: true }); return true; } catch {}
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (watcher) { await stopWatching(); watcherStopped = true; }
      await new Promise(r => setTimeout(r, 500 + attempt * 300));
      fs.rmSync(targetPath, { recursive: true, force: true });
      return true;
    }
  } finally {
    if (watcherStopped && workspacePath) await startWatching(workspacePath);
  }
  return false;
});

ipcMain.handle('fs:copy', async (_event, src: string, dest: string) => {
  if (!isPathSafe(src) || !isPathSafe(dest)) return false;
  try { fs.cpSync(src, dest, { recursive: true }); return true; } catch { return false; }
});

ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
  if (!isPathSafe(oldPath) || !isPathSafe(newPath)) return false;
  try { fs.renameSync(oldPath, newPath); return true; } catch { return false; }
});

function cockpitDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// File watcher (using chokidar for reliable cross-platform watching)
let watcher: any = null;
let watchDebounce: ReturnType<typeof setTimeout> | null = null;
const pendingChanges = new Set<string>();

async function startWatching(dir: string): Promise<void> {
  await stopWatching();
  try {
    const chokidar = require('chokidar');
    watcher = chokidar.watch(dir, {
      ignored: /(^|[\/\\])(\.git|node_modules)([\/\\]|$)/,
      persistent: true,
      ignoreInitial: true,
      depth: 20,
    });

    const queueChange = (filePath: string) => {
      pendingChanges.add(filePath);
      if (watchDebounce) clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => {
        for (const p of pendingChanges) {
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send('file:changed', p);
          }
        }
        pendingChanges.clear();
      }, 100);
    };

    watcher.on('add', queueChange);
    watcher.on('change', queueChange);
    watcher.on('unlink', queueChange);
    watcher.on('addDir', () => {});
  } catch (e) {
    console.error('file:watch error', e);
  }
}

async function stopWatching(): Promise<void> {
  if (watcher) { await watcher.close(); watcher = null; }
  if (watchDebounce) { clearTimeout(watchDebounce); watchDebounce = null; }
  pendingChanges.clear();
}

if (process.platform === 'win32') app.setAppUserModelId('com.cockpit.ide');

let lastWsFile: string;
let recentWsFile: string;
function saveLastWorkspace(p: string): void {
  try { fs.writeFileSync(lastWsFile, p, 'utf-8'); } catch {}
}
function loadLastWorkspace(): string | null {
  try { return fs.readFileSync(lastWsFile, 'utf-8').trim() || null; } catch { return null; }
}

function getRecentWorkspaces(): string[] {
  try { return JSON.parse(fs.readFileSync(recentWsFile, 'utf-8')); } catch { return []; }
}
function addRecentWorkspace(p: string): void {
  const list = getRecentWorkspaces().filter(w => w !== p);
  list.unshift(p);
  if (list.length > 5) list.length = 5;
  try { fs.writeFileSync(recentWsFile, JSON.stringify(list, null, 2)); } catch {}
}

function createWindow(): void {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'cockpit_ide_icon.ico')
    : path.join(app.getAppPath(), 'public', 'cockpit_ide_icon.ico');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'Cockpit IDE',
    backgroundColor: '#161C24',
    frame: false,
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.maximize();
  mainWindow.show();

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.webContents.on('will-navigate', (event) => { event.preventDefault(); });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.setZoomLevel(0);
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.control && (input.key === '-' || input.key === '=' || input.key === '+' || input.key === '0')) {
      _e.preventDefault();
    }
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('close', () => {
    cleanupWindowTerminals(mainWindow!);
    mainWindow = null;
  });
}

function cleanupWindowTerminals(win: BrowserWindow): void {
  let winId: number | undefined;
  try { winId = win.webContents.id; } catch { /* window already destroyed */ }
  const ids = new Set<string>();
  for (const [uuid, sender] of terminalSenders) {
    if (sender && (sender.id === winId || sender.isDestroyed())) {
      ids.add(uuid);
    }
  }
  for (const uuid of ids) {
    const pty = ptyProcesses.get(uuid);
    if (pty) { pty.kill(); ptyProcesses.delete(uuid); }
    terminalSenders.delete(uuid);
  }
}

function createNewWindow(): void {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'cockpit_ide_icon.ico')
    : path.join(app.getAppPath(), 'public', 'cockpit_ide_icon.ico');
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'Cockpit IDE',
    backgroundColor: '#161C24',
    frame: false,
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.maximize();
  win.show();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.on('will-navigate', (event) => { event.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.setZoomLevel(0);
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.control && (input.key === '-' || input.key === '=' || input.key === '+' || input.key === '0')) {
      _e.preventDefault();
    }
  });
  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools();
  }
  win.on('close', () => cleanupWindowTerminals(win));
}

app.whenReady().then(async () => {
  // Initialize storage paths
  lastWsFile = path.join(app.getPath('userData'), 'last-workspace.txt');
  recentWsFile = path.join(app.getPath('userData'), 'recent-workspaces.json');

  // CLI workspace path takes precedence over saved state
  const cliPath = resolveCliWorkspace();
  if (cliPath) {
    cockpitDir(path.join(cliPath, '.cockpit'));
    workspacePath = cliPath;
    saveLastWorkspace(cliPath);
    addRecentWorkspace(cliPath);
    await startWatching(cliPath);
  }
  ipcMain.handle('window:new', () => { createNewWindow(); return true; });
  ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });
  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  });
  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });
  ipcMain.handle('window:isMaximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });
  ipcMain.handle('clipboard:readText', () => clipboard.readText());

  // Terminal PTY — multi-session
  ipcMain.handle('terminal:create', async (event, uuid: string, cwd?: string) => {
    let nodePty: any;
    try {
      const origErr = process.stderr.write.bind(process.stderr);
      process.stderr.write = () => true;
      nodePty = await import('node-pty');
      process.stderr.write = origErr;
    } catch { return false; }
    const plat = process.platform;
    let shell: string;
    if (plat === 'win32') {
      shell = process.env.COMSPEC || 'cmd.exe';
    } else if (plat === 'darwin') {
      shell = process.env.SHELL || '/bin/zsh';
    } else {
      shell = process.env.SHELL || '/bin/bash';
    }
    const home = process.env.USERPROFILE || process.env.HOME || '/tmp';
    let resolvedCwd = cwd || home;
    if (resolvedCwd) {
      try {
        if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
          resolvedCwd = home;
        }
      } catch { resolvedCwd = home; }
    }
    let pty: any;
    try {
      pty = nodePty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: resolvedCwd,
        env: filterEnv(),
      });
    } catch { return false; }

    const sender = event.sender;
    terminalSenders.set(uuid, sender);

    pty.onData((data: string) => {
      if (!sender.isDestroyed()) {
        sender.send('terminal:data', uuid, data);
      }
    });

    pty.onExit(() => {
      if (!sender.isDestroyed()) {
        sender.send('terminal:exit', uuid);
      }
      ptyProcesses.delete(uuid);
      terminalSenders.delete(uuid);
    });

    ptyProcesses.set(uuid, pty);
    return true;
  });

  ipcMain.on('terminal:write', (_event, uuid: string, data: string) => {
    ptyProcesses.get(uuid)?.write(data);
  });

  ipcMain.on('terminal:resize', (_event, uuid: string, cols: number, rows: number) => {
    ptyProcesses.get(uuid)?.resize(cols, rows);
  });

  ipcMain.on('terminal:kill', (_event, uuid: string) => {
    const pty = ptyProcesses.get(uuid);
    if (pty) { pty.kill(); ptyProcesses.delete(uuid); }
    terminalSenders.delete(uuid);
  });

  // Workspace
  // File watcher
  ipcMain.handle('file:watch', async (_event, dir: string) => {
    await startWatching(dir);
    return true;
  });

  ipcMain.handle('file:unwatch', async () => {
    await stopWatching();
    return true;
  });

  ipcMain.handle('workspace:select', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow!;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Open Workspace',
    });
    if (result.canceled || !result.filePaths.length) return null;
    const wsPath = result.filePaths[0];
    cockpitDir(path.join(wsPath, '.cockpit'));
    workspacePath = wsPath;
    saveLastWorkspace(wsPath);
    addRecentWorkspace(wsPath);
    await startWatching(wsPath);
    return wsPath;
  });

  ipcMain.handle('workspace:getPath', () => workspacePath);

  ipcMain.handle('workspace:load', (_event, wsPath?: string) => {
    const targetPath = wsPath || workspacePath;
    if (!targetPath) return null;
    if (wsPath && !isPathSafe(wsPath)) return null;
    const f = path.join(targetPath, '.cockpit', 'window.json');
    try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return null; }
  });

  ipcMain.handle('workspace:save', (_event, state: any, wsPath?: string) => {
    const targetPath = wsPath || workspacePath;
    if (!targetPath) { console.error('workspace:save — no workspacePath'); return false; }
    if (wsPath && !isPathSafe(wsPath)) return false;
    const dir = path.join(targetPath, '.cockpit');
    try {
      cockpitDir(dir);
      fs.writeFileSync(path.join(dir, 'window.json'), JSON.stringify(state, null, 2));
      return true;
    } catch (e) { console.error('workspace:save error', e); return false; }
  });

  ipcMain.handle('workspace:getRecent', () => getRecentWorkspaces());
  ipcMain.handle('workspace:addRecent', (_event, p: string) => { addRecentWorkspace(p); });

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return false;
      await shell.openExternal(url);
      return true;
    } catch { return false; }
  });

  // User preferences (saved to userData, not workspace-specific)
  const prefsFile = path.join(app.getPath('userData'), 'preferences.json');
  ipcMain.handle('prefs:load', () => {
    try { return JSON.parse(fs.readFileSync(prefsFile, 'utf-8')); } catch { return {}; }
  });
  ipcMain.handle('prefs:save', (_event, prefs: any) => {
    try { fs.writeFileSync(prefsFile, JSON.stringify(prefs, null, 2)); return true; } catch { return false; }
  });

  createWindow();

  app.on('window-all-closed', () => {
    stopWatching().then(() => {
      for (const pty of ptyProcesses.values()) pty.kill();
      ptyProcesses.clear();
      if (process.platform !== 'darwin') app.quit();
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ─── Test helpers ───
export function _testSetWorkspacePath(p: string | null): void { workspacePath = p; }
export function _testIsPathSafe(p: string): boolean { return isPathSafe(p); }
