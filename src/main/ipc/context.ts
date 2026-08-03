// Shared context passed to every IPC namespace registrar (refactor.md §A.4).
// The three wrappers in logging.ts are used in place of raw ipcMain.* so a
// handler error is logged and pushed to the originating window.
//
// The IpcCtx shape now lives in ipc-types.ts (pure structural types) so
// file.ts can name it without importing this module — that was the last
// file ↔ context import cycle. This module re-exports for the other
// namespaces that import IpcCtx from './context'.

export type { IpcCtx, RegisterHandlers, WorkspaceWatchers } from './ipc-types';
