import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod/v3';
import { executeToolCall, type ToolCallResult } from './tool-executor';
import { ToolRegistry } from './tool-registry';
import { specsExploreTool, runCommandTool } from './tool-definitions';
import type { ToolContext, ToolDefinition } from './types';

const greetSchema = z.object({ name: z.string() });
const greetTool = {
  name: 'greet',
  description: 'greets someone',
  parameters: greetSchema,
  execute: async (args: { name: string }) => `Hello, ${args.name}`,
} as ToolDefinition;

const failSchema = z.object({});
const failTool = {
  name: 'fail',
  description: 'always fails',
  parameters: failSchema,
  execute: async () => {
    throw new Error('boom');
  },
} as ToolDefinition;

const dummyContext: ToolContext = {
  cockpit: {
    getWorkspacePath: vi.fn().mockReturnValue('/ws'),
  } as any,
  electronAPI: {} as Window['electronAPI'],
};

describe('executeToolCall', () => {
  it('executes a valid tool call and returns output', async () => {
    const registry = new ToolRegistry([greetTool]);
    const result = await executeToolCall(registry, 'greet', '{"name":"World"}', dummyContext);
    expect(result.ok).toBe(true);
    expect(result.output).toBe('Hello, World');
  });

  it('returns an error for unknown tools', async () => {
    const registry = new ToolRegistry([greetTool]);
    const result = await executeToolCall(registry, 'unknown', '{}', dummyContext);
    expect(result.ok).toBe(false);
    expect(result.output).toBe('Unknown tool: unknown');
  });

  it('returns an error for invalid JSON arguments', async () => {
    const registry = new ToolRegistry([greetTool]);
    const result = await executeToolCall(registry, 'greet', 'not-json', dummyContext);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('Invalid JSON arguments for tool greet');
  });

  it('returns an error when arguments fail validation', async () => {
    const registry = new ToolRegistry([greetTool]);
    const result = await executeToolCall(registry, 'greet', '{"age":42}', dummyContext);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('Invalid arguments for greet');
  });

  it('returns an error when the tool throws', async () => {
    const registry = new ToolRegistry([failTool]);
    const result = await executeToolCall(registry, 'fail', '{}', dummyContext);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('boom');
  });

  it('coerces null/undefined output to an empty string', async () => {
    const nullSchema = z.object({});
    const nullTool = {
      name: 'nullTool',
      description: 'returns undefined',
      parameters: nullSchema,
      execute: async () => undefined as any,
    } as ToolDefinition;
    const registry = new ToolRegistry([nullTool]);
    const result = await executeToolCall(registry, 'nullTool', '{}', dummyContext);
    expect(result.ok).toBe(true);
    expect(result.output).toBe('');
  });

  it('specs_explore tool delegates to cockpit.exploreSpecsMap', async () => {
    const exploreMock = vi.fn().mockResolvedValue('Found 1 spec node(s) matching "theme"');
    const ctx: ToolContext = {
      cockpit: { exploreSpecsMap: exploreMock } as any,
      electronAPI: {} as Window['electronAPI'],
    };
    const registry = new ToolRegistry([specsExploreTool]);
    const result = await executeToolCall(registry, 'specs_explore', '{"query":"theme"}', ctx);
    expect(result.ok).toBe(true);
    expect(exploreMock).toHaveBeenCalledWith('theme');
    expect(result.output).toContain('Found 1 spec node(s)');
  });

  it('specs_explore tool surfaces errors gracefully', async () => {
    const exploreMock = vi.fn().mockRejectedValue(new Error('Spec map unavailable'));
    const ctx: ToolContext = {
      cockpit: { exploreSpecsMap: exploreMock } as any,
      electronAPI: {} as Window['electronAPI'],
    };
    const registry = new ToolRegistry([specsExploreTool]);
    const result = await executeToolCall(registry, 'specs_explore', '{"query":"theme"}', ctx);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('Spec map unavailable');
  });

  it('run_command writes the command and returns the new terminal output', async () => {
    const readTerminal = vi.fn()
      .mockReturnValueOnce('prompt> ')
      .mockReturnValue('prompt> \necho hi\nhi\nprompt> ');
    const writeToTerminal = vi.fn();
    const ctx: ToolContext = {
      cockpit: { readTerminal, writeToTerminal } as any,
      electronAPI: {} as Window['electronAPI'],
    };
    const registry = new ToolRegistry([runCommandTool]);

    vi.useFakeTimers();
    try {
      const promise = executeToolCall(registry, 'run_command', '{"uuid":"t1","command":"echo hi"}', ctx);
      await vi.advanceTimersByTimeAsync(4000);
      const result = await promise;
      expect(writeToTerminal).toHaveBeenCalledWith('t1', 'echo hi');
      expect(result.ok).toBe(true);
      expect(result.output).toContain('hi');
      expect(result.output).not.toContain('timed out');
    } finally {
      vi.useRealTimers();
    }
  });

  it('run_command reports a timeout with partial output when output never stabilizes', async () => {
    const readTerminal = vi.fn()
      .mockReturnValueOnce('prompt> ')
      .mockReturnValue('prompt> \nrunning...\n');
    const ctx: ToolContext = {
      cockpit: { readTerminal, writeToTerminal: vi.fn() } as any,
      electronAPI: {} as Window['electronAPI'],
    };
    const registry = new ToolRegistry([runCommandTool]);

    vi.useFakeTimers();
    try {
      const promise = executeToolCall(registry, 'run_command', '{"uuid":"t1","command":"npm test","timeout_seconds":1}', ctx);
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;
      expect(result.ok).toBe(true);
      expect(result.output).toContain('running...');
      expect(result.output).toContain('timed out');
    } finally {
      vi.useRealTimers();
    }
  });
});
