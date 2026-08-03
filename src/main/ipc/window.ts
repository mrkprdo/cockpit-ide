// window:* namespace — BrowserWindow lifecycle commands. window:new delegates
// to the main.ts-owned factory (passed in via ctx.onNewWindow) to avoid a
// module cycle — window.ts can't import main.ts.

import type { IpcMain } from 'electron';
import { BrowserWindow } from 'electron';
import type { IpcCtx } from './context';
import { withHandlerLogging, withListenerLogging } from './logging';

export function registerWindowHandlers(ipcMain: IpcMain, ctx: IpcCtx): void {
  withHandlerLogging('window:new', async () => {
    ctx.onNewWindow();
    return true;
  }, false);

  withListenerLogging('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  withListenerLogging('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  });

  withListenerLogging('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  withHandlerLogging('window:isMaximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  }, false);

  withListenerLogging('window:reload', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    // Must reload from main: renderer-initiated location.reload() is blocked by
    // the will-navigate preventDefault guard in createWindow().
    win?.webContents.reload();
  });
}
