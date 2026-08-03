// diagnostics:* namespace — renderer error forwarding into crash.log.

import type { IpcMain } from 'electron';
import type { IpcCtx } from './context';
import { logFatal, withListenerLogging } from './logging';

export function registerDiagnosticsHandlers(ipcMain: IpcMain, _ctx: IpcCtx): void {
  // Fatal JS errors in the renderer (window.onerror / unhandledrejection) have
  // no console once packaged — forward them here so they land in crash.log too.
  withListenerLogging('diagnostics:rendererError', (_event, kind: string, message: string) => {
    logFatal(`renderer:${kind}`, message);
  });
}
