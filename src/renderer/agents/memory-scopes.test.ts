import { describe, it, expect, vi } from 'vitest';
import { resolveMemoryScope, localMemoryPath, readLocalMemory, writeLocalMemory } from './memory-scopes';

describe('memory-scopes', () => {
  it('defaults to project scope when a definition has none', () => {
    expect(resolveMemoryScope(null)).toBe('project');
    expect(resolveMemoryScope({ name: 'x', description: 'd', systemPrompt: 's' })).toBe('project');
  });

  it('honors the definition memoryScope', () => {
    expect(resolveMemoryScope({ name: 'x', description: 'd', systemPrompt: 's', memoryScope: 'user' })).toBe('user');
    expect(resolveMemoryScope({ name: 'x', description: 'd', systemPrompt: 's', memoryScope: 'local' })).toBe('local');
  });

  it('local memory path is under .cockpit/agents/memory with forward slashes', () => {
    expect(localMemoryPath('C:\\ws', 'reviewer')).toBe('C:/ws/.cockpit/agents/memory/reviewer.md');
  });

  it('readLocalMemory returns content or empty string', async () => {
    const fsApi = { readFile: vi.fn(async () => 'state so far') };
    expect(await readLocalMemory('/ws', 'reviewer', fsApi as never)).toBe('state so far');
    const missing = { readFile: vi.fn(async () => null) };
    expect(await readLocalMemory('/ws', 'reviewer', missing as never)).toBe('');
  });

  it('writeLocalMemory mkdirs then writes', async () => {
    const calls: string[] = [];
    const fsApi = {
      mkdir: vi.fn(async () => { calls.push('mkdir'); return true; }),
      writeFile: vi.fn(async () => { calls.push('write'); return true; }),
    };
    const ok = await writeLocalMemory('/ws', 'planner', 'hello', fsApi as never);
    expect(ok).toBe(true);
    expect(calls).toEqual(['mkdir', 'write']);
  });
});
