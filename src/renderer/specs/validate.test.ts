import { describe, it, expect } from 'vitest';
import { parseSpecDoc } from './format';
import { buildGraph, buildMainIndex } from './graph';
import { staleFooter, summarizeReport, validate } from './validate';
import type { SourceFacts } from './types';

function spec(name: string, file: string, opts: {
  layer?: string; exports?: string[]; desc?: string;
  deps?: Array<[string, string]>; refs?: Array<[string, string]>; ipc?: string[];
} = {}): string {
  const lines = ['---', `name: ${name}`, `file: ${file}`];
  if (opts.layer) lines.push(`layer: ${opts.layer}`);
  if (opts.exports) lines.push(`exports: [${opts.exports.join(', ')}]`);
  lines.push('---', '', `# ${name}`, '', opts.desc ?? `${name} does something specific.`, '');
  if (opts.deps) {
    lines.push('## Dependencies', '');
    for (const [f, p] of opts.deps) lines.push(`- **${f}** \`${p}\``);
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
  '---', 'name: T', '---', '', '# T', '', '## Features', '',
  '### foundation', '',
  '| id | name | file | spec | ui |', '|----|------|------|------|----|',
  '| a | A | src/a.ts | a.spec.md | |',
  '| ghost | Ghost | src/ghost.ts | ghost.spec.md | |',
  '',
  '### core', '',
  '| id | name | file | spec | ui |', '|----|------|------|------|----|',
  '| b | B | src/b.ts | b.spec.md | |',
  '',
].join('\n');

function graphFrom(specStrs: Record<string, string>, withMain = true) {
  const specs = new Map(Object.entries(specStrs).map(([k, v]) => [k, parseSpecDoc(v)]));
  return buildGraph(withMain ? buildMainIndex(parseSpecDoc(MAIN)) : null, specs);
}

function ids(report: ReturnType<typeof validate>): string[] {
  return report.issues.map(i => i.id);
}

describe('validate rules', () => {
  it('clean symmetric graph → ok', () => {
    const g = graphFrom({
      'a.spec.md': spec('A', 'src/a.ts', { layer: 'foundation', refs: [['B', 'src/b.ts']] }),
      'b.spec.md': spec('B', 'src/b.ts', { layer: 'core', deps: [['A', 'src/a.ts']] }),
    });
    const r = validate(g);
    expect(r.ok).toBe(true);
    expect(ids(r).filter(i => i !== 'main.missing-feature')).toEqual([]);
  });

  it('edge.unresolved (error) when dep path resolves to nothing', () => {
    const g = graphFrom({ 'a.spec.md': spec('A', 'src/a.ts', { deps: [['Nope', 'src/nope.ts']] }) });
    const r = validate(g);
    expect(ids(r)).toContain('edge.unresolved');
    expect(r.ok).toBe(false);
  });

  it('edge.asymmetric (warn) when reverse ref missing', () => {
    const g = graphFrom({
      'a.spec.md': spec('A', 'src/a.ts', { layer: 'foundation' }),
      'b.spec.md': spec('B', 'src/b.ts', { layer: 'core', deps: [['A', 'src/a.ts']] }),
    });
    const issue = validate(g).issues.find(i => i.id === 'edge.asymmetric');
    expect(issue?.featureId).toBe('a');
  });

  it('layer.cycle (warn)', () => {
    const g = graphFrom({
      'a.spec.md': spec('A', 'src/a.ts', { deps: [['B', 'src/b.ts']], refs: [['B', 'src/b.ts']] }),
      'b.spec.md': spec('B', 'src/b.ts', { deps: [['A', 'src/a.ts']], refs: [['A', 'src/a.ts']] }),
    });
    expect(ids(validate(g))).toContain('layer.cycle');
  });

  it('layer.inversion (warn) when foundation depends on window', () => {
    const g = graphFrom({
      'a.spec.md': spec('A', 'src/a.ts', { layer: 'foundation', deps: [['P', 'src/p.ts']] }),
      'p.spec.md': spec('P', 'src/p.ts', { layer: 'window', refs: [['A', 'src/a.ts']] }),
    }, false);
    expect(ids(validate(g))).toContain('layer.inversion');
  });

  it('no inversion for downward, utility, or orchestrator edges', () => {
    const g = graphFrom({
      'p.spec.md': spec('P', 'src/p.ts', { layer: 'window', deps: [['A', 'src/a.ts'], ['U', 'src/u.ts']] }),
      'a.spec.md': spec('A', 'src/a.ts', { layer: 'foundation', refs: [['P', 'src/p.ts']] }),
      'u.spec.md': spec('U', 'src/u.ts', { layer: 'utility', refs: [['P', 'src/p.ts']] }),
      // orchestrator wiring widgets/modals/windows is normal architecture
      'c.spec.md': spec('C', 'src/c.ts', { layer: 'core', deps: [['W', 'src/w.ts'], ['P', 'src/p.ts']] }),
      'w.spec.md': spec('W', 'src/w.ts', { layer: 'widget', refs: [['C', 'src/c.ts']] }),
    }, false);
    expect(ids(validate(g))).not.toContain('layer.inversion');
  });

  it('utility depending on a UI layer is an inversion', () => {
    const g = graphFrom({
      'u.spec.md': spec('U', 'src/u.ts', { layer: 'utility', deps: [['W', 'src/w.ts']] }),
      'w.spec.md': spec('W', 'src/w.ts', { layer: 'widget', refs: [['U', 'src/u.ts']] }),
    }, false);
    expect(ids(validate(g))).toContain('layer.inversion');
  });

  it('description.stub (info) for stub and empty descriptions', () => {
    const g = graphFrom({
      'a.spec.md': spec('A', 'src/a.ts', { desc: 'TODO: describe this feature' }),
      'b.spec.md': spec('B', 'src/b.ts', { desc: 'Auto-generated spec for B' }),
    }, false);
    expect(ids(validate(g)).filter(i => i === 'description.stub').length).toBe(2);
  });

  it('main.orphan-row + main.missing-feature + spec.missing-file with sourceFiles', () => {
    const g = graphFrom({
      'a.spec.md': spec('A', 'src/a.ts'),
      'b.spec.md': spec('B', 'src/b.ts'),
    });
    const r = validate(g, { sourceFiles: new Set(['src/a.ts', 'src/new.ts']) });
    expect(ids(r)).toContain('main.orphan-row');      // ghost row + b row missing on disk
    expect(ids(r)).toContain('main.missing-feature'); // src/new.ts has no row
    expect(ids(r)).toContain('spec.missing-file');    // b.spec.md points at missing src/b.ts
    expect(r.coverage.unspecced).toEqual(['src/new.ts']);
    expect(r.coverage.linked).toBe(1);
  });

  it('existingFiles keeps non-TS specs (html/css) from false missing-file errors', () => {
    const g = graphFrom({
      'a.spec.md': spec('A', 'src/a.ts'),
      'shell.spec.md': spec('Shell', 'src/index.html'),
    }, false);
    // sourceFiles = TS features only; existingFiles includes the html file
    const r = validate(g, {
      sourceFiles: new Set(['src/a.ts']),
      existingFiles: new Set(['src/a.ts', 'src/index.html']),
    });
    expect(ids(r)).not.toContain('spec.missing-file');
    // without existingFiles the TS-only set would false-positive
    const bad = validate(g, { sourceFiles: new Set(['src/a.ts']) });
    expect(ids(bad)).toContain('spec.missing-file');
  });

  it('exports.drift + ipc.unlisted with facts', () => {
    const g = graphFrom({
      'a.spec.md': spec('A', 'src/a.ts', { exports: ['A'], ipc: ['fs:readFile'] }),
    }, false);
    const facts = new Map<string, SourceFacts>([['src/a.ts', {
      relativePath: 'src/a.ts', exports: ['A', 'helperFn'], importPaths: [],
      ipcChannels: ['fs:readFile', 'fs:writeFile'], externalPackages: [],
      singleton: false, suggestedType: 'logic', suggestedLayer: 'core',
    }]]);
    const r = validate(g, { facts });
    expect(ids(r)).toContain('exports.drift');
    expect(ids(r)).toContain('ipc.unlisted');
  });
});

describe('report summaries', () => {
  it('summarizeReport formats counts', () => {
    const g = graphFrom({ 'a.spec.md': spec('A', 'src/a.ts', { deps: [['X', 'src/x.ts']] }) }, false);
    const r = validate(g);
    expect(summarizeReport(r)).toMatch(/^✕ 1 error/);
    const clean = validate(graphFrom({ 'a.spec.md': spec('A', 'src/a.ts') }, false));
    expect(summarizeReport(clean)).toBe('✓ valid');
  });

  it('staleFooter only when errors/warnings exist', () => {
    const clean = validate(graphFrom({ 'a.spec.md': spec('A', 'src/a.ts') }, false));
    expect(staleFooter(clean)).toBe('');
    expect(staleFooter(null)).toBe('');
    const dirty = validate(graphFrom({ 'a.spec.md': spec('A', 'src/a.ts', { deps: [['X', 'src/x.ts']] }) }, false));
    expect(staleFooter(dirty)).toContain('specs_validate');
  });
});
