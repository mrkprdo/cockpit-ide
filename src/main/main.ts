import { app, BrowserWindow, ipcMain, session } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { ideServer } from './ide-server';
import { logFatal, logMain } from './ipc/logging';
import { state } from './ipc/state';
import * as security from './ipc/security';
import * as store from './ipc/workspace-store';
import { startWatching, stopWatching, registerFileHandlers } from './ipc/file';
import { registerAppHandlers } from './ipc/app';
import { registerClipboardHandlers } from './ipc/clipboard';
import { registerDiagnosticsHandlers } from './ipc/diagnostics';
import { registerFsHandlers } from './ipc/fs';
import { registerGitHandlers } from './ipc/git';
import { registerIdeHandlers } from './ipc/ide';
import { registerMemoryHandlers } from './ipc/memory';
import { registerPrefsHandlers } from './ipc/prefs';
import { registerShellHandlers } from './ipc/shell';
import { registerTerminalHandlers } from './ipc/terminal';
import { registerWindowHandlers } from './ipc/window';
import { registerWorkspaceHandlers } from './ipc/workspace';

process.noDeprecation = true;

process.on('uncaughtException', (err) => logFatal('uncaughtException', err));
process.on('unhandledRejection', (err) => logFatal('unhandledRejection', err));

// A renderer crash (OOM, GPU fault, etc.) otherwise leaves a permanently
// blank/frozen window with no log and no recovery. Log it and reload so the
// user gets their workspace back (state is already persisted via
// workspace:save) instead of a dead window.
function wireCrashRecovery(win: BrowserWindow): void {
  win.webContents.on('render-process-gone', (_event, details) => {
    logMain('error', 'main', 'renderer process gone', `reason=${details.reason} exitCode=${details.exitCode}`);
    logFatal('render-process-gone', new Error(`reason=${details.reason} exitCode=${details.exitCode}`));
    if (!win.isDestroyed()) win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  });
}

// Ctrl +/-/0 zoom the whole renderer uniformly (chrome, editors, terminals, file tree).
// Handled here because before-input-event preventDefault stops the keydown from ever
// reaching the page, so renderer-side key handling for these is impossible.
function installZoomControls(wc: Electron.WebContents): void {
  let level = store.readZoom();
  wc.setVisualZoomLevelLimits(1, 1);
  const apply = (): void => { wc.setZoomLevel(level); store.writeZoom(level); };
  // Zoom level resets on each load; reapply once the page is ready.
  wc.on('did-finish-load', () => wc.setZoomLevel(level));
  apply();
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !input.control) return;
    const k = input.key;
    if (k === '=' || k === '+') { e.preventDefault(); level = Math.min(store.ZOOM_MAX, level + store.ZOOM_STEP); apply(); }
    else if (k === '-' || k === '_') { e.preventDefault(); level = Math.max(store.ZOOM_MIN, level - store.ZOOM_STEP); apply(); }
    else if (k === '0') { e.preventDefault(); level = 0; apply(); }
  });
}

function createWindow(): void {
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
      devTools: !app.isPackaged,
    },
  });

  state.mainWindow = win;
  win.maximize();
  win.show();
  logMain('info', 'main', 'window created', win.id);

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.webContents.on('will-navigate', (event) => { event.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  installZoomControls(win.webContents);
  wireCrashRecovery(win);

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools();
  }

  win.on('close', () => {
    cleanupWindowTerminals(win);
    if (state.mainWindow === win) state.mainWindow = null;
  });
}

function cleanupWindowTerminals(win: BrowserWindow): void {
  let winId: number | undefined;
  try { winId = win.webContents.id; } catch { /* window already destroyed */ }
  const ids = new Set<string>();
  for (const [uuid, sender] of state.terminalSenders) {
    if (sender && (sender.id === winId || sender.isDestroyed())) {
      ids.add(uuid);
    }
  }
  for (const uuid of ids) {
    const pty = state.ptyProcesses.get(uuid);
    if (pty) { pty.kill(); state.ptyProcesses.delete(uuid); }
    state.terminalSenders.delete(uuid);
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
      devTools: !app.isPackaged,
    },
  });
  win.maximize();
  win.show();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.on('will-navigate', (event) => { event.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  installZoomControls(win.webContents);
  wireCrashRecovery(win);
  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools();
  }
  win.on('close', () => cleanupWindowTerminals(win));
}

app.whenReady().then(async () => {
  logMain('info', 'main', 'app ready', `packaged=${app.isPackaged}`);
  // No remote content is ever loaded, so there's never a legitimate reason to
  // grant a permission request (camera, notifications, etc.) — deny by default
  // instead of relying on Electron's own default.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  // Initialize userData-backed stores (recent/last workspace, zoom)
  store.initWorkspaceStore();

  // Paths already persisted from a prior session were reached through the OS
  // folder picker at some point — trust them for the pre-workspace fs checks
  // (e.g. WelcomeModal checking whether a recent workspace still exists).
  for (const p of store.getRecentWorkspaces()) security.trustWorkspacePath(p);

  // CLI workspace path takes precedence over saved state
  const cliPath = security.resolveCliWorkspace();
  if (cliPath) {
    logMain('info', 'main', 'CLI workspace', cliPath);
    security.cockpitDir(path.join(cliPath, '.cockpit'));
    state.defaultWorkspacePath = cliPath;
    security.trustWorkspacePath(cliPath);
    store.saveLastWorkspace(cliPath);
    store.addRecentWorkspace(cliPath);
    await startWatching(cliPath);
  }
  // Start IDE server if a workspace is already known
  if (cliPath) {
    try { await ideServer.start(cliPath); } catch (e) { console.error('ide: start failed', e); }
  }

  const ctx = {
    security,
    state,
    startWatching,
    stopWatching,
    onNewWindow: createNewWindow,
  };
  registerAppHandlers(ipcMain, ctx);
  registerClipboardHandlers(ipcMain, ctx);
  registerDiagnosticsHandlers(ipcMain, ctx);
  registerFileHandlers(ipcMain, ctx);
  registerFsHandlers(ipcMain, ctx);
  registerGitHandlers(ipcMain, ctx);
  registerIdeHandlers(ipcMain, ctx);
  registerMemoryHandlers(ipcMain, ctx);
  registerPrefsHandlers(ipcMain, ctx);
  registerShellHandlers(ipcMain, ctx);
  registerTerminalHandlers(ipcMain, ctx);
  registerWindowHandlers(ipcMain, ctx);
  registerWorkspaceHandlers(ipcMain, ctx);

  createWindow();

  // Associate CLI path with the main window's per-window workspace
  if (cliPath && state.mainWindow) {
    state.windowWorkspaces.set(state.mainWindow.id, cliPath);
  }

  // Hot reload: dev.js writes this sentinel after renderer-only rebuilds
  if (process.argv.includes('--dev')) {
    const distDir = path.join(app.getAppPath(), 'dist');
    const sentinelName = '.dev-reload';
    let lastReloadTime = 0;
    try {
      fs.watch(distDir, (_, filename) => {
        if (filename !== sentinelName) return;
        const now = Date.now();
        if (now - lastReloadTime < 500) return;
        lastReloadTime = now;
        setTimeout(() => {
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) win.webContents.reload();
          }
        }, 100);
      });
    } catch {}
  }

  app.on('window-all-closed', () => {
    ideServer.stop();
    stopWatching().then(() => {
      for (const pty of state.ptyProcesses.values()) pty.kill();
      state.ptyProcesses.clear();
      if (process.platform !== 'darwin') app.quit();
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ─── Test helpers (delegate to the split modules) ───
export function _testSetWorkspacePath(p: string | null): void { state.defaultWorkspacePath = p; }
export function _testIsPathSafe(p: string): boolean { return security.isPathSafe(p); }
export function _testTrustPath(p: string): void { security.trustWorkspacePath(p); }
