import { SKILL_PROMPTS } from './prompts';
import type { AgentCapability, PermissionMode, SkillName, SubAgentDefinition } from './types';

/**
 * Declarative subagent definitions.
 *
 * The ten SDLC skills are modeled as `SubAgentDefinition` data (name, description,
 * model, tool allowlist/denylist, permission mode, hooks, color, system prompt).
 * `skills.ts` derives the legacy `Skill` registry from `BUILTIN_DEFINITIONS`, so
 * consumers that still import `SKILLS`/`getSkill` keep working.
 *
 * Users can add custom definitions as `.cockpit/agents/<name>.json`; those are
 * loaded at runtime by `definition-file.ts` and merged here via `registerDefinition`.
 *
 * Guardrails are STILL enforced in code (`permissions.ts` + `skills.guardToolCall`),
 * never only in the prompt — a violation returns a tool error, not silent permission.
 */

/** Tools always granted to read-only definitions with no explicit allowlist. */
export const READ_ONLY_TOOLS = [
  'read_file', 'list_directory', 'grep_workspace', 'get_canvas_state',
  'memory_list', 'memory_search', 'memory_get', 'specs_explore', 'specs_validate',
];

function def(name: SkillName, label: string, icon: string, color: string, tools: string[], capabilities: AgentCapability[], permissionMode: PermissionMode, contextTokens: number, maxTurns: number, timeoutMs: number, description: string): SubAgentDefinition {
  return {
    name,
    label,
    icon,
    color,
    description,
    systemPrompt: SKILL_PROMPTS[name],
    tools,
    capabilities,
    permissionMode,
    contextTokens,
    maxTurns,
    timeoutMs,
  };
}

export const BUILTIN_DEFINITIONS: Record<SkillName, SubAgentDefinition> = {
  planner: def(
    'planner', 'Planner', '🗺️', '#8b9dc3',
    ['specs_explore', 'read_file', 'list_directory', 'grep_workspace', 'memory_list', 'memory_search', 'memory_get', 'get_canvas_state'],
    [], 'default', 4096, 8, 180_000,
    'Produces a numbered, dependency-ordered execution plan for a task without editing files.',
  ),
  'spec-orienter': def(
    'spec-orienter', 'Spec Orienter', '🧭', '#4fc3f7',
    ['specs_explore', 'specs_validate', 'read_file', 'list_directory', 'grep_workspace', 'get_canvas_state'],
    [], 'default', 4096, 10, 180_000,
    'Maps the SPECGEN spec graph for a feature area before code changes (read-only orientation brief).',
  ),
  scaffolder: def(
    'scaffolder', 'Scaffolder', '🏗️', '#ffb74d',
    ['read_file', 'list_directory', 'write_file', 'create_directory', 'copy_file', 'rename_file', 'grep_workspace', 'specs_reconcile', 'get_canvas_state', 'reveal_file_in_explorer'],
    ['destructive'], 'acceptEdits', 4096, 12, 180_000,
    'Creates skeleton structure for a feature: directories, headers, index barrels, initial spec skeletons (stubs and TODOs only).',
  ),
  implementer: def(
    'implementer', 'Implementer', '🛠️', '#00e5ff',
    [
      'read_file', 'write_file', 'list_directory', 'create_directory', 'grep_workspace',
      'get_canvas_state', 'open_file_in_editor', 'reveal_file_in_explorer', 'open_in_markdown',
      'read_editor', 'get_editor_state', 'get_selected_text', 'set_editor_content', 'go_to_line',
      'git_status', 'git_diff', 'git_log',
      'specs_explore', 'specs_validate',
      'agent_dispatch', 'agent_wait', 'agent_status',
    ],
    ['destructive', 'peer'], 'acceptEdits', 8192, 24, 600_000,
    'Implements a feature in source files per the provided spec/orientation/plan, following existing conventions.',
  ),
  reviewer: def(
    'reviewer', 'Reviewer', '🔍', '#ffd54f',
    ['read_file', 'list_directory', 'grep_workspace', 'git_status', 'git_diff', 'git_log', 'specs_explore', 'specs_validate', 'get_canvas_state', 'agent_dispatch', 'agent_wait', 'agent_status'],
    ['peer'], 'default', 4096, 14, 300_000,
    'Read-only code review for correctness, conventions, and spec alignment (never writes files).',
  ),
  tester: def(
    'tester', 'Tester', '🧪', '#a5d6a7',
    ['read_file', 'list_directory', 'grep_workspace', 'get_canvas_state', 'run_command', 'write_to_terminal', 'send_key_to_terminal', 'read_terminal', 'kill_terminal', 'git_status', 'git_diff', 'specs_validate', 'agent_dispatch', 'agent_wait', 'agent_status'],
    ['destructive', 'peer'], 'auto', 4096, 16, 600_000,
    'Verifies a change works: runs the project test suite and targeted checks, reports pass/fail per area.',
  ),
  debugger: def(
    'debugger', 'Debugger', '🐞', '#ef5350',
    [
      'read_file', 'write_file', 'list_directory', 'grep_workspace',
      'get_canvas_state', 'read_editor', 'get_editor_state', 'set_editor_content', 'go_to_line',
      'run_command', 'write_to_terminal', 'send_key_to_terminal', 'read_terminal', 'kill_terminal',
      'git_status', 'git_diff', 'git_log',
      'specs_explore', 'specs_validate',
      'agent_dispatch', 'agent_wait', 'agent_status',
    ],
    ['destructive', 'peer'], 'auto', 4096, 20, 600_000,
    'Diagnoses and fixes failing behavior: reproduce, hypothesize, verify, patch the root cause, re-test.',
  ),
  'git-committer': def(
    'git-committer', 'Git Committer', '📦', '#ce93d8',
    ['git_status', 'git_diff', 'git_log', 'git_stage', 'git_unstage', 'git_commit', 'git_branches', 'read_file', 'list_directory', 'get_canvas_state'],
    ['destructive'], 'acceptEdits', 4096, 10, 180_000,
    'Turns staged or working-tree changes into a clean conventional commit. Never pushes or amends history.',
  ),
  'docs-writer': def(
    'docs-writer', 'Docs Writer', '📝', '#f48fb1',
    ['read_file', 'write_file', 'list_directory', 'grep_workspace', 'open_in_markdown', 'reveal_file_in_explorer', 'get_canvas_state'],
    ['destructive'], 'acceptEdits', 4096, 10, 300_000,
    'Writes or updates documentation (READMEs, DESIGN docs, plan docs) to reflect the actual state of the code.',
  ),
  'spec-sync': def(
    'spec-sync', 'Spec Sync', '🔄', '#9e9d24',
    ['specs_explore', 'specs_validate', 'specs_reconcile', 'specs_reload', 'read_file', 'list_directory', 'grep_workspace', 'get_canvas_state'],
    ['destructive'], 'acceptEdits', 4096, 12, 300_000,
    'Keeps the SPECGEN spec graph in sync with source: validates drift, reconciles structural fields, updates contract prose.',
  ),
};

export const BUILTIN_NAMES = Object.keys(BUILTIN_DEFINITIONS) as SkillName[];

/** User-registered custom definitions (loaded from `.cockpit/agents/*.json`). */
const customDefinitions = new Map<string, SubAgentDefinition>();

/**
 * Resolve a definition by id — user custom first, then built-in. Returns the
 * name of the resolved definition (used to distinguish custom vs built-in).
 */
export function getDefinition(name: string): SubAgentDefinition | null {
  return customDefinitions.get(name) ?? BUILTIN_DEFINITIONS[name as SkillName] ?? null;
}

/** Is `name` a user-defined (custom) agent rather than a built-in skill? */
export function isCustomDefinition(name: string): boolean {
  return customDefinitions.has(name);
}

/** Register a custom definition. Built-ins win on name collision (returns false). */
export function registerDefinition(defn: SubAgentDefinition): boolean {
  if (!defn?.name) return false;
  if (BUILTIN_DEFINITIONS[defn.name as SkillName]) return false;
  customDefinitions.set(defn.name, defn);
  return true;
}

export function unregisterDefinition(name: string): boolean {
  return customDefinitions.delete(name);
}

/** Remove every custom definition (used before a full reload from disk). */
export function clearCustomDefinitions(): void {
  customDefinitions.clear();
}

/** All known definition ids (built-ins + customs), sorted. */
export function listDefinitions(): SubAgentDefinition[] {
  return [
    ...Object.values(BUILTIN_DEFINITIONS),
    ...Array.from(customDefinitions.values()),
  ].sort((a, b) => a.name.localeCompare(b.name));
}
