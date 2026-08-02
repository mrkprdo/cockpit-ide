import { describe, it, expect } from 'vitest';
import {
  parseRule,
  compilePattern,
  normalizePath,
  ruleMatches,
  parsePermissions,
  evaluatePermission,
  applyMode,
  familyForTool,
} from './permissions';
import type { SubAgentDefinition } from './types';

function defn(over: Partial<SubAgentDefinition> = {}): SubAgentDefinition {
  return {
    name: 'test-agent',
    description: 'd',
    systemPrompt: 'sp',
    permissions: { allow: [], deny: [], ask: [] },
    ...over,
  };
}

describe('parseRule', () => {
  it('parses Tool(pattern) form', () => {
    expect(parseRule('Bash(npm run test *)')).toEqual({ tool: 'Bash', pattern: 'npm run test *' });
    expect(parseRule('Read(./**/*.ts)')).toEqual({ tool: 'Read', pattern: './**/*.ts' });
  });

  it('parses bare tool names', () => {
    expect(parseRule('Read')).toEqual({ tool: 'Read', pattern: '' });
    expect(parseRule('*')).toEqual({ tool: '*', pattern: '' });
  });

  it('returns null for malformed input', () => {
    expect(parseRule('')).toBeNull();
    expect(parseRule('Bash(')).toBeNull();
    expect(parseRule('not a rule')).toBeNull();
  });
});

describe('compilePattern', () => {
  it('empty pattern matches anything', () => {
    expect(compilePattern('').test('anything')).toBe(true);
  });

  it('wildcards: single * is non-greedy over non-slash, ** crosses dirs', () => {
    expect(compilePattern('npm run test *').test('npm run test app')).toBe(true);
    expect(compilePattern('npm run test *').test('npm run test app extra')).toBe(true);
    expect(compilePattern('./**/*.ts').test('./src/renderer/app.ts')).toBe(true);
    expect(compilePattern('*.ts').test('a.ts')).toBe(true);
    expect(compilePattern('*.ts').test('a/b.ts')).toBe(false);
  });
});

describe('normalizePath', () => {
  it('normalizes backslashes, dots, and strips drive/workspace prefixes', () => {
    expect(normalizePath('src\\renderer\\app.ts')).toBe('src/renderer/app.ts');
    expect(normalizePath('C:/ws/./src/../src/app.ts', 'C:/ws')).toBe('src/app.ts');
    expect(normalizePath('/ws/src/app.ts', '/ws')).toBe('src/app.ts');
    expect(normalizePath('/ws/src/app.ts')).toBe('/ws/src/app.ts');
  });
});

describe('ruleMatches', () => {
  it('matches family + pattern against the primary arg', () => {
    const r = parseRule('Bash(npm run test *)')!;
    expect(ruleMatches(r, 'write_to_terminal', { command: 'npm run test src/foo' })).toBe(true);
    expect(ruleMatches(r, 'write_to_terminal', { command: 'rm -rf /' })).toBe(false);
  });

  it('family match works for bare rules', () => {
    const r = parseRule('Read')!;
    expect(ruleMatches(r, 'read_file', { path: '/anything' })).toBe(true);
    // Write tool is not in the Read family.
    expect(ruleMatches(r, 'write_file', { path: '/x' })).toBe(false);
  });

  it('Write(.env) matches only the exact sensitive file', () => {
    const r = parseRule('Write(.env)')!;
    expect(ruleMatches(r, 'write_file', { path: '/ws/.env' })).toBe(true);
    expect(ruleMatches(r, 'write_file', { path: '/ws/.env.example' })).toBe(false);
  });

  it('Agent rules match agent ids', () => {
    const r = parseRule('Agent(worker)')!;
    expect(ruleMatches(r, 'agent_spawn', { agent: 'worker' })).toBe(true);
    expect(ruleMatches(r, 'agent_spawn', { agent: 'researcher' })).toBe(false);
  });
});

describe('evaluatePermission', () => {
  it('deny wins over allow and ask', () => {
    const d = defn({
      permissions: { allow: ['Bash(git log *)'], deny: ['Bash(git *)'], ask: ['Bash(git push *)'] },
    });
    expect(evaluatePermission(d, 'write_to_terminal', { command: 'git push origin main' })).toBe('deny');
  });

  it('ask beats allow when no deny', () => {
    const d = defn({ permissions: { allow: ['Bash(npm *)'], ask: ['Bash(npm install *)'] } });
    expect(evaluatePermission(d, 'write_to_terminal', { command: 'npm install lodash' })).toBe('ask');
  });

  it('allow returns allow; nothing matches returns unset', () => {
    const d = defn({ permissions: { allow: ['Bash(npm run test *)'] } });
    expect(evaluatePermission(d, 'write_to_terminal', { command: 'npm run test app' })).toBe('allow');
    expect(evaluatePermission(d, 'write_to_terminal', { command: 'rm -rf /' })).toBe('unset');
  });
});

describe('applyMode', () => {
  it('plan denies writes and bash, allows reads', () => {
    expect(applyMode('unset', 'plan', 'write_file')).toBe('deny');
    expect(applyMode('allow', 'plan', 'read_file')).toBe('allow');
  });

  it('dontAsk only runs explicit allow', () => {
    expect(applyMode('ask', 'dontAsk', 'read_file')).toBe('deny');
    expect(applyMode('allow', 'dontAsk', 'read_file')).toBe('allow');
  });

  it('auto approves allow and ask', () => {
    expect(applyMode('ask', 'auto', 'write_file')).toBe('allow');
    expect(applyMode('deny', 'auto', 'write_file')).toBe('deny');
  });

  it('default: unset reads allowed, unset writes denied', () => {
    expect(applyMode('unset', 'default', 'read_file')).toBe('allow');
    expect(applyMode('unset', 'default', 'write_file')).toBe('deny');
  });

  it('acceptEdits auto-approves Write/Edit but gates Bash', () => {
    expect(applyMode('unset', 'acceptEdits', 'write_file')).toBe('allow');
    expect(applyMode('unset', 'acceptEdits', 'write_to_terminal')).toBe('deny');
    expect(applyMode('ask', 'acceptEdits', 'write_to_terminal')).toBe('ask');
    expect(applyMode('deny', 'acceptEdits', 'write_file')).toBe('deny');
  });
});

describe('familyForTool', () => {
  it('maps tool names to families', () => {
    expect(familyForTool('write_to_terminal')).toBe('Bash');
    expect(familyForTool('grep_workspace')).toBe('Grep');
    expect(familyForTool('agent_spawn')).toBe('Agent');
  });
});

describe('parsePermissions', () => {
  it('filters malformed entries', () => {
    const parsed = parsePermissions({ allow: ['Read', 'Bash(', '(()'], deny: [], ask: [] });
    expect(parsed.allow).toHaveLength(1);
    expect(parsed.allow[0].tool).toBe('Read');
  });
});
