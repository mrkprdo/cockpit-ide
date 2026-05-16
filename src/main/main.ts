import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let ptyProcess: any = null;

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
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

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

  // Terminal PTY
  ipcMain.handle('terminal:create', async () => {
    let nodePty: any;
    try {
      // Suppress node-pty's noisy console attach errors
      const origErr = process.stderr.write.bind(process.stderr);
      process.stderr.write = () => true;
      nodePty = await import('node-pty');
      process.stderr.write = origErr;
    } catch { return false; }
    const shell = process.env.COMSPEC || 'cmd.exe';
    ptyProcess = nodePty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || process.env.USERPROFILE,
      env: process.env as { [key: string]: string },
    });

    ptyProcess.onData((data: string) => {
      mainWindow?.webContents.send('terminal:data', data);
    });

    return true;
  });

  ipcMain.on('terminal:write', (_event, data: string) => {
    ptyProcess?.write(data);
  });

  ipcMain.on('terminal:resize', (_event, cols: number, rows: number) => {
    ptyProcess?.resize(cols, rows);
  });

  ipcMain.on('terminal:kill', () => {
    if (ptyProcess) { ptyProcess.kill(); ptyProcess = null; }
  });

  createWindow();

  app.on('window-all-closed', () => {
    if (ptyProcess) { ptyProcess.kill(); ptyProcess = null; }
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
