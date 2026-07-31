import type { AgentCapability, Skill, SkillName } from './types';
import { SKILL_PROMPTS } from './prompts';

/**
 * SDLC skills registry. Each skill maps a pipeline stage to:
 * - a system-prompt fragment (role/behavior),
 * - an explicit tool allowlist (subset of ALL_TOOLS),
 * - capabilities that unlock orchestration, peer messaging, and destructive ops.
 *
 * Guardrails are enforced in code (guardedExecuteToolCall), never only in the
 * prompt: a violation returns a tool error, not silent permission.
 */
export const SKILLS: Record<SkillName, Skill> = {
  planner: {
    name: 'planner',
    label: 'Planner',
    icon: '🗺️',
    color: '#8b9dc3',
    promptTemplate: SKILL_PROMPTS.planner,
    allowedTools: ['specs_explore', 'read_file', 'list_directory', 'grep_workspace', 'memory_list', 'memory_search', 'memory_get', 'get_canvas_state'],
    capabilities: [],
    contextTokens: 4096,
    maxSteps: 8,
    timeoutMs: 180_000,
  },
  'spec-orienter': {
    name: 'spec-orienter',
    label: 'Spec Orienter',
    icon: '🧭',
    color: '#4fc3f7',
    promptTemplate: SKILL_PROMPTS['spec-orienter'],
    allowedTools: ['specs_explore', 'specs_validate', 'read_file', 'list_directory', 'grep_workspace', 'get_canvas_state'],
    capabilities: [],
    contextTokens: 4096,
    maxSteps: 10,
    timeoutMs: 180_000,
  },
  scaffolder: {
    name: 'scaffolder',
    label: 'Scaffolder',
    icon: '🏗️',
    color: '#ffb74d',
    promptTemplate: SKILL_PROMPTS.scaffolder,
    allowedTools: ['read_file', 'list_directory', 'write_file', 'create_directory', 'copy_file', 'rename_file', 'grep_workspace', 'specs_reconcile', 'get_canvas_state', 'reveal_file_in_explorer'],
    capabilities: ['destructive'],
    contextTokens: 4096,
    maxSteps: 12,
    timeoutMs: 180_000,
  },
  implementer: {
    name: 'implementer',
    label: 'Implementer',
    icon: '🛠️',
    color: '#00e5ff',
    promptTemplate: SKILL_PROMPTS.implementer,
    allowedTools: [
      'read_file', 'write_file', 'list_directory', 'create_directory', 'grep_workspace',
      'get_canvas_state', 'open_file_in_editor', 'reveal_file_in_explorer', 'open_in_markdown',
      'read_editor', 'get_editor_state', 'get_selected_text', 'set_editor_content', 'go_to_line',
      'git_status', 'git_diff', 'git_log',
      'specs_explore', 'specs_validate',
      'agent_dispatch', 'agent_wait', 'agent_status',
    ],
    capabilities: ['destructive', 'peer'],
    contextTokens: 8192,
    maxSteps: 24,
    timeoutMs: 600_000,
  },
  reviewer: {
    name: 'reviewer',
    label: 'Reviewer',
    icon: '🔍',
    color: '#ffd54f',
    promptTemplate: SKILL_PROMPTS.reviewer,
    allowedTools: ['read_file', 'list_directory', 'grep_workspace', 'git_status', 'git_diff', 'git_log', 'specs_explore', 'specs_validate', 'get_canvas_state', 'agent_dispatch', 'agent_wait', 'agent_status'],
    capabilities: ['peer'],
    contextTokens: 4096,
    maxSteps: 14,
    timeoutMs: 300_000,
  },
  tester: {
    name: 'tester',
    label: 'Tester',
    icon: '🧪',
    color: '#a5d6a7',
    promptTemplate: SKILL_PROMPTS.tester,
    allowedTools: ['read_file', 'list_directory', 'grep_workspace', 'get_canvas_state', 'write_to_terminal', 'send_key_to_terminal', 'read_terminal', 'kill_terminal', 'git_status', 'git_diff', 'specs_validate', 'agent_dispatch', 'agent_wait', 'agent_status'],
    capabilities: ['destructive', 'peer'],
    contextTokens: 4096,
    maxSteps: 16,
    timeoutMs: 600_000,
  },
  debugger: {
    name: 'debugger',
    label: 'Debugger',
    icon: '🐞',
    color: '#ef5350',
    promptTemplate: SKILL_PROMPTS.debugger,
    allowedTools: [
      'read_file', 'write_file', 'list_directory', 'grep_workspace',
      'get_canvas_state', 'read_editor', 'get_editor_state', 'set_editor_content', 'go_to_line',
      'write_to_terminal', 'send_key_to_terminal', 'read_terminal', 'kill_terminal',
      'git_status', 'git_diff', 'git_log',
      'specs_explore', 'specs_validate',
      'agent_dispatch', 'agent_wait', 'agent_status',
    ],
    capabilities: ['destructive', 'peer'],
    contextTokens: 4096,
    maxSteps: 20,
    timeoutMs: 600_000,
  },
  'git-committer': {
    name: 'git-committer',
    label: 'Git Committer',
    icon: '📦',
    color: '#ce93d8',
    promptTemplate: SKILL_PROMPTS['git-committer'],
    allowedTools: ['git_status', 'git_diff', 'git_log', 'git_stage', 'git_unstage', 'git_commit', 'git_branches', 'read_file', 'list_directory', 'get_canvas_state'],
    capabilities: ['destructive'],
    contextTokens: 4096,
    maxSteps: 10,
    timeoutMs: 180_000,
  },
  'docs-writer': {
    name: 'docs-writer',
    label: 'Docs Writer',
    icon: '📝',
    color: '#f48fb1',
    promptTemplate: SKILL_PROMPTS['docs-writer'],
    allowedTools: ['read_file', 'write_file', 'list_directory', 'grep_workspace', 'open_in_markdown', 'reveal_file_in_explorer', 'get_canvas_state'],
    capabilities: ['destructive'],
    contextTokens: 4096,
    maxSteps: 10,
    timeoutMs: 300_000,
  },
  'spec-sync': {
    name: 'spec-sync',
    label: 'Spec Sync',
    icon: '🔄',
    color: '#9e9d24',
    promptTemplate: SKILL_PROMPTS['spec-sync'],
    allowedTools: ['specs_explore', 'specs_validate', 'specs_reconcile', 'specs_reload', 'read_file', 'list_directory', 'grep_workspace', 'get_canvas_state'],
    capabilities: ['destructive'],
    contextTokens: 4096,
    maxSteps: 12,
    timeoutMs: 300_000,
  },
};

export const SKILL_NAMES = Object.keys(SKILLS) as SkillName[];

export function getSkill(name: SkillName): Skill {
  return SKILLS[name];
}

/**
 * Tools that are always denied unless the skill carries the matching
 * capability. This is the hard deny-list on top of the allowlist — the
 * allowlist alone would let a misconfigured skill mutate the repo.
 */
const HARD_DENY: Record<string, AgentCapability> = {
  delete_file: 'destructive',
  git_push: 'destructive',
  git_checkout: 'destructive',
  memory_delete: 'destructive',
  memory_set: 'destructive',
  agent_spawn: 'orchestrate',
  agent_kill: 'orchestrate',
  agent_dispatch: 'peer',
};

export interface GuardResult {
  ok: boolean;
  error?: string;
}

/**
 * Check whether `skill` may invoke tool `name`.
 * - must be in the skill's allowlist
 * - hard-deny tools require the matching capability
 */
export function guardToolCall(skill: Skill, name: string): GuardResult {
  if (!skill.allowedTools.includes(name)) {
    return {
      ok: false,
      error: `Guardrail: skill "${skill.name}" (${skill.label}) is not allowed to call "${name}". Allowed: ${skill.allowedTools.join(', ') || '(none)'}`,
    };
  }
  const needCap = HARD_DENY[name];
  if (needCap && !skill.capabilities.includes(needCap)) {
    return {
      ok: false,
      error: `Guardrail: tool "${name}" requires capability "${needCap}" which skill "${skill.name}" does not have.`,
    };
  }
  return { ok: true };
}
