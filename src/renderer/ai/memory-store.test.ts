import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore, emptyMemory, normalizeMemory } from './memory-store';

function emptyFile() {
  return { version: 1, updatedAt: '2020-01-01T00:00:00.000Z', entries: [] as any[] };
}

describe('normalizeMemory / emptyMemory', () => {
  it('emptyMemory returns version 1 and empty entries', () => {
    const m = emptyMemory();
    expect(m.version).toBe(1);
    expect(m.entries).toEqual([]);
    expect(typeof m.updatedAt).toBe('string');
  });

  it('normalizeMemory rejects invalid shapes', () => {
    expect(normalizeMemory(null).entries).toEqual([]);
    expect(normalizeMemory({}).entries).toEqual([]);
    expect(normalizeMemory({ entries: 'x' }).entries).toEqual([]);
  });

  it('normalizeMemory drops entries without keys', () => {
    const m = normalizeMemory({
      version: 1,
      entries: [{ key: 'ok', body: 'yes' }, { body: 'no-key' }, null],
    });
    expect(m.entries).toHaveLength(1);
    expect(m.entries[0].key).toBe('ok');
    expect(m.entries[0].id).toBeTruthy();
  });
});

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    const api = (window as any).electronAPI.memory;
    api.loadGlobal.mockReset().mockResolvedValue(emptyFile());
    api.saveGlobal.mockReset().mockResolvedValue(true);
    api.loadWorkspace.mockReset().mockResolvedValue(emptyFile());
    api.saveWorkspace.mockReset().mockResolvedValue(true);
  });

  it('loadGlobal caches remote data', async () => {
    (window as any).electronAPI.memory.loadGlobal.mockResolvedValue({
      version: 1,
      updatedAt: 't',
      entries: [{ id: '1', key: 'tone', tags: ['ui'], body: 'concise', updatedAt: 't' }],
    });
    await store.loadGlobal();
    expect(store.global.entries).toHaveLength(1);
    expect(store.list('global')).toContain('tone');
  });

  it('loadWorkspace swaps local cache', async () => {
    await store.loadWorkspace('/ws');
    expect(store.workspacePath).toBe('/ws');
    expect((window as any).electronAPI.memory.loadWorkspace).toHaveBeenCalledWith('/ws');
  });

  it('buildIndexPrompt is empty-state friendly', () => {
    const text = store.buildIndexPrompt();
    expect(text).toContain('## Memory');
    expect(text).toContain('No memory yet');
    expect(text).not.toContain('body');
  });

  it('buildIndexPrompt lists keys and tags only', async () => {
    (window as any).electronAPI.memory.loadGlobal.mockResolvedValue({
      version: 1,
      entries: [{ id: '1', key: 'stack', tags: ['ts'], body: 'SECRET BODY', updatedAt: 't' }],
    });
    (window as any).electronAPI.memory.loadWorkspace.mockResolvedValue({
      version: 1,
      entries: [{ id: '2', key: 'build', tags: [], body: 'make all', updatedAt: 't' }],
    });
    await store.loadGlobal();
    await store.loadWorkspace('/ws');
    const text = store.buildIndexPrompt();
    expect(text).toContain('stack');
    expect(text).toContain('[ts]');
    expect(text).toContain('build');
    expect(text).not.toContain('SECRET BODY');
    expect(text).not.toContain('make all');
  });

  it('set upserts and persists global', async () => {
    const msg = await store.set('global', 'preferred-stack', 'TypeScript', ['prefs']);
    expect(msg).toContain('Created');
    expect(store.get('global', 'preferred-stack')).toContain('TypeScript');
    expect((window as any).electronAPI.memory.saveGlobal).toHaveBeenCalled();

    const msg2 = await store.set('global', 'preferred-stack', 'TS + Electron');
    expect(msg2).toContain('Updated');
    expect(store.global.entries).toHaveLength(1);
    expect(store.get('global', 'preferred-stack')).toContain('TS + Electron');
  });

  it('set workspace requires loaded path', async () => {
    const msg = await store.set('workspace', 'x', 'y');
    expect(msg).toContain('No workspace');
  });

  it('set workspace persists via saveWorkspace', async () => {
    await store.loadWorkspace('/proj');
    const msg = await store.set('workspace', 'api', 'REST only', ['backend']);
    expect(msg).toContain('Created');
    expect((window as any).electronAPI.memory.saveWorkspace).toHaveBeenCalledWith(
      '/proj',
      expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({ key: 'api', body: 'REST only' }),
        ]),
      }),
    );
  });

  it('search finds key and body matches', async () => {
    await store.loadWorkspace('/ws');
    await store.set('workspace', 'build-cmd', 'make test');
    await store.set('global', 'other', 'mentions build in body');
    const out = store.search('build');
    expect(out).toContain('build-cmd');
    expect(out).toContain('other');
    expect(out.indexOf('build-cmd')).toBeLessThan(out.indexOf('other'));
  });

  it('delete removes by key', async () => {
    await store.set('global', 'tmp', 'x');
    const msg = await store.delete('global', 'tmp');
    expect(msg).toContain('Deleted');
    expect(store.get('global', 'tmp')).toContain('Not found');
  });

  it('clearWorkspace drops local cache', async () => {
    await store.loadWorkspace('/ws');
    await store.set('workspace', 'k', 'v');
    store.clearWorkspace();
    expect(store.workspacePath).toBeNull();
    expect(store.workspace.entries).toEqual([]);
  });
});
