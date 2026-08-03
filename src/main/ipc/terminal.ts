// terminal:* namespace — multi-session node-pty PTYs (refactor.md §A.4).
// Shared per-pty maps live in state.ts; env whitelist comes from security.ts.
// PTY exit logging (terminal.pty-exit) is wired in phase 7.

import * as fs from 'fs';
import type { IpcMain } from 'electron';
import type { IpcCtx } from './context';
import { withHandlerLogging, withListenerLogging, logFatal } from './logging';

// Reference-counted stderr suppression around the node-pty dynamic import (it
// prints native-binding noise on load). Concurrent terminal:create calls each
// suppress/restore in turn without one call's restore clobbering another's.
let stderrSuppressDepth = 0;
let origStderrWrite: typeof process.stderr.write | null = null;

function suppressStderr(): void {
  if (stderrSuppressDepth++ === 0) {
    origStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = () => true;
  }
}

function restoreStderr(): void {
  if (--stderrSuppressDepth === 0 && origStderrWrite) {
    process.stderr.write = origStderrWrite;
    origStderrWrite = null;
  }
}

export function registerTerminalHandlers(ipcMain: IpcMain, ctx: IpcCtx): void {
  const { security, state } = ctx;

  withHandlerLogging('terminal:create', async (event, uuid: string, cwd?: string) => {
    let nodePty: any;
    suppressStderr();
    try {
      nodePty = await import('node-pty');
    } catch { return false; } finally {
      restoreStderr();
    }
    const plat = process.platform;
    let shell: string;
    if (plat === 'win32') {
      shell = process.env.COMSPEC || 'cmd.exe';
    } else if (plat === 'darwin') {
      shell = process.env.SHELL || '/bin/zsh';
    } else {
      shell = process.env.SHELL || '/bin/bash';
    }
    const home = process.env.USERPROFILE || process.env.HOME || '/tmp';
    let resolvedCwd = cwd || home;
    if (resolvedCwd) {
      try {
        if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
          resolvedCwd = home;
        }
      } catch { resolvedCwd = home; }
    }
    let pty: any;
    try {
      pty = nodePty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: resolvedCwd,
        env: security.filterEnv(),
      });
    } catch { return false; }

    const sender = event.sender;
    state.terminalSenders.set(uuid, sender);

    pty.onData((data: string) => {
      if (!sender.isDestroyed()) {
        sender.send('terminal:data', uuid, data);
      }
    });

    pty.onExit(() => {
      // terminal.pty-exit (refactor.md §B.4): a PTY still registered here when
      // onExit fires was NOT deliberately killed (terminal:kill deletes the map
      // entry first) — that's an unexpected death worth logging. Deliberate
      // kills leave the map empty, so has(uuid) is false and nothing is logged.
      if (state.ptyProcesses.has(uuid)) {
        logFatal('terminal.pty-exit', new Error(`PTY ${uuid} exited unexpectedly`));
        try {
          if (!sender.isDestroyed()) {
            sender.send('health:mainFailure', { kind: 'terminal.pty-exit', message: `PTY ${uuid} exited unexpectedly` });
          }
        } catch { /* best effort */ }
      }
      if (!sender.isDestroyed()) {
        sender.send('terminal:exit', uuid);
      }
      state.ptyProcesses.delete(uuid);
      state.terminalSenders.delete(uuid);
    });

    state.ptyProcesses.set(uuid, pty);
    return true;
  }, false);

  withListenerLogging('terminal:write', (event, uuid: string, data: string) => {
    if (state.terminalSenders.get(uuid) !== event.sender) return;
    state.ptyProcesses.get(uuid)?.write(data);
  });

  withListenerLogging('terminal:resize', (event, uuid: string, cols: number, rows: number) => {
    if (state.terminalSenders.get(uuid) !== event.sender) return;
    state.ptyProcesses.get(uuid)?.resize(cols, rows);
  });

  withListenerLogging('terminal:kill', (event, uuid: string) => {
    if (state.terminalSenders.get(uuid) !== event.sender) return;
    const pty = state.ptyProcesses.get(uuid);
    if (pty) { pty.kill(); state.ptyProcesses.delete(uuid); }
    state.terminalSenders.delete(uuid);
  });
}
