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
import * as store from './workspace-store';
import { ideServer } from '../ide-server';

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
    const f = path.join(targetPath, '.cockpit', 'window.json');
    try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return null; }
  }, null);

  withHandlerLogging('workspace:save', (event, stateArg: any, wsPath?: string) => {
    const targetPath = wsPath || state.defaultWorkspacePath;
    if (!targetPath) { console.error('workspace:save — no workspacePath'); return false; }
    if (wsPath && !security.isPathSafe(wsPath, event)) return false;
    const dir = path.join(targetPath, '.cockpit');
    try {
      security.cockpitDir(dir);
      fs.writeFileSync(path.join(dir, 'window.json'), JSON.stringify(stateArg, null, 2));
      return true;
    } catch (e) { console.error('workspace:save error', e); return false; }
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
