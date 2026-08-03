// ide:* namespace — editor-state feed into the WebSocket ide server, plus the
// status probe used by the AI drawer and the open-file fan-out to all windows.

import type { IpcMain } from 'electron';
import { BrowserWindow } from 'electron';
import type { IpcCtx } from './context';
import { withHandlerLogging, withListenerLogging } from './logging';
import { ideServer } from '../ide-server';

export function registerIdeHandlers(ipcMain: IpcMain, ctx: IpcCtx): void {
  ideServer.onOpenFile = (filePath) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('ide:openFile', filePath);
    }
  };

  withListenerLogging('ide:editorState', (_event, state: any) => {
    ideServer.updateEditorState(state);
  });

  withHandlerLogging('ide:status', () => ({
    running: ideServer.getPort() > 0,
    port: ideServer.getPort(),
    workspace: ctx.state.defaultWorkspacePath,
    lockPaths: ideServer.getLockPaths(),
  }), { running: false, port: 0, workspace: null, lockPaths: [] });
}
