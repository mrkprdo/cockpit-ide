import { describe, it, expect, vi } from 'vitest';
import { SpecsData, Limiter, type DataHost } from './data';

interface Entry { name: string; isDirectory: boolean }

const dir = (...names: string[]): Entry[] =>
  names.map(n => ({ name: n, isDirectory: !n.includes('.') }));

interface FakeApi {
  api: any;
  readDirs: string[];
  readFiles: string[];
  writes: Array<[string, string]>;
  maxInFlight: () => number;
}

/**
 * Fake `window.electronAPI.fs` over a path→entries / path→content map. Tracks
 * concurrency so the bounded-parallel reads can be asserted.
 */
function makeApi(
  tree: Record<string, Entry[]>,
  files: Record<string, string>,
): FakeApi {
  const readDirs: string[] = [];
  const readFiles: string[] = [];
  const writes: Array<[string, string]> = [];
  const store: Record<string, string> = { ...files };
  let inFlight = 0;
  let maxInFlight = 0;

  const api = {
    fs: {
      readDir: vi.fn(async (p: string) => {
        readDirs.push(p);
        await Promise.resolve();
        return tree[p] ?? null;
      }),
      readFile: vi.fn(async (p: string) => {
        readFiles.push(p);
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight--;
        return store[p] ?? null;
      }),
      mkdir: vi.fn(async () => true),
      writeFile: vi.fn(async (p: string, content: string) => {
        writes.push([p, content]);
        store[p] = content;   // so a later readFile sees the snapshot
        return true;
      }),
    },
  };

  return { api, readDirs, readFiles, writes, maxInFlight: () => maxInFlight };
}

function makeHost(): DataHost & { built: number; errors: string[] } {
  const host = {
    built: 0,
    errors: [] as string[],
    onCollections: vi.fn(),
    onReady: vi.fn(),
    renderTabBar: vi.fn(),
    showEmptyState: vi.fn(),
    updateHeaderCounts: vi.fn(),
    setSpecDirLabel: vi.fn(),
    onGraphBuilt: vi.fn(() => { host.built++; }),
    showValidation: vi.fn(),
    showLoadError: vi.fn((t: string, m: string) => { host.errors.push(`${t}: ${m}`); }),
  };
  return host;
}

const MAIN_SPEC = ['---', 'title: Demo Specs', '---', '', '# Demo', ''].join('\n');

describe('SpecsData.findAllCollections', () => {
  it('finds the fast-path collection without a duplicate readFile', async () => {
    const ws = '/ws';
    const { api, readFiles } = makeApi(
      { '/ws/src/specs': dir('main.spec.md', 'a.spec.md') },
      { '/ws/src/specs/main.spec.md': MAIN_SPEC },
    );
    const data = new SpecsData(api, ws, makeHost());

    const collections = await data.findAllCollections();

    expect(collections).toHaveLength(1);
    expect(collections[0].specsDir).toBe('/ws/src/specs');
    expect(collections[0].title).toBe('Demo Specs');
    // One probe + (reused) title read — not two reads of main.spec.md.
    expect(readFiles.filter(p => p === '/ws/src/specs/main.spec.md')).toHaveLength(1);
  });

  it('walks directories with readDir only (no per-directory readFile probe)', async () => {
    const ws = '/ws';
    const { api, readFiles } = makeApi(
      {
        '/ws': dir('src', 'docs'),
        '/ws/src': dir('nothing'),
        '/ws/docs': dir('main.spec.md', 'x.spec.md'),
      },
      { '/ws/docs/main.spec.md': MAIN_SPEC },
    );
    const data = new SpecsData(api, ws, makeHost());
    const collections = await data.findAllCollections();

    expect(collections.map(c => c.specsDir)).toEqual(['/ws/docs']);
    // The walk must not probe main.spec.md in directories that lack one: the
    // directory listing already answers that question.
    expect(readFiles).not.toContain('/ws/main.spec.md');
    expect(readFiles).not.toContain('/ws/src/main.spec.md');
  });

  it('skips build/VCS/scratch directories', async () => {
    const ws = '/ws';
    const { api, readDirs } = makeApi(
      {
        '/ws': dir('out', 'release', 'coverage', '.worktrees', 'node_modules', 'dist', 'src'),
        '/ws/src': dir('main.spec.md'),
        '/ws/out': dir('main.spec.md'),
        '/ws/release': dir('main.spec.md'),
        '/ws/coverage': dir('main.spec.md'),
        '/ws/.worktrees': dir('main.spec.md'),
      },
      { '/ws/src/main.spec.md': MAIN_SPEC },
    );
    const data = new SpecsData(api, ws, makeHost());
    const collections = await data.findAllCollections();

    expect(collections.map(c => c.specsDir)).toEqual(['/ws/src']);
    for (const skipped of ['out', 'release', 'coverage', '.worktrees', 'node_modules', 'dist']) {
      expect(readDirs).not.toContain(`/ws/${skipped}`);
    }
  });

  it('caps concurrent directory reads', async () => {
    const ws = '/ws';
    const children = Array.from({ length: 40 }, (_, i) => `d${i}`);
    const tree: Record<string, Entry[]> = { '/ws': dir(...children) };
    for (const c of children) tree[`/ws/${c}`] = [{ name: 'a.ts', isDirectory: false }];
    const { api, readDirs } = makeApi(tree, {});
    const data = new SpecsData(api, ws, makeHost());

    await data.findAllCollections();

    // Root + one readDir per child (the walk never reads files).
    expect(readDirs.length).toBe(41);
    expect(readDirs).toContain('/ws/d39');
  });
});

describe('SpecsData.buildFromFiles', () => {
  function corpus(n: number): { tree: Record<string, Entry[]>; files: Record<string, string> } {
    const names = Array.from({ length: n }, (_, i) => `f${i}.spec.md`);
    const files: Record<string, string> = { '/ws/src/specs/main.spec.md': MAIN_SPEC };
    for (const name of names) {
      files[`/ws/src/specs/${name}`] = [
        '---',
        `name: ${name}`,
        `file: src/${name.replace('.spec.md', '.ts')}`,
        '---',
        '',
      ].join('\n');
    }
    return { tree: { '/ws/src/specs': dir('main.spec.md', ...names) }, files };
  }

  function makeData(n: number) {
    const { tree, files } = corpus(n);
    const fake = makeApi(tree, files);
    const host = makeHost();
    const data = new SpecsData(fake.api, '/ws', host);
    data.collections = [{ title: 'Demo', specsDir: '/ws/src/specs', mainData: {} }];
    return { data, host, fake };
  }

  it('reads the corpus with bounded parallelism', async () => {
    const { data, fake } = makeData(24);
    await data.buildFromFiles(0);

    expect(data.lastSpecFileCount).toBe(24);
    // 24 specs + main.spec.md + the snapshot read.
    expect(fake.readFiles.filter(p => p.endsWith('.spec.md'))).toHaveLength(25);
    expect(fake.maxInFlight()).toBeGreaterThan(1);
    expect(fake.maxInFlight()).toBeLessThanOrEqual(8);
  });

  it('writes the layout snapshot keyed by corpus hash', async () => {
    const { data, fake } = makeData(3);
    await data.buildFromFiles(0);

    const snapWrite = fake.writes.find(([p]) => p.includes('specsmap'));
    expect(snapWrite).toBeTruthy();
    const snap = JSON.parse(snapWrite![1]);
    expect(snap.specgenVersion).toBeTruthy();
    expect(snap.corpusHash).toBeTruthy();
    expect(snap.nodes.length).toBe(3);
  });

  it('reuses the snapshot cache for an unchanged corpus (no rebuild)', async () => {
    const { data, host } = makeData(3);
    await data.buildFromFiles(0);
    expect(host.built).toBe(1);

    // Second pass with the identical corpus + snapshot on disk.
    await data.buildFromFiles(0);
    expect(host.built).toBe(1);
    expect(host.updateHeaderCounts).toHaveBeenCalled();
  });
});

describe('Limiter', () => {
  it('never runs more than `max` tasks at once', async () => {
    const limiter = new Limiter(2);
    let active = 0;
    let peak = 0;
    const task = async () => limiter.run(async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
    });
    await Promise.all(Array.from({ length: 10 }, task));
    expect(peak).toBeLessThanOrEqual(2);
  });
});
