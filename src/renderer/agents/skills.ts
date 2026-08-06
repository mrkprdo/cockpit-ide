import type { AgentCapability, Skill, SkillName } from './types';
import { BUILTIN_DEFINITIONS, BUILTIN_NAMES, READ_ONLY_TOOLS, DEFAULT_AGENT_TIMEOUT_MS, initials } from './definitions';
import type { SubAgentDefinition } from './types';
import { TOOL_FAMILIES } from './permissions';

/**
 * SDLC skills registry — now a thin derivation over `definitions.ts`.
 *
 * The ten skills are declared once as `SubAgentDefinition` data (in
 * definitions.ts); `SKILLS` below maps them back into the legacy `Skill` shape
 * so existing consumers (`guardToolCall`, the AI panel, session) keep
 * working unchanged. Guardrails are enforced in code (`permissions.ts` +
 * `guardToolCall`), never only in the prompt.
 */

/**
 * Expand a definition's `tools` allowlist into concrete tool names.
 * Family names (Bash, Read, Write, Edit, Grep, WebFetch, Agent) expand to all
 * members; missing allowlist → READ_ONLY_TOOLS.
 */
export function expandToolAllowlist(tools: string[] | undefined): string[] {
  if (!tools || tools.length === 0) return [...READ_ONLY_TOOLS];
  const out = new Set<string>();
  for (const t of tools) {
    const family = TOOL_FAMILIES[t];
    if (family) for (const member of family) out.add(member);
    else out.add(t);
  }
  return Array.from(out);
}

/** Derive the legacy Skill shape from a declarative definition. */
export function definitionToSkill(defn: SubAgentDefinition): Skill {
  return {
    name: defn.name as SkillName,
    label: defn.label ?? defn.name,
    icon: defn.icon ?? initials(defn.label ?? defn.name),
    color: defn.color ?? '#78909c',
    promptTemplate: defn.systemPrompt,
    allowedTools: expandToolAllowlist(defn.tools),
    capabilities: defn.capabilities ?? [],
    contextTokens: defn.contextTokens ?? 4096,
    maxSteps: defn.maxTurns ?? 24,
    timeoutMs: defn.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS,
  };
}

export const SKILLS: Record<SkillName, Skill> = Object.fromEntries(
  BUILTIN_NAMES.map((name) => [name, definitionToSkill(BUILTIN_DEFINITIONS[name])]),
) as Record<SkillName, Skill>;

export const SKILL_NAMES = BUILTIN_NAMES;

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
  agent_approve: 'orchestrate',
  agent_dispatch: 'peer',
  agent_broadcast: 'peer',
  pipeline_confirm: 'orchestrate',
  pipeline_reset: 'orchestrate',
  pipeline_status: 'orchestrate',
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
