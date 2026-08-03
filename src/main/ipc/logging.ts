// Main-process failure logging + the three registration wrappers used by every
// IPC namespace file instead of raw ipcMain.* (refactor.md §B.4).
//
// Rules this module enforces:
// - logging only — a wrapper never changes a handler's resolve/reject contract
//   or return-value shape (no rethrow, ever)
// - pushMainFailure targets the *correct* window via event.sender, not the
//   module-level mainWindow singleton (this app supports multiple windows)
// - best-effort: a destroyed webContents makes .send() throw; the push must
//   never be what breaks the "no rethrow, ever" rule above

import * as fs from 'fs';
import * as path from 'path';
import { app, BrowserWindow, ipcMain } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import type { FailureSignalKind } from '../../shared/health-types';
import type { LogLevel, LogSignal } from '../../shared/log-types';

/** Shared stringification for logFatal + pushMainFailure. */
export function formatError(err: unknown): string {
  return err instanceof Error ? (err.stack || err.message) : String(err);
}

/** crash.log writer — kept here (not duplicated per namespace) so uncaught
 *  exceptions and IPC handler errors share one vocabulary. */
export function logFatal(kind: string, err: unknown): void {
  console.error(kind, err);
  try {
    const line = `${new Date().toISOString()} [${kind}] ${formatError(err)}\n`;
    fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), line);
  } catch { /* best effort */ }
}

export function pushMainFailure(event: IpcMainEvent | IpcMainInvokeEvent, kind: FailureSignalKind, err: unknown): void {
  logFatal(kind, err);
  try {
    BrowserWindow.fromWebContents(event.sender)?.webContents.send(
      'health:mainFailure', { kind, message: formatError(err) },
    );
  } catch { /* best effort, same as logFatal's own crash.log write */ }
}

/**
 * Structured operational logging from main. Writes to the main console and
 * pushes the line to every live window (log:push) so it shows up in the dev
 * console's unified stream — main-process activity is otherwise invisible to
 * the renderer. Best-effort: a window that died mid-push must never throw here.
 */
export function logMain(level: LogLevel, source: string, ...args: unknown[]): void {
  const message = args.map(a => (a instanceof Error ? (a.stack || a.message) : String(a))).join(' ');
  try {
    const fn = ({ debug: console.debug, info: console.info, log: console.log, warn: console.warn, error: console.error })[level];
    fn(`[${source}]`, ...args);
  } catch { /* best effort */ }
  const sig: LogSignal = { source, level, message, at: Date.now() };
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('log:push', sig);
    }
  } catch { /* best effort */ }
}

// ipcMain.handle (promise-returning) — preserves the exact fallback the
// original handler used; never rethrows, never changes what the renderer sees.
export function withHandlerLogging<T>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<T> | T,
  fallback: T,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try { return await fn(event, ...args); }
    catch (err) { pushMainFailure(event, 'ipc.handler-error', err); return fallback; }
  });
}

// ipcMain.on, fire-and-forget (ipcRenderer.send) — nothing to reject, just logs.
export function withListenerLogging(
  channel: string,
  fn: (event: IpcMainEvent, ...args: any[]) => void,
): void {
  ipcMain.on(channel, (event, ...args) => {
    try { fn(event, ...args); }
    catch (err) { pushMainFailure(event, 'ipc.handler-error', err); }
  });
}

// ipcMain.on, sendSync-backed (ipcRenderer.sendSync) — MUST set event.returnValue
// even on the catch path, or the renderer's blocking call resolves to undefined
// instead of the fallback it used to get.
export function withSyncListenerLogging<T>(
  channel: string,
  fn: (event: IpcMainEvent, ...args: any[]) => T,
  fallback: T,
): void {
  ipcMain.on(channel, (event, ...args) => {
    try { event.returnValue = fn(event, ...args); }
    catch (err) { pushMainFailure(event, 'ipc.handler-error', err); event.returnValue = fallback; }
  });
}
