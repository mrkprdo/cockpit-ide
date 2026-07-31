import { z } from 'zod/v3';
import type { ToolDefinition } from '../ai/types';
import { getAgentExecutor } from './executor';
import { SKILL_NAMES } from './skills';

/**
 * Sub-agent orchestration tools. Registered in ALL_TOOLS via tool-definitions.ts
 * so the main session (and capable peers) can spawn/dispatch/wait/kill.
 *
 * Guardrails for these tools are enforced both here (existence checks) and in
 * the skill layer (skills.ts HARD_DENY: spawn/kill need 'orchestrate',
 * dispatch needs 'peer').
 *
 * Parameter naming: the canonical keys are snake_case (what the JSON schema
 * advertises to the model). camelCase aliases (expectedResult, agentId, …) are
 * ALSO accepted at parse time so a model that follows camelCase conventions —
 * e.g. the orchestration prose in the system prompt — does not get spurious
 * "Invalid arguments" errors.
 */

const SkillEnum = z.enum(SKILL_NAMES as unknown as [string, ...string[]]);

/**
 * Normalize camelCase aliases onto their canonical snake_case keys before
 * validation. Only applied when the canonical key is absent, so explicit
 * snake_case wins. Unknown keys are stripped by the object schema as usual.
 */
function withAliases<T extends z.ZodRawShape>(shape: T, aliases: Record<string, string>) {
  return z.preprocess((val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      const out: Record<string, unknown> = { ...obj };
      for (const [alias, canonical] of Object.entries(aliases)) {
        if (out[alias] !== undefined && out[canonical] === undefined) {
          out[canonical] = out[alias];
          delete out[alias];
        }
      }
      return out;
    }
    return val;
  }, z.object(shape));
}

export const AgentSpawnArgs = withAliases({
  skill: SkillEnum.describe('SDLC skill to launch'),
  context: z.string().describe('Task context: files, plan, previous results — keep it tight, the agent has no other memory'),
  expected_result: z.string().describe('What "done" looks like — the agent aims its final respond at this'),
  guardrails: z.array(z.string()).optional().describe('Extra human-readable guardrails for this dispatch'),
  timeout_ms: z.number().int().positive().optional().describe('Override the skill default timeout in ms'),
  seed_summary: z.string().optional().describe('Compaction summary from a prior agent (memory handoff)'),
}, {
  expectedResult: 'expected_result',
  timeoutMs: 'timeout_ms',
  seedSummary: 'seed_summary',
});

export const AgentDispatchArgs = withAliases({
  agent_id: z.string().describe('Target agent id (from agent_spawn or agent_status)'),
  message: z.string().describe('Message / request payload'),
  topic: z.string().optional().describe('Topic for fan-out, e.g. "review.request", "impl.done"'),
  expects_response: z.boolean().optional().describe('Register a waiter on the correlation id (default false)'),
}, {
  agentId: 'agent_id',
  expectsResponse: 'expects_response',
});

export const AgentWaitArgs = withAliases({
  correlation_id: z.string().describe('Correlation id returned by agent_spawn'),
  timeout_ms: z.number().int().positive().optional().describe('Max wait in ms (default 120000)'),
}, {
  correlationId: 'correlation_id',
  timeoutMs: 'timeout_ms',
});

export const AgentStatusArgs = z.object({});

export const AgentKillArgs = withAliases({
  agent_id: z.string().describe('Agent id to abort'),
}, {
  agentId: 'agent_id',
});

export const agentSpawnTool: ToolDefinition<typeof AgentSpawnArgs> = {
  name: 'agent_spawn',
  description: 'Launch an autonomous sub-agent with the given SDLC skill. Returns {agentId, correlationId}. Non-blocking: the agent runs on the bus; await its result with agent_wait(correlationId). Params: skill, context, expected_result (alias expectedResult), guardrails?, timeout_ms? (alias timeoutMs), seed_summary?.',
  parameters: AgentSpawnArgs,
  execute: async (args) => {
    const ex = getAgentExecutor();
    try {
      const res = ex.spawn({
        skill: args.skill as never,
        context: args.context,
        expectedResult: args.expected_result,
        guardrails: args.guardrails,
        timeoutMs: args.timeout_ms,
        seedSummary: args.seed_summary,
      });
      return JSON.stringify(res, null, 2);
    } catch (err: any) {
      return `Error spawning agent: ${err?.message || String(err)}`;
    }
  },
};

export const agentDispatchTool: ToolDefinition<typeof AgentDispatchArgs> = {
  name: 'agent_dispatch',
  description: 'Send a message/request to a running sub-agent (peer messaging). Use topic for fan-out (e.g. "review.request"). Returns the message id. Params: agent_id (alias agentId), message, topic?, expects_response? (alias expectsResponse).',
  parameters: AgentDispatchArgs,
  execute: async (args) => {
    const ex = getAgentExecutor();
    const correlationId = args.expects_response
      ? `corr-msg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      : undefined;
    try {
      const msgId = ex.dispatch(args.agent_id as never, {
        type: args.expects_response ? 'request' : 'broadcast',
        topic: args.topic,
        correlationId,
        expectsResponse: args.expects_response,
        payload: args.message,
      });
      return JSON.stringify({ messageId: msgId, correlationId: correlationId ?? null }, null, 2);
    } catch (err: any) {
      return `Error dispatching: ${err?.message || String(err)}`;
    }
  },
};

export const agentWaitTool: ToolDefinition<typeof AgentWaitArgs> = {
  name: 'agent_wait',
  description: 'Non-blocking await on the message collector for a correlationId (from agent_spawn or agent_dispatch). Resolves with the agent\'s respond payload or a timeout reason. Params: correlation_id (alias correlationId), timeout_ms? (alias timeoutMs).',
  parameters: AgentWaitArgs,
  execute: async (args) => {
    const ex = getAgentExecutor();
    const res = await ex.waitFor(args.correlation_id, args.timeout_ms ?? 120_000);
    if (!res.ok || !res.message) {
      return JSON.stringify({ ok: false, reason: res.reason, correlationId: res.correlationId }, null, 2);
    }
    const payload = typeof res.message.payload === 'string'
      ? res.message.payload
      : JSON.stringify(res.message.payload, null, 2);
    return JSON.stringify({
      ok: true,
      from: res.message.from,
      topic: res.message.topic ?? null,
      payload,
    }, null, 2);
  },
};

export const agentStatusTool: ToolDefinition<typeof AgentStatusArgs> = {
  name: 'agent_status',
  description: 'List all sub-agents: id, skill, lifecycle state, steps, tokens, mailbox depth, brief summary, result preview. Also reports the current LLM config source and concurrency cap.',
  parameters: AgentStatusArgs,
  execute: async () => {
    const ex = getAgentExecutor();
    return JSON.stringify({
      cap: ex.getMaxConcurrent(),
      agents: ex.status().map(a => ({
        id: a.id,
        skill: a.skill,
        state: a.state,
        steps: a.steps,
        tokensUsed: a.tokensUsed,
        contextTokens: a.contextTokens,
        mailbox: a.mailboxCount,
        startedAt: a.startedAt,
        finishedAt: a.finishedAt,
        brief: a.briefSummary,
        expectedResult: a.expectedResult,
        resultPreview: a.resultPreview,
        error: a.error,
      })),
    }, null, 2);
  },
};

export const agentKillTool: ToolDefinition<typeof AgentKillArgs> = {
  name: 'agent_kill',
  description: 'Abort a running sub-agent at its next yield. Its status becomes killed; it is GC\'d with the next purge. Params: agent_id (alias agentId).',
  parameters: AgentKillArgs,
  execute: async (args) => {
    const ex = getAgentExecutor();
    const ok = ex.kill(args.agent_id as never);
    return ok ? `Killed ${args.agent_id}` : `No running agent "${args.agent_id}"`;
  },
};

export const AGENT_TOOLS: ToolDefinition<any>[] = [
  agentSpawnTool,
  agentDispatchTool,
  agentWaitTool,
  agentStatusTool,
  agentKillTool,
];
