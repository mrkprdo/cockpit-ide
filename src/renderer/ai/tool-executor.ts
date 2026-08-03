import type { ToolContext } from './types';
import { ToolRegistry } from './tool-registry';

export interface ToolCallResult {
  ok: boolean;
  output: string;
}

/**
 * Execute a single tool call by name with raw JSON arguments.
 *
 * - Looks up the tool in the registry.
 * - Parses and validates arguments with the tool's Zod schema.
 * - Executes the tool and returns its string output.
 *
 * On any failure (unknown tool, invalid JSON, schema validation error, or
 * runtime exception) the returned output is a descriptive error string and
 * `ok` is false.
 */
export async function executeToolCall(
  registry: ToolRegistry,
  name: string,
  rawArgs: string,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const tool = registry.get(name);
  if (!tool) {
    return { ok: false, output: `Unknown tool: ${name}` };
  }

  let parsed: unknown;
  try {
    parsed = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { ok: false, output: `Invalid JSON arguments for tool ${name}: ${rawArgs}` };
  }

  const validation = tool.parameters.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues.map((i: { path: Array<string | number>; message: string }) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return { ok: false, output: `Invalid arguments for ${name}: ${issues}` };
  }

  try {
    const output = await tool.execute(validation.data, ctx);
    return { ok: true, output: String(output ?? '') };
  } catch (err: any) {
    return { ok: false, output: `Error in ${name}: ${err.message || String(err)}` };
  }
}
