import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseSpecDoc, serializeSpecDoc, fmGet, fmGetParsed, fmSet,
  getSection, setSection, getDescription, setDescription,
  parseDeps, parseRefs, parseIpc, parseExternalDeps, parseTest,
  formatDeps, formatRefs, formatBacktickList,
  parseFeaturesTables, formatFeaturesTables,
} from './format';

const SPECS_DIR = join(process.cwd(), 'src', 'specs');
const HAS_SPECS = existsSync(SPECS_DIR);
const files = HAS_SPECS ? readdirSync(SPECS_DIR).filter(f => f.endsWith('.spec.md')) : [];

describe('format round-trip', () => {
  it('finds the repo spec corpus', () => {
    if (!HAS_SPECS) return; // skip when specs dir is absent (CI)
    expect(files.length).toBeGreaterThan(30);
  });

  for (const f of files) {
    it(`round-trips ${f} byte-for-byte`, () => {
      const raw = readFileSync(join(SPECS_DIR, f), 'utf-8');
      expect(serializeSpecDoc(parseSpecDoc(raw))).toBe(raw);
    });
  }

  it('round-trips a file with unknown sections and no frontmatter', () => {
    const raw = '# Title\n\nDesc line.\n\n## Weird Custom Section\n\ncontent **bold**\n\n```js\ncode();\n```\n';
    expect(serializeSpecDoc(parseSpecDoc(raw))).toBe(raw);
  });

  it('round-trips empty string and frontmatter-only files', () => {
    expect(serializeSpecDoc(parseSpecDoc(''))).toBe('');
    const fmOnly = '---\nname: X\n---\n';
    expect(serializeSpecDoc(parseSpecDoc(fmOnly))).toBe(fmOnly);
  });
});

describe('frontmatter access', () => {
  const raw = '---\nname: Canvas Grid\nfile: src/renderer/components/canvas-grid.ts\nsingleton: false\nexports: [GridStyle, generateGridPattern]\n---\n\n# Canvas Grid\n\nDesc.\n';

  it('fmGet reads raw values', () => {
    const doc = parseSpecDoc(raw);
    expect(fmGet(doc, 'name')).toBe('Canvas Grid');
    expect(fmGet(doc, 'missing')).toBeUndefined();
  });

  it('fmGetParsed parses booleans and arrays', () => {
    const doc = parseSpecDoc(raw);
    expect(fmGetParsed(doc, 'singleton')).toBe(false);
    expect(fmGetParsed(doc, 'exports')).toEqual(['GridStyle', 'generateGridPattern']);
  });

  it('fmSet replaces in place and appends new keys', () => {
    const doc = parseSpecDoc(raw);
    fmSet(doc, 'singleton', true);
    fmSet(doc, 'layer', 'foundation');
    const out = serializeSpecDoc(doc);
    expect(out).toContain('singleton: true');
    expect(out).toContain('layer: foundation');
    // name position untouched
    expect(out.indexOf('name:')).toBeLessThan(out.indexOf('file:'));
  });
});

describe('section mutation preserves everything else', () => {
  const raw = [
    '---', 'name: X', 'file: src/x.ts', '---', '',
    '# X', '', 'Hand-written description that must survive.', '',
    '## Dependencies', '', '- **Old Dep** `src/old.ts` — old usage', '',
    '## Interface', '', '### Methods', '', '- **doThing** `(): void` — does thing', '',
    '## Custom Notes', '', 'Precious prose.', '',
  ].join('\n');

  it('setSection replaces only the target section', () => {
    const doc = parseSpecDoc(raw);
    setSection(doc, 'Dependencies', formatDeps([{ feature: 'New Dep', file: 'src/new.ts', usage: 'imports' }]));
    const out = serializeSpecDoc(doc);
    expect(out).toContain('- **New Dep** `src/new.ts` — imports');
    expect(out).not.toContain('Old Dep');
    expect(out).toContain('Hand-written description that must survive.');
    expect(out).toContain('- **doThing** `(): void` — does thing');
    expect(out).toContain('Precious prose.');
  });

  it('setSection appends a missing section at the end', () => {
    const doc = parseSpecDoc(raw);
    setSection(doc, 'Test', ['`src/x.test.ts`']);
    const out = serializeSpecDoc(doc);
    expect(out).toContain('## Test\n\n`src/x.test.ts`');
    expect(out.indexOf('Custom Notes')).toBeLessThan(out.indexOf('## Test'));
  });

  it('description get/set', () => {
    const doc = parseSpecDoc(raw);
    expect(getDescription(doc)).toBe('Hand-written description that must survive.');
    setDescription(doc, 'New desc.');
    expect(getDescription(parseSpecDoc(serializeSpecDoc(doc)))).toBe('New desc.');
  });
});

describe('structured reads', () => {
  it('parses plain and wiki-link dep forms', () => {
    const raw = [
      '# X', '',
      '## Dependencies', '',
      '- **Plain Dep** `src/a.ts` — uses a',
      '- [[b.spec.md|Wiki Dep]] `src/b.ts` — uses b',
      '',
      '## Referenced By', '',
      '- **Caller** `src/c.ts`',
      '',
      '## IPC Channels', '',
      '- `fs:readFile`',
      '',
      '## External Dependencies', '',
      '- `marked`',
      '',
      '## Test', '',
      '`src/x.test.ts`', '',
    ].join('\n');
    const doc = parseSpecDoc(raw);
    expect(parseDeps(doc)).toEqual([
      { feature: 'Plain Dep', file: 'src/a.ts', usage: 'uses a' },
      { feature: 'Wiki Dep', file: 'src/b.ts', usage: 'uses b' },
    ]);
    expect(parseRefs(doc)).toEqual([{ feature: 'Caller', file: 'src/c.ts' }]);
    expect(parseIpc(doc)).toEqual(['fs:readFile']);
    expect(parseExternalDeps(doc)).toEqual(['marked']);
    expect(parseTest(doc)).toBe('src/x.test.ts');
  });

  it('formatters emit canonical plain form', () => {
    expect(formatDeps([{ feature: 'A', file: 'src/a.ts' }])).toEqual(['- **A** `src/a.ts`']);
    expect(formatRefs([])).toEqual(['None.']);
    expect(formatBacktickList(['fs:readFile'])).toEqual(['- `fs:readFile`']);
  });
});

describe('main.spec.md features tables', () => {
  it('parses the real repo main.spec.md', () => {
    if (!HAS_SPECS) return;
    // The corpus is generated (gitignored) — assert structure, not exact ids.
    const raw = readFileSync(join(SPECS_DIR, 'main.spec.md'), 'utf-8');
    const doc = parseSpecDoc(raw);
    const features = parseFeaturesTables(doc);
    expect(Object.keys(features)).toContain('foundation');
    const allRows = Object.values(features).flat();
    expect(allRows.length).toBeGreaterThan(10);
    const specsmap = allRows.find(r => r.file === 'src/renderer/components/SpecsMapPlugin.ts');
    expect(specsmap).toBeTruthy();
    expect(specsmap!.spec).toMatch(/\.spec\.md$/);
  });

  it('format → parse is stable', () => {
    const features = {
      core: [{ id: 'app', name: 'App', file: 'src/app.ts', spec: 'app.spec.md', ui: '' }],
      foundation: [{ id: 'theme', name: 'Theme', file: 'src/theme.ts', spec: 'theme.spec.md', ui: 'theme-ui.spec.md' }],
    };
    const body = formatFeaturesTables(features, ['foundation', 'core']);
    const doc = parseSpecDoc('# X\n');
    setSection(doc, 'Features', body);
    const reparsed = parseFeaturesTables(parseSpecDoc(serializeSpecDoc(doc)));
    expect(reparsed).toEqual(features);
    // layer order respected
    const out = serializeSpecDoc(doc);
    expect(out.indexOf('### foundation')).toBeLessThan(out.indexOf('### core'));
  });
});
