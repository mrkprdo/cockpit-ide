// SPECGEN runtime — structural reconcile: source facts → spec patches.
//
// R1 enforced here: only structural fields are written (frontmatter file/
// exports/singleton-at-creation, Dependencies, Referenced By, IPC Channels,
// External Dependencies, Test, main Features rows). Descriptions, Interface,
// State, Lifecycle, UI bodies, and unknown sections are never touched on
// existing specs. `report` mode computes everything and writes nothing.

import type { SpecDoc } from './format';
import {
  fmGet, fmSet, formatBacktickList, formatDeps, formatFeaturesTables,
  formatRefs, getSection, parseDeps, parseFeaturesTables, parseSpecDoc,
  serializeSpecDoc, setSection,
} from './format';
import { LAYER_ORDER, specIdFromFilename } from './graph';
import { SOURCE_FILE_RE, TEST_FILE_RE, extractSourceFacts } from './extract-ts';
import type { DepItem, MainFeatureRow, ReconcileChangelog, ReconcileMode, RefItem, SourceFacts, SpecsFs } from './types';

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', 'coverage', '.cockpit', '.codegraph']);
export const STUB_DESCRIPTION = 'TODO: describe this feature';

export interface ReconcileOptions {
  fs: SpecsFs;
  wsRoot: string;      // absolute, forward slashes, no trailing slash
  specsDir: string;    // absolute
  sourceRoot?: string; // absolute; default `${wsRoot}/src`
  mode: ReconcileMode;
  createSkeletons?: boolean;
}

export interface ReconcileResult extends ReconcileChangelog {
  facts: Map<string, SourceFacts>;      // repo-relative source path → facts
  sourceFiles: Set<string>;             // repo-relative TS/JS feature files
  existingFiles: Set<string>;           // every walked file (any type) on disk
}

export async function reconcile(opts: ReconcileOptions): Promise<ReconcileResult> {
  const { fs, mode, createSkeletons = false } = opts;
  const wsRoot = opts.wsRoot.replace(/\\/g, '/').replace(/\/$/, '');
  const specsDir = opts.specsDir.replace(/\\/g, '/').replace(/\/$/, '');
  const sourceRoot = (opts.sourceRoot ?? `${wsRoot}/src`).replace(/\\/g, '/').replace(/\/$/, '');

  const result: ReconcileResult = {
    mode, created: [], updated: [], unchanged: [], failed: [],
    facts: new Map(), sourceFiles: new Set(), existingFiles: new Set(),
  };

  // 1. Walk source tree (skip the spec corpus dir itself, not every dir named "specs")
  const allFiles: string[] = [];
  await walk(fs, sourceRoot, allFiles, 0, 8, specsDir);
  const relAll = new Set(allFiles.map(f => f.slice(wsRoot.length + 1)));
  const sourceFiles = [...relAll].filter(f =>
    SOURCE_FILE_RE.test(f) && !TEST_FILE_RE.test(f) && !isTestInfra(f));
  result.sourceFiles = new Set(sourceFiles);
  result.existingFiles = relAll;

  // 2. Extract facts
  for (const rel of sourceFiles) {
    const content = await fs.readFile(`${wsRoot}/${rel}`);
    if (content !== null) result.facts.set(rel, extractSourceFacts(rel, content, relAll));
  }

  // 3. Load spec corpus
  const entries = await fs.readDir(specsDir) ?? [];
  const rawByFile = new Map<string, string>();
  const docs = new Map<string, SpecDoc>();
  for (const e of entries) {
    if (e.isDirectory || !e.name.endsWith('.spec.md') || e.name === 'main.spec.md') continue;
    const raw = await fs.readFile(`${specsDir}/${e.name}`);
    if (raw !== null) {
      rawByFile.set(e.name, raw);
      docs.set(e.name, parseSpecDoc(raw));
    }
  }
  const mainRaw = await fs.readFile(`${specsDir}/main.spec.md`);
  const mainDoc = mainRaw !== null ? parseSpecDoc(mainRaw) : null;

  // Source path → spec filename
  const specByFile = new Map<string, string>();
  const specByBasename = new Map<string, string>();
  for (const [filename, doc] of docs) {
    const f = fmGet(doc, 'file');
    if (f) {
      specByFile.set(f, filename);
      specByBasename.set(f.split('/').pop()!, filename);
    }
  }

  // 4. Skeletons for unspecced source files
  for (const rel of sourceFiles) {
    if (specByFile.has(rel) || specByBasename.has(rel.split('/').pop()!)) continue;
    const facts = result.facts.get(rel);
    if (!facts) continue;
    const specFile = `${kebab(rel.split('/').pop()!.replace(SOURCE_FILE_RE, ''))}.spec.md`;
    if (docs.has(specFile)) continue; // name collision — leave for validation to flag
    if (createSkeletons) {
      const doc = parseSpecDoc(skeletonMd(rel, facts));
      docs.set(specFile, doc);
      specByFile.set(rel, specFile);
      result.created.push(specFile);
    } else {
      result.failed.push({ path: rel, error: 'unspecced (skeleton creation disabled)' });
    }
  }

  // 5. Structural patch per spec whose source file was walked
  const finalDeps = new Map<string, DepItem[]>(); // spec filename → deps after patch
  for (const [specFile, doc] of docs) {
    const srcRel = fmGet(doc, 'file');
    if (!srcRel) { finalDeps.set(specFile, parseDeps(doc)); continue; }
    const facts = result.facts.get(srcRel);
    if (!facts) { finalDeps.set(specFile, parseDeps(doc)); continue; }

    if (facts.exports.length) fmSet(doc, 'exports', facts.exports);

    const existingDeps = parseDeps(doc);
    const usageByFile = new Map(existingDeps.map(d => [d.file.split('/').pop()!, d.usage]));
    const deps: DepItem[] = facts.importPaths.map(imp => {
      const depSpec = specByFile.get(imp) ?? specByBasename.get(imp.split('/').pop()!);
      const depDoc = depSpec ? docs.get(depSpec) : undefined;
      const feature = depDoc ? (fmGet(depDoc, 'name') ?? specIdFromFilename(depSpec!)) : displayName(imp.split('/').pop()!.replace(SOURCE_FILE_RE, ''));
      const usage = usageByFile.get(imp.split('/').pop()!);
      return { feature, file: imp, ...(usage ? { usage } : {}) };
    });
    finalDeps.set(specFile, deps);
    setSection(doc, 'Dependencies', formatDeps(deps));
    setSection(doc, 'IPC Channels', facts.ipcChannels.length ? formatBacktickList(facts.ipcChannels) : ['None.']);
    if (facts.externalPackages.length) {
      setSection(doc, 'External Dependencies', formatBacktickList(facts.externalPackages));
    }
    if (facts.testPath) setSection(doc, 'Test', [`\`${facts.testPath}\``]);
  }

  // 6. Global Referenced By recompute from final deps
  const refsBySpec = new Map<string, RefItem[]>();
  for (const [specFile, deps] of finalDeps) {
    const doc = docs.get(specFile)!;
    const fromFeature = fmGet(doc, 'name') ?? specIdFromFilename(specFile);
    const fromFile = fmGet(doc, 'file') ?? '';
    for (const d of deps) {
      const targetSpec = specByFile.get(d.file) ?? specByBasename.get(d.file.split('/').pop()!);
      if (!targetSpec || targetSpec === specFile) continue;
      const list = refsBySpec.get(targetSpec) ?? [];
      if (!list.some(r => r.file === fromFile)) list.push({ feature: fromFeature, file: fromFile });
      refsBySpec.set(targetSpec, list);
    }
  }
  for (const [specFile, doc] of docs) {
    // Only rewrite refs on specs tied to walked source files (don't churn entry/ui specs)
    const srcRel = fmGet(doc, 'file');
    if (!srcRel || !result.facts.has(srcRel)) continue;
    const refs = (refsBySpec.get(specFile) ?? []).sort((a, b) => a.feature.localeCompare(b.feature));
    setSection(doc, 'Referenced By', formatRefs(refs));
  }

  // 7. main.spec.md Features rows (structural); other sections preserved
  let mainOut: string | null = null;
  if (mainDoc) {
    const features = parseFeaturesTables(mainDoc);
    const rowById = new Map<string, { layer: string; row: MainFeatureRow }>();
    for (const [layer, rows] of Object.entries(features)) {
      for (const r of rows) rowById.set(r.id, { layer, row: r });
    }
    const next: Record<string, MainFeatureRow[]> = {};
    const push = (layer: string, row: MainFeatureRow) => { (next[layer] ??= []).push(row); };

    for (const [specFile, doc] of docs) {
      const id = specIdFromFilename(specFile);
      if (fmGet(doc, 'parent') || [...rowById.values()].some(x => x.row.ui === specFile)) continue; // ui sub-specs live in the ui column
      const existing = rowById.get(id);
      const srcRel = fmGet(doc, 'file') ?? existing?.row.file ?? '';
      const layer = existing?.layer ?? fmGet(doc, 'layer') ?? 'plugin';
      push(layer, {
        id,
        name: fmGet(doc, 'name') ?? existing?.row.name ?? id,
        file: srcRel,
        spec: specFile,
        ui: existing?.row.ui ?? '',
      });
    }
    // Keep rows for entry/config features whose spec exists but has no file in walk
    setSection(mainDoc, 'Features', formatFeaturesTables(next, LAYER_ORDER));
    mainOut = serializeSpecDoc(mainDoc);
  }

  // 8. Diff + write
  for (const [specFile, doc] of docs) {
    if (result.created.includes(specFile)) continue;
    const out = serializeSpecDoc(doc);
    const orig = rawByFile.get(specFile);
    if (orig === out) { result.unchanged.push(specFile); continue; }
    result.updated.push(specFile);
    if (mode === 'structural') {
      const ok = await fs.writeFile(`${specsDir}/${specFile}`, out);
      if (!ok) result.failed.push({ path: specFile, error: 'write failed' });
    }
  }
  if (mainOut !== null && mainRaw !== mainOut) {
    result.updated.push('main.spec.md');
    if (mode === 'structural') await fs.writeFile(`${specsDir}/main.spec.md`, mainOut);
  } else if (mainOut !== null) {
    result.unchanged.push('main.spec.md');
  }
  if (mode === 'structural') {
    for (const specFile of result.created) {
      const ok = await fs.writeFile(`${specsDir}/${specFile}`, serializeSpecDoc(docs.get(specFile)!));
      if (!ok) result.failed.push({ path: specFile, error: 'write failed' });
    }
  }

  return result;
}

// SPECGEN Phase 1 excludes test infrastructure, not just *.test.* files
function isTestInfra(rel: string): boolean {
  return rel.split('/').some(seg => seg === 'test' || seg === 'tests' || seg === '__tests__' || seg === '__mocks__');
}

async function walk(fs: SpecsFs, dir: string, out: string[], depth: number, maxDepth: number, skipDir: string): Promise<void> {
  if (depth > maxDepth) return;
  const entries = await fs.readDir(dir);
  if (!entries) return;
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const full = `${dir}/${e.name}`;
    if (e.isDirectory) {
      if (full === skipDir) continue;
      await walk(fs, full, out, depth + 1, maxDepth, skipDir);
    } else {
      out.push(full);
    }
  }
}

function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/[._]/g, '-')
    .toLowerCase();
}

function displayName(stem: string): string {
  return stem.replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function skeletonMd(rel: string, facts: SourceFacts): string {
  const stem = rel.split('/').pop()!.replace(SOURCE_FILE_RE, '');
  const lines = [
    '---',
    `name: ${displayName(stem)}`,
    `file: ${rel}`,
    `type: ${facts.suggestedType}`,
    `layer: ${facts.suggestedLayer}`,
    `singleton: ${facts.singleton}`,
  ];
  if (facts.exports.length) lines.push(`exports: [${facts.exports.join(', ')}]`);
  lines.push('---', '', `# ${displayName(stem)}`, '', STUB_DESCRIPTION, '');
  lines.push('## Dependencies', '', 'None.', '');
  lines.push('## Referenced By', '', 'None.', '');
  lines.push('## IPC Channels', '', 'None.', '');
  return lines.join('\n');
}
