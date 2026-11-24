// SpecsMap — corpus/graph data layer (refactor.md §A.4).
// Owns collection discovery, the *.spec.md corpus, the runtime graph
// projection, and the v2 layout snapshot cache. DOM side effects are
// delegated to the DataHost so this stays free of console.* logging
// (failures go through reportFailure, §B.3).
//
// Discovery/read I/O is concurrent and bounded: a repo with a dozen collections
// and 68 spec files used to cost one awaited IPC round-trip per directory and
// per spec file (hundreds of serial round-trips before the map could draw).

import { parseSpecDoc, type SpecDoc } from '../../specs/format';
import { buildGraph, buildMainIndex } from '../../specs/graph';
import { corpusHash, loadSnapshot as loadSnapshotV2, makeSnapshot } from '../../specs/snapshot';
import { validate } from '../../specs/validate';
import type { SpecGraph, ValidationReport } from '../../specs/types';
import { computeLayout, NODE_H, NODE_UI_H, NODE_UI_W, NODE_W, type SpecNode } from '../../specs/layout';
import { SPECGEN_VERSION } from '../../specgen-hash';
import { parseMainSpecMd, parseSpecMd, type SpecCollection, type SpecData } from './parse';
import { reportFailure } from '../../health/monitor';
import { IGNORED_DIRS } from '../../../shared/ignore-dirs';

/** Max concurrent fs IPC calls (reads/readDirs) per phase. */
const IO_CONCURRENCY = 8;

/** Directories never worth walking into (build output, deps, VCS, scratch). */
const SKIP_DIRS = IGNORED_DIRS;

/** Bounded-concurrency map; results keep the input order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Shared gate so a recursive walk never fans out past IO_CONCURRENCY calls. */
export class Limiter {
  private active = 0;
  private waiting: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>(r => this.waiting.push(r));
    this.active++;
    try { return await fn(); } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

interface SnapNode {
  id: string;
  name: string;
  specFile: string;
  sourceFile: string;
  isEntry: boolean;
  entryPath: string;
  layer: string;
  isUI: boolean;
  parentId?: string;
  uiChildId?: string;
  deps: string[];
  raw: Record<string, unknown>;
}

export interface DataHost {
  onCollections(collections: SpecCollection[]): void;
  onReady(): void;
  renderTabBar(): void;
  showEmptyState(): void | Promise<void>;
  updateHeaderCounts(): void;
  setSpecDirLabel(text: string): void;
  onGraphBuilt(): void;
  showValidation(): void;
  showLoadError(title: string, message: string): void;
}

export class SpecsData {
  specDocs = new Map<string, SpecDoc>();
  specRawMap = new Map<string, SpecData>();
  nodes: SpecNode[] = [];
  graph: SpecGraph | null = null;
  report: ValidationReport | null = null;
  refCounts = new Map<string, number>();
  collections: SpecCollection[] = [];
  activeCollectionIndex = 0;
  specBaseDir = '';
  snapshotPath = '';
  lastSpecFileCount = 0;
  driftDirty = false;
  lastRendered: string | null = null; // `${collectionId}:${hash}` of the last onGraphBuilt() call

  private api: Window['electronAPI'];
  private wsPath: string;
  private host: DataHost;

  constructor(api: Window['electronAPI'], wsPath: string, host: DataHost) {
    this.api = api;
    this.wsPath = wsPath;
    this.host = host;
    this.snapshotPath = wsPath.replace(/\\/g, '/').replace(/\/?$/, '') + '/.cockpit/specsmap.json';
  }

  async loadSpecs(): Promise<void> {
    try {
      const collections = await this.findAllCollections();
      if (collections.length === 0) {
        await this.host.showEmptyState();
        this.host.onReady();
        return;
      }
      this.collections = collections;
      this.activeCollectionIndex = 0;
      this.host.onCollections(collections);
      this.host.renderTabBar();

      await this.buildFromFiles(0);
      this.host.onReady();
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.host.showLoadError('Error loading specs', msg);
      this.host.onReady();
    }
  }

  /**
   * Snapshot v2 is a layout cache only (R2): the corpus is always re-read and
   * re-validated; the snapshot just skips parse+layout when corpusHash matches.
   */
  tryLoadSnapshotV2(raw: string | null, hash: string, collectionId: string): boolean {
    const snap = loadSnapshotV2<SnapNode>(raw, {
      specgenVersion: SPECGEN_VERSION, collectionId, corpusHash: hash,
    });
    if (raw && (!snap || snap.nodes.length === 0)) {
      reportFailure({
        kind: 'specs.corrupt-cache',
        source: 'specsmap/data.ts',
        message: `Stored snapshot for "${collectionId}" rejected (parse/version/hash mismatch); rebuilding from corpus.`,
      });
    }
    if (!snap || snap.nodes.length === 0) return false;

    const rawNodes: SpecNode[] = snap.nodes.map(sn => ({
      id: sn.id, name: sn.name, specFile: sn.specFile, sourceFile: sn.sourceFile,
      isEntry: sn.isEntry, entryPath: sn.entryPath,
      layer: sn.layer, isUI: sn.isUI, parentId: sn.parentId, uiChildId: sn.uiChildId,
      deps: sn.deps, x: 0, y: 0,
      w: sn.isUI ? NODE_UI_W : NODE_W,
      h: sn.isUI ? NODE_UI_H : NODE_H,
    }));

    this.refCounts.clear();
    for (const n of rawNodes) {
      for (const d of n.deps) this.refCounts.set(d, (this.refCounts.get(d) ?? 0) + 1);
    }
    this.nodes = computeLayout(rawNodes);
    return true;
  }

  async saveSnapshot(hash: string, collectionId: string): Promise<void> {
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    await this.api?.fs.mkdir(wsRoot + '/.cockpit');
    const nodes: SnapNode[] = this.nodes.map(n => ({
      id: n.id, name: n.name, specFile: n.specFile, sourceFile: n.sourceFile,
      isEntry: n.isEntry, entryPath: n.entryPath,
      layer: n.layer, isUI: n.isUI, parentId: n.parentId, uiChildId: n.uiChildId,
      deps: n.deps,
      raw: (this.specRawMap.get(n.id) ?? {}) as Record<string, unknown>,
    }));
    const snap = makeSnapshot(SPECGEN_VERSION, collectionId, hash, nodes);
    await this.api?.fs.writeFile(this.snapshotPath, JSON.stringify(snap));
  }

  async buildFromFiles(collectionIndex: number): Promise<void> {
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    const collection = this.collections[collectionIndex];
    if (!collection) {
      await this.host.showEmptyState();
      return;
    }
    const base = collection.specsDir;
    this.specBaseDir = base;
    this.host.setSpecDirLabel(base + '/');
    this.snapshotPath = wsRoot + '/.cockpit/specsmap-' +
      base.replace(wsRoot, '').replace(/[\/\\]/g, '_').replace(/^_/, '') + '.json';

    const mainData = collection.mainData ?? {};

    const specLayerMap = new Map<string, string>();
    const specToUI = new Map<string, string>();
    const uiToParent = new Map<string, string>();

    const featuresMap = mainData.features;
    if (Array.isArray(featuresMap)) {
      for (const feat of featuresMap as unknown[]) {
        if (feat && typeof feat === 'object' && 'spec' in (feat as Record<string, unknown>)) {
          const f = feat as { spec: string; ui?: string };
          specLayerMap.set(f.spec, 'unknown');
          if (f.ui) {
            specToUI.set(f.spec, f.ui);
            uiToParent.set(f.ui, f.spec);
            specLayerMap.set(f.ui, 'unknown');
          }
        }
      }
    } else {
      for (const [layer, features] of Object.entries(featuresMap ?? {})) {
        if (!Array.isArray(features)) continue;
        for (const feat of features) {
          if (feat && typeof feat === 'object' && 'spec' in (feat as Record<string, unknown>)) {
            const f = feat as { spec: string; ui?: string };
            specLayerMap.set(f.spec, layer);
            if (f.ui) {
              specToUI.set(f.spec, f.ui);
              uiToParent.set(f.ui, f.spec);
              specLayerMap.set(f.ui, layer);
            }
          }
        }
      }
    }

    const entries = await this.api?.fs.readDir(base) ?? [];
    const specFiles = entries
      .filter(e => !e.isDirectory && e.name.endsWith('.spec.md') && e.name !== 'main.spec.md')
      .map(e => e.name);

    this.lastSpecFileCount = specFiles.length;

    if (specFiles.length === 0) {
      await this.host.showEmptyState();
      return;
    }

    this.specRawMap.clear();
    this.specDocs.clear();
    const rawTexts: Array<{ path: string; content: string }> = [];
    // Read the corpus concurrently (8 in flight) but keep file order — the
    // corpus hash fed to the snapshot cache is order-sensitive.
    const reads = await mapLimit(specFiles, IO_CONCURRENCY, async (filename) =>
      ({ filename, raw: await this.api?.fs.readFile(base + '/' + filename) }));
    for (const { filename, raw } of reads) {
      if (raw) {
        rawTexts.push({ path: filename, content: raw });
        try {
          this.specRawMap.set(filename, parseSpecMd(raw));
          this.specDocs.set(filename, parseSpecDoc(raw));
        } catch { /* skip invalid spec file */ }
      }
    }

    // SPECGEN runtime projection: graph + validation (corpus stays canonical)
    const mainRaw = await this.api?.fs.readFile(base + '/main.spec.md');
    if (mainRaw) rawTexts.push({ path: 'main.spec.md', content: mainRaw });
    try {
      const mainIndex = mainRaw ? buildMainIndex(parseSpecDoc(mainRaw)) : null;
      this.graph = buildGraph(mainIndex, this.specDocs);
      this.report = validate(this.graph);
    } catch {
      this.graph = null;
      this.report = null;
    }
    this.driftDirty = false;

    const collectionId = base.replace(wsRoot, '').replace(/^\//, '') || base;
    const hash = corpusHash(rawTexts);
    const renderKey = `${collectionId}:${hash}`;
    const snapRaw = await this.api?.fs.readFile(this.snapshotPath) ?? null;
    if (this.tryLoadSnapshotV2(snapRaw, hash, collectionId)) {
      // Corpus unchanged since last render (e.g. Refresh clicked with no file
      // edits) — skip the full DOM teardown/rebuild, just refresh derived state.
      if (renderKey === this.lastRendered) {
        this.host.updateHeaderCounts();
        this.host.showValidation();
        return;
      }
      this.lastRendered = renderKey;
      this.host.onGraphBuilt();
      return;
    }

    const sourceToSpec = new Map<string, string>();
    for (const [filename, data] of this.specRawMap) {
      if (data.file) {
        const baseName = data.file.split('/').pop()!;
        sourceToSpec.set(baseName, filename);
        const stem = baseName.replace(/\.[^.]+$/, '');
        if (stem !== baseName) sourceToSpec.set(stem, filename);
      }
    }

    const rawNodes: SpecNode[] = [];
    for (const [filename, data] of this.specRawMap) {
      const isUI = uiToParent.has(filename);
      const layer = specLayerMap.get(filename) ?? data.layer ?? 'window';
      const hasEntry = !!data.entry;
      const entryPath = data.entry ?? '';
      const deps: string[] = [];
      for (const dep of data.dependencies ?? []) {
        const basename = dep.file?.split('/').pop();
        if (basename) {
          const depId = sourceToSpec.get(basename);
          if (depId && depId !== filename) deps.push(depId);
        }
      }
      rawNodes.push({
        id: filename,
        name: data.name ?? filename.replace('.spec.md', ''),
        specFile: filename,
        sourceFile: hasEntry ? entryPath : (data.file ? data.file.split('/').pop()! : ''),
        isEntry: hasEntry,
        entryPath,
        layer, isUI,
        parentId: isUI ? uiToParent.get(filename) : undefined,
        uiChildId: specToUI.get(filename),
        deps, x: 0, y: 0,
        w: isUI ? NODE_UI_W : NODE_W,
        h: isUI ? NODE_UI_H : NODE_H,
      });
    }

    this.refCounts.clear();
    for (const n of rawNodes) {
      for (const d of n.deps) this.refCounts.set(d, (this.refCounts.get(d) ?? 0) + 1);
    }

    this.nodes = computeLayout(rawNodes);
    await this.saveSnapshot(hash, collectionId);
    this.lastRendered = renderKey;
    this.host.onGraphBuilt();
  }

  async findAllCollections(): Promise<SpecCollection[]> {
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    const foundPaths: string[] = [];
    const rawCache = new Map<string, string | null>();

    // Fast path: probe the common locations concurrently (was one awaited
    // round-trip each).
    const quickPaths = [
      wsRoot + '/src/specs/main.spec.md',
      wsRoot + '/specs/main.spec.md',
      wsRoot + '/.specs/main.spec.md',
    ];
    const quickRaws = await Promise.all(quickPaths.map(p => this.probeRead(p)));
    quickPaths.forEach((p, i) => {
      const raw = quickRaws[i];
      if (!raw) return;
      rawCache.set(p, raw);
      if (!foundPaths.includes(p)) foundPaths.push(p);
    });

    // Bounded concurrent walk for more collections.
    await this.walkFindAll(wsRoot, 0, 4, foundPaths);

    const dirs: string[] = [];
    const seenDirs = new Set<string>();
    for (const p of foundPaths) {
      const dir = p.replace(/\/main\.spec\.md$/, '');
      if (seenDirs.has(dir)) continue;
      seenDirs.add(dir);
      dirs.push(dir);
    }

    // One main.spec.md read per collection, 8 at a time, reusing the bytes the
    // probes already fetched.
    const mains = await mapLimit(dirs, IO_CONCURRENCY, (dir) => {
      const cached = rawCache.get(dir + '/main.spec.md');
      return cached !== undefined
        ? Promise.resolve(cached)
        : this.probeRead(dir + '/main.spec.md');
    });

    const collections: SpecCollection[] = [];
    dirs.forEach((dir, i) => {
      const raw = mains[i];
      let mainData: Record<string, unknown> | null = null;
      let title = '';
      if (raw) {
        try { mainData = parseMainSpecMd(raw); } catch { /* skip */ }
      }
      if (mainData && typeof mainData === 'object') {
        title = String((mainData as any).title ?? (mainData as any).name ?? '');
      }
      if (!title) title = dir.split('/').pop() || 'Specs';
      collections.push({ title, specsDir: dir, mainData });
    });

    // Sort by depth (shallower first), then alphabetically
    collections.sort((a, b) => {
      const aDepth = a.specsDir.split('/').length;
      const bDepth = b.specsDir.split('/').length;
      if (aDepth !== bDepth) return aDepth - bDepth;
      return a.title.localeCompare(b.title);
    });

    return collections;
  }

  /** readFile that treats any failure as "not there" (discovery probe only). */
  private async probeRead(p: string): Promise<string | null> {
    try { return (await this.api?.fs.readFile(p)) ?? null; } catch { return null; }
  }

  /**
   * Breadth-first-ish collection discovery. One readDir per directory — the
   * old version also issued a readFile per directory just to test for
   * main.spec.md, and awaited every child directory in series.
   */
  async walkFindAll(dir: string, depth: number, maxDepth: number, out: string[], gate?: Limiter): Promise<void> {
    if (depth > maxDepth) return;
    const limiter = gate ?? new Limiter(IO_CONCURRENCY);
    const entries = await limiter.run(async () => (await this.api?.fs.readDir(dir)) ?? null);
    if (!entries) return;

    // main.spec.md presence is already visible in the directory listing.
    if (entries.some(e => !e.isDirectory && e.name === 'main.spec.md')) {
      const p = dir + '/main.spec.md';
      if (!out.includes(p)) out.push(p);
    }

    const subdirs = entries.filter(e => e.isDirectory && !SKIP_DIRS.has(e.name));
    await Promise.all(subdirs.map(e => this.walkFindAll(dir + '/' + e.name, depth + 1, maxDepth, out, limiter)));
  }
}
