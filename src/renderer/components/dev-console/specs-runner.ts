// On-demand specs validation for the dev console's Specs tab (refactor.md §C.1).
// Self-contained runner over the specs graph engine — mirrors the collection
// discovery SpecsMapWindow does (refactor.md §A.4 pulls that into specsmap/data.ts).

import { parseSpecDoc, fmGet } from '../../specs/format';
import { buildMainIndex, buildGraph } from '../../specs/graph';
import { validate, summarizeReport } from '../../specs/validate';

const SKIP_DIRS = new Set(['.git', 'node_modules', '.cockpit', '.codegraph', 'coverage', 'dist', 'release', 'out']);

interface Collection {
  title: string;
  specsDir: string;
}

async function findCollections(wsRoot: string): Promise<Collection[]> {
  const foundPaths: string[] = [];
  const quickPaths = [
    wsRoot + '/src/specs/main.spec.md',
    wsRoot + '/specs/main.spec.md',
    wsRoot + '/.specs/main.spec.md',
  ];
  for (const p of quickPaths) {
    const raw = await window.electronAPI?.fs.readFile(p);
    if (raw && !foundPaths.includes(p)) foundPaths.push(p);
  }

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 4) return;
    const entries = await window.electronAPI?.fs.readDir(dir);
    if (!entries) return;
    const mainRaw = await window.electronAPI?.fs.readFile(dir + '/main.spec.md');
    if (mainRaw && !foundPaths.includes(dir + '/main.spec.md')) foundPaths.push(dir + '/main.spec.md');
    for (const e of entries) {
      if (!e.isDirectory || SKIP_DIRS.has(e.name)) continue;
      await walk(dir + '/' + e.name, depth + 1);
    }
  };
  await walk(wsRoot, 0);

  const collections: Collection[] = [];
  const seenDirs = new Set<string>();
  for (const p of foundPaths) {
    const dir = p.replace(/\/main\.spec\.md$/, '');
    if (seenDirs.has(dir)) continue;
    seenDirs.add(dir);
    const raw = await window.electronAPI?.fs.readFile(p);
    let title = '';
    if (raw) {
      try {
        const doc = parseSpecDoc(raw);
        title = String(fmGet(doc, 'title') ?? fmGet(doc, 'name') ?? '');
      } catch { /* skip */ }
    }
    if (!title) title = dir.split('/').pop() || 'Specs';
    collections.push({ title, specsDir: dir });
  }
  collections.sort((a, b) => {
    const d = a.specsDir.split('/').length - b.specsDir.split('/').length;
    if (d !== 0) return d;
    return a.title.localeCompare(b.title);
  });
  return collections;
}

async function readCorpus(specsDir: string): Promise<{ mainRaw: string | null; specRaws: Map<string, string> }> {
  const specRaws = new Map<string, string>();
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 4) return;
    const entries = await window.electronAPI?.fs.readDir(dir);
    if (!entries) return;
    for (const e of entries) {
      const full = dir + '/' + e.name;
      if (e.isDirectory) {
        if (!SKIP_DIRS.has(e.name)) await walk(full, depth + 1);
      } else if (e.name.endsWith('.spec.md')) {
        const raw = await window.electronAPI?.fs.readFile(full);
        if (raw) specRaws.set(full, raw);
      }
    }
  };
  await walk(specsDir, 0);
  const mainRaw = specRaws.get(specsDir + '/main.spec.md') ?? null;
  return { mainRaw, specRaws };
}

/** Run validation against the workspace's spec corpus. Returns a markdown summary. */
export async function runSpecsValidation(wsRoot: string): Promise<string> {
  const collections = await findCollections(wsRoot);
  const lines: string[] = [];
  for (const c of collections) {
    const { mainRaw, specRaws } = await readCorpus(c.specsDir);
    const main = mainRaw ? buildMainIndex(parseSpecDoc(mainRaw)) : null;
    const docs = new Map<string, ReturnType<typeof parseSpecDoc>>();
    for (const [path, raw] of specRaws) {
      try { docs.set(path, parseSpecDoc(raw)); } catch { /* unparseable spec — validate below */ }
    }
    const graph = buildGraph(main, docs);
    const report = validate(graph);
    lines.push(`## ${c.title} — \`${c.specsDir}\``);
    lines.push(`- ${summarizeReport(report)}`);
    lines.push(`- spec files: ${report.coverage.specFiles} · source files: ${report.coverage.sourceFiles} · linked: ${report.coverage.linked}`);
    if (report.coverage.unspecced.length) {
      lines.push(`- unspecced: ${report.coverage.unspecced.join(', ')}`);
    }
    if (report.issues.length) {
      lines.push('', '### Issues');
      for (const i of report.issues) {
        lines.push(`- [${i.severity}] ${i.id}: ${i.message}${i.fixHint ? ` (fix: ${i.fixHint})` : ''}`);
      }
    } else {
      lines.push('', 'All validation rules pass.');
    }
    lines.push('');
  }
  if (collections.length === 0) {
    lines.push('No spec collections found under the workspace root.');
  }
  return lines.join('\n');
}
