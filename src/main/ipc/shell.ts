// shell:* namespace — external links (protocol-restricted) and the agent hook
// command runner.

import type { IpcMain } from 'electron';
import { BrowserWindow, shell } from 'electron';
import * as fs from 'fs';
import type { IpcCtx } from './context';
import { withHandlerLogging } from './logging';
import { runShellCommand } from '../shell';
import { isMediaPath } from '../../shared/media';

export function registerShellHandlers(ipcMain: IpcMain, ctx: IpcCtx): void {
  withHandlerLogging('shell:openExternal', async (_event, url: string) => {
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return false;
      await shell.openExternal(url);
      return true;
    } catch { return false; }
  }, false);

  // Hand a file to the OS default app. Only media paths (the same set the
  // Explorer routes to a viewer tab) qualify: this must never become a generic
  // "execute this path" bridge for the renderer.
  withHandlerLogging('shell:openPath', async (event, filePath: string) => {
    if (typeof filePath !== 'string' || !isMediaPath(filePath)) return false;
    if (!ctx.security.isPathSafe(filePath, event)) return false;
    const error = await shell.openPath(filePath);
    return error === '';
  }, false);

  // Reveal a workspace item in the OS file manager. Files open their containing
  // folder with the item selected; folders open themselves. Both paths go
  // through the same workspace sandbox as every other fs-facing bridge.
  withHandlerLogging('shell:openInExplorer', async (event, targetPath: string) => {
    if (typeof targetPath !== 'string') return false;
    const canon = ctx.security.resolvePathInsideWorkspace(targetPath, event);
    if (!canon) return false;
    try {
      const stat = await fs.promises.stat(canon);
      if (stat.isDirectory()) {
        const error = await shell.openPath(canon);
        return error === '';
      }
      shell.showItemInFolder(canon);
      return true;
    } catch { return false; }
  }, false);

  // Hook command runner (PreToolUse/PostToolUse/SubagentStart/Stop). The renderer
  // supplies the whole command string — same trust model as terminal:create. The
  // workspace path gate applies to cwd so a hook can't reach outside the sandbox,
  // and cwd DEFAULTS to the window's workspace: hooks used to pass no cwd at all,
  // which inherited the app's own working directory and skipped the gate entirely.
  withHandlerLogging('shell:exec', async (event, opts: { command?: string; cwd?: string; timeoutMs?: number; input?: string }) => {
    if (!opts || typeof opts.command !== 'string' || !opts.command.trim()) {
      return { exitCode: -1, stdout: '', stderr: 'shell:exec: command is required' };
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const wsPath = (win && ctx.state.windowWorkspaces.get(win.id)) || ctx.state.defaultWorkspacePath;
    if (!wsPath) {
      return { exitCode: -1, stdout: '', stderr: 'shell:exec: no workspace is open' };
    }
    const cwd = opts.cwd && opts.cwd.trim() ? opts.cwd : wsPath;
    if (!ctx.security.isPathSafe(cwd, event)) {
      return { exitCode: -1, stdout: '', stderr: 'shell:exec: cwd outside the workspace sandbox' };
    }
    return runShellCommand(opts.command, {
      cwd,
      timeoutMs: typeof opts.timeoutMs === 'number' ? opts.timeoutMs : undefined,
      input: typeof opts.input === 'string' ? opts.input : undefined,
    });
  }, { exitCode: -1, stdout: '', stderr: 'shell:exec: handler error' });
}
