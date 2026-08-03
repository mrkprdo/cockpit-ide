/**
 * Roundtable orchestration — a parallel expert panel with quorum.
 *
 * The main session (orchestrator) asks `roundtable_compose` for a panel:
 * a seeded random selection of expert agents, each mastering ONE skill area
 * (the 15-area roster below) plus a random draw of sub-traits. The compose
 * result is a spawn-ready plan: every expert gets a brief (context, expected
 * result, guardrails) and the orchestrator spawns them ALL in parallel, waits
 * for quorum of responds, then synthesizes the plan.
 *
 * Experts share mid-run findings over the bus: they call agent_broadcast with
 * the session topic (`roundtable.<sessionId>.findings`), which fan-outs to
 * every running agent's mailbox — the panel literally hears each other.
 *
 * Pure logic module: no DOM, no executor. Everything is testable.
 */

import { getDefinition, registerDefinition } from './definitions';
import type { PermissionMode, SubAgentDefinition } from './types';

/** One row of the roundtable roster (the user's skill-area table). */
export interface ExpertArea {
  /** Definition id: `expert-<area>` (spawnable via agent_spawn). */
  id: string;
  /** Display label, e.g. 'Programming Master'. */
  name: string;
  /** The master skill area, e.g. 'Programming'. */
  skill: string;
  icon: string;
  color: string;
  /** Individual developer responsibility column. */
  individual: string;
  /** Team responsibility column. */
  team: string;
}

/** A panel seat: one expert assigned a master area + random sub-traits. */
export interface ExpertAssignment {
  /** Spawn this definition via agent_spawn(agent: definition). */
  definition: string;
  name: string;
  icon: string;
  color: string;
  master: string;
  /** Random sub-traits drawn for THIS session (1–3). */
  traits: string[];
  /** Ready-to-use agent_spawn payload pieces. */
  context: string;
  expectedResult: string;
  guardrails: string[];
}

/** The full compose result the orchestrator acts on. */
export interface RoundtablePlan {
  sessionId: string;
  /** Shared findings topic: experts broadcast here via agent_broadcast. */
  topic: string;
  panelSize: number;
  /** Responds needed before the orchestrator synthesizes. */
  quorum: number;
  seed: number;
  experts: ExpertAssignment[];
}

export interface ComposeOptions {
  /** Panel size, clamped to [3, EXPERT_AREAS.length]. Default 5. */
  panelSize?: number;
  /** Deterministic composition: same seed → same panel. Default random. */
  seed?: number;
  /** Quorum as a fraction of the panel (default 0.6, clamped to [0.5, 1]). */
  quorumRatio?: number;
  /** Restrict the candidate pool to these area ids (optional). */
  areas?: string[];
  /** Exclude these area ids from the candidate pool (optional). */
  excludeAreas?: string[];
}

/** The 15 skill areas from the roundtable roster (user's table). */
export const EXPERT_AREAS: ExpertArea[] = [
  { id: 'expert-programming', name: 'Programming Master', skill: 'Programming', icon: '💻', color: '#00e5ff', individual: 'Write maintainable code', team: 'Establish coding standards' },
  { id: 'expert-software-design', name: 'Software Design Master', skill: 'Software Design', icon: '🧩', color: '#b39ddb', individual: 'Design modules/classes', team: 'Design system architecture' },
  { id: 'expert-algorithms', name: 'Algorithms & Data Structures Master', skill: 'Algorithms & Data Structures', icon: '🧮', color: '#ffd54f', individual: 'Solve problems efficiently', team: 'Choose appropriate algorithms for products' },
  { id: 'expert-debugging', name: 'Debugging Master', skill: 'Debugging', icon: '🐞', color: '#ef5350', individual: 'Find bugs quickly', team: 'Build debugging processes and tooling' },
  { id: 'expert-testing', name: 'Testing Master', skill: 'Testing', icon: '🧪', color: '#a5d6a7', individual: 'Unit/integration tests', team: 'CI/CD and quality gates' },
  { id: 'expert-build-systems', name: 'Build Systems Master', skill: 'Build Systems', icon: '🛠️', color: '#ffb74d', individual: 'CMake, Make, Gradle, etc.', team: 'Reproducible builds' },
  { id: 'expert-version-control', name: 'Version Control Master', skill: 'Version Control', icon: '🔀', color: '#f06292', individual: 'Git', team: 'Branching/release strategy' },
  { id: 'expert-operating-systems', name: 'Operating Systems Master', skill: 'Operating Systems', icon: '🐧', color: '#ff8a65', individual: 'Processes, threads, memory', team: 'Platform expertise' },
  { id: 'expert-networking', name: 'Networking Master', skill: 'Networking', icon: '🌐', color: '#4fc3f7', individual: 'TCP/IP, HTTP, IPC', team: 'Distributed systems' },
  { id: 'expert-security', name: 'Security Master', skill: 'Security', icon: '🔐', color: '#e57373', individual: 'Secure coding', team: 'Security reviews and compliance' },
  { id: 'expert-performance', name: 'Performance Master', skill: 'Performance', icon: '⚡', color: '#fff176', individual: 'Profiling & optimization', team: 'Capacity planning' },
  { id: 'expert-documentation', name: 'Documentation Master', skill: 'Documentation', icon: '📝', color: '#f48fb1', individual: 'Document code', team: 'Maintain engineering knowledge' },
  { id: 'expert-devops', name: 'DevOps Master', skill: 'DevOps', icon: '🚀', color: '#90caf9', individual: 'Deploy applications', team: 'Infrastructure automation' },
  { id: 'expert-communication', name: 'Communication Master', skill: 'Communication', icon: '💬', color: '#80cbc4', individual: 'Explain technical ideas', team: 'Cross-team collaboration' },
  { id: 'expert-business', name: 'Business Understanding Master', skill: 'Business Understanding', icon: '📊', color: '#aed581', individual: 'Understand customer needs', team: 'Align engineering with business goals' },
];

/** Random sub-traits drawn per expert per session (flavor, not hard skills). */
export const SUB_TRAITS = [
  'cautious — double-checks every assumption',
  'skeptical of premature abstraction',
  'prefers minimal diffs and boring solutions',
  'optimizes for readability first',
  'thinks in failure modes and edge cases',
  'evidence-driven — demands to see the actual output',
  'pragmatic — favors the fastest safe path',
  'security-paranoid — looks for the exploit in everything',
  'performance-conscious — profiles before judging',
  'test-first — wants a failing test before a fix',
  'documentation-obsessed — hates unexplained magic',
  'backward-compatible guardian',
  'systemic — sees the whole pipeline, not just the function',
  'data-driven — quotes numbers, not vibes',
  'customer-focused — asks "who does this serve?"',
  'challenger — pokes holes in every proposal',
  'consensus-builder — looks for what everyone agrees on',
  'worst-case planner — designs for the disaster path',
  'simplicity maximalist — cuts anything not needed',
  'historian — checks git blame and past decisions',
];

/** Tools every roundtable expert may call: read/evidence + peer sharing. */
export const EXPERT_TOOLS = [
  'read_file', 'list_directory', 'grep_workspace', 'get_canvas_state',
  'git_status', 'git_diff', 'git_log',
  'specs_explore', 'specs_validate',
  'agent_dispatch', 'agent_broadcast', 'agent_wait', 'agent_status',
];

/** Deterministic PRNG (mulberry32) so a seed reproduces the exact panel. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shuffle an array in place with the seeded RNG (Fisher–Yates). */
function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Draw `n` distinct items from a pool using the seeded RNG. */
function drawDistinct<T>(pool: T[], n: number, rng: () => number): T[] {
  const shuffled = seededShuffle(pool, rng);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

/** Quorum needed for a panel: ceil(panelSize * ratio), at least 1. */
export function quorumFor(panelSize: number, ratio = 0.6): number {
  const r = Math.min(1, Math.max(0.5, ratio));
  return Math.max(1, Math.min(panelSize, Math.ceil(panelSize * r)));
}

/** Build the expert definition for one area (registered at boot). */
export function buildExpertDefinition(area: ExpertArea): SubAgentDefinition {
  return {
    name: area.id,
    description: `Roundtable expert — master of ${area.skill}. Individual: ${area.individual}. Team: ${area.team}.`,
    systemPrompt: `# Role: ${area.name} 🎯
You are a highly technical roundtable expert. Your ONE master skill is **${area.skill}**.

## Your responsibilities
- Individual developer responsibility: ${area.individual}.
- Team responsibility: ${area.team}.

## Roundtable protocol
- You are seated on a parallel expert panel investigating one issue. Stay in your lane — attack the issue from your master skill's angle, no more.
- Use read_file / grep / git_diff / specs_explore and run evidence you can actually see. Never invent results.
- As you work, broadcast key findings to the roundtable topic with agent_broadcast (topic is given in your brief) so the rest of the panel hears you — that is how the panel shares output.
- You may agent_dispatch a pointed question to a peer expert if their angle is decisive for yours; keep it purposeful.
- When you have a verdict, STOP and respond with: your findings, the evidence you saw, any open questions, and what you need from the orchestrator. Do not keep working after your respond.`,
    tools: [...EXPERT_TOOLS],
    capabilities: ['peer'],
    permissionMode: 'default' as PermissionMode,
    maxTurns: 12,
    timeoutMs: 300_000,
    contextTokens: 4096,
    color: area.color,
    icon: area.icon,
    label: area.name,
  };
}

/** All 15 expert definitions (registered at boot via registerRoundtableExperts). */
export const EXPERT_DEFINITIONS: SubAgentDefinition[] = EXPERT_AREAS.map(buildExpertDefinition);

/** Idempotent registration — call at boot and/or before composing. */
let expertsRegistered = false;
export function registerRoundtableExperts(): void {
  // Self-heal across workspace reloads: App.loadWorkspace() runs
  // loadDefinitionsFromWorkspace() (which calls clearCustomDefinitions() and
  // wipes EVERY custom definition, including these code-registered experts)
  // before calling us. Trusting the boolean alone leaves the roster empty on
  // the second load — so re-register whenever the first expert is missing.
  if (expertsRegistered && getDefinition(EXPERT_AREAS[0].id)) return;
  for (const defn of EXPERT_DEFINITIONS) registerDefinition(defn);
  expertsRegistered = true;
}

/** Build the spawn brief (context) for one expert in one session. */
export function buildExpertContext(area: ExpertArea, traits: string[], issue: string, sessionId: string, topic: string): string {
  return [
    `# Roundtable session ${sessionId}`,
    ``,
    `## The issue under discussion`,
    issue,
    ``,
    `## You are the ${area.name}`,
    `Master skill: **${area.skill}**`,
    `Individual responsibility: ${area.individual}`,
    `Team responsibility: ${area.team}`,
    ``,
    `## Your sub-traits this session`,
    ...traits.map(t => `- ${t}`),
    ``,
    `## Panel protocol`,
    `- Other experts are investigating the SAME issue in parallel from their own angles.`,
    `- Broadcast findings as you go to topic \`${topic}\` via agent_broadcast.`,
    `- You may agent_dispatch peers (agent_status lists them).`,
    `- End with your verdict + evidence + open questions; that respond reaches the orchestrator.`,
  ].join('\n');
}

/**
 * Compose a roundtable panel for an issue.
 *
 * Deterministic given a seed: same issue + same seed + same options → the same
 * panel (same experts, same traits, same briefs). Without a seed, `Date.now()`
 * seeds it, so every session is a fresh draw.
 */
export function composeRoundtable(issue: string, opts: ComposeOptions = {}): RoundtablePlan {
  registerRoundtableExperts();

  const seed = opts.seed ?? Date.now() % 2_147_483_647;
  const rng = mulberry32(seed);

  let pool = EXPERT_AREAS;
  if (opts.areas && opts.areas.length > 0) {
    pool = EXPERT_AREAS.filter(a => opts.areas!.includes(a.id));
  }
  if (opts.excludeAreas && opts.excludeAreas.length > 0) {
    pool = pool.filter(a => !opts.excludeAreas!.includes(a.id));
  }
  if (pool.length === 0) pool = EXPERT_AREAS;

  const panelSize = Math.min(Math.max(opts.panelSize ?? 5, 3), pool.length);
  const picked = seededShuffle(pool, rng).slice(0, panelSize);
  const quorum = quorumFor(panelSize, opts.quorumRatio);

  const sessionId = `rt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const topic = `roundtable.${sessionId}.findings`;

  const experts: ExpertAssignment[] = picked.map(area => {
    const traitCount = 1 + Math.floor(rng() * 3); // 1–3 traits
    const traits = drawDistinct(SUB_TRAITS, traitCount, rng);
    return {
      definition: area.id,
      name: area.name,
      icon: area.icon,
      color: area.color,
      master: area.skill,
      traits,
      context: buildExpertContext(area, traits, issue, sessionId, topic),
      expectedResult: `Findings brief from the ${area.name}: verdict on the issue from the ${area.skill} angle, evidence you actually saw, open questions, and what you need from the orchestrator.`,
      guardrails: [
        'Read-only: never edit files, never run mutating commands.',
        'Stay in your master skill lane.',
        'Base every claim on evidence you actually read or ran.',
        'Broadcast key findings to the roundtable topic so the panel hears you.',
      ],
    };
  });

  return { sessionId, topic, panelSize, quorum, seed, experts };
}

/** Reset the registration flag (tests). */
export function _resetRoundtableRegistrationForTests(): void {
  expertsRegistered = false;
}
