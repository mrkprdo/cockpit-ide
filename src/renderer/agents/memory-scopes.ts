import type { SubAgentDefinition } from './types';

/**
 * Agent-scoped persistent memory — maps the Claude-Code user/project/local
 * scopes onto Cockpit's existing memory system.
 *
 *  user    → global agent memory (shared across workspaces)
 *  project → workspace agent memory (.cockpit/memory.json)
 *  local   → per-agent scratch file (.cockpit/agents/memory/<name>.md),
 *            not version-controlled, used for state handoff between dispatches
 *
 * `user` and `project` are handled by the existing memory_store (scopes
 * 'global' and 'workspace'). `local` is a plain markdown file the session can
 * read/write via the fs IPC for long-running state.
 */

export type MemoryScope = 'user' | 'project' | 'local';

export const MEMORY_DIR = '.cockpit/agents/memory';

/** Resolve a definition's memory scope (default: project). */
export function resolveMemoryScope(defn: SubAgentDefinition | null): MemoryScope {
  return defn?.memoryScope ?? 'project';
}

/** Local-scope file path for an agent definition. */
export function localMemoryPath(wsPath: string, defnName: string): string {
  const base = `${wsPath.replace(/\\/g, '/')}/${MEMORY_DIR}`;
  return `${base}/${defnName}.md`;
}

/** Read the local-scope scratch file ('' when missing). */
export async function readLocalMemory(wsPath: string, defnName: string, fsApi = window.electronAPI?.fs): Promise<string> {
  if (!fsApi) return '';
  try {
    const raw = await fsApi.readFile(localMemoryPath(wsPath, defnName));
    return raw ?? '';
  } catch {
    return '';
  }
}

/** Write the local-scope scratch file (creates dirs via mkdir recursive). */
export async function writeLocalMemory(wsPath: string, defnName: string, content: string, fsApi = window.electronAPI?.fs): Promise<boolean> {
  if (!fsApi) return false;
  try {
    const dir = `${wsPath.replace(/\\/g, '/')}/${MEMORY_DIR}`;
    await fsApi.mkdir(dir);
    return !!(await fsApi.writeFile(localMemoryPath(wsPath, defnName), content));
  } catch {
    return false;
  }
}
