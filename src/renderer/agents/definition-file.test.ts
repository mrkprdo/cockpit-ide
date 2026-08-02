import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseDefinitionFile, loadDefinitionsFromWorkspace } from './definition-file';
import { getDefinition, isCustomDefinition, clearCustomDefinitions, listDefinitions } from './definitions';

describe('parseDefinitionFile', () => {
  it('parses a valid definition', () => {
    const raw = JSON.stringify({
      name: 'db-reader',
      description: 'Read-only SQL analyst',
      systemPrompt: 'You are a DB analyst.',
      tools: ['Bash'],
      permissionMode: 'default',
      permissions: { allow: ['Bash(select *)'], deny: ['Bash(delete *)'] },
      maxTurns: 10,
      color: 'blue',
    });
    const r = parseDefinitionFile('db-reader.json', raw);
    expect('defn' in r).toBe(true);
    if ('defn' in r) {
      expect(r.defn.name).toBe('db-reader');
      expect(r.defn.permissionMode).toBe('default');
      expect(r.defn.permissions?.deny).toEqual(['Bash(delete *)']);
    }
  });

  it('rejects invalid JSON', () => {
    const r = parseDefinitionFile('x.json', '{not json');
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toContain('invalid JSON');
  });

  it('rejects schema violations (bad name, missing prompt)', () => {
    const bad = parseDefinitionFile('bad.json', JSON.stringify({ name: 'Bad Name', description: 'd' }));
    expect('error' in bad).toBe(true);
    if ('error' in bad) expect(bad.error).toContain('schema');
  });
});

describe('loadDefinitionsFromWorkspace', () => {
  let files: Record<string, string | null>;
  let fsMock: any;

  beforeEach(() => {
    files = {
      'db-reader.json': JSON.stringify({ name: 'db-reader', description: 'Read-only', systemPrompt: 'SP', tools: ['Bash'] }),
      'malformed.json': '{oops',
      'bus.jsonl': 'ignored',
      'collide.json': JSON.stringify({ name: 'implementer', description: 'collides with built-in', systemPrompt: 'SP' }),
    };
    fsMock = {
      readDir: async () => Object.keys(files).map(name => ({ name, isDirectory: false })),
      readFile: async (p: string) => files[p.split('/').pop() as string] ?? null,
      mkdir: async () => true,
    };
    clearCustomDefinitions();
  });

  afterEach(() => clearCustomDefinitions());

  it('registers valid custom definitions and reports errors/skips', async () => {
    const res = await loadDefinitionsFromWorkspace('/ws', fsMock);
    expect(res.loaded.map(d => d.name)).toEqual(['db-reader']);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].file).toBe('malformed.json');
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0].reason).toContain('collides');

    expect(isCustomDefinition('db-reader')).toBe(true);
    expect(getDefinition('db-reader')?.name).toBe('db-reader');
  });

  it('built-ins still resolve after custom load', async () => {
    await loadDefinitionsFromWorkspace('/ws', fsMock);
    expect(getDefinition('implementer')).toBeTruthy();
    expect(listDefinitions().length).toBeGreaterThanOrEqual(10);
  });

  it('returns empty report when no workspace or fs', async () => {
    const res = await loadDefinitionsFromWorkspace('', null as never);
    expect(res.loaded).toHaveLength(0);
    expect(res.errors).toHaveLength(0);
  });
});
