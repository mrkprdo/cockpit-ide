// app:* namespace — app:version is sendSync-backed.

import type { IpcMain } from 'electron';
import { app } from 'electron';
import type { IpcCtx } from './context';
import { withSyncListenerLogging } from './logging';

export function registerAppHandlers(ipcMain: IpcMain, _ctx: IpcCtx): void {
  withSyncListenerLogging('app:version', () => app.getVersion(), '');
}
