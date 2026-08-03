// fs:* namespace — filesystem read/write behind the path sandbox (refactor.md
// §A.4). Registered through withHandlerLogging; per-handler judgment (refactor.md
// §B.4): expected control flow (ENOENT on a not-yet-existing path) returns the
// sentinel as before, genuinely unexpected errors propagate to the wrapper's
// catch so they're logged and the renderer still sees the same fallback.
//
// Mutating handlers resolve their target through security.resolvePathInsideWorkspace
// and operate on the canonical (symlink-resolved) path — the same guarantee as
// isPathSafe, but re-verified against on-disk reality at mutation time (TOCTOU
// hardening, refactor.md §A.4.1).

import * as fs from 'fs';
import type { IpcMain } from 'electron';
import type { IpcCtx } from './context';
import { withHandlerLogging } from './logging';
import { isWatching } from './file';

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'ENOENT';
}

function isNotDirectory(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'ENOTDIR';
}

export function registerFsHandlers(ipcMain: IpcMain, ctx: IpcCtx): void {
  const { security, startWatching, stopWatching, state } = ctx;

  withHandlerLogging('fs:readDir', async (event, dirPath: string) => {
    // Read-only existence/directory check. Allow trusted paths (e.g. recent
    // workspaces from another session) even when they lie outside the current
    // window's workspace — the WelcomeModal uses this to show them as pickable.
    const canon = security.resolvePathInsideWorkspace(dirPath, event) ?? (security.isTrustedWorkspacePath(dirPath) ? dirPath : null);
    if (!canon) return null;
    try {
      const entries = fs.readdirSync(canon, { withFileTypes: true });
      return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
    } catch (err) {
      if (isEnoent(err)) return null;          // directory legitimately doesn't exist yet
      if (isNotDirectory(err)) return null;    // path exists but is a file, not a directory
      throw err;
    }
  }, null);

  withHandlerLogging('fs:readFile', async (event, filePath: string) => {
    const canon = security.resolvePathInsideWorkspace(filePath, event);
    if (!canon) return null;
    try { return fs.readFileSync(canon, 'utf-8'); }
    catch (err) { if (isEnoent(err)) return null; throw err; }
  }, null);

  withHandlerLogging('fs:writeFile', async (event, filePath: string, content: string) => {
    const canon = security.resolvePathInsideWorkspace(filePath, event);
    if (!canon) return false;
    try { fs.writeFileSync(canon, content, 'utf-8'); return true; }
    catch (err) { if (isEnoent(err)) return false; throw err; }
  }, false);

  withHandlerLogging('fs:mkdir', async (event, dirPath: string) => {
    const canon = security.resolvePathInsideWorkspace(dirPath, event);
    if (!canon) return false;
    try { fs.mkdirSync(canon, { recursive: true }); return true; }
    catch (err) { if (isEnoent(err)) return false; throw err; }
  }, false);

  // fs:delete retries around the watcher (a watched dir may be locked while the
  // chokidar handle is open). rmSync failures here are expected — preserve the
  // retry dance exactly; only unexpected escapes reach the wrapper.
  withHandlerLogging('fs:delete', async (event, targetPath: string) => {
    const canon = security.resolvePathInsideWorkspace(targetPath, event);
    if (!canon) return false;
    let watcherStopped = false;
    try { fs.rmSync(canon, { recursive: true, force: true }); return true; } catch {}
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (isWatching()) { await stopWatching(); watcherStopped = true; }
        await new Promise(r => setTimeout(r, 500 + attempt * 300));
        try { fs.rmSync(canon, { recursive: true, force: true }); return true; } catch { /* retry */ }
      }
    } finally {
      if (watcherStopped && state.defaultWorkspacePath) await startWatching(state.defaultWorkspacePath);
    }
    return false;
  }, false);

  withHandlerLogging('fs:copy', async (event, src: string, dest: string) => {
    const srcCanon = security.resolvePathInsideWorkspace(src, event);
    const destCanon = security.resolvePathInsideWorkspace(dest, event);
    if (!srcCanon || !destCanon) return false;
    try { fs.cpSync(srcCanon, destCanon, { recursive: true }); return true; }
    catch (err) { if (isEnoent(err)) return false; throw err; }
  }, false);

  withHandlerLogging('fs:rename', async (event, oldPath: string, newPath: string) => {
    const oldCanon = security.resolvePathInsideWorkspace(oldPath, event);
    const newCanon = security.resolvePathInsideWorkspace(newPath, event);
    if (!oldCanon || !newCanon) return false;
    try { fs.renameSync(oldCanon, newCanon); return true; }
    catch (err) { if (isEnoent(err)) return false; throw err; }
  }, false);
}
