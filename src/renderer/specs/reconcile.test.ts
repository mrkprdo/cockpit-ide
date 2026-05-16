import { describe, it, expect } from 'vitest';
import { extractSourceFacts } from './extract-ts';
import { reconcile } from './reconcile';
import type { SpecsFs } from './types';

// ── extract-ts ───────────────────────────────────────────────────────────────

describe('extractSourceFacts', () => {
  const files = new Set([
    'src/a.ts', 'src/b.ts', 'src/util/index.ts', 'src/a.test.ts',
  ]);

  it('extracts exports incl. export lists and default classes', () => {
    const src = [
      `export class Foo {}`,
      `export default class Bar {}`,
      `export const baz = 1;`,
      `export interface Qux {}`,
      `const hidden = 2;`,
      `export { hidden as visible };`,
    ].join('\n');
    const f = extractSourceFacts('src/a.ts', src, files);
    expect(f.exports.sort()).toEqual(['Bar', 'Foo', 'Qux', 'baz', 'visible']);
  });

  it('resolves relative imports incl. index files; collects externals', () => {
    const src = [
      `import { B } from './b';`,
      `import * as U from './util';`,
      `import { marked } from 'marked';`,
      `import fit from '@xterm/addon-fit';`,
      `import path from 'node:path';`,
    ].join('\n');
    const f = extractSourceFacts('src/a.ts', src, files);
    expect(f.importPaths).toEqual(['src/b.ts', 'src/util/index.ts']);
    expect(f.externalPackages.sort()).toEqual(['@xterm/addon-fit', 'marked']);
  });

  it('detects ipc channels and test path', () => {
    const src = `window.electronAPI.fs.readFile('x'); ipcRenderer.invoke('workspace:load'); const s = 'fs:readFile';`;
    const f = extractSourceFacts('src/a.ts', src, files);
    expect(f.ipcChannels).toContain('workspace:load');
    expect(f.ipcChannels).toContain('fs:readFile');
    expect(f.testPath).toBe('src/a.test.ts');
  });

  it('classifies: no internal imports → foundation; DOM → ui', () => {
    const f1 = extractSourceFacts('src/a.ts', `export const x = 1;`, files);
    expect(f1.suggestedLayer).toBe('foundation');
    const f2 = extractSourceFacts('src/b.ts', `import { x } from './a';\nexport class W { el = document.createElement('div'); }`, files);
    expect(f2.suggestedType).toBe('ui');
  });
});

// ── reconcile ────────────────────────────────────────────────────────────────

interface MemFsOpts { [path: string]: string }

function memFs(files: MemFsOpts): { fs: SpecsFs; files: MemFsOpts; writes: string[] } {
  const writes: string[] = [];
  const fs: SpecsFs = {
    async readDir(dirPath: string) {
      const prefix = dirPath.replace(/\/$/, '') + '/';
      const names = new Map<string, boolean>();
      let found = false;
      for (const p of Object.keys(files)) {
        if (!p.startsWith(prefix)) continue;
        found = true;
        const rest = p.slice(prefix.length);
        const seg = rest.split('/')[0];
        names.set(seg, rest.includes('/'));
      }
      if (!found) return null;
      return [...names.entries()].map(([name, isDirectory]) => ({ name, isDirectory }));
    },
    async readFile(p: string) { return files[p] ?? null; },
    async writeFile(p: string, content: string) { files[p] = content; writes.push(p); return true; },
  };
  return { fs, files, writes };
}

const WS = 'C:/ws';

function fixtureFiles(): MemFsOpts {
  return {
    [`${WS}/src/theme.ts`]: `export type Theme = 'dark';\nexport function applyTheme(t: Theme): void {}\n`,
    [`${WS}/src/App.ts`]: `import { applyTheme } from './theme';\nexport class App { el = document.createElement('div'); }\nconst s = 'workspace:load';\n`,
    [`${WS}/src/specs/main.spec.md`]: [
      '---', 'name: Fixture', 'version: 1.0.0', '---', '', '# Fixture', '', 'Hand-written blurb.', '',
      '## Stack', '', '- **runtime:** test', '',
      '## Features', '',
      '### foundation', '',
      '| id | name | file | spec | ui |', '|----|------|------|------|----|',
      '| theme | Theme | src/theme.ts | theme.spec.md | |',
      '',
      '### core', '',
      '| id | name | file | spec | ui |', '|----|------|------|------|----|',
      '| app | App | src/App.ts | app.spec.md | |',
      '',
      '## IPC Channels', '', '### workspace', '- `workspace:load` — loads', '',
    ].join('\n'),
    [`${WS}/src/specs/theme.spec.md`]: [
      '---', 'name: Theme', 'file: src/theme.ts', 'type: logic', 'layer: foundation', 'singleton: false',
      'exports: [Theme]', '---', '',
      '# Theme', '', 'Hand-written theme description.', '',
      '## Dependencies', '', 'None.', '',
      '## Referenced By', '', 'None.', '',
      '## Interface', '', '- **applyTheme** `(t: Theme): void` — applies', '',
    ].join('\n'),
    [`${WS}/src/specs/app.spec.md`]: [
      '---', 'name: App', 'file: src/App.ts', 'type: ui', 'layer: core', 'singleton: true',
      'exports: [App]', '---', '',
      '# App', '', 'Hand-written app description.', '',
      '## Dependencies', '', '- **Theme** `src/theme.ts` — applies theme at boot', '',
      '## Custom Notes', '', 'Precious.', '',
    ].join('\n'),
  };
}

describe('reconcile', () => {
  it('report mode computes diff but writes nothing', async () => {
    const { fs, writes } = memFs(fixtureFiles());
    const r = await reconcile({ fs, wsRoot: WS, specsDir: `${WS}/src/specs`, mode: 'report' });
    expect(writes).toEqual([]);
    expect(r.updated).toContain('theme.spec.md'); // gains exports + referenced_by
    expect(r.sourceFiles.has('src/App.ts')).toBe(true);
    expect(r.facts.get('src/App.ts')?.importPaths).toEqual(['src/theme.ts']);
  });

  it('structural mode patches structural fields, preserves prose, closes referenced_by', async () => {
    const { fs, files } = memFs(fixtureFiles());
    const r = await reconcile({ fs, wsRoot: WS, specsDir: `${WS}/src/specs`, mode: 'structural' });
    expect(r.failed).toEqual([]);

    const theme = files[`${WS}/src/specs/theme.spec.md`];
    expect(theme).toContain('exports: [Theme, applyTheme]');          // exports refreshed
    expect(theme).toContain('- **App** `src/App.ts`');                // referenced_by closed
    expect(theme).toContain('Hand-written theme description.');       // prose intact
    expect(theme).toContain('- **applyTheme** `(t: Theme): void`');   // Interface intact

    const app = files[`${WS}/src/specs/app.spec.md`];
    expect(app).toContain('- **Theme** `src/theme.ts` — applies theme at boot'); // usage preserved
    expect(app).toContain('- `workspace:load`');                      // ipc detected
    expect(app).toContain('Precious.');                               // unknown section intact
    expect(app).toContain('Hand-written app description.');
  });

  it('preserves main.spec.md human sections while rewriting Features rows', async () => {
    const { fs, files } = memFs(fixtureFiles());
    await reconcile({ fs, wsRoot: WS, specsDir: `${WS}/src/specs`, mode: 'structural' });
    const main = files[`${WS}/src/specs/main.spec.md`];
    expect(main).toContain('Hand-written blurb.');
    expect(main).toContain('- **runtime:** test');
    expect(main).toContain('- `workspace:load` — loads');
    expect(main).toContain('| theme | Theme | src/theme.ts | theme.spec.md |');
    expect(main.indexOf('## Stack')).toBeLessThan(main.indexOf('## Features'));
  });

  it('unspecced files: reported by default, skeleton with flag', async () => {
    const base = fixtureFiles();
    base[`${WS}/src/newbie.ts`] = `export function fresh(): number { return 1; }\n`;
    {
      const { fs } = memFs({ ...base });
      const r = await reconcile({ fs, wsRoot: WS, specsDir: `${WS}/src/specs`, mode: 'structural' });
      expect(r.failed.some(f => f.path === 'src/newbie.ts')).toBe(true);
      expect(r.created).toEqual([]);
    }
    {
      const { fs, files } = memFs({ ...base });
      const r = await reconcile({ fs, wsRoot: WS, specsDir: `${WS}/src/specs`, mode: 'structural', createSkeletons: true });
      expect(r.created).toEqual(['newbie.spec.md']);
      const skel = files[`${WS}/src/specs/newbie.spec.md`];
      expect(skel).toContain('TODO: describe this feature');
      expect(skel).toContain('file: src/newbie.ts');
      expect(skel).toContain('exports: [fresh]');
      const main = files[`${WS}/src/specs/main.spec.md`];
      expect(main).toContain('| newbie |');
    }
  });

  it('is idempotent: second structural run reports all unchanged', async () => {
    const { fs, files } = memFs(fixtureFiles());
    await reconcile({ fs, wsRoot: WS, specsDir: `${WS}/src/specs`, mode: 'structural' });
    const snapshot = { ...files };
    const r2 = await reconcile({ fs, wsRoot: WS, specsDir: `${WS}/src/specs`, mode: 'structural' });
    expect(r2.updated).toEqual([]);
    expect({ ...files }).toEqual(snapshot);
  });

  it('excludes test infrastructure (src/test/, __tests__/) from features', async () => {
    const base = fixtureFiles();
    base[`${WS}/src/test/setup.ts`] = `export const mockElectronAPI = {};\n`;
    base[`${WS}/src/__tests__/helper.ts`] = `export const h = 1;\n`;
    const { fs, files } = memFs(base);
    const r = await reconcile({ fs, wsRoot: WS, specsDir: `${WS}/src/specs`, mode: 'structural', createSkeletons: true });
    expect(r.sourceFiles.has('src/test/setup.ts')).toBe(false);
    expect(r.created).toEqual([]);
    expect(files[`${WS}/src/specs/setup.spec.md`]).toBeUndefined();
    // still available for import resolution evidence
    expect(r.existingFiles.has('src/test/setup.ts')).toBe(true);
  });

  it('walks source dirs named "specs" — only the corpus dir itself is skipped', async () => {
    const base = fixtureFiles();
    base[`${WS}/src/renderer/specs/graphlib.ts`] = `export function build(): void {}\n`;
    base[`${WS}/src/specs/graphlib.spec.md`] = [
      '---', 'name: Graphlib', 'file: src/renderer/specs/graphlib.ts', 'type: utility', 'layer: utility',
      'singleton: false', 'exports: [stale]', '---', '',
      '# Graphlib', '', 'Hand-written graphlib description.', '',
      '## Dependencies', '', 'None.', '',
    ].join('\n');
    const { fs, files } = memFs(base);
    const r = await reconcile({ fs, wsRoot: WS, specsDir: `${WS}/src/specs`, mode: 'structural' });
    expect(r.sourceFiles.has('src/renderer/specs/graphlib.ts')).toBe(true);
    expect(files[`${WS}/src/specs/graphlib.spec.md`]).toContain('exports: [build]');
    // corpus .md files are not treated as source
    expect([...r.sourceFiles].some(f => f.endsWith('.spec.md'))).toBe(false);
  });

  it('never deletes ui specs and never touches their bodies', async () => {
    const base = fixtureFiles();
    base[`${WS}/src/specs/app-ui.spec.md`] = '---\nname: App UI\nparent: app\n---\n\n# App UI\n\n## DOM Structure\n\nRoot div.\n';
    const { fs, files } = memFs(base);
    const r = await reconcile({ fs, wsRoot: WS, specsDir: `${WS}/src/specs`, mode: 'structural' });
    expect(files[`${WS}/src/specs/app-ui.spec.md`]).toContain('Root div.');
    expect(r.unchanged).toContain('app-ui.spec.md');
  });
});
