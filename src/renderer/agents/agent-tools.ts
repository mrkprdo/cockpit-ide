import { z } from 'zod/v3';
import type { ToolDefinition } from '../ai/types';
import { getAgentExecutor } from './executor';
import { SKILL_NAMES } from './skills';
import { listDefinitions } from './definitions';
import type { PermissionMode } from './types';

/**
 * Sub-agent orchestration tools. Registered in ALL_TOOLS via tool-definitions.ts
 * so the main session (and capable peers) can spawn/dispatch/wait/kill/approve.
 *
 * Guardrails for these tools are enforced both here (existence checks) and in
 * the skill layer (skills.ts HARD_DENY: spawn/kill need 'orchestrate',
 * dispatch needs 'peer'). Custom definitions can restrict which agents may be
 * spawned via `permissions.deny: ["Agent(name)"]`.
 *
 * Parameter naming: the canonical keys are snake_case (what the JSON schema
 * advertises to the model). camelCase aliases (expectedResult, agentId, …) are
 * ALSO accepted at parse time so a model that follows camelCase conventions —
 * e.g. the orchestration prose in the system prompt — does not get spurious
 * "Invalid arguments" errors.
 */

const SkillEnum = z.enum(SKILL_NAMES as unknown as [string, ...string[]]);
const PermissionModeEnum = z.enum(['default', 'acceptEdits', 'auto', 'plan', 'dontAsk']);

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
  skill: SkillEnum.optional().describe('Built-in SDLC skill to launch (mutually exclusive with agent)'),
  agent: z.string().optional().describe('Custom or built-in subagent definition id (mutually exclusive with skill)'),
  context: z.string().describe('Task context: files, plan, previous results — keep it tight, the agent has no other memory'),
  expected_result: z.string().describe('What "done" looks like — the agent aims its final respond at this'),
  guardrails: z.array(z.string()).optional().describe('Extra human-readable guardrails for this dispatch'),
  timeout_ms: z.number().int().positive().optional().describe('Override the definition default timeout in ms'),
  seed_summary: z.string().optional().describe('Compaction summary from a prior agent (memory handoff)'),
  model: z.string().optional().describe('Per-agent model override (falls back to definition.model, then the executor config)'),
  permission_mode: PermissionModeEnum.optional().describe('Per-agent permission mode override (default|acceptEdits|auto|plan|dontAsk)'),
  max_turns: z.number().int().positive().optional().describe('Per-agent step cap override'),
}, {
  expectedResult: 'expected_result',
  timeoutMs: 'timeout_ms',
  seedSummary: 'seed_summary',
  permissionMode: 'permission_mode',
  maxTurns: 'max_turns',
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

export const AgentApproveArgs = withAliases({
  correlation_id: z.string().describe('Correlation id whose ask-gated tool call should be approved/denied'),
  approve: z.boolean().describe('true = allow the parked tool to run; false = deny it'),
}, {
  correlationId: 'correlation_id',
});

export const agentSpawnTool: ToolDefinition<typeof AgentSpawnArgs> = {
  name: 'agent_spawn',
  description: 'Launch an autonomous sub-agent. Pass EITHER skill (built-in SDLC skill) OR agent (custom definition id). Returns {agentId, correlationId}. Non-blocking: the agent runs on the bus; await its result with agent_wait(correlationId). Params: skill?/agent?, context, expected_result (alias expectedResult), guardrails?, timeout_ms? (alias timeoutMs), seed_summary?, model?, permission_mode? (alias permissionMode), max_turns?.',
  parameters: AgentSpawnArgs,
  execute: async (args) => {
    const ex = getAgentExecutor();
    try {
      const res = ex.spawn({
        skill: args.skill as never,
        agent: args.agent,
        context: args.context,
        expectedResult: args.expected_result,
        guardrails: args.guardrails,
        timeoutMs: args.timeout_ms,
        seedSummary: args.seed_summary,
        model: args.model,
        permissionMode: args.permission_mode as PermissionMode | undefined,
        maxTurns: args.max_turns,
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
  description: 'List all sub-agents: id, definition/skill, lifecycle state, steps, tokens, mailbox depth, brief summary, result preview. Also reports the current LLM config source and concurrency cap.',
  parameters: AgentStatusArgs,
  execute: async () => {
    const ex = getAgentExecutor();
    return JSON.stringify({
      cap: ex.getMaxConcurrent(),
      agents: ex.status().map(a => ({
        id: a.id,
        skill: a.skill,
        definition: a.definition,
        isCustom: a.isCustom,
        permissionMode: a.permissionMode,
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

export const agentApproveTool: ToolDefinition<typeof AgentApproveArgs> = {
  name: 'agent_approve',
  description: 'Approve or deny a parked ask-gated tool call on a sub-agent (agent_wait returned reason "needs-approval"). approve=true re-runs the tool; false injects an approval-declined note. Params: correlation_id (alias correlationId), approve.',
  parameters: AgentApproveArgs,
  execute: async (args) => {
    const ex = getAgentExecutor();
    const ok = ex.approve(args.correlation_id, args.approve);
    return ok
      ? `Approval ${args.approve ? 'granted' : 'denied'} for ${args.correlation_id}`
      : `No parked approval for "${args.correlation_id}"`;
  },
};

export const DefinitionsListArgs = z.object({});

export const definitionsListTool: ToolDefinition<typeof DefinitionsListArgs> = {
  name: 'definitions_list',
  description: 'List every available subagent definition: id, built-in vs custom, description, permission mode, max turns, tool count. Use before agent_spawn to pick an agent id.',
  parameters: DefinitionsListArgs,
  execute: async () => {
    const list = listDefinitions();
    return JSON.stringify(list.map(d => ({
      name: d.name,
      builtin: SKILL_NAMES.includes(d.name as never),
      description: d.description,
      permissionMode: d.permissionMode ?? 'acceptEdits',
      maxTurns: d.maxTurns ?? 24,
      model: d.model ?? null,
      tools: d.tools ? d.tools.length : 'read-only',
    })), null, 2);
  },
};

export const AGENT_TOOLS: ToolDefinition<any>[] = [
  agentSpawnTool,
  agentDispatchTool,
  agentWaitTool,
  agentStatusTool,
  agentKillTool,
  agentApproveTool,
  definitionsListTool,
];
