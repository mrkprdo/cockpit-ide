import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// Enable hot reload in dev mode — watches dist/ for changes
if (process.argv.includes('--dev')) {
  try {
    require('electron-reload')(__dirname, {
      electron: require('electron'),
      hardResetMethod: 'exit',
    });
  } catch {}
}

let mainWindow: BrowserWindow | null = null;
const ptyProcesses = new Map<string, any>();
let workspacePath: string | null = null;

// File system IPC
ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
  } catch { return null; }
});

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
});

ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  try { fs.writeFileSync(filePath, content, 'utf-8'); return true; } catch { return false; }
});

ipcMain.handle('fs:delete', async (_event, targetPath: string) => {
  try { fs.rmSync(targetPath, { recursive: true, force: true }); return true; } catch { return false; }
});

ipcMain.handle('fs:copy', async (_event, src: string, dest: string) => {
  try { fs.cpSync(src, dest, { recursive: true }); return true; } catch { return false; }
});

ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
  try { fs.renameSync(oldPath, newPath); return true; } catch { return false; }
});

function cockpitDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// File watcher (using chokidar for reliable cross-platform watching)
let watcher: any = null;
let watchDebounce: ReturnType<typeof setTimeout> | null = null;
const pendingChanges = new Set<string>();

function startWatching(dir: string): void {
  stopWatching();
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
          mainWindow?.webContents.send('file:changed', p);
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

function stopWatching(): void {
  if (watcher) { watcher.close(); watcher = null; }
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
  const iconPath = path.join(app.getAppPath(), 'public', 'cockpit_ide_icon.ico');
  let winIcon: string = iconPath;
  try {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) winIcon = img as any;
  } catch {}

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'Cockpit IDE',
    backgroundColor: '#0A0E14',
    frame: false,
    icon: winIcon,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.maximize();
  mainWindow.show();

  // Force icon after show (Windows taskbar sometimes ignores constructor icon)
  try {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) mainWindow.setIcon(img);
  } catch {}

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Initialize storage paths and restore last workspace
  lastWsFile = path.join(app.getPath('userData'), 'last-workspace.txt');
  recentWsFile = path.join(app.getPath('userData'), 'recent-workspaces.json');
  try {
    const saved = loadLastWorkspace();
    if (saved) {
      workspacePath = saved;
      startWatching(saved);
    }
  } catch {} // noop if userData not available
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized());

  // Terminal PTY — multi-session
  ipcMain.handle('terminal:create', async (_event, uuid: string, cwd?: string) => {
    let nodePty: any;
    try {
      const origErr = process.stderr.write.bind(process.stderr);
      process.stderr.write = () => true;
      nodePty = await import('node-pty');
      process.stderr.write = origErr;
    } catch { return false; }
    const shell = process.env.COMSPEC || 'cmd.exe';
    const pty = nodePty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: cwd || process.env.USERPROFILE || process.env.HOME,
      env: process.env as { [key: string]: string },
    });

    pty.onData((data: string) => {
      mainWindow?.webContents.send('terminal:data', uuid, data);
    });

    pty.onExit(() => {
      mainWindow?.webContents.send('terminal:exit', uuid);
      ptyProcesses.delete(uuid);
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
  });

  // Workspace
  // File watcher
  ipcMain.handle('file:watch', async (_event, dir: string) => {
    startWatching(dir);
    return true;
  });

  ipcMain.handle('file:unwatch', async () => {
    stopWatching();
    return true;
  });

  ipcMain.handle('workspace:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Open Workspace',
    });
    if (result.canceled || !result.filePaths.length) return null;
    const wsPath = result.filePaths[0];
    cockpitDir(path.join(wsPath, '.cockpit'));
    workspacePath = wsPath;
    saveLastWorkspace(wsPath);
    addRecentWorkspace(wsPath);
    startWatching(wsPath);
    return wsPath;
  });

  ipcMain.handle('workspace:getPath', () => workspacePath || loadLastWorkspace());

  ipcMain.handle('workspace:load', () => {
    if (!workspacePath) return null;
    const f = path.join(workspacePath, '.cockpit', 'window.json');
    try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return null; }
  });

  ipcMain.handle('workspace:save', (_event, state: any) => {
    if (!workspacePath) { console.error('workspace:save — no workspacePath'); return false; }
    const dir = path.join(workspacePath, '.cockpit');
    try {
      cockpitDir(dir);
      fs.writeFileSync(path.join(dir, 'window.json'), JSON.stringify(state, null, 2));
      return true;
    } catch (e) { console.error('workspace:save error', e); return false; }
  });

  ipcMain.handle('workspace:getRecent', () => getRecentWorkspaces());
  ipcMain.handle('workspace:addRecent', (_event, p: string) => { addRecentWorkspace(p); });

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    try { await shell.openExternal(url); return true; } catch { return false; }
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
    stopWatching();
    for (const pty of ptyProcesses.values()) pty.kill();
    ptyProcesses.clear();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
