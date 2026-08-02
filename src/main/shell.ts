import { spawn } from 'child_process';

export interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  input?: string;
}

export interface ExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

const MAX_OUTPUT = 1024 * 1024; // 1 MB cap per stream
const DEFAULT_TIMEOUT = 30_000;

/**
 * Run a shell command and capture stdout/stderr + exit code.
 *
 * This is the hook command runner (Claude-Code-style). Unlike the git helpers
 * (which use execFile and never touch a shell), hooks need real shell semantics:
 * `cmd.exe /C` on Windows, `/bin/bash -c` on POSIX.
 *
 * The whole `command` string is supplied by the renderer (the fleet's hook
 * definitions) — the same trust model as `write_to_terminal`, which can already
 * run arbitrary commands in the workspace terminal. The caller applies the
 * workspace path gate to `cwd` before calling.
 */
export function runShellCommand(command: string, opts: ExecOptions = {}): Promise<ExecResult> {
  return new Promise<ExecResult>((resolve) => {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
    const shell = process.platform === 'win32'
      ? { file: process.env.ComSpec || 'cmd.exe', arg: '/C' }
      : { file: '/bin/bash', arg: '-c' };

    let child;
    try {
      child = spawn(shell.file, [shell.arg, command], {
        cwd: opts.cwd,
        windowsHide: true,
        env: { ...process.env },
      });
    } catch (err: any) {
      resolve({ exitCode: -1, stdout: '', stderr: `failed to spawn shell: ${err?.message || String(err)}` });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const killTimer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch {}
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      stdout = appendCapped(stdout, d.toString(), MAX_OUTPUT);
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr = appendCapped(stderr, d.toString(), MAX_OUTPUT);
    });

    child.on('error', (err: Error) => {
      clearTimeout(killTimer);
      resolve({ exitCode: -1, stdout, stderr: `${stderr}\nspawn error: ${err.message}`.trim() });
    });

    child.on('close', (code: number | null) => {
      clearTimeout(killTimer);
      if (timedOut) {
        stderr = `${stderr}\n[hook timed out after ${timeoutMs}ms]`.trim();
      }
      resolve({ exitCode: code, stdout, stderr });
    });

    // Pipe the hook payload (JSON) on stdin, then close it so the child can exit.
    if (opts.input) {
      try {
        child.stdin?.write(opts.input);
      } catch {}
    }
    try {
      child.stdin?.end();
    } catch {}
  });
}

function appendCapped(buf: string, chunk: string, cap: number): string {
  if (buf.length >= cap) return buf;
  const next = buf + chunk;
  return next.length > cap ? next.slice(0, cap) : next;
}
