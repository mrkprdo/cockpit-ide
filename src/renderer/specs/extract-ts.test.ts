import { describe, it, expect } from 'vitest';
import { extractSourceFacts } from './extract-ts';

function facts(relativePath: string, content: string, fileSet: string[] = []) {
  return extractSourceFacts(relativePath, content, new Set(fileSet));
}

describe('classify: type', () => {
  it('classifies .d.ts as model', () => {
    expect(facts('src/types.d.ts', 'export interface Foo { x: number }').suggestedType).toBe('model');
  });

  it('classifies main/preload files as process', () => {
    expect(facts('src/main/main.ts', 'app.whenReady()').suggestedType).toBe('process');
    expect(facts('src/preload/preload.ts', 'contextBridge.exposeInMainWorld()').suggestedType).toBe('process');
  });

  it('classifies DOM-touching code as ui', () => {
    expect(facts('src/renderer/Widget.ts', 'export class Widget { render() { document.createElement("div"); } }').suggestedType).toBe('ui');
  });

  it('classifies IPC-only code as data', () => {
    expect(facts('src/renderer/api.ts', 'export function load() { return window.electronAPI.fs.readFile("x"); }').suggestedType).toBe('data');
  });

  it('classifies empty/whitespace-only content as config', () => {
    expect(facts('src/renderer/constants.ts', '// just a comment\n\n').suggestedType).toBe('config');
  });

  it('classifies interface/type-heavy files as model', () => {
    const content = [
      'export interface A { a: number }',
      'export interface B { b: string }',
      'export type C = A | B',
      'const x = 1',
    ].join('\n');
    expect(facts('src/renderer/types.ts', content).suggestedType).toBe('model');
  });

  it('classifies function-heavy files with no DOM/IPC as utility', () => {
    const content = [
      'export function add(a: number, b: number) { return a + b; }',
      'export function sub(a: number, b: number) { return a - b; }',
      'const helper = 1',
    ].join('\n');
    expect(facts('src/renderer/math.ts', content).suggestedType).toBe('utility');
  });

  it('falls back to logic when nothing else matches', () => {
    const content = 'export class Store { private state = {}; update(v: unknown) { this.state = v; } }';
    expect(facts('src/renderer/store.ts', content).suggestedType).toBe('logic');
  });
});

describe('classify: layer', () => {
  it('classifies files with no project-relative imports as foundation', () => {
    const content = "import { z } from 'zod';\nexport const schema = z.object({});";
    expect(facts('src/renderer/schema.ts', content).suggestedLayer).toBe('foundation');
  });

  it('classifies modal-path files as modal when it imports project code', () => {
    const content = "import { Base } from './base';\nexport class ConfirmModal extends Base {}";
    expect(facts('src/renderer/components/ConfirmModal.ts', content).suggestedLayer).toBe('modal');
  });

  it('classifies overlay/palette/tutorial/drawer-path files as overlay', () => {
    const content = "import { Base } from './base';\nexport class CommandPalette extends Base {}";
    expect(facts('src/renderer/components/CommandPalette.ts', content).suggestedLayer).toBe('overlay');
  });

  it('classifies plugin-path files as plugin', () => {
    const content = "import { Base } from './base';\nexport class GitPlugin extends Base {}";
    expect(facts('src/renderer/components/GitPlugin.ts', content).suggestedLayer).toBe('plugin');
  });

  it('classifies utility-typed files outside special paths as utility layer', () => {
    const content = [
      "import { helper } from './helper';",
      'export function add(a: number, b: number) { return a + b; }',
      'export function sub(a: number, b: number) { return a - b; }',
    ].join('\n');
    expect(facts('src/renderer/math.ts', content).suggestedLayer).toBe('utility');
  });

  it('classifies ui-typed files outside special paths as widget layer', () => {
    const content = "import { Base } from './base';\nexport class Button extends Base { render() { document.createElement('button'); } }";
    expect(facts('src/renderer/components/Button.ts', content).suggestedLayer).toBe('widget');
  });

  it('defaults everything else to core', () => {
    const content = "import { Base } from './base';\nexport class Store extends Base { update() {} }";
    expect(facts('src/renderer/Store.ts', content).suggestedLayer).toBe('core');
  });
});

describe('resolveImport (via importPaths)', () => {
  it('resolves a sibling file with an extension appended', () => {
    const fileSet = ['src/renderer/a.ts', 'src/renderer/b.ts'];
    const f = facts('src/renderer/a.ts', "import { b } from './b';", fileSet);
    expect(f.importPaths).toEqual(['src/renderer/b.ts']);
  });

  it('resolves a directory import to its index file', () => {
    const fileSet = ['src/renderer/a.ts', 'src/renderer/lib/index.ts'];
    const f = facts('src/renderer/a.ts', "import { x } from './lib';", fileSet);
    expect(f.importPaths).toEqual(['src/renderer/lib/index.ts']);
  });

  it('resolves parent-directory (..) traversal', () => {
    const fileSet = ['src/renderer/components/a.ts', 'src/renderer/shared.ts'];
    const f = facts('src/renderer/components/a.ts', "import { s } from '../shared';", fileSet);
    expect(f.importPaths).toEqual(['src/renderer/shared.ts']);
  });

  it('drops an import that resolves to nothing in fileSet', () => {
    const f = facts('src/renderer/a.ts', "import { x } from './missing';", ['src/renderer/a.ts']);
    expect(f.importPaths).toEqual([]);
  });

  it('collects external packages, splitting scoped names to two segments', () => {
    const f = facts('src/renderer/a.ts', "import x from 'lodash/debounce';\nimport y from '@scope/pkg/sub';");
    expect(f.externalPackages.sort()).toEqual(['@scope/pkg', 'lodash']);
  });

  it('ignores node: builtin imports', () => {
    const f = facts('src/renderer/a.ts', "import fs from 'node:fs';");
    expect(f.externalPackages).toEqual([]);
  });
});

describe('extractSourceFacts: other facts', () => {
  it('collects export declarations and export-list renames', () => {
    const content = [
      'export class Foo {}',
      'export function bar() {}',
      'const a = 1, b = 2;',
      'export { a, b as bee };',
    ].join('\n');
    const f = facts('src/renderer/foo.ts', content);
    expect(f.exports.sort()).toEqual(['Foo', 'a', 'bar', 'bee']);
  });

  it('collects IPC channels matching known namespaces only', () => {
    const content = "window.electronAPI.fs.readFile('x'); doThing('not:achannel'); go('git:status');";
    const f = facts('src/renderer/a.ts', content);
    expect(f.ipcChannels.sort()).toEqual(['git:status']);
  });

  it('finds a matching test file by stem', () => {
    const fileSet = ['src/renderer/foo.ts', 'src/renderer/foo.test.ts'];
    const f = facts('src/renderer/foo.ts', 'export const x = 1;', fileSet);
    expect(f.testPath).toBe('src/renderer/foo.test.ts');
  });

  it('leaves testPath undefined when no test file exists', () => {
    const f = facts('src/renderer/foo.ts', 'export const x = 1;', ['src/renderer/foo.ts']);
    expect(f.testPath).toBeUndefined();
  });

  it('detects singleton via getInstance()', () => {
    expect(facts('src/renderer/store.ts', 'class Store { static getInstance() {} }').singleton).toBe(true);
  });

  it('detects singleton via exported const = new', () => {
    expect(facts('src/renderer/store.ts', 'export const store = new Store();').singleton).toBe(true);
  });

  it('does not flag non-singleton classes', () => {
    expect(facts('src/renderer/widget.ts', 'export class Widget {}').singleton).toBe(false);
  });
});
