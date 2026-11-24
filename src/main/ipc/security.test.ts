import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

const fsState = vi.hoisted(() => ({
  realpathCalls: [] as string[],
  exists: new Set<string>(),
  /** path → realpath override (symlink simulation). */
  realpaths: new Map<string, string>(),
  failRealpath: new Set<string>(),
}));

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/mock/userdata') },
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
}));

vi.mock('fs', () => ({
  existsSync: vi.fn((p: string) => fsState.exists.has(p)),
  realpathSync: vi.fn((p: string) => {
    fsState.realpathCalls.push(p);
    if (fsState.failRealpath.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return fsState.realpaths.get(p) ?? p;
  }),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
  mkdirSync: vi.fn(),
}));

import { resolvePathInsideWorkspace, invalidateWorkspaceRealpath } from './security';
import { state } from './state';

const WS = path.resolve('/ws/project');

function reset(): void {
  fsState.realpathCalls.length = 0;
  fsState.exists.clear();
  fsState.realpaths.clear();
  fsState.failRealpath.clear();
  state.defaultWorkspacePath = WS;
  // The workspace and a leaf file exist on disk.
  fsState.exists.add(WS);
  invalidateWorkspaceRealpath();
}

describe('resolvePathInsideWorkspace — a workspace that IS a filesystem root', () => {
  const ROOT = path.parse(process.cwd()).root;   // "D:\" on Windows, "/" elsewhere

  beforeEach(() => {
    fsState.realpathCalls.length = 0;
    fsState.exists.clear();
    fsState.realpaths.clear();
    fsState.failRealpath.clear();
    fsState.exists.add(ROOT);
    state.defaultWorkspacePath = ROOT;
    invalidateWorkspaceRealpath();
  });

  it('accepts a child of the root (regression: d:\\\\ matched no child)', () => {
    const child = path.join(ROOT, 'project');
    expect(resolvePathInsideWorkspace(child)).toBe(child);
    const deep = path.join(ROOT, 'project', 'src', 'a.ts');
    expect(resolvePathInsideWorkspace(deep)).toBe(deep);
  });

  it('still rejects a path on another volume', () => {
    if (process.platform !== 'win32') return;   // "/" contains everything on POSIX
    expect(resolvePathInsideWorkspace('C:\\Windows')).toBeNull();
  });
});

describe('resolvePathInsideWorkspace — canonical workspace memo', () => {
  beforeEach(reset);

  it('realpaths the workspace once across many calls', () => {
    for (let i = 0; i < 25; i++) {
      const target = path.resolve(`/ws/project/src/f${i}.ts`);
      fsState.exists.add(target);
      expect(resolvePathInsideWorkspace(target)).toBe(target);
    }
    const wsRealpaths = fsState.realpathCalls.filter(p => p === WS);
    expect(wsRealpaths).toHaveLength(1);
    // The leaf/nearest-ancestor realpath stays per-call (TOCTOU hardening).
    expect(fsState.realpathCalls.length).toBeGreaterThan(25);
  });

  it('invalidateWorkspaceRealpath(wsPath) forces a re-resolve', () => {
    const target = path.resolve('/ws/project/src/a.ts');
    fsState.exists.add(target);
    resolvePathInsideWorkspace(target);
    resolvePathInsideWorkspace(target);
    expect(fsState.realpathCalls.filter(p => p === WS)).toHaveLength(1);

    invalidateWorkspaceRealpath(WS);
    resolvePathInsideWorkspace(target);
    expect(fsState.realpathCalls.filter(p => p === WS)).toHaveLength(2);
  });

  it('invalidateWorkspaceRealpath() with no argument clears every workspace', () => {
    const target = path.resolve('/ws/project/src/a.ts');
    fsState.exists.add(target);
    resolvePathInsideWorkspace(target);
    invalidateWorkspaceRealpath();
    resolvePathInsideWorkspace(target);
    expect(fsState.realpathCalls.filter(p => p === WS)).toHaveLength(2);
  });

  it('still rejects a path outside the workspace', () => {
    const outside = path.resolve('/etc/passwd');
    fsState.exists.add(outside);
    expect(resolvePathInsideWorkspace(outside)).toBeNull();
  });

  it('still rejects a symlinked leaf that escapes the workspace', () => {
    const link = path.resolve('/ws/project/src/evil');
    const outsideDir = path.resolve('/outside');
    fsState.exists.add(link);
    fsState.realpaths.set(link, outsideDir);

    expect(resolvePathInsideWorkspace(link)).toBeNull();
  });

  it('resolves a not-yet-existing leaf through its nearest existing ancestor', () => {
    const newFile = path.resolve('/ws/project/src/new/file.ts');
    fsState.exists.add(path.resolve('/ws/project/src')); // ancestor exists

    expect(resolvePathInsideWorkspace(newFile)).toBe(newFile);
  });

  it('falls back to string containment when the workspace is not materialized', () => {
    fsState.exists.clear();
    fsState.failRealpath.add(WS);
    const target = path.resolve('/ws/project/src/a.ts');

    expect(resolvePathInsideWorkspace(target)).toBe(target);
    // Failed resolutions are never cached.
    resolvePathInsideWorkspace(target);
    expect(fsState.realpathCalls.filter(p => p === WS).length).toBe(2);
  });
});
