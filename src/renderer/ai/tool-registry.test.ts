import { describe, it, expect } from 'vitest';
import { z } from 'zod/v3';
import { ToolRegistry } from './tool-registry';
import type { ToolDefinition } from './types';

const echoSchema = z.object({ message: z.string() });
const echoTool = {
  name: 'echo',
  description: 'echoes input',
  parameters: echoSchema,
  execute: async (args: { message: string }) => args.message,
} as ToolDefinition;

const addSchema = z.object({ a: z.number(), b: z.number() });
const addTool = {
  name: 'add',
  description: 'adds numbers',
  parameters: addSchema,
  execute: async (args: { a: number; b: number }) => String(args.a + args.b),
} as ToolDefinition;

describe('ToolRegistry', () => {
  it('registers tools from constructor', () => {
    const registry = new ToolRegistry([echoTool, addTool]);
    expect(registry.has('echo')).toBe(true);
    expect(registry.has('add')).toBe(true);
  });

  it('registers tools via register()', () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    expect(registry.get('echo')).toBe(echoTool);
  });

  it('throws on duplicate registration', () => {
    const registry = new ToolRegistry([echoTool]);
    expect(() => registry.register(echoTool)).toThrow('Duplicate tool registration: echo');
  });

  it('returns undefined for unknown tools', () => {
    const registry = new ToolRegistry();
    expect(registry.get('missing')).toBeUndefined();
    expect(registry.has('missing')).toBe(false);
  });

  it('lists all tool names', () => {
    const registry = new ToolRegistry([echoTool, addTool]);
    expect(registry.names()).toEqual(['echo', 'add']);
  });

  it('emits OpenAI-compatible function schemas', () => {
    const registry = new ToolRegistry([echoTool]);
    const schemas = registry.toOpenAISchemas();
    expect(schemas).toEqual([
      {
        type: 'function',
        function: {
          name: 'echo',
          description: 'echoes input',
          parameters: {
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
          },
        },
      },
    ]);
  });
});
