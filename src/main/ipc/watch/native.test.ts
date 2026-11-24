import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import * as path from 'node:path';

const { watchMock, statMock } = vi.hoisted(() => ({ watchMock: vi.fn(), statMock: vi.fn() }));

vi.mock('fs', () => ({
  default: {},
  watch: watchMock,
  promises: { stat: statMock },
}));

vi.mock('../logging', () => ({ logMain: vi.fn() }));

import { startNativeWatch, NATIVE_EVENT_RATE_LIMIT } from './native';

const ROOT = path.join(path.sep, 'ws');

function start(isIgnored: (p: string) => boolean = () => false) {
  const emitter = Object.assign(new EventEmitter(), { close: vi.fn() });
  watchMock.mockReturnValue(emitter);
  const changed = vi.fn();
  const error = vi.fn();
  const flood = vi.fn();
  const session = startNativeWatch(ROOT, isIgnored, { changed, error, flood });
  return { emitter, changed, error, flood, session };
}

/** Let the async stat + sink.changed settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('native watch backend', () => {
  beforeEach(() => {
    watchMock.mockReset();
    statMock.mockReset();
  });

  it('takes one recursive OS watch for the whole tree', () => {
    const { session } = start();
    expect(watchMock).toHaveBeenCalledTimes(1);
    expect(watchMock).toHaveBeenCalledWith(ROOT, { recursive: true, persistent: true });
    // One handle: there is no per-entry set to budget.
    expect(session.size()).toBeNull();
  });

  it('reports a changed file with its full path', () => {
    const { emitter, changed } = start();
    emitter.emit('change', 'change', path.join('src', 'a.ts'));
    expect(changed).toHaveBeenCalledWith(path.join(ROOT, 'src', 'a.ts'));
  });

  it('accepts an absolute filename from the OS', () => {
    const { emitter, changed } = start();
    const absolute = path.join(ROOT, 'src', 'b.ts');
    emitter.emit('change', 'change', absolute);
    expect(changed).toHaveBeenCalledWith(absolute);
  });

  it('never reports ignored paths', () => {
    const { emitter, changed } = start((p) => p.includes('node_modules'));
    emitter.emit('change', 'change', path.join('node_modules', 'pkg', 'index.js'));
    emitter.emit('change', 'rename', path.join('node_modules', 'pkg'));
    expect(changed).not.toHaveBeenCalled();
  });

  it('reports a renamed file once it proves not to be a directory', async () => {
    const { emitter, changed } = start();
    statMock.mockResolvedValue({ isDirectory: () => false });
    emitter.emit('change', 'rename', path.join('src', 'new.ts'));
    await settle();
    expect(changed).toHaveBeenCalledWith(path.join(ROOT, 'src', 'new.ts'));
  });

  it('drops a renamed directory (no consumer, avoids a tree reload)', async () => {
    const { emitter, changed } = start();
    statMock.mockResolvedValue({ isDirectory: () => true });
    emitter.emit('change', 'rename', path.join('src', 'newdir'));
    await settle();
    expect(changed).not.toHaveBeenCalled();
  });

  it('reports a vanished path as a change (that is a delete)', async () => {
    const { emitter, changed } = start();
    statMock.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    emitter.emit('change', 'rename', path.join('src', 'gone.ts'));
    await settle();
    expect(changed).toHaveBeenCalledWith(path.join(ROOT, 'src', 'gone.ts'));
  });

  it('survives an event with no filename', () => {
    const { emitter, changed } = start();
    expect(() => emitter.emit('change', 'rename', null)).not.toThrow();
    expect(changed).not.toHaveBeenCalled();
  });

  it('forwards watcher errors', () => {
    const { emitter, error } = start();
    const err = new Error('EPERM');
    emitter.emit('error', err);
    expect(error).toHaveBeenCalledWith(err);
  });

  it('close() releases the OS watch', async () => {
    const { emitter, session } = start();
    await session.close();
    expect(emitter.close).toHaveBeenCalledTimes(1);
  });

  it('stays quiet at a normal edit rate', () => {
    let now = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const { emitter, flood } = start();
      for (let sec = 0; sec < 5; sec++) {
        for (let i = 0; i < 100; i++) emitter.emit('change', 'change', `f${sec}-${i}.ts`);
        now += 1_100;
      }
      expect(flood).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('stands down when the tree changes faster than a UI can follow', () => {
    let now = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const { emitter, flood, session } = start();
      for (let sec = 0; sec < 4; sec++) {
        for (let i = 0; i < NATIVE_EVENT_RATE_LIMIT + 10; i++) {
          emitter.emit('change', 'change', `f${sec}-${i}.ts`);
        }
        now += 1_100;
      }
      expect(flood).toHaveBeenCalledTimes(1);
      expect(session).toBeTruthy();
    } finally {
      nowSpy.mockRestore();
    }
  });
});
