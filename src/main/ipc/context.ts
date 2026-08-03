// Shared context passed to every IPC namespace registrar (refactor.md §A.4).
// The three wrappers in logging.ts are used in place of raw ipcMain.* so a
// handler error is logged and pushed to the originating window.

import type { IpcMain } from 'electron';
import type * as security from './security';
import type { state } from './state';
import type { startWatching, stopWatching } from './file';

export interface IpcCtx {
  security: typeof security;
  state: typeof state;
  startWatching: typeof startWatching;
  stopWatching: typeof stopWatching;
  /** main.ts-owned window factory for `window:new`. */
  onNewWindow: () => void;
}

export type RegisterHandlers = (ipcMain: IpcMain, ctx: IpcCtx) => void;
