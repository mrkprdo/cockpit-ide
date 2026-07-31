/**
 * Sub-agent fleet core types.
 *
 * One envelope shape (AgentMessage) carries everything on the bus: dispatches
 * (briefs), responds, peer requests, broadcasts, status pings, and kills.
 * Correlation IDs tie a respond back to its originating dispatch/request, and
 * the MessageCollector (in bus.ts) is the "who captures what" layer — waiters
 * are keyed by correlationId + replyTo.
 */

export type AgentId = 'main' | `agent:${string}`;

export type AgentMessageType =
  | 'dispatch'      // a brief: context + skill + guardrails + expected result
  | 'respond'       // final (or partial) result of a dispatch/request
  | 'request'       // peer-to-peer request (expects a respond)
  | 'broadcast'     // fan-out to a topic or '*'
  | 'status'        // lifecycle/state ping (feeds UI + log)
  | 'kill';         // abort + cleanup instruction

export interface AgentMessage {
  id: string;
  type: AgentMessageType;
  from: AgentId;
  to: AgentId | AgentId[] | '*';
  /** Topic for fan-out, e.g. 'impl.done', 'test.passed', 'review.request'. */
  topic?: string;
  /** Ties responds/requests to the original dispatch/request. */
  correlationId?: string;
  expectsResponse?: boolean;
  replyTo?: AgentId;
  payload: unknown;
  /** ms; expired messages are dropped on delivery (stale messages never wake a sleeping agent). */
  ttl?: number;
  ts: number;
}

export interface DeliveryRecord {
  msgId: string;
  deliveredTo: AgentId[];
  dropped: Array<{ to: AgentId | AgentId[] | '*'; reason: 'no-mailbox' | 'expired' | 'unknown' }>;
  ts: number;
}

/** The skill set covering the SDLC pipeline. */
export type SkillName =
  | 'planner'
  | 'spec-orienter'
  | 'scaffolder'
  | 'implementer'
  | 'reviewer'
  | 'tester'
  | 'debugger'
  | 'git-committer'
  | 'docs-writer'
  | 'spec-sync';

export type AgentCapability = 'orchestrate' | 'peer' | 'destructive';

export interface Skill {
  name: SkillName;
  label: string;
  icon: string;
  color: string;
  /** System prompt fragment injected as the agent's role. */
  promptTemplate: string;
  /** Subset of ALL_TOOLS the agent may call. */
  allowedTools: string[];
  capabilities: AgentCapability[];
  /** Short-context cap (tokens) — overflow triggers compaction. */
  contextTokens: number;
  maxSteps: number;
  timeoutMs: number;
}

export type AgentState =
  | 'planned'
  | 'spawning'
  | 'active'
  | 'waiting'
  | 'done'
  | 'error'
  | 'killed'
  | 'expired';

export interface AgentStatus {
  id: AgentId;
  skill: SkillName | null;       // null for the main bubble
  state: AgentState;
  label: string;                 // short display label
  icon: string;
  color: string;
  steps: number;
  tokensUsed: number;
  contextTokens: number;
  startedAt: number | null;
  finishedAt: number | null;
  briefSummary: string;          // truncated brief text
  expectedResult: string;
  guardrails: string[];
  mailboxCount: number;
  lastActivityAt: number;
  resultPreview: string | null;  // final respond preview
  error: string | null;
}

/** What a spawned agent is asked to do. */
export interface AgentBrief {
  skill: SkillName;
  context: string;               // task context (files, plan, previous results…)
  expectedResult: string;        // what "done" looks like
  guardrails: string[];          // extra human-readable guardrails (enforced in prompt + code)
  correlationId?: string;
  timeoutMs?: number;
  /** Seed from a prior agent's compaction summary (memory handoff). */
  seedSummary?: string;
}

export interface SpawnResult {
  agentId: AgentId;
  correlationId: string;
}

export interface WaitResult {
  ok: boolean;
  correlationId: string;
  message: AgentMessage | null;
  reason: 'respond' | 'timeout' | 'aborted' | 'expired' | 'error';
}

