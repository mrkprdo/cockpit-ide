// clipboard:* namespace — readText is sendSync-backed, writeText is invoke-backed.

import type { IpcMain } from 'electron';
import { clipboard } from 'electron';
import type { IpcCtx } from './context';
import { withHandlerLogging, withSyncListenerLogging } from './logging';

export function registerClipboardHandlers(ipcMain: IpcMain, _ctx: IpcCtx): void {
  withSyncListenerLogging('clipboard:readText', () => clipboard.readText(), '');
  withHandlerLogging('clipboard:writeText', (_event, text: string) => { clipboard.writeText(text); }, undefined);
}
