import type { ToolDefinition, OpenAIFunctionSchema } from './types';
import { zodToJsonSchema } from './zod-to-openai';

/**
 * Registry that maps tool names to definitions and can emit OpenAI-compatible
 * function schemas for LLM function calling.
 */
export class ToolRegistry {
  private byName = new Map<string, ToolDefinition>();

  constructor(tools: ToolDefinition[] = []) {
    for (const tool of tools) this.register(tool);
  }

  register(tool: ToolDefinition): void {
    if (this.byName.has(tool.name)) {
      throw new Error(`Duplicate tool registration: ${tool.name}`);
    }
    this.byName.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.byName.get(name);
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  names(): string[] {
    return Array.from(this.byName.keys());
  }

  all(): ToolDefinition[] {
    return Array.from(this.byName.values());
  }

  /**
   * Convert all registered tools to the OpenAI `tools` array format used by
   * the chat completions endpoint.
   */
  toOpenAISchemas(): OpenAIFunctionSchema[] {
    return this.all().map((tool): OpenAIFunctionSchema => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.parameters),
      },
    }));
  }
}
