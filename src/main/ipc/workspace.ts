// workspace:* namespace — workspace selection/loading/save + the recent list
// (refactor.md §A.4). Trust model: a renderer-supplied wsPath must already be
// trusted (OS dialog, CLI arg, or a path persisted from a prior session) —
// workspace:setPath must never widen the fs sandbox to an arbitrary string.

import * as fs from 'fs';
import * as path from 'path';
import type { IpcMain } from 'electron';
import { dialog, BrowserWindow } from 'electron';
import type { IpcCtx } from './context';
import { withHandlerLogging } from './logging';
import { logMain, notifyUser } from './logging';
import * as store from './workspace-store';
import { ideServer } from '../ide-server';

/** Parse a JSON file, returning null when it is missing or corrupt. */
function readJsonFile(file: string): unknown | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

export function registerWorkspaceHandlers(ipcMain: IpcMain, ctx: IpcCtx): void {
  const { security, state, startWatching } = ctx;

  withHandlerLogging('workspace:select', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || state.mainWindow!;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Open Workspace',
    });
    if (result.canceled || !result.filePaths.length) return null;
    const wsPath = result.filePaths[0];
    logMain('info', 'main', 'workspace selected', wsPath);
    security.trustWorkspacePath(wsPath);
    security.cockpitDir(path.join(wsPath, '.cockpit'));
    if (win) state.windowWorkspaces.set(win.id, wsPath);
    store.saveLastWorkspace(wsPath);
    store.addRecentWorkspace(wsPath);
    await startWatching(wsPath);
    ideServer.stop();
    try { await ideServer.start(wsPath); } catch (e) { console.error('ide: start failed', e); }
    return wsPath;
  }, null);

  withHandlerLogging('workspace:getPath', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && state.windowWorkspaces.has(win.id)) return state.windowWorkspaces.get(win.id)!;
    return null;
  }, null);

  withHandlerLogging('workspace:setPath', async (event, wsPath: string) => {
    // wsPath must already be trusted (came from the OS dialog, the CLI arg, or
    // a workspace persisted from a prior session) — it must never be able to
    // widen the fs sandbox to an arbitrary renderer-supplied string.
    if (!security.isTrustedWorkspacePath(wsPath)) return false;
    try { if (!fs.statSync(wsPath).isDirectory()) return false; } catch { return false; }
    logMain('info', 'main', 'workspace setPath', wsPath);
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) state.windowWorkspaces.set(win.id, wsPath);
    security.cockpitDir(path.join(wsPath, '.cockpit'));
    store.saveLastWorkspace(wsPath);
    store.addRecentWorkspace(wsPath);
    await startWatching(wsPath);
    ideServer.stop();
    try { await ideServer.start(wsPath); } catch (e) { console.error('ide: start failed', e); }
    return true;
  }, false);

  withHandlerLogging('workspace:load', (event, wsPath?: string) => {
    const targetPath = wsPath || state.defaultWorkspacePath;
    if (!targetPath) return null;
    if (wsPath && !security.isPathSafe(wsPath, event)) return null;
    const dir = path.join(targetPath, '.cockpit');
    const f = path.join(dir, 'window.json');
    const live = readJsonFile(f);
    if (live !== null) {
      logMain('debug', 'main', 'workspace loaded', targetPath);
      return live;
    }
    // Unreadable or missing. Try the previous good copy: before this existed, a
    // single bad byte reset the whole layout to defaults AND overwrote the file,
    // destroying the evidence with no signal to the user.
    const backup = readJsonFile(`${f}.bak`);
    if (backup !== null) {
      try { fs.copyFileSync(`${f}.bak`, f); } catch { /* serve the in-memory copy regardless */ }
      logMain('warn', 'main', 'window.json unreadable — restored from backup', targetPath);
      notifyUser('warn', 'Your saved layout could not be read — restored the previous backup.', event);
      return backup;
    }
    if (fs.existsSync(f)) {
      logMain('warn', 'main', 'window.json unreadable — no backup available', targetPath);
      notifyUser('error', 'Your saved layout could not be read and no backup exists. A default layout was created.', event);
    }
    return null;
  }, null);

  withHandlerLogging('workspace:save', (event, stateArg: any, wsPath?: string) => {
    const targetPath = wsPath || state.defaultWorkspacePath;
    if (!targetPath) { notifyUser('error', 'Could not save the layout: no workspace is open.', event); return false; }
    if (wsPath && !security.isPathSafe(wsPath, event)) return false;
    const dir = path.join(targetPath, '.cockpit');
    const f = path.join(dir, 'window.json');
    const tmp = `${f}.tmp`;
    try {
      security.cockpitDir(dir);
      fs.writeFileSync(tmp, JSON.stringify(stateArg, null, 2));
      // Keep the last good copy, then swap in one rename: a crash mid-write can
      // never leave a truncated window.json behind.
      try { if (fs.existsSync(f)) fs.copyFileSync(f, `${f}.bak`); } catch { /* backup is best-effort */ }
      fs.renameSync(tmp, f);
      return true;
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* ignore */ }
      logMain('error', 'main', 'workspace:save failed', e);
      notifyUser('error', 'Could not save the window layout to disk.', event);
      return false;
    }
  }, false);

  withHandlerLogging('workspace:getRecent', () => store.getRecentWorkspaces(), []);

  // Only record paths already trusted (OS dialog, CLI arg, or a path persisted
  // from a prior session) — otherwise a renderer could plant an arbitrary path
  // here, which trustWorkspacePath() then blindly trusts on the next launch,
  // widening the fs sandbox root to anything.
  withHandlerLogging('workspace:addRecent', (_event, p: string) => {
    if (!security.isTrustedWorkspacePath(p)) return;
    store.addRecentWorkspace(p);
  }, undefined);

  withHandlerLogging('workspace:removeRecent', (_event, p: string) => { store.removeRecentWorkspace(p); }, undefined);
}
