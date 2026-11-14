import { z } from 'zod/v3';
import { registerDefinition, clearCustomDefinitions } from './definitions';
import type { SubAgentDefinition } from './types';

/**
 * Load custom subagent definitions from `.cockpit/agents/*.json`.
 *
 * Each file is one definition: { name, description, systemPrompt, tools?,
 * disallowedTools?, maxTurns?, permissionMode?, permissions?, hooks?, ... }.
 * Built-ins win on name collision (the custom file is skipped with a warning).
 * Malformed files produce an error row in the result, never a crash.
 */

const HookSpecSchema = z.object({
  matcher: z.string().optional(),
  command: z.string(),
});

const HooksSchema = z.object({
  PreToolUse: z.array(HookSpecSchema).optional(),
  PostToolUse: z.array(HookSpecSchema).optional(),
  SubagentStart: z.array(HookSpecSchema).optional(),
  SubagentStop: z.array(HookSpecSchema).optional(),
}).optional();

export const DefinitionFileSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'name must be lowercase-hyphen'),
  description: z.string(),
  systemPrompt: z.string(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  maxTurns: z.number().int().positive().optional(),
  permissionMode: z.enum(['default', 'acceptEdits', 'auto', 'plan', 'dontAsk']).optional(),
  permissions: z.object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
    ask: z.array(z.string()).optional(),
  }).optional(),
  hooks: HooksSchema,
  capabilities: z.array(z.enum(['orchestrate', 'peer', 'destructive'])).optional(),
  color: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  contextTokens: z.number().int().positive().optional(),
  background: z.boolean().optional(),
  memoryScope: z.enum(['user', 'project', 'local']).optional(),
  label: z.string().optional(),
  icon: z.string().optional(),
});

export interface LoadResult {
  loaded: SubAgentDefinition[];
  errors: Array<{ file: string; error: string }>;
  skipped: Array<{ file: string; reason: string }>;
  /**
   * Shell hooks declared by workspace files. They are reported here whether or
   * not they were registered, so the caller can ask the user for consent.
   */
  hooks: Array<{ file: string; name: string; commands: string[] }>;
}

export interface LoadOptions {
  /** Register workspace-declared hooks. Default false — see loadDefinitionsFromWorkspace. */
  allowHooks?: boolean;
}

const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop'] as const;

/** Flatten every hook command a definition declares, as "Event: command". */
function collectHookCommands(defn: SubAgentDefinition): string[] {
  const hooks = (defn as { hooks?: Record<string, Array<{ command?: string }>> }).hooks;
  if (!hooks || typeof hooks !== 'object') return [];
  const out: string[] = [];
  for (const event of HOOK_EVENTS) {
    const list = hooks[event];
    if (!Array.isArray(list)) continue;
    for (const spec of list) {
      if (spec && typeof spec.command === 'string') out.push(`${event}: ${spec.command}`);
    }
  }
  return out;
}

/** Parse + validate one definition file's raw text. */
export function parseDefinitionFile(fileName: string, raw: string): { defn: SubAgentDefinition } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    return { error: `invalid JSON: ${err?.message || String(err)}` };
  }
  const result = DefinitionFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
    return { error: `schema: ${issues}` };
  }
  return { defn: result.data as SubAgentDefinition };
}

/** The directory (relative to the workspace) user definitions live in. */
export const DEFINITIONS_DIR = '.cockpit/agents';

/**
 * Load all `.cockpit/agents/*.json` definitions for a workspace via the fs IPC.
 * Clears prior custom definitions, then registers each valid one. Returns a
 * report for the UI / definitions tool.
 *
 * SECURITY: `hooks` in these files are arbitrary shell commands that ship
 * inside the repository, and `SubagentStart` fires before an agent's first tool
 * call. They are therefore stripped unless the caller passes `allowHooks: true`,
 * which must only happen after the user explicitly confirms in this session.
 */
export async function loadDefinitionsFromWorkspace(
  wsPath: string,
  fsApi = window.electronAPI?.fs,
  opts: LoadOptions = {},
): Promise<LoadResult> {
  const result: LoadResult = { loaded: [], errors: [], skipped: [], hooks: [] };
  if (!wsPath || !fsApi) return result;

  clearCustomDefinitions();
  const dir = `${wsPath.replace(/\\/g, '/')}/${DEFINITIONS_DIR}`;
  let entries;
  try {
    entries = await fsApi.readDir(dir);
  } catch {
    return result;
  }
  if (!entries) return result;

  const jsonFiles = entries
    .filter(e => !e.isDirectory && e.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of jsonFiles) {
    const fileName = entry.name;
    // Skip the fleet's own persistence files if they share the directory.
    if (fileName === 'bus.jsonl' || fileName === 'roster.json' || fileName.startsWith('.')) continue;
    let raw: string | null;
    try {
      raw = await fsApi.readFile(`${dir}/${fileName}`);
    } catch {
      result.errors.push({ file: fileName, error: 'read failed' });
      continue;
    }
    if (raw === null || raw === undefined) {
      result.errors.push({ file: fileName, error: 'read returned nothing' });
      continue;
    }
    const parsed = parseDefinitionFile(fileName, raw);
    if ('error' in parsed) {
      result.errors.push({ file: fileName, error: parsed.error });
      continue;
    }
    const defn = parsed.defn;
    const commands = collectHookCommands(defn);
    if (commands.length > 0) {
      result.hooks.push({ file: fileName, name: defn.name, commands });
      if (!opts.allowHooks) {
        delete (defn as { hooks?: unknown }).hooks;
      }
    }
    const registered = registerDefinition(defn);
    if (!registered) {
      result.skipped.push({ file: fileName, reason: `built-in name "${defn.name}" collides` });
      continue;
    }
    result.loaded.push(defn);
  }

  return result;
}
