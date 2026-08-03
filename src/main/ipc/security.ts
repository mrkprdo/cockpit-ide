// Path + environment security shared by fs/file/git/terminal/workspace
// handlers (refactor.md §A.4). Imports state.ts (windowWorkspaces,
// defaultWorkspacePath) to resolve which workspace a given window is scoped to
// before checking a path against it — state.ts itself imports nothing, so the
// dependency direction is one-way: security → state.

import * as fs from 'fs';
import * as path from 'path';
import { app, BrowserWindow } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { state } from './state';

export const ALLOWED_ENV_KEYS = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'SHELL', 'COMSPEC',
  'TEMP', 'TMP', 'HOMEDRIVE', 'HOMEPATH',
  'USERNAME', 'COMPUTERNAME', 'TERM', 'TERMINFO',
  'LC_ALL', 'LANG', 'LC_CTYPE',
  'PATHEXT', 'PROMPT', 'PS1',
  'APPDATA',   'LOCALAPPDATA', 'ProgramFiles', 'SystemRoot',
  'NODE_PATH', 'npm_config_user_agent',
  'OPENCODE_EDITOR_SSE_PORT', 'OPENCODE_MCP_PORT',
]);

/** Ensure a directory exists (workspace .cockpit, memory dirs, etc.). */
export function cockpitDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Paths a renderer is allowed to hand to workspace:setPath, or to read via fs:*
// before any per-window workspace has been assigned. Populated only from
// sources the renderer can't forge on its own: the OS folder-picker dialog
// (workspace:select), the CLI arg resolved from argv, and the workspace list
// already persisted to disk at startup. Never populated from an IPC argument
// the renderer controls directly.
const trustedWorkspacePaths = new Set<string>();

function trustKey(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function trustWorkspacePath(p: string): void {
  trustedWorkspacePaths.add(trustKey(p));
}

export function isTrustedWorkspacePath(p: string): boolean {
  try { return trustedWorkspacePaths.has(trustKey(p)); } catch { return false; }
}

export function isPathSafe(targetPath: string, event?: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const win = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
  const wsPath = (win && state.windowWorkspaces.has(win.id)) ? state.windowWorkspaces.get(win.id)! : state.defaultWorkspacePath;
  // No workspace scoped to this window yet — only allow paths already known-trusted
  // (e.g. WelcomeModal checking whether a recent workspace still exists on disk).
  if (!wsPath) return isTrustedWorkspacePath(targetPath);
  const resolved = path.resolve(targetPath);
  const ws = path.resolve(wsPath);
  const sep = path.sep;
  const isWin = process.platform === 'win32';
  const a = isWin ? resolved.toLowerCase() : resolved;
  const b = isWin ? ws.toLowerCase() : ws;
  if (!a.startsWith(b + sep) && a !== b) return false;
  try {
    const real = fs.realpathSync(resolved);
    const c = isWin ? real.toLowerCase() : real;
    if (!c.startsWith(b + sep) && c !== b) return false;
  } catch { }
  return true;
}

/** Environment whitelist for spawned shells (terminal:create). */
export function filterEnv(): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of ALLOWED_ENV_KEYS) {
    if (process.env[key]) safe[key] = process.env[key]!;
  }
  return safe;
}

export function resolveCliWorkspace(): string | null {
  const userArgs = app.isPackaged ? process.argv.slice(1) : process.argv.slice(2);
  for (const arg of userArgs) {
    if (arg.startsWith('-')) continue;
    try {
      const resolved = path.resolve(arg);
      if (fs.statSync(resolved).isDirectory()) return resolved;
    } catch {}
  }
  return null;
}
