import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, safeStorage, session } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { ideServer } from './ide-server';
import { runShellCommand } from './shell';

process.noDeprecation = true;

// Crash log lives in userData so a main-process fault leaves a trace even
// though the app has no visible console once packaged.
function logFatal(kind: string, err: unknown): void {
  console.error(kind, err);
  try {
    const line = `${new Date().toISOString()} [${kind}] ${err instanceof Error ? (err.stack || err.message) : String(err)}\n`;
    fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), line);
  } catch { /* best effort */ }
}
process.on('uncaughtException', (err) => logFatal('uncaughtException', err));
process.on('unhandledRejection', (err) => logFatal('unhandledRejection', err));

// Fatal JS errors in the renderer (window.onerror / unhandledrejection) have
// no console once packaged — forward them here so they land in crash.log too.
ipcMain.on('diagnostics:rendererError', (_event, kind: string, message: string) => {
  logFatal(`renderer:${kind}`, message);
});

// A renderer crash (OOM, GPU fault, etc.) otherwise leaves a permanently
// blank/frozen window with no log and no recovery. Log it and reload so the
// user gets their workspace back (state is already persisted via
// workspace:save) instead of a dead window.
function wireCrashRecovery(win: BrowserWindow): void {
  win.webContents.on('render-process-gone', (_event, details) => {
    logFatal('render-process-gone', new Error(`reason=${details.reason} exitCode=${details.exitCode}`));
    if (!win.isDestroyed()) win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  });
}

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
const windowWorkspaces = new Map<number, string | null>();
let defaultWorkspacePath: string | null = null;

// ─── Path security ───
const ALLOWED_ENV_KEYS = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'SHELL', 'COMSPEC',
  'TEMP', 'TMP', 'HOMEDRIVE', 'HOMEPATH',
  'USERNAME', 'COMPUTERNAME', 'TERM', 'TERMINFO',
  'LC_ALL', 'LANG', 'LC_CTYPE',
  'PATHEXT', 'PROMPT', 'PS1',
  'APPDATA',   'LOCALAPPDATA', 'ProgramFiles', 'SystemRoot',
  'NODE_PATH', 'npm_config_user_agent',
  'OPENCODE_EDITOR_SSE_PORT', 'OPENCODE_MCP_PORT',
]);

// Paths a renderer is allowed to hand to workspace:setPath, or to read via fs:*
// before any per-window workspace has been assigned. Populated only from
// sources the renderer can't forge on its own: the OS folder-picker dialog
// (workspace:select), the CLI arg resolved from argv, and the workspace list
// already persisted to disk at startup. Never populated from an IPC argument
// the renderer controls directly — that's what made workspace:setPath able to
// silently move the fs sandbox root anywhere before this fix.
const trustedWorkspacePaths = new Set<string>();

function trustKey(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
function trustWorkspacePath(p: string): void {
  trustedWorkspacePaths.add(trustKey(p));
}
function isTrustedWorkspacePath(p: string): boolean {
  try { return trustedWorkspacePaths.has(trustKey(p)); } catch { return false; }
}

function isPathSafe(targetPath: string, event?: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  const win = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
  const wsPath = (win && windowWorkspaces.has(win.id)) ? windowWorkspaces.get(win.id)! : defaultWorkspacePath;
  // No workspace scoped to this window yet — only allow paths already known-trusted
  // (e.g. WelcomeModal checking whether a recent workspace still exists on disk).
  if (!wsPath) return isTrustedWorkspacePath(targetPath);
  const resolved = path.resolve(targetPath);
  const ws = path.resolve(wsPath);
  const sep = path.sep;
  const isWin = process.platform === 'win32';
  const a = isWin ? resolved.toLowerCase() : resolved;
  const b = isWin ? ws.toLowerCase() : ws;
  if (!a.startsWith(b + sep) && a !== b) return false;
  try {
    const real = fs.realpathSync(resolved);
    const c = isWin ? real.toLowerCase() : real;
    if (!c.startsWith(b + sep) && c !== b) return false;
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
ipcMain.on('clipboard:readText', (e) => { e.returnValue = clipboard.readText(); });

// File system IPC
ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
  // Read-only existence/directory check. Allow trusted paths (e.g. recent
  // workspaces from another session) even when they lie outside the current
  // window's workspace — the WelcomeModal uses this to show them as pickable.
  if (!isPathSafe(dirPath, _event) && !isTrustedWorkspacePath(dirPath)) return null;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
  } catch { return null; }
});

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  if (!isPathSafe(filePath, _event)) return null;
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
});

ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
  if (!isPathSafe(filePath, _event)) return false;
  try { fs.writeFileSync(filePath, content, 'utf-8'); return true; } catch { return false; }
});

ipcMain.handle('fs:mkdir', async (_event, dirPath: string) => {
  if (!isPathSafe(dirPath, _event)) return false;
  try { fs.mkdirSync(dirPath, { recursive: true }); return true; } catch { return false; }
});

ipcMain.handle('fs:delete', async (_event, targetPath: string) => {
  if (!isPathSafe(targetPath, _event)) return false;
  let watcherStopped = false;
  try { fs.rmSync(targetPath, { recursive: true, force: true }); return true; } catch {}
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (watcher) { await stopWatching(); watcherStopped = true; }
      await new Promise(r => setTimeout(r, 500 + attempt * 300));
      try { fs.rmSync(targetPath, { recursive: true, force: true }); return true; } catch { /* retry */ }
    }
  } finally {
    if (watcherStopped && defaultWorkspacePath) await startWatching(defaultWorkspacePath);
  }
  return false;
});

ipcMain.handle('fs:copy', async (_event, src: string, dest: string) => {
  if (!isPathSafe(src, _event) || !isPathSafe(dest, _event)) return false;
  try { fs.cpSync(src, dest, { recursive: true }); return true; } catch { return false; }
});

ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
  if (!isPathSafe(oldPath, _event) || !isPathSafe(newPath, _event)) return false;
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

// Reference-counted stderr suppression around the node-pty dynamic import (it
// prints native-binding noise on load). Concurrent terminal:create calls each
// suppress/restore in turn without one call's restore clobbering another's.
let stderrSuppressDepth = 0;
let origStderrWrite: typeof process.stderr.write | null = null;
function suppressStderr(): void {
  if (stderrSuppressDepth++ === 0) {
    origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = () => true;
  }
}
function restoreStderr(): void {
  if (--stderrSuppressDepth === 0 && origStderrWrite) {
    process.stderr.write = origStderrWrite;
    origStderrWrite = null;
  }
}

if (process.platform === 'win32') app.setAppUserModelId('com.cockpit.ide');

let lastWsFile: string;
let recentWsFile: string;
let zoomFile: string;

// Renderer zoom (Ctrl +/-/0). Electron zoom level is logarithmic: factor = 1.2 ^ level.
const ZOOM_STEP = 0.5;
const ZOOM_MIN = -2;
const ZOOM_MAX = 4;

function readZoom(): number {
  try {
    const n = parseFloat(fs.readFileSync(zoomFile, 'utf-8'));
    return Number.isFinite(n) ? Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, n)) : 0;
  } catch { return 0; }
}
function writeZoom(level: number): void {
  try { fs.writeFileSync(zoomFile, String(level)); } catch {}
}

// Ctrl +/-/0 zoom the whole renderer uniformly (chrome, editors, terminals, file tree).
// Handled here because before-input-event preventDefault stops the keydown from ever
// reaching the page, so renderer-side key handling for these is impossible.
function installZoomControls(wc: Electron.WebContents): void {
  let level = readZoom();
  wc.setVisualZoomLevelLimits(1, 1);
  const apply = (): void => { wc.setZoomLevel(level); writeZoom(level); };
  // Zoom level resets on each load; reapply once the page is ready.
  wc.on('did-finish-load', () => wc.setZoomLevel(level));
  apply();
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !input.control) return;
    const k = input.key;
    if (k === '=' || k === '+') { e.preventDefault(); level = Math.min(ZOOM_MAX, level + ZOOM_STEP); apply(); }
    else if (k === '-' || k === '_') { e.preventDefault(); level = Math.max(ZOOM_MIN, level - ZOOM_STEP); apply(); }
    else if (k === '0') { e.preventDefault(); level = 0; apply(); }
  });
}
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
function removeRecentWorkspace(p: string): void {
  const list = getRecentWorkspaces().filter(w => w !== p);
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
      devTools: !app.isPackaged,
    },
  });

  mainWindow.maximize();
  mainWindow.show();

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.webContents.on('will-navigate', (event) => { event.preventDefault(); });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  installZoomControls(mainWindow.webContents);
  wireCrashRecovery(mainWindow);

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
  // No remote content is ever loaded, so there's never a legitimate reason to
  // grant a permission request (camera, notifications, etc.) — deny by default
  // instead of relying on Electron's own default.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  // Initialize storage paths
  lastWsFile = path.join(app.getPath('userData'), 'last-workspace.txt');
  recentWsFile = path.join(app.getPath('userData'), 'recent-workspaces.json');
  zoomFile = path.join(app.getPath('userData'), 'zoom-level.txt');

  // Paths already persisted from a prior session were reached through the OS
  // folder picker at some point — trust them for the pre-workspace fs checks
  // (e.g. WelcomeModal checking whether a recent workspace still exists).
  for (const p of getRecentWorkspaces()) trustWorkspacePath(p);

  // CLI workspace path takes precedence over saved state
  const cliPath = resolveCliWorkspace();
  if (cliPath) {
    cockpitDir(path.join(cliPath, '.cockpit'));
    defaultWorkspacePath = cliPath;
    trustWorkspacePath(cliPath);
    saveLastWorkspace(cliPath);
    addRecentWorkspace(cliPath);
    await startWatching(cliPath);
  }
  // Start IDE server if a workspace is already known
  if (cliPath) {
    try { await ideServer.start(cliPath); } catch (e) { console.error('ide: start failed', e); }
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
  ipcMain.on('window:reload', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    // Must reload from main: renderer-initiated location.reload() is blocked by
    // the will-navigate preventDefault guard in createWindow().
    win?.webContents.reload();
  });
  ipcMain.handle('clipboard:writeText', (_event, text: string) => { clipboard.writeText(text); });

  // Terminal PTY — multi-session
  ipcMain.handle('terminal:create', async (event, uuid: string, cwd?: string) => {
    let nodePty: any;
    suppressStderr();
    try {
      nodePty = await import('node-pty');
    } catch { return false; } finally {
      restoreStderr();
    }
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
    if (terminalSenders.get(uuid) !== _event.sender) return;
    ptyProcesses.get(uuid)?.write(data);
  });

  ipcMain.on('terminal:resize', (_event, uuid: string, cols: number, rows: number) => {
    if (terminalSenders.get(uuid) !== _event.sender) return;
    ptyProcesses.get(uuid)?.resize(cols, rows);
  });

  ipcMain.on('terminal:kill', (_event, uuid: string) => {
    if (terminalSenders.get(uuid) !== _event.sender) return;
    const pty = ptyProcesses.get(uuid);
    if (pty) { pty.kill(); ptyProcesses.delete(uuid); }
    terminalSenders.delete(uuid);
  });

  // ─── Git operations ───
  // execFile never invokes a shell, so these are immune to shell-metacharacter
  // injection — but a ref/path starting with '-' can still be parsed by git
  // itself as a flag rather than a positional arg. Reject that shape outright.
  function isSafeGitArg(s: string): boolean {
    return typeof s === 'string' && s.length > 0 && !s.startsWith('-');
  }

  ipcMain.handle('git:remotes', async (_event, repoPath: string) => {
    if (!isPathSafe(repoPath, _event)) return [];
    return new Promise(resolve => {
      execFile('git', ['remote', '-v'], { cwd: repoPath }, (err, stdout) => {
        if (err) { resolve([]); return; }
        const remotes: { name: string; url: string }[] = [];
        const seen = new Set<string>();
        for (const line of stdout.trim().split('\n').filter(Boolean)) {
          const [name, url] = line.split('\t');
          if (!seen.has(name)) {
            seen.add(name);
            remotes.push({ name, url: (url || '').replace(/\s+\(.*\)$/, '') });
          }
        }
        resolve(remotes);
      });
    });
  });

  ipcMain.handle('git:branches', async (_event, repoPath: string) => {
    if (!isPathSafe(repoPath, _event)) return [];
    return new Promise(resolve => {
      execFile('git', ['branch', '-a'], { cwd: repoPath }, (err, stdout) => {
        if (err) { resolve([]); return; }
        const branches = stdout.trim().split('\n').filter(Boolean).map(line => {
          const current = line.startsWith('*');
          const name = line.replace(/^\*\s*/, '').trim();
          return { name, current, isRemote: name.startsWith('remotes/') };
        });
        resolve(branches);
      });
    });
  });

  ipcMain.handle('git:checkout', async (_event, repoPath: string, branch: string) => {
    if (!isPathSafe(repoPath, _event) || !isSafeGitArg(branch)) return { ok: false, error: 'Invalid branch name' };
    return new Promise(resolve => {
      execFile('git', ['checkout', branch], { cwd: repoPath }, (err, _stdout, stderr) => {
        resolve({ ok: !err, error: err ? String(stderr || err.message).trim() : '' });
      });
    });
  });

  ipcMain.handle('git:log', async (_event, repoPath: string, maxCount: number = 50) => {
    if (!isPathSafe(repoPath, _event)) return [];
    return new Promise(resolve => {
      execFile('git', ['log', `--max-count=${maxCount}`, '--format=%H|%an|%ai|%s', '--', '.'], { cwd: repoPath, maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) { resolve([]); return; }
        const commits = stdout.trim().split('\n').filter(Boolean).map(line => {
          const [hash, author, date, ...msgParts] = line.split('|');
          return { hash, author, date: date || '', message: msgParts.join('|') || '' };
        });
        resolve(commits);
      });
    });
  });

  ipcMain.handle('git:showTree', async (_event, repoPath: string, commit: string) => {
    if (!isPathSafe(repoPath, _event) || !isSafeGitArg(commit)) return [];
    return new Promise(resolve => {
      execFile('git', ['diff-tree', '--no-commit-id', '-r', '--name-status', '--root', commit], { cwd: repoPath, maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) { resolve([]); return; }
        const files = stdout.trim().split('\n').filter(Boolean).map(line => {
          const [rawStatus, ...nameParts] = line.split('\t');
          const status = rawStatus.replace(/[^A-Z]/g, '') || '?';
          return { status, path: nameParts.join('\t') };
        });
        resolve(files);
      });
    });
  });

  ipcMain.handle('git:diff', async (_event, repoPath: string, commit: string, filePath?: string) => {
    if (!isPathSafe(repoPath, _event) || !isSafeGitArg(commit)) return '';
    return new Promise(resolve => {
      const args = ['show', '--no-color', commit];
      if (filePath) args.push('--', filePath);
      execFile('git', args, { cwd: repoPath, maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) { resolve(''); return; }
        const idx = stdout.indexOf('diff --git');
        resolve(idx >= 0 ? stdout.substring(idx) : stdout);
      });
    });
  });

  ipcMain.handle('git:currentBranch', async (_event, repoPath: string) => {
    if (!isPathSafe(repoPath, _event)) return '';
    return new Promise(resolve => {
      execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath }, (err, stdout) => {
        if (err) { resolve(''); return; }
        resolve(stdout.trim());
      });
    });
  });

  ipcMain.handle('git:stagedFiles', async (_event, repoPath: string) => {
    if (!isPathSafe(repoPath, _event)) return [];
    return new Promise(resolve => {
      execFile('git', ['diff', '--cached', '--name-status'], { cwd: repoPath, maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) { resolve([]); return; }
        const files = stdout.trim().split('\n').filter(Boolean).map(line => {
          const [status, ...nameParts] = line.split('\t');
          return { status: status || '?', path: nameParts.join('\t') };
        });
        resolve(files);
      });
    });
  });

  ipcMain.handle('git:unstagedFiles', async (_event, repoPath: string) => {
    if (!isPathSafe(repoPath, _event)) return [];
    return new Promise(resolve => {
      execFile('git', ['status', '--porcelain'], { cwd: repoPath, maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) { resolve([]); return; }
        const files = stdout.trim().split('\n').filter(Boolean).reduce((acc: { status: string; path: string }[], line: string) => {
          const xy = line.substring(0, 2);
          const path = line.substring(3).trim();
          // xy[1] is working-tree status — include if changed or untracked
          if (xy[1] !== ' ') {
            acc.push({ status: xy.trim() || '?', path });
          }
          return acc;
        }, []);
        resolve(files);
      });
    });
  });

  ipcMain.handle('git:stagedDiff', async (_event, repoPath: string, filePath: string) => {
    if (!isPathSafe(repoPath, _event)) return '';
    return new Promise(resolve => {
      execFile('git', ['diff', '--cached', '--', filePath], { cwd: repoPath, maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) { resolve(''); return; }
        resolve(stdout);
      });
    });
  });

  ipcMain.handle('git:unstagedDiff', async (_event, repoPath: string, filePath: string) => {
    if (!isPathSafe(repoPath, _event)) return '';
    return new Promise(resolve => {
      execFile('git', ['diff', '--', filePath], { cwd: repoPath, maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) { resolve(''); return; }
        if (stdout.trim()) { resolve(stdout); return; }
        // Empty diff — file may be untracked (new). Check and show full content as addition.
        execFile('git', ['ls-files', '--error-unmatch', filePath], { cwd: repoPath }, (lsErr) => {
          if (lsErr) {
            // File is untracked — read it and build a new-file diff
            const fullPath = path.resolve(repoPath, filePath);
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');
              const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
              const safePath = filePath.replace(/\\/g, '/');
              let diff =
                'diff --git a/' + safePath + ' b/' + safePath + '\n' +
                'new file mode 100644\n' +
                'index 0000000..0000000\n' +
                '--- /dev/null\n' +
                '+++ b/' + safePath + '\n' +
                '@@ -0,0 +1,' + lineCount + ' @@\n';
              diff += lines
                .filter((_, i) => !(i === lines.length - 1 && lines[i] === ''))
                .map(l => '+' + l)
                .join('\n');
              resolve(diff);
            } catch { resolve(''); }
          } else {
            resolve('');
          }
        });
      });
    });
  });

  ipcMain.handle('git:commitBody', async (_event, repoPath: string, commit: string) => {
    if (!isPathSafe(repoPath, _event) || !isSafeGitArg(commit)) return '';
    return new Promise(resolve => {
      execFile('git', ['log', '-1', '--format=%B', commit], { cwd: repoPath }, (err, stdout) => {
        if (err) { resolve(''); return; }
        resolve(stdout);
      });
    });
  });

  ipcMain.handle('git:stage', async (_event, repoPath: string, filePath: string) => {
    if (!isPathSafe(repoPath, _event)) return false;
    return new Promise(resolve => {
      execFile('git', ['add', '--', filePath], { cwd: repoPath }, (err) => {
        resolve(!err);
      });
    });
  });

  ipcMain.handle('git:unstage', async (_event, repoPath: string, filePath: string) => {
    if (!isPathSafe(repoPath, _event)) return false;
    return new Promise(resolve => {
      execFile('git', ['restore', '--staged', '--', filePath], { cwd: repoPath }, (err) => {
        resolve(!err);
      });
    });
  });

  ipcMain.handle('git:commit', async (_event, repoPath: string, message: string) => {
    if (!isPathSafe(repoPath, _event)) return { ok: false, error: 'Invalid workspace path' };
    return new Promise(resolve => {
      execFile('git', ['commit', '-m', message], { cwd: repoPath }, (err, stdout, stderr) => {
        resolve({ ok: !err, error: err ? String(stderr || stdout || err.message).trim() : '' });
      });
    });
  });

  ipcMain.handle('git:push', async (_event, repoPath: string) => {
    if (!isPathSafe(repoPath, _event)) return { ok: false, error: 'Invalid workspace path' };
    return new Promise(resolve => {
      execFile('git', ['push'], { cwd: repoPath, maxBuffer: 1024 * 1024 }, (err, _stdout, stderr) => {
        resolve({ ok: !err, error: err ? String(stderr || err.message).trim() : '' });
      });
    });
  });

  ipcMain.handle('git:checkAhead', async (_event, repoPath: string) => {
    if (!isPathSafe(repoPath, _event)) return 0;
    return new Promise(resolve => {
      execFile('git', ['rev-list', '--count', '@{u}..HEAD'], { cwd: repoPath }, (err, stdout) => {
        if (err) { resolve(0); return; }
        resolve(parseInt(stdout.trim(), 10) || 0);
      });
    });
  });

  // Workspace
  // File watcher
  ipcMain.handle('file:watch', async (_event, dir: string) => {
    if (!isPathSafe(dir, _event)) return false;
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
    trustWorkspacePath(wsPath);
    cockpitDir(path.join(wsPath, '.cockpit'));
    if (win) windowWorkspaces.set(win.id, wsPath);
    saveLastWorkspace(wsPath);
    addRecentWorkspace(wsPath);
    await startWatching(wsPath);
    ideServer.stop();
    try { await ideServer.start(wsPath); } catch (e) { console.error('ide: start failed', e); }
    return wsPath;
  });

  ipcMain.handle('workspace:getPath', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && windowWorkspaces.has(win.id)) return windowWorkspaces.get(win.id)!;
    return null;
  });

  ipcMain.handle('workspace:setPath', async (event, wsPath: string) => {
    // wsPath must already be trusted (came from the OS dialog, the CLI arg, or
    // a workspace persisted from a prior session) — it must never be able to
    // widen the fs sandbox to an arbitrary renderer-supplied string.
    if (!isTrustedWorkspacePath(wsPath)) return false;
    try { if (!fs.statSync(wsPath).isDirectory()) return false; } catch { return false; }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) windowWorkspaces.set(win.id, wsPath);
    cockpitDir(path.join(wsPath, '.cockpit'));
    saveLastWorkspace(wsPath);
    addRecentWorkspace(wsPath);
    await startWatching(wsPath);
    ideServer.stop();
    try { await ideServer.start(wsPath); } catch (e) { console.error('ide: start failed', e); }
    return true;
  });

  ipcMain.handle('workspace:load', (_event, wsPath?: string) => {
    const targetPath = wsPath || defaultWorkspacePath;
    if (!targetPath) return null;
    if (wsPath && !isPathSafe(wsPath, _event)) return null;
    const f = path.join(targetPath, '.cockpit', 'window.json');
    try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return null; }
  });

  ipcMain.handle('workspace:save', (_event, state: any, wsPath?: string) => {
    const targetPath = wsPath || defaultWorkspacePath;
    if (!targetPath) { console.error('workspace:save — no workspacePath'); return false; }
    if (wsPath && !isPathSafe(wsPath, _event)) return false;
    const dir = path.join(targetPath, '.cockpit');
    try {
      cockpitDir(dir);
      fs.writeFileSync(path.join(dir, 'window.json'), JSON.stringify(state, null, 2));
      return true;
    } catch (e) { console.error('workspace:save error', e); return false; }
  });

  ipcMain.handle('workspace:getRecent', () => getRecentWorkspaces());
  // Only record paths already trusted (OS dialog, CLI arg, or a path persisted
  // from a prior session) — otherwise a renderer could plant an arbitrary path
  // here, which trustWorkspacePath() then blindly trusts on the next launch,
  // widening the fs sandbox root to anything.
  ipcMain.handle('workspace:addRecent', (_event, p: string) => {
    if (!isTrustedWorkspacePath(p)) return;
    addRecentWorkspace(p);
  });
  ipcMain.handle('workspace:removeRecent', (_event, p: string) => { removeRecentWorkspace(p); });

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return false;
      await shell.openExternal(url);
      return true;
    } catch { return false; }
  });

  // Hook command runner (PreToolUse/PostToolUse/SubagentStart/Stop). The renderer
  // supplies the whole command string — same trust model as terminal:create. The
  // workspace path gate applies to cwd so a hook can't reach outside the sandbox.
  ipcMain.handle('shell:exec', async (_event, opts: { command?: string; cwd?: string; timeoutMs?: number; input?: string }) => {
    if (!opts || typeof opts.command !== 'string' || !opts.command.trim()) {
      return { exitCode: -1, stdout: '', stderr: 'shell:exec: command is required' };
    }
    const cwd = opts.cwd && opts.cwd.trim() ? opts.cwd : undefined;
    if (cwd && !isPathSafe(cwd, _event)) {
      return { exitCode: -1, stdout: '', stderr: 'shell:exec: cwd outside the workspace sandbox' };
    }
    return runShellCommand(opts.command, {
      cwd,
      timeoutMs: typeof opts.timeoutMs === 'number' ? opts.timeoutMs : undefined,
      input: typeof opts.input === 'string' ? opts.input : undefined,
    });
  });

  // User preferences (saved to userData, not workspace-specific)
  const prefsFile = path.join(app.getPath('userData'), 'preferences.json');
  // IDE context server — receives editor state from renderer, pushes via WebSocket
  ideServer.onOpenFile = (filePath) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('ide:openFile', filePath);
    }
  };
  ipcMain.on('ide:editorState', (_event, state: any) => {
    ideServer.updateEditorState(state);
  });
  ipcMain.handle('ide:status', () => ({
    running: ideServer.getPort() > 0,
    port: ideServer.getPort(),
    workspace: defaultWorkspacePath,
    lockPaths: ideServer.getLockPaths(),
  }));

  // Prefs may contain secrets (e.g. the LLM API key). Encrypt at rest via the
  // OS keychain (safeStorage) where available; plaintext JSON from an older
  // version, or from a platform without a keychain, still loads correctly.
  ipcMain.handle('prefs:load', () => {
    try {
      const raw = fs.readFileSync(prefsFile);
      try { return JSON.parse(raw.toString('utf-8')); } catch { /* not plaintext — try decrypting below */ }
      if (safeStorage.isEncryptionAvailable()) return JSON.parse(safeStorage.decryptString(raw));
      return {};
    } catch { return {}; }
  });
  ipcMain.handle('prefs:save', (_event, prefs: any) => {
    try {
      const json = JSON.stringify(prefs, null, 2);
      const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : json;
      fs.writeFileSync(prefsFile, data);
      return true;
    } catch { return false; }
  });

  // Agent memory: global (userData) + workspace-local (.cockpit/memory.json)
  const globalMemoryFile = path.join(app.getPath('userData'), 'memory.json');

  function emptyMemoryFile(): { version: number; updatedAt: string; entries: any[] } {
    return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
  }

  function normalizeMemoryFile(raw: any): { version: number; updatedAt: string; entries: any[] } {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) return emptyMemoryFile();
    return {
      version: 1,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      entries: raw.entries,
    };
  }

  function readOrCreateMemoryFile(filePath: string): { version: number; updatedAt: string; entries: any[] } {
    try {
      if (!fs.existsSync(filePath)) {
        const base = emptyMemoryFile();
        cockpitDir(path.dirname(filePath));
        fs.writeFileSync(filePath, JSON.stringify(base, null, 2), 'utf-8');
        return base;
      }
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return normalizeMemoryFile(parsed);
    } catch {
      const base = emptyMemoryFile();
      try {
        cockpitDir(path.dirname(filePath));
        fs.writeFileSync(filePath, JSON.stringify(base, null, 2), 'utf-8');
      } catch { /* ignore */ }
      return base;
    }
  }

  function writeMemoryFile(filePath: string, data: any): boolean {
    try {
      const file = normalizeMemoryFile(data);
      file.updatedAt = new Date().toISOString();
      cockpitDir(path.dirname(filePath));
      fs.writeFileSync(filePath, JSON.stringify(file, null, 2), 'utf-8');
      return true;
    } catch { return false; }
  }

  ipcMain.handle('memory:loadGlobal', () => readOrCreateMemoryFile(globalMemoryFile));
  ipcMain.handle('memory:saveGlobal', (_event, data: any) => writeMemoryFile(globalMemoryFile, data));
  ipcMain.handle('memory:loadWorkspace', (_event, wsPath: string) => {
    if (!wsPath || !isPathSafe(wsPath, _event)) return emptyMemoryFile();
    const f = path.join(wsPath, '.cockpit', 'memory.json');
    return readOrCreateMemoryFile(f);
  });
  ipcMain.handle('memory:saveWorkspace', (_event, wsPath: string, data: any) => {
    if (!wsPath || !isPathSafe(wsPath, _event)) return false;
    const f = path.join(wsPath, '.cockpit', 'memory.json');
    return writeMemoryFile(f, data);
  });

  createWindow();

  // Associate CLI path with the main window's per-window workspace
  if (cliPath && mainWindow) {
    windowWorkspaces.set(mainWindow.id, cliPath);
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
export function _testSetWorkspacePath(p: string | null): void { defaultWorkspacePath = p; }
export function _testIsPathSafe(p: string): boolean { return isPathSafe(p); }
export function _testTrustPath(p: string): void { trustWorkspacePath(p); }
