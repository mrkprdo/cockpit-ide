// Shared IPC registrar context (refactor.md §A.4). Breaking the file ↔ context
// cycle: the watcher functions and the context shape are declared here as
// structural types, so neither context.ts nor file.ts needs to import the
// other to name them. ipc-types.ts itself imports only security.ts (→ state.ts)
// and state.ts — a strictly acyclic type graph.

import type { IpcMain } from 'electron';
import type * as security from './security';
import type { state } from './state';

/** Structural type for the workspace file watcher pair implemented in file.ts. */
export interface WorkspaceWatchers {
  startWatching(dir: string): Promise<void>;
  stopWatching(): Promise<void>;
}

/** Shared context passed to every IPC namespace registrar. */
export interface IpcCtx extends WorkspaceWatchers {
  security: typeof security;
  state: typeof state;
  /** main.ts-owned window factory for `window:new`. */
  onNewWindow: () => void;
}

export type RegisterHandlers = (ipcMain: IpcMain, ctx: IpcCtx) => void;
