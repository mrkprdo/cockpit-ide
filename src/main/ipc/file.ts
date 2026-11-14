// Workspace file watcher (chokidar) + the file:* namespace (refactor.md §A.4).
// startWatching/stopWatching are exported for fs.ts (delete retry) and
// workspace.ts (watch on select/setPath) — dependency flows file ← fs/workspace.

import { BrowserWindow } from 'electron';
import type { IpcMain } from 'electron';
import type { IpcCtx } from './ipc-types';
import { withHandlerLogging } from './logging';
import { invalidateWorkspaceRealpath } from './security';

let watcher: any = null;
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
}

export async function startWatching(dir: string): Promise<void> {
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
      watchDebounce = setTimeout(flushChanges, DEBOUNCE_MS);
      // Only the FIRST event of a burst arms the max-wait cap.
      if (!watchMaxWait) watchMaxWait = setTimeout(flushChanges, MAX_WAIT_MS);
    };

    watcher.on('add', queueChange);
    watcher.on('change', queueChange);
    watcher.on('unlink', queueChange);
    watcher.on('addDir', () => {});
  } catch (e) {
    console.error('file:watch error', e);
  }
}

export async function stopWatching(): Promise<void> {
  if (watcher) { await watcher.close(); watcher = null; }
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
  return watcher !== null;
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
}
