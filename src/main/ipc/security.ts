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

/** Resolve the workspace a given window is scoped to (falling back to the default). */
function scopeFor(event?: IpcMainInvokeEvent | IpcMainEvent): string | null {
  const win = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
  return (win && state.windowWorkspaces.has(win.id)) ? state.windowWorkspaces.get(win.id)! : state.defaultWorkspacePath;
}

// ─── Canonical workspace path memo ───────────────────────────────────────────
// resolvePathInsideWorkspace runs on every tree expand, spec read, diff, save
// and terminal spawn. Its `realpathSync(wsPath)` is the same answer every time
// for a given workspace, and realpath is a comparatively expensive syscall on
// Windows (junction/handle resolution). Cache it per resolved workspace path.
//
// Only the *workspace root* is memoised — the leaf / nearest-ancestor realpath
// stays per-call so a symlink swapped in between check and use is still
// resolved against on-disk reality (TOCTOU hardening). The final containment
// check keeps running on canonical paths exactly as before.
//
// TTL bounds staleness after a workspace directory is deleted and recreated at
// the same path; a workspace switch can also clear it eagerly through
// invalidateWorkspaceRealpath().
const WORKSPACE_REALPATH_TTL_MS = 5_000;
const workspaceRealpathCache = new Map<string, { real: string; at: number }>();

function workspaceRealpathKey(wsPath: string): string {
  const resolved = path.resolve(wsPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Drop the memoised canonical workspace path — all workspaces when called with
 * no argument, one entry (case-aware) otherwise. Call on a workspace switch.
 */
export function invalidateWorkspaceRealpath(wsPath?: string): void {
  if (wsPath === undefined) { workspaceRealpathCache.clear(); return; }
  workspaceRealpathCache.delete(workspaceRealpathKey(wsPath));
}

/**
 * Canonical (symlink-free) form of a workspace root, memoised; null when the
 * workspace is not materialized on disk (or realpath is unavailable).
 */
function workspaceRealpath(wsPath: string): string | null {
  const key = workspaceRealpathKey(wsPath);
  const hit = workspaceRealpathCache.get(key);
  if (hit && Date.now() - hit.at < WORKSPACE_REALPATH_TTL_MS) return hit.real;
  try {
    const real = fs.realpathSync(wsPath);
    if (typeof real !== 'string' || real.length === 0) return null;
    workspaceRealpathCache.set(key, { real, at: Date.now() });
    return real;
  } catch {
    workspaceRealpathCache.delete(key);
    return null;
  }
}

/** Case-aware containment: is `p` (resolved) inside the (resolved) workspace `ws`? */
function isWithin(ws: string, p: string): boolean {
  const sep = path.sep;
  const isWin = process.platform === 'win32';
  const a = isWin ? p.toLowerCase() : p;
  const b = isWin ? path.resolve(ws).toLowerCase() : path.resolve(ws);
  return a === b || a.startsWith(b + sep);
}

export function isPathSafe(targetPath: string, event?: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const wsPath = scopeFor(event);
  // No workspace scoped to this window yet — only allow paths already known-trusted
  // (e.g. WelcomeModal checking whether a recent workspace still exists on disk).
  if (!wsPath) return isTrustedWorkspacePath(targetPath);
  const resolved = path.resolve(targetPath);
  if (!isWithin(wsPath, resolved)) return false;
  try {
    const real = fs.realpathSync(resolved);
    if (!isWithin(wsPath, real)) return false;
  } catch { }
  return true;
}

/**
 * Resolve a path to its canonical (symlink-free) form at call time and verify
 * the result still lives inside the window's workspace. Unlike isPathSafe —
 * which validates the caller-supplied string and swallows realpath failures —
 * this walks up to the nearest existing ancestor, realpaths THAT, re-joins the
 * not-yet-existing tail, and re-checks containment on the canonical result.
 *
 * Mutating fs:* handlers use this instead of isPathSafe so a symlink swapped
 * in between check and write (TOCTOU) is resolved against on-disk reality, not
 * the stale caller string.
 *
 * When the workspace itself is not yet materialized on disk (no realpath
 * available — e.g. a fresh path from the folder picker, or a mocked fs in
 * tests), it falls back to the same string-containment check isPathSafe uses:
 * there is no on-disk tree to symlink-escape through until the workspace
 * exists, and the original path string is returned so callers keep operating
 * on exactly what they were given.
 *
 * Returns null when the path is outside the sandbox or unresolvable (e.g. the
 * filesystem root).
 */
export function resolvePathInsideWorkspace(targetPath: string, event?: IpcMainInvokeEvent | IpcMainEvent): string | null {
  const wsPath = scopeFor(event);
  const resolved = path.resolve(targetPath);
  if (!wsPath) {
    // No workspace scoped to this window yet — trusted paths only (same rule as isPathSafe).
    return isTrustedWorkspacePath(resolved) ? targetPath : null;
  }
  // Workspace not materialized yet → string-containment only; pass the caller's
  // original string through (old isPathSafe semantics).
  const wsReal = workspaceRealpath(wsPath);
  if (wsReal === null) {
    return isWithin(wsPath, resolved) ? targetPath : null;
  }
  // Workspace exists on disk: walk up to the nearest existing ancestor so a
  // not-yet-created leaf (a new file or dir being written) still resolves
  // through real symlink chains, then re-verify containment on the canonical
  // result and return it (TOCTOU hardening).
  let cur = resolved;
  const tail: string[] = [];
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) return null; // hit the filesystem root — unresolvable
    tail.unshift(path.basename(cur));
    cur = parent;
  }
  let real: string;
  try { real = fs.realpathSync(cur); } catch { return null; }
  const canon = tail.length > 0 ? path.join(real, ...tail) : real;
  return isWithin(wsReal, canon) ? canon : null;
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
