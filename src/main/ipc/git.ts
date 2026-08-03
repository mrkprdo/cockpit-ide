// git:* namespace — 16 execFile-backed git operations (refactor.md §A.4).
// execFile never invokes a shell, so these are immune to shell-metacharacter
// injection — but a ref/path starting with '-' can still be parsed by git
// itself as a flag rather than a positional arg. Reject that shape outright.

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { IpcMain } from 'electron';
import type { IpcCtx } from './context';
import { withHandlerLogging } from './logging';

function isSafeGitArg(s: string): boolean {
  return typeof s === 'string' && s.length > 0 && !s.startsWith('-');
}

function runGit<T>(repoPath: string, args: string[], resolve: (v: T) => void, fallback: T, onSuccess: (stdout: string) => void): void {
  execFile('git', args, { cwd: repoPath, maxBuffer: 1024 * 1024 }, (err, stdout, _stderr) => {
    if (err) { resolve(fallback); return; }
    onSuccess(stdout);
  });
}

export function registerGitHandlers(ipcMain: IpcMain, ctx: IpcCtx): void {
  const { security } = ctx;

  withHandlerLogging('git:remotes', async (event, repoPath: string) => {
    if (!security.isPathSafe(repoPath, event)) return [];
    return new Promise<{ name: string; url: string }[]>(resolve => {
      runGit(repoPath, ['remote', '-v'], resolve, [], (stdout) => {
        const remotes: { name: string; url: string }[] = [];
        const seen = new Set<string>();
        for (const line of stdout.trim().split('\n').filter(Boolean)) {
          const [name, url] = line.split('\t');
          if (!seen.has(name)) {
            seen.add(name);
            remotes.push({ name, url: (url || '').replace(/\s+\(.*\)$/, '') });
          }
        }
        resolve(remotes);
      });
    });
  }, []);

  withHandlerLogging('git:branches', async (event, repoPath: string) => {
    if (!security.isPathSafe(repoPath, event)) return [];
    return new Promise<{ name: string; current: boolean; isRemote: boolean }[]>(resolve => {
      runGit(repoPath, ['branch', '-a'], resolve, [], (stdout) => {
        const branches = stdout.trim().split('\n').filter(Boolean).map(line => {
          const current = line.startsWith('*');
          const name = line.replace(/^\*\s*/, '').trim();
          return { name, current, isRemote: name.startsWith('remotes/') };
        });
        resolve(branches);
      });
    });
  }, []);

  withHandlerLogging('git:checkout', async (event, repoPath: string, branch: string) => {
    if (!security.isPathSafe(repoPath, event) || !isSafeGitArg(branch)) return { ok: false, error: 'Invalid branch name' };
    return new Promise<{ ok: boolean; error?: string }>(resolve => {
      execFile('git', ['checkout', branch], { cwd: repoPath }, (err, _stdout, stderr) => {
        resolve({ ok: !err, error: err ? String(stderr || err.message).trim() : '' });
      });
    });
  }, { ok: false, error: 'Invalid branch name' });

  withHandlerLogging('git:log', async (event, repoPath: string, maxCount: number = 50) => {
    if (!security.isPathSafe(repoPath, event)) return [];
    return new Promise<{ hash: string; author: string; date: string; message: string }[]>(resolve => {
      runGit(repoPath, ['log', `--max-count=${maxCount}`, '--format=%H|%an|%ai|%s', '--', '.'], resolve, [], (stdout) => {
        const commits = stdout.trim().split('\n').filter(Boolean).map(line => {
          const [hash, author, date, ...msgParts] = line.split('|');
          return { hash, author, date: date || '', message: msgParts.join('|') || '' };
        });
        resolve(commits);
      });
    });
  }, []);

  withHandlerLogging('git:showTree', async (event, repoPath: string, commit: string) => {
    if (!security.isPathSafe(repoPath, event) || !isSafeGitArg(commit)) return [];
    return new Promise<{ status: string; path: string }[]>(resolve => {
      runGit(repoPath, ['diff-tree', '--no-commit-id', '-r', '--name-status', '--root', commit], resolve, [], (stdout) => {
        const files = stdout.trim().split('\n').filter(Boolean).map(line => {
          const [rawStatus, ...nameParts] = line.split('\t');
          const status = rawStatus.replace(/[^A-Z]/g, '') || '?';
          return { status, path: nameParts.join('\t') };
        });
        resolve(files);
      });
    });
  }, []);

  withHandlerLogging('git:diff', async (event, repoPath: string, commit: string, filePath?: string) => {
    if (!security.isPathSafe(repoPath, event) || !isSafeGitArg(commit)) return '';
    return new Promise<string>(resolve => {
      const args = ['show', '--no-color', commit];
      if (filePath) args.push('--', filePath);
      execFile('git', args, { cwd: repoPath, maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) { resolve(''); return; }
        const idx = stdout.indexOf('diff --git');
        resolve(idx >= 0 ? stdout.substring(idx) : stdout);
      });
    });
  }, '');

  withHandlerLogging('git:currentBranch', async (event, repoPath: string) => {
    if (!security.isPathSafe(repoPath, event)) return '';
    return new Promise<string>(resolve => {
      execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath }, (err, stdout) => {
        if (err) { resolve(''); return; }
        resolve(stdout.trim());
      });
    });
  }, '');

  withHandlerLogging('git:stagedFiles', async (event, repoPath: string) => {
    if (!security.isPathSafe(repoPath, event)) return [];
    return new Promise<{ status: string; path: string }[]>(resolve => {
      runGit(repoPath, ['diff', '--cached', '--name-status'], resolve, [], (stdout) => {
        const files = stdout.trim().split('\n').filter(Boolean).map(line => {
          const [status, ...nameParts] = line.split('\t');
          return { status: status || '?', path: nameParts.join('\t') };
        });
        resolve(files);
      });
    });
  }, []);

  withHandlerLogging('git:unstagedFiles', async (event, repoPath: string) => {
    if (!security.isPathSafe(repoPath, event)) return [];
    return new Promise<{ status: string; path: string }[]>(resolve => {
      runGit(repoPath, ['status', '--porcelain'], resolve, [], (stdout) => {
        const files = stdout.trim().split('\n').filter(Boolean).reduce((acc: { status: string; path: string }[], line: string) => {
          const xy = line.substring(0, 2);
          const path = line.substring(3).trim();
          // xy[1] is working-tree status — include if changed or untracked
          if (xy[1] !== ' ') {
            acc.push({ status: xy.trim() || '?', path });
          }
          return acc;
        }, []);
        resolve(files);
      });
    });
  }, []);

  withHandlerLogging('git:stagedDiff', async (event, repoPath: string, filePath: string) => {
    if (!security.isPathSafe(repoPath, event)) return '';
    return new Promise<string>(resolve => {
      execFile('git', ['diff', '--cached', '--', filePath], { cwd: repoPath, maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) { resolve(''); return; }
        resolve(stdout);
      });
    });
  }, '');

  withHandlerLogging('git:unstagedDiff', async (event, repoPath: string, filePath: string) => {
    if (!security.isPathSafe(repoPath, event)) return '';
    return new Promise<string>(resolve => {
      execFile('git', ['diff', '--', filePath], { cwd: repoPath, maxBuffer: 1024 * 1024 }, (err, stdout) => {
        if (err) { resolve(''); return; }
        if (stdout.trim()) { resolve(stdout); return; }
        // Empty diff — file may be untracked (new). Check and show full content as addition.
        execFile('git', ['ls-files', '--error-unmatch', filePath], { cwd: repoPath }, (lsErr) => {
          if (lsErr) {
            // File is untracked — read it and build a new-file diff
            const fullPath = path.resolve(repoPath, filePath);
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');
              const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
              const safePath = filePath.replace(/\\/g, '/');
              let diff =
                'diff --git a/' + safePath + ' b/' + safePath + '\n' +
                'new file mode 100644\n' +
                'index 0000000..0000000\n' +
                '--- /dev/null\n' +
                '+++ b/' + safePath + '\n' +
                '@@ -0,0 +1,' + lineCount + ' @@\n';
              diff += lines
                .filter((_, i) => !(i === lines.length - 1 && lines[i] === ''))
                .map(l => '+' + l)
                .join('\n');
              resolve(diff);
            } catch { resolve(''); }
          } else {
            resolve('');
          }
        });
      });
    });
  }, '');

  withHandlerLogging('git:commitBody', async (event, repoPath: string, commit: string) => {
    if (!security.isPathSafe(repoPath, event) || !isSafeGitArg(commit)) return '';
    return new Promise<string>(resolve => {
      execFile('git', ['log', '-1', '--format=%B', commit], { cwd: repoPath }, (err, stdout) => {
        if (err) { resolve(''); return; }
        resolve(stdout);
      });
    });
  }, '');

  withHandlerLogging('git:stage', async (event, repoPath: string, filePath: string) => {
    if (!security.isPathSafe(repoPath, event)) return false;
    return new Promise<boolean>(resolve => {
      execFile('git', ['add', '--', filePath], { cwd: repoPath }, (err) => {
        resolve(!err);
      });
    });
  }, false);

  withHandlerLogging('git:unstage', async (event, repoPath: string, filePath: string) => {
    if (!security.isPathSafe(repoPath, event)) return false;
    return new Promise<boolean>(resolve => {
      execFile('git', ['restore', '--staged', '--', filePath], { cwd: repoPath }, (err) => {
        resolve(!err);
      });
    });
  }, false);

  withHandlerLogging('git:commit', async (event, repoPath: string, message: string) => {
    if (!security.isPathSafe(repoPath, event)) return { ok: false, error: 'Invalid workspace path' };
    return new Promise<{ ok: boolean; error?: string }>(resolve => {
      execFile('git', ['commit', '-m', message], { cwd: repoPath }, (err, stdout, stderr) => {
        resolve({ ok: !err, error: err ? String(stderr || stdout || err.message).trim() : '' });
      });
    });
  }, { ok: false, error: 'Invalid workspace path' });

  withHandlerLogging('git:push', async (event, repoPath: string) => {
    if (!security.isPathSafe(repoPath, event)) return { ok: false, error: 'Invalid workspace path' };
    return new Promise<{ ok: boolean; error?: string }>(resolve => {
      execFile('git', ['push'], { cwd: repoPath, maxBuffer: 1024 * 1024 }, (err, _stdout, stderr) => {
        resolve({ ok: !err, error: err ? String(stderr || err.message).trim() : '' });
      });
    });
  }, { ok: false, error: 'Invalid workspace path' });

  withHandlerLogging('git:checkAhead', async (event, repoPath: string) => {
    if (!security.isPathSafe(repoPath, event)) return 0;
    return new Promise<number>(resolve => {
      execFile('git', ['rev-list', '--count', '@{u}..HEAD'], { cwd: repoPath }, (err, stdout) => {
        if (err) { resolve(0); return; }
        resolve(parseInt(stdout.trim(), 10) || 0);
      });
    });
  }, 0);
}
