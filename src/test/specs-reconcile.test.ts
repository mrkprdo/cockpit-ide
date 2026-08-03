// Headless SPECGEN structural reconcile harness (refactor.md §D).
//
// Runs the same reconcile engine the SpecsMap plugin / specs_reconcile agent
// tool use, but against the real filesystem via node fs — so the spec corpus
// can be re-aligned without launching the app.
//
//   # read-only report (safe; runs in CI)
//   npx vitest run src/test/specs-reconcile.test.ts
//
//   # structural write: creates skeletons for unspecced files + patches
//   # Dependencies / Referenced By / IPC / Features (refactor.md §D step 2)
//   set SPECS_RECONCILE=structural && npx vitest run src/test/specs-reconcile.test.ts
//
// This file is intentionally NOT part of the normal `npm test` flow's writes —
// without the env flag it only reports and never touches the corpus.

import { describe, it, expect } from 'vitest';
import * as nodefs from 'node:fs';
import * as path from 'node:path';
import { reconcile } from '../renderer/specs/reconcile';
import { validate } from '../renderer/specs/validate';
import { parseSpecDoc } from '../renderer/specs/format';
import { buildMainIndex, buildGraph } from '../renderer/specs/graph';
import type { SpecsFs } from '../renderer/specs/types';

const REPO = process.cwd().replace(/\\/g, '/');
const SPECS_DIR = `${REPO}/src/specs`;
// eslint-disable-next-line no-console
console.log('[specs-reconcile] env SPECS_RECONCILE =', JSON.stringify(process.env.SPECS_RECONCILE));
const STRUCTURAL = (process.env.SPECS_RECONCILE ?? '').trim() === 'structural';

const fsAdapter: SpecsFs = {
  async readDir(dirPath) {
    const p = dirPath.replace(/\//g, path.sep);
    try {
      const entries = nodefs.readdirSync(p, { withFileTypes: true });
      return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
    } catch {
      return null;
    }
  },
  async readFile(filePath) {
    try {
      return nodefs.readFileSync(filePath.replace(/\//g, path.sep), 'utf8');
    } catch {
      return null;
    }
  },
  async writeFile(filePath, content) {
    try {
      nodefs.writeFileSync(filePath.replace(/\//g, path.sep), content, 'utf8');
      return true;
    } catch {
      return false;
    }
  },
};

describe('headless specs reconcile', () => {
  it(STRUCTURAL
    ? 'structural mode — writes skeleton specs + structural patches'
    : 'report mode — computes structural patches without writing',
  async () => {
    const result = await reconcile({
      fs: fsAdapter,
      wsRoot: REPO,
      specsDir: SPECS_DIR,
      mode: STRUCTURAL ? 'structural' : 'report',
      createSkeletons: STRUCTURAL,
    });
    // eslint-disable-next-line no-console
    console.log(`[specs-reconcile] mode=${result.mode} created=${result.created.length} updated=${result.updated.length} unchanged=${result.unchanged.length} failed=${result.failed.length}`);
    if (result.failed.length) {
      // eslint-disable-next-line no-console
      console.log('[specs-reconcile] failed:', result.failed);
    }
    if (STRUCTURAL) {
      expect(result.failed).toEqual([]);
      // eslint-disable-next-line no-console
      console.log(`[specs-reconcile] created:\n  ${result.created.join('\n  ')}`);
      // eslint-disable-next-line no-console
      console.log(`[specs-reconcile] updated:\n  ${result.updated.join('\n  ')}`);
    }
  });

  it('validation gate — zero errors (main.missing-feature / edge.unresolved)', async () => {
    const result = await reconcile({
      fs: fsAdapter,
      wsRoot: REPO,
      specsDir: SPECS_DIR,
      mode: 'report',
      createSkeletons: false,
    });
    const entries = (await fsAdapter.readDir(SPECS_DIR)) ?? [];
    const specFiles = entries.filter(e => e.name.endsWith('.spec.md') && e.name !== 'main.spec.md');
    const docs = new Map<string, ReturnType<typeof parseSpecDoc>>();
    for (const e of specFiles) {
      const raw = await fsAdapter.readFile(`${SPECS_DIR}/${e.name}`);
      if (raw !== null) docs.set(e.name, parseSpecDoc(raw));
    }
    const mainRaw = await fsAdapter.readFile(`${SPECS_DIR}/main.spec.md`);
    const main = mainRaw ? buildMainIndex(parseSpecDoc(mainRaw)) : null;
    const graph = buildGraph(main, docs);
    const report = validate(graph, {
      sourceFiles: result.sourceFiles,
      existingFiles: result.existingFiles,
      facts: result.facts,
    });
    // eslint-disable-next-line no-console
    console.log(`[specs-validate] errors=${report.counts.error} warn=${report.counts.warn} info=${report.counts.info} ok=${report.ok}`);
    const errorIssues = report.issues.filter(i => i.severity === 'error');
    if (errorIssues.length) {
      // eslint-disable-next-line no-console
      console.log('[specs-validate] errors:', errorIssues.map(e => `[${e.id}] ${e.message}`));
    }
    const blocking = errorIssues.filter(i => i.id === 'main.missing-feature' || i.id === 'edge.unresolved');
    if (blocking.length) {
      // eslint-disable-next-line no-console
      console.log('[specs-validate] blocking issues:', blocking.map(b => `[${b.id}] ${b.message}`));
    }
    expect(blocking).toEqual([]);
  }, 60_000);
});
