import { describe, it, expect } from 'vitest';
import { parseSpecDoc } from './format';
import {
  buildGraph, buildMainIndex, contextMarkdown, findCycles,
  impact, neighbors, resolveFeature, search, specIdFromFilename,
} from './graph';

function makeSpec(opts: {
  name: string; file?: string; entry?: string; layer?: string; type?: string;
  exports?: string[]; deps?: Array<[string, string, string?]>; refs?: Array<[string, string]>;
  ipc?: string[]; desc?: string;
}): string {
  const lines = ['---', `name: ${opts.name}`];
  if (opts.file) lines.push(`file: ${opts.file}`);
  if (opts.entry) lines.push(`entry: ${opts.entry}`);
  if (opts.type) lines.push(`type: ${opts.type}`);
  if (opts.layer) lines.push(`layer: ${opts.layer}`);
  if (opts.exports) lines.push(`exports: [${opts.exports.join(', ')}]`);
  lines.push('---', '', `# ${opts.name}`, '', opts.desc ?? `${opts.name} description.`, '');
  if (opts.deps) {
    lines.push('## Dependencies', '');
    for (const [f, p, u] of opts.deps) lines.push(`- **${f}** \`${p}\`${u ? ` — ${u}` : ''}`);
    lines.push('');
  }
  if (opts.refs) {
    lines.push('## Referenced By', '');
    for (const [f, p] of opts.refs) lines.push(`- **${f}** \`${p}\``);
    lines.push('');
  }
  if (opts.ipc) {
    lines.push('## IPC Channels', '');
    for (const ch of opts.ipc) lines.push(`- \`${ch}\``);
    lines.push('');
  }
  return lines.join('\n');
}

const MAIN = [
  '---', 'name: Test', 'version: 1.0.0', '---', '', '# Test', '',
  '## Features', '',
  '### foundation', '',
  '| id | name | file | spec | ui |', '|----|------|------|------|----|',
  '| theme | Theme | src/theme.ts | theme.spec.md | |',
  '',
  '### core', '',
  '| id | name | file | spec | ui |', '|----|------|------|------|----|',
  '| app | App | src/App.ts | app.spec.md | app-ui.spec.md |',
  '',
  '### window', '',
  '| id | name | file | spec | ui |', '|----|------|------|------|----|',
  '| widget | Widget | src/Widget.ts | widget.spec.md | |',
  '',
].join('\n');

function buildFixture() {
  const main = buildMainIndex(parseSpecDoc(MAIN));
  const specs = new Map([
    ['theme.spec.md', parseSpecDoc(makeSpec({ name: 'Theme', file: 'src/theme.ts', exports: ['Theme'], desc: 'Colors and tokens.' }))],
    ['app.spec.md', parseSpecDoc(makeSpec({
      name: 'App', file: 'src/App.ts',
      deps: [['Theme', 'src/theme.ts', 'applies theme'], ['Widget', 'src/Widget.ts', 'renders']],
      ipc: ['workspace:load'],
    }))],
    ['app-ui.spec.md', parseSpecDoc('---\nname: App UI\nparent: app\n---\n\n# App UI\n\nUI spec.\n')],
    ['widget.spec.md', parseSpecDoc(makeSpec({
      name: 'Widget', file: 'src/Widget.ts',
      deps: [['Theme', 'src/theme.ts']],
      refs: [['App', 'src/App.ts']],
    }))],
  ]);
  return buildGraph(main, specs);
}

describe('buildGraph', () => {
  it('builds nodes with layers from the main index', () => {
    const g = buildFixture();
    expect(g.nodes.size).toBe(4);
    expect(g.nodes.get('theme')?.layer).toBe('foundation');
    expect(g.nodes.get('app')?.layer).toBe('core');
    expect(g.nodes.get('app')?.uiSpecFile).toBe('app-ui.spec.md');
    expect(g.nodes.get('app-ui')?.parentId).toBe('app');
  });

  it('resolves depends edges by file path and creates ui-of edges', () => {
    const g = buildFixture();
    const depends = g.edges.filter(e => e.kind === 'depends').map(e => `${e.from}->${e.to}`);
    expect(depends).toContain('app->theme');
    expect(depends).toContain('app->widget');
    expect(depends).toContain('widget->theme');
    expect(g.edges.filter(e => e.kind === 'ui-of')).toEqual([{ kind: 'ui-of', from: 'app-ui', to: 'app' }]);
  });

  it('byFile and basename fallback resolution', () => {
    const g = buildFixture();
    expect(resolveFeature(g.byFile, g.byBasename, 'src/theme.ts')).toBe('theme');
    expect(resolveFeature(g.byFile, g.byBasename, 'theme.ts')).toBe('theme');
    expect(resolveFeature(g.byFile, g.byBasename, 'src\\theme.ts')).toBe('theme');
    expect(resolveFeature(g.byFile, g.byBasename, 'src/nope.ts')).toBeUndefined();
  });

  it('specIdFromFilename strips extension', () => {
    expect(specIdFromFilename('canvas-area.spec.md')).toBe('canvas-area');
  });
});

describe('search', () => {
  it('matches id, description, ipc, exports and ranks id matches first', () => {
    const g = buildFixture();
    expect(search(g, 'widget').map(n => n.id)).toEqual(['widget']);
    expect(search(g, 'tokens')[0].id).toBe('theme');
    expect(search(g, 'workspace:load')[0].id).toBe('app');
    expect(search(g, '')).toEqual([]);
    const app = search(g, 'app');
    expect(app[0].id).toBe('app'); // exact before app-ui
  });
});

describe('neighbors / impact / cycles', () => {
  it('neighbors depth 1', () => {
    const g = buildFixture();
    const nb = neighbors(g, 'widget');
    expect(nb.upstream.map(n => n.id)).toEqual(['theme']);
    expect(nb.downstream.map(n => n.id)).toEqual(['app']);
  });

  it('impact transitively at depth', () => {
    const g = buildFixture();
    expect(impact(g, 'theme', 3).downstream.sort()).toEqual(['app', 'widget']);
    expect(impact(g, 'theme', 1).downstream.sort()).toEqual(['app', 'widget']);
    expect(impact(g, 'app', 3).upstream.sort()).toEqual(['theme', 'widget']);
  });

  it('findCycles detects a 2-node cycle and ignores DAGs', () => {
    const g = buildFixture();
    expect(findCycles(g)).toEqual([]);
    const specs = new Map([
      ['a.spec.md', parseSpecDoc(makeSpec({ name: 'A', file: 'src/a.ts', deps: [['B', 'src/b.ts']] }))],
      ['b.spec.md', parseSpecDoc(makeSpec({ name: 'B', file: 'src/b.ts', deps: [['A', 'src/a.ts']] }))],
    ]);
    const cyclic = buildGraph(null, specs);
    const cycles = findCycles(cyclic);
    expect(cycles.length).toBe(1);
    expect(cycles[0].sort()).toEqual(['a', 'b']);
  });
});

describe('contextMarkdown', () => {
  it('emits dense sections including neighborhood and impact', () => {
    const g = buildFixture();
    const md = contextMarkdown(g, 'theme');
    expect(md).toContain('## theme');
    expect(md).toContain('- **file:** `src/theme.ts`');
    expect(md).toContain('### Description');
    expect(md).toContain('Colors and tokens.');
    expect(md).toContain('downstream: ');
    expect(md).toContain('feature(s) downstream may be affected');
  });

  it('includes Interface from doc when requested', () => {
    const g = buildFixture();
    const doc = parseSpecDoc('# T\n\nd\n\n## Interface\n\n- **m** `(): void` — x\n');
    const md = contextMarkdown(g, 'app', doc);
    expect(md).toContain('### Interface');
    expect(md).toContain('- **m** `(): void` — x');
  });

  it('returns empty string for unknown id', () => {
    expect(contextMarkdown(buildFixture(), 'nope')).toBe('');
  });
});
