// Workspace file watcher (chokidar) + the file:* namespace (refactor.md §A.4).
// startWatching/stopWatching are exported for fs.ts (delete retry) and
// workspace.ts (watch on select/setPath) — dependency flows file ← fs/workspace.

import { BrowserWindow } from 'electron';
import type { IpcMain } from 'electron';
import type { IpcCtx } from './ipc-types';
import { withHandlerLogging } from './logging';

let watcher: any = null;
let watchDebounce: ReturnType<typeof setTimeout> | null = null;
const pendingChanges = new Set<string>();

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

export async function stopWatching(): Promise<void> {
  if (watcher) { await watcher.close(); watcher = null; }
  if (watchDebounce) { clearTimeout(watchDebounce); watchDebounce = null; }
  pendingChanges.clear();
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
