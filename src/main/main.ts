import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

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

function cockpitDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// File watcher
let watcher: fs.FSWatcher | null = null;
let watchDebounce: ReturnType<typeof setTimeout> | null = null;
const watchedFiles = new Set<string>();

function startWatching(dir: string): void {
  stopWatching();
  try {
    watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const fullPath = path.resolve(dir, filename);
      // Ignore .git, node_modules, and the .cockpit folder
      const parts = filename.split(/[\\/]/);
      if (parts.some(p => p === '.git' || p === 'node_modules' || p === '.cockpit')) return;
      // Only care about file changes (not directories)
      try {
        if (fs.statSync(fullPath).isDirectory()) return;
      } catch { return; }

      if (watchDebounce) clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => {
        mainWindow?.webContents.send('file:changed', fullPath);
      }, 100);
    });
  } catch (e) {
    console.error('file:watch error', e);
  }
}

function stopWatching(): void {
  if (watcher) { watcher.close(); watcher = null; }
  if (watchDebounce) { clearTimeout(watchDebounce); watchDebounce = null; }
  watchedFiles.clear();
}

if (process.platform === 'win32') app.setAppUserModelId('com.cockpit.ide');

function createWindow(): void {
  const iconPath = path.join(app.getAppPath(), 'public', 'cockpit_ide_icon.ico');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'Cockpit IDE',
    backgroundColor: '#0A0E14',
    frame: false,
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.maximize();
  mainWindow.show();

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
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
    startWatching(wsPath);
    return wsPath;
  });

  ipcMain.handle('workspace:getPath', () => workspacePath);

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
