// Workspace file watcher + the file:* namespace (refactor.md §A.4).
// startWatching/stopWatching are exported for fs.ts (delete retry) and
// workspace.ts (watch on select/setPath) — dependency flows file ← fs/workspace.
//
// Two interchangeable backends (watch/native.ts, watch/chokidar.ts):
//   native   — one recursive OS watch for the whole tree (default). A drive
//              root or a 20k-file repo costs the same one handle.
//   chokidar — the original per-entry watcher. Kept selectable (View → File
//              watcher) and used automatically where a recursive watch is
//              unavailable. It is the backend with a watch-set budget, because
//              it registers a handle per file and per directory.

import * as fs from 'fs';
import * as path from 'path';
import { BrowserWindow } from 'electron';
import type { IpcMain } from 'electron';
import type { IpcCtx } from './ipc-types';
import { logMain, notifyUser, withHandlerLogging } from './logging';
import { readPrefsFile } from './prefs';
import { invalidateWorkspaceRealpath } from './security';
import { startChokidarWatch } from './watch/chokidar';
import { startNativeWatch } from './watch/native';
import { WATCH_FILE_LIMIT, WATCH_DIR_LIMIT, WATCH_MAX_DEPTH } from './watch/budget';
import type { WatchBackendName, WatchSession } from './watch/types';
import { IGNORED_DIRS } from '../../shared/ignore-dirs';

export { WATCH_FILE_LIMIT, WATCH_DIR_LIMIT, watchSetSize } from './watch/budget';

let session: WatchSession | null = null;
/** Root the current watcher was started for — a repeat start is a no-op. */
let watchedDir: string | null = null;
/** Root we last refused to watch — suppress the boot's duplicate toast. */
let refusedDir: string | null = null;
let refusedAt = 0;
/** Re-selecting the same folder later re-scans (the tree may have shrunk). */
const REFUSAL_QUIET_MS = 10_000;
/** Last budget verdict, so a watcher restart (fs:delete pauses it) doesn't re-walk. */
let budgetVerdict: { dir: string; tooLarge: boolean } | null = null;
/** Backend chosen this run (prefs at boot, View menu afterwards). */
let backendOverride: WatchBackendName | null = null;
/** What actually backs the live session (native can fall back to chokidar). */
let activeBackend: WatchBackendName | null = null;
let watchDebounce: ReturnType<typeof setTimeout> | null = null;
let watchMaxWait: ReturnType<typeof setTimeout> | null = null;
/** Paths collected since the last flush — the per-tick dedupe set. */
const pendingChanges = new Set<string>();
/** Path → last time it was actually broadcast (cross-flush de-dupe). */
const lastSentAt = new Map<string, number>();

const DEBOUNCE_MS = 100;
/** A sustained event storm must not starve the flush (trailing debounce alone). */
const MAX_WAIT_MS = 250;
/** A path that bounces (add → unlink → add across ticks) is sent once. */
const REPEAT_SUPPRESS_MS = 250;
/**
 * One flush carrying more unique paths than this is a checkout / install /
 * build storm, not editing. Sending a `file:changed` per path is what makes the
 * renderer the bottleneck, so stand down instead (chokidar's own growth guard
 * covers the handle side; this covers the message side for both backends).
 */
const WATCH_FLOOD_LIMIT = 10_000;

/** A drive/filesystem root can never have a sane watch set — no scan needed. */
export function isFilesystemRoot(dir: string): boolean {
  const abs = path.resolve(dir);
  return path.parse(abs).root === abs;
}

/**
 * Walks `dir` (depth- and ignore-limited) until it can prove the watch set
 * would exceed the budget. Async throughout, so an oversized workspace costs a
 * fraction of a crawl without blocking the message loop. Unreadable directories
 * (`System Volume Information`, `$RECYCLE.BIN`) are skipped: they hold nothing
 * anyone edits.
 *
 * Symlinked directories are followed — chokidar follows them by default, so a
 * junction pointing at a whole volume has to count here too, or the budget
 * would pass and the crawl would still blow up.
 */
export async function exceedsWatchBudget(dir: string, isIgnored: (p: string) => boolean): Promise<boolean> {
  let files = 0;
  let dirs = 0;
  const queue: Array<{ path: string; depth: number }> = [{ path: dir, depth: 0 }];
  const countFile = (): boolean => ++files > WATCH_FILE_LIMIT;
  const countDir = (): boolean => ++dirs > WATCH_DIR_LIMIT;
  while (queue.length > 0) {
    const current = queue.pop()!;
    let entries: import('fs').Dirent[];
    try { entries = await fs.promises.readdir(current.path, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      const full = path.join(current.path, entry.name);
      if (isIgnored(full)) continue;
      if (entry.isDirectory()) {
        if (countDir()) return true;
        if (current.depth < WATCH_MAX_DEPTH) queue.push({ path: full, depth: current.depth + 1 });
        continue;
      }
      if (entry.isSymbolicLink()) {
        // One stat per link, only to learn whether the watcher would descend.
        let targetIsDir = false;
        try { targetIsDir = (await fs.promises.stat(full)).isDirectory(); } catch { /* dangling/locked */ }
        if (targetIsDir) {
          if (countDir()) return true;
          if (current.depth < WATCH_MAX_DEPTH) queue.push({ path: full, depth: current.depth + 1 });
        } else if (countFile()) {
          return true;
        }
        continue;
      }
      if (countFile()) return true;
    }
  }
  return false;
}

/**
 * Directory names declared in the workspace's own `.gitignore` (plain
 * `dir`, `/dir`, `dir/` entries only — globs and negations are ignored).
 * A workspace's build output belongs there long before we see it; honouring
 * it keeps chokidar from registering a watcher per generated file.
 */
function gitignoredDirNames(root: string): Set<string> {
  const names = new Set<string>();
  let raw: string;
  try { raw = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8'); } catch { return names; }
  for (const line of raw.split(/\r?\n/)) {
    const entry = line.trim();
    // Reject comments, negations, globs and nested paths — only plain names.
    const m = /^\/?([^/*?[\]!#\\]+)\/?$/.exec(entry);
    if (m) names.add(m[1]);
  }
  return names;
}

/**
 * Watch-scope predicate: build output, dependency trees, VCS metadata and any
 * directory the workspace's own `.gitignore` lists are never worth watching.
 * chokidar needed this to avoid a `fs.watch` handle per generated file; the
 * native backend needs it to keep a busy tree's event stream down to edits.
 *
 * Exported for tests.
 */
export function makeIgnore(root: string): (p: string) => boolean {
  const fromGitignore = gitignoredDirNames(root);
  return (p: string): boolean => {
    const rel = path.relative(root, p);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
    for (const segment of rel.split(/[\\/]/)) {
      if (IGNORED_DIRS.has(segment) || fromGitignore.has(segment)) return true;
    }
    return false;
  };
}

/** Which backend this run uses: the View-menu choice, else the saved pref. */
export function watchBackendName(): WatchBackendName {
  if (backendOverride) return backendOverride;
  return readPrefsFile().watchBackend === 'chokidar' ? 'chokidar' : 'native';
}

/** What is really watching right now (accounts for the native→chokidar fallback). */
export function activeWatchBackend(): WatchBackendName {
  return activeBackend ?? watchBackendName();
}

/** Apply a backend choice (persisted by the renderer as a pref). Restart needed. */
export function setWatchBackendName(name: unknown): WatchBackendName {
  backendOverride = name === 'chokidar' ? 'chokidar' : 'native';
  return backendOverride;
}

let budgetTripped = false;

function enforceRuntimeBudget(): void {
  if (budgetTripped || !session) return;
  // A per-entry backend reports its live set; the native watcher holds one
  // handle regardless of tree size, so there is nothing to enforce.
  const size = session.size();
  if (!size) return;
  const { files, dirs } = size;
  if (files <= WATCH_FILE_LIMIT && dirs <= WATCH_DIR_LIMIT) return;
  budgetTripped = true;
  // Forget the cached "small enough" verdict: a restart (or the user
  // re-selecting the folder) must re-walk the tree and decide fresh.
  budgetVerdict = null;
  logMain('warn', 'file', 'live watching stopped — workspace grew past the watch budget',
    `${files} files / ${dirs} dirs`);
  notifyUser('warn',
    'Live file refresh was switched off: this workspace grew past '
    + `${WATCH_FILE_LIMIT.toLocaleString()} files (a clone, an install or a generated tree). `
    + 'Editing and saving still work — reopen the folder to turn watching back on.');
  void stopWatching();
}

/**
 * Send each unique pending path at most once per flush, and at most once per
 * REPEAT_SUPPRESS_MS across flushes. `git checkout` / a build otherwise emits
 * thousands of events, and every consumer (explorer, editor tabs, git panel)
 * used to receive one IPC message per path — per window.
 *
 * Channel and payload shape are unchanged: one `file:changed` per unique path.
 */
function flushChanges(): void {
  if (watchDebounce) { clearTimeout(watchDebounce); watchDebounce = null; }
  if (watchMaxWait) { clearTimeout(watchMaxWait); watchMaxWait = null; }
  if (pendingChanges.size === 0) return;

  if (pendingChanges.size > WATCH_FLOOD_LIMIT) {
    const count = pendingChanges.size;
    pendingChanges.clear();
    budgetTripped = true;
    budgetVerdict = null;
    logMain('warn', 'file', 'live watching stopped — filesystem activity flood', `${count} paths in one flush`);
    notifyUser('warn',
      `Live file refresh was switched off: ${count.toLocaleString()} files changed at once `
      + '(a checkout, install or build). Editing and saving still work — reopen the folder '
      + 'to turn watching back on.');
    void stopWatching();
    return;
  }

  const now = Date.now();
  // Hoisted out of the per-path loop: was getAllWindows() per path.
  const windows = BrowserWindow.getAllWindows();
  for (const p of pendingChanges) {
    const sent = lastSentAt.get(p);
    if (sent !== undefined && now - sent < REPEAT_SUPPRESS_MS) continue;
    lastSentAt.set(p, now);
    for (const win of windows) win.webContents.send('file:changed', p);
  }
  pendingChanges.clear();
  if (lastSentAt.size > 512) {
    for (const [p, at] of lastSentAt) if (now - at >= REPEAT_SUPPRESS_MS) lastSentAt.delete(p);
  }
  enforceRuntimeBudget();
}

function queueChange(filePath: string): void {
  pendingChanges.add(filePath);
  if (watchDebounce) clearTimeout(watchDebounce);
  watchDebounce = setTimeout(flushChanges, DEBOUNCE_MS);
  // Only the FIRST event of a burst arms the max-wait cap.
  if (!watchMaxWait) watchMaxWait = setTimeout(flushChanges, MAX_WAIT_MS);
}

/** Shared error handling: a blocked tree can fail hundreds of watches in a row. */
let watcherErrors = 0;
function handleWatcherError(err: unknown): void {
  watcherErrors++;
  if (watcherErrors <= 5 || watcherErrors % 100 === 0) {
    logMain('warn', 'file', `watcher error (${watcherErrors})`, String(err));
  }
}

/** The backend saw more changes than a UI can follow; it already stood down. */
function handleEventFlood(): void {
  if (!session) return;
  logMain('warn', 'file', 'live watching stopped — folder changes too fast to follow');
  notifyUser('warn',
    'Live file refresh was switched off: this folder changes too fast to follow (thousands '
    + 'of edits a second). Editing and saving still work — reopen the folder to try again.');
  void stopWatching();
}

function refuseToWatch(dir: string, abs: string, reason: 'root' | 'size'): void {
  refusedDir = abs;
  refusedAt = Date.now();
  logMain('warn', 'file', `live watching disabled — ${reason === 'root' ? 'drive/filesystem root' : 'workspace too large'}`, dir);
  notifyUser('warn', reason === 'root'
    ? 'Live file refresh is off for this workspace: a whole drive is too broad to follow '
      + '(system directories generate thousands of events a second). Editing and saving still '
      + 'work — open a project folder to get live updates.'
    : 'Live file refresh is off for this workspace: a tree with more than '
      + `${WATCH_FILE_LIMIT.toLocaleString()} files is too large for the chokidar watcher. `
      + 'Editing and saving still work — switch View → File watcher → Native, or open a project folder.');
}

export async function startWatching(dir: string): Promise<void> {
  // workspace:* and the CLI path both start a watcher on boot; re-crawling the
  // same tree a second time (or re-scanning it just to refuse it again) is
  // pure startup cost, and a second "watching is off" toast is pure noise.
  const abs = path.resolve(dir);
  if (session && watchedDir && path.resolve(watchedDir) === abs) return;
  if (refusedDir === abs && Date.now() - refusedAt < REFUSAL_QUIET_MS) return;
  await stopWatching();

  // Refused for chokidar only: it would register one handle per entry (~78k for
  // a drive). The native watcher holds a single handle for the whole volume, so
  // a drive root is allowed — its own rate guard stands it down if the drive
  // turns out to be too chatty to follow.
  const backend = watchBackendName();
  if (isFilesystemRoot(dir) && backend === 'chokidar') { refuseToWatch(dir, abs, 'root'); return; }

  const isIgnored = makeIgnore(dir);

  if (backend === 'chokidar') {
    const cached = budgetVerdict && budgetVerdict.dir === abs ? budgetVerdict.tooLarge : null;
    const tooLarge = cached ?? await exceedsWatchBudget(dir, isIgnored);
    budgetVerdict = { dir: abs, tooLarge };
    if (tooLarge) { refuseToWatch(dir, abs, 'size'); return; }
  }

  const sink = {
    changed: queueChange,
    error: handleWatcherError,
    ready: () => enforceRuntimeBudget(),
    flood: handleEventFlood,
  };

  refusedDir = null;
  budgetTripped = false;
  watcherErrors = 0;
  try {
    session = backend === 'native'
      ? startNativeWatch(dir, isIgnored, sink)
      : startChokidarWatch(dir, isIgnored, sink);
    activeBackend = backend;
    watchedDir = dir;
  } catch (e) {
    if (backend !== 'native') {
      logMain('error', 'file', 'chokidar watcher failed to start', String(e));
      session = null;
      return;
    }
    // Node without recursive watch support (pre-20 Linux/macOS): fall back.
    logMain('warn', 'file', 'native watcher unavailable — falling back to chokidar', String(e));
    session = null;
    const tooLarge = await exceedsWatchBudget(dir, isIgnored);
    budgetVerdict = { dir: abs, tooLarge };
    if (tooLarge) { refuseToWatch(dir, abs, 'size'); return; }
    notifyUser('warn', 'The native file watcher is not available on this platform — using chokidar.');
    session = startChokidarWatch(dir, isIgnored, sink);
    activeBackend = 'chokidar';
    watchedDir = dir;
  }
}

export async function stopWatching(): Promise<void> {
  if (session) { await session.close(); session = null; }
  watchedDir = null;
  if (watchDebounce) { clearTimeout(watchDebounce); watchDebounce = null; }
  if (watchMaxWait) { clearTimeout(watchMaxWait); watchMaxWait = null; }
  pendingChanges.clear();
  lastSentAt.clear();
  // Every workspace switch (and fs:delete's watcher pause) funnels through
  // here — drop the memoised canonical workspace path so a workspace that was
  // re-created or re-pointed at the same path re-resolves from disk.
  invalidateWorkspaceRealpath();
}

/** Whether a watcher is currently holding a directory open. */
export function isWatching(): boolean {
  return session !== null;
}

export function registerFileHandlers(ipcMain: IpcMain, ctx: IpcCtx): void {
  withHandlerLogging('file:watch', async (event, dir: string) => {
    if (!ctx.security.isPathSafe(dir, event)) return false;
    await startWatching(dir);
    return true;
  }, false);

  withHandlerLogging('file:unwatch', async () => {
    await stopWatching();
    return true;
  }, false);

  withHandlerLogging('file:getWatchBackend', () => activeWatchBackend(), 'native');

  // Switching backend restarts the watch: the two have different limits and
  // different failure modes, and the pref applies to the next launch too.
  withHandlerLogging('file:setWatchBackend', async (event, name: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const wsPath = (win && ctx.state.windowWorkspaces.get(win.id)) || ctx.state.defaultWorkspacePath;
    setWatchBackendName(name);
    await stopWatching();
    if (wsPath) await startWatching(wsPath);
    return activeWatchBackend();
  }, 'native');
}
