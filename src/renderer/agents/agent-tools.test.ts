import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod/v3';
import { zodToJsonSchema } from '../ai/zod-to-openai';
import {
  AgentSpawnArgs,
  AgentDispatchArgs,
  AgentWaitArgs,
  AgentKillArgs,
  AgentApproveArgs,
  AgentBroadcastArgs,
  agentSpawnTool,
  agentApproveTool,
  definitionsListTool,
  agentBroadcastTool,
  agentDispatchTool,
} from './agent-tools';
import { getAgentExecutor } from './executor';
import { AgentBus } from './bus';

/**
 * The orchestrator LLM is told about these tools in prose (ORCHESTRATION_SECTION)
 * and frequently emits camelCase parameter names (expectedResult, agentId,
 * correlationId, expectsResponse, timeoutMs). The schemas must accept BOTH
 * spellings — a rejected spawn/dispatch/wait is a "wrong parameter error" that
 * makes the main session loop and appear stuck.
 */
describe('agent_* tool parameter aliases', () => {
  it('agent_spawn accepts camelCase expectedResult/timeoutMs/seedSummary', () => {
    const parsed = AgentSpawnArgs.safeParse({
      skill: 'implementer',
      context: 'Implement foo',
      expectedResult: 'foo done',
      timeoutMs: 90000,
      seedSummary: 'prior handoff',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.expected_result).toBe('foo done');
      expect(parsed.data.timeout_ms).toBe(90000);
      expect(parsed.data.seed_summary).toBe('prior handoff');
      expect(parsed.data).not.toHaveProperty('expectedResult');
    }
  });

  it('agent_spawn still accepts canonical snake_case', () => {
    const parsed = AgentSpawnArgs.safeParse({
      skill: 'reviewer',
      context: 'Review the diff',
      expected_result: 'review report',
      guardrails: ['read-only'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.expected_result).toBe('review report');
      expect(parsed.data.guardrails).toEqual(['read-only']);
    }
  });

  it('agent_spawn still requires the expected result (either spelling)', () => {
    const missing = AgentSpawnArgs.safeParse({ skill: 'planner', context: 'x' });
    expect(missing.success).toBe(false);
  });

  it('agent_dispatch accepts camelCase agentId/expectsResponse', () => {
    const parsed = AgentDispatchArgs.safeParse({
      agentId: 'agent:abc123',
      message: 'please review',
      topic: 'review.request',
      expectsResponse: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.agent_id).toBe('agent:abc123');
      expect(parsed.data.expects_response).toBe(true);
    }
  });

  it('agent_wait accepts camelCase correlationId/timeoutMs', () => {
    const parsed = AgentWaitArgs.safeParse({ correlationId: 'corr-x', timeoutMs: 5000 });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.correlation_id).toBe('corr-x');
      expect(parsed.data.timeout_ms).toBe(5000);
    }
  });

  it('agent_kill accepts camelCase agentId', () => {
    const parsed = AgentKillArgs.safeParse({ agentId: 'agent:zzz' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.agent_id).toBe('agent:zzz');
    }
  });

  it('agent_broadcast accepts message + topic + intent + re', () => {
    const parsed = AgentBroadcastArgs.safeParse({
      message: 'found a lead',
      topic: 'room.findings',
      intent: 'finding',
      re: 'Reviewer',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.message).toBe('found a lead');
      expect(parsed.data.topic).toBe('room.findings');
      expect(parsed.data.intent).toBe('finding');
      expect(parsed.data.re).toBe('Reviewer');
    }
  });

  it('agent_broadcast tool fans out to all mailboxes (topic-tagged)', async () => {
    const ex = getAgentExecutor();
    const bus = new AgentBus();
    const mailbox = bus.registerMailbox('agent:probe');

    // Swap the executor's bus to a fresh one so the test is hermetic.
    const original = ex.getBus();
    // @ts-expect-error test seam: swap the bus
    ex.bus = bus;
    try {
      const out = await agentBroadcastTool.execute(
        { message: 'panel update', topic: 'room.findings' } as never,
        {} as never,
      );
      expect(out).toContain('messageId');
      expect(out).toContain('topic');
      expect(mailbox.length).toBeGreaterThan(0);
      expect(mailbox.peek()[0].topic).toBe('room.findings');
    } finally {
      // @ts-expect-error test seam: restore the bus
      ex.bus = original;
      bus.unregisterMailbox('agent:probe');
    }
  });

  it('agent_broadcast attributes the sender from ctx.agentId (room attribution)', async () => {
    const ex = getAgentExecutor();
    const bus = new AgentBus();
    bus.registerMailbox('agent:probe');
    const original = ex.getBus();
    // @ts-expect-error test seam: swap the bus
    ex.bus = bus;
    try {
      const out = await agentBroadcastTool.execute(
        { message: 'finding from the reviewer', topic: 'room.findings' } as never,
        { agentId: 'agent:reviewer' } as never,
      );
      expect(out).toContain('messageId');
      expect(out).toContain('agent:reviewer');
      const msg = bus.getMailbox('agent:probe')!.peek()[0];
      expect(msg.from).toBe('agent:reviewer');
    } finally {
      // @ts-expect-error test seam: restore the bus
      ex.bus = original;
      bus.unregisterMailbox('agent:probe');
    }
  });

  it('agent_spawn accepts a persona (inline-designed sub-agent)', () => {
    const parsed = AgentSpawnArgs.safeParse({
      persona: {
        name: 'Cache Skeptic',
        system_prompt: 'Attack cache key correctness from the tenant-isolation angle.',
      },
      context: 'review the cache layer',
      expected_result: 'findings brief',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.persona?.name).toBe('Cache Skeptic');
      expect(parsed.data.persona?.system_prompt).toContain('cache key');
      expect(parsed.data.skill).toBeUndefined();
      expect(parsed.data.agent).toBeUndefined();
    }
  });

  it('persona precedence is enforced at spawn time (persona > agent > skill)', () => {
    // The schema accepts any combination (the model may drift); the executor
    // rejects a spawn that names more than one source.
    const ex = getAgentExecutor();
    const withSkill = () => (ex as any).resolveDefinition({
      persona: { name: 'X', system_prompt: 'p' },
      skill: 'planner',
      context: 'c',
      expectedResult: 'e',
    });
    expect(withSkill).toThrow(/spawn requires either/);
    const withAgent = () => (ex as any).resolveDefinition({
      persona: { name: 'X', system_prompt: 'p' },
      agent: 'reviewer',
      context: 'c',
      expectedResult: 'e',
    });
    expect(withAgent).toThrow(/spawn requires either/);
  });

  it('persona.capabilities is not in the schema (T3 hard security boundary)', () => {
    const parsed = AgentSpawnArgs.safeParse({
      persona: {
        name: 'Escalator',
        system_prompt: 'p',
        capabilities: ['destructive', 'orchestrate'],
      } as never,
      context: 'c',
      expected_result: 'e',
    });
    // The model-authored capabilities key is stripped by the schema — it can
    // never reach the built definition (which hard-codes ['peer']).
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data.persona as any).capabilities).toBeUndefined();
    }
  });

  it('persona forwards intent/re to the executor via emitSay on broadcast', async () => {
    const ex = getAgentExecutor();
    const spy = vi.spyOn(ex, 'emitSay').mockImplementation(() => {});
    const bus = new AgentBus();
    const original = ex.getBus();
    // @ts-expect-error test seam: swap the bus
    ex.bus = bus;
    try {
      await agentBroadcastTool.execute(
        { message: 'the tenant id is missing', topic: 'room.findings', intent: 'rebuttal', re: 'Reviewer' } as never,
        { agentId: 'agent:cache-skeptic' } as never,
      );
      expect(spy).toHaveBeenCalledWith('agent:cache-skeptic', expect.objectContaining({
        intent: 'rebuttal',
        re: 'Reviewer',
        text: 'the tenant id is missing',
      }));
    } finally {
      spy.mockRestore();
      // @ts-expect-error test seam: restore the bus
      ex.bus = original;
    }
  });

  it('agent_dispatch emits say with intent question when expects_response', async () => {
    const ex = getAgentExecutor();
    const saySpy = vi.spyOn(ex, 'emitSay').mockImplementation(() => {});
    const dispatchSpy = vi.spyOn(ex, 'dispatch').mockReturnValue('msg-1');
    try {
      // snake_case: execute() receives args already validated by the schema.
      await agentDispatchTool.execute(
        { agent_id: 'agent:target', message: 'is the cache tenant-scoped?', expects_response: true } as never,
        { agentId: 'agent:asker' } as never,
      );
      expect(saySpy).toHaveBeenCalledWith('agent:asker', expect.objectContaining({
        intent: 'question',
        to: 'agent:target',
      }));
    } finally {
      saySpy.mockRestore();
      dispatchSpy.mockRestore();
    }
  });

  it('explicit snake_case wins when both spellings are provided', () => {
    const parsed = AgentWaitArgs.safeParse({ correlation_id: 'corr-snake', correlationId: 'corr-camel' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.correlation_id).toBe('corr-snake');
    }
  });

  it('the advertised JSON schema still exposes the snake_case params (ZodEffects unwrapped)', () => {
    const schema = zodToJsonSchema(AgentSpawnArgs);
    const props = Object.keys((schema.properties as Record<string, unknown>) ?? {});
    expect(schema.type).toBe('object');
    expect(props).toContain('skill');
    expect(props).toContain('context');
    expect(props).toContain('expected_result');
    expect(props).toContain('timeout_ms');
    expect(props).toContain('seed_summary');
    // Aliases are NOT advertised (the model should learn snake_case) — but they parse.
    expect(props).not.toContain('expectedResult');
    const required = schema.required as string[];
    expect(required).toContain('expected_result');
  });

  it('is a proper ZodEffects instance (compatible with safeParse + infer)', () => {
    expect(AgentSpawnArgs).toBeInstanceOf(z.ZodEffects);
    type SpawnData = z.infer<typeof AgentSpawnArgs>;
    const data: SpawnData = { skill: 'planner', context: 'c', expected_result: 'e' };
    expect(data.skill).toBe('planner');
  });

  it('agent_spawn accepts agent (definition id) instead of skill', () => {
    const parsed = AgentSpawnArgs.safeParse({
      agent: 'db-reader',
      context: 'query the DB',
      expected_result: 'rows',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.agent).toBe('db-reader');
      expect(parsed.data.skill).toBeUndefined();
    }
  });

  it('agent_spawn accepts model/permissionMode/maxTurns overrides (camelCase + snake)', () => {
    const parsed = AgentSpawnArgs.safeParse({
      skill: 'implementer',
      context: 'c',
      expected_result: 'e',
      permissionMode: 'plan',
      maxTurns: 5,
      model: 'deepseek-v4-pro',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.permission_mode).toBe('plan');
      expect(parsed.data.max_turns).toBe(5);
      expect(parsed.data.model).toBe('deepseek-v4-pro');
    }
    // Invalid permission mode is rejected.
    expect(AgentSpawnArgs.safeParse({ skill: 'planner', context: 'c', expected_result: 'e', permission_mode: 'banana' }).success).toBe(false);
  });

  it('agent_approve accepts correlationId/approve with aliases', () => {
    const parsed = AgentApproveArgs.safeParse({ correlationId: 'corr-x', approve: true });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.correlation_id).toBe('corr-x');
      expect(parsed.data.approve).toBe(true);
    }
  });

  it('agent_approve tool reports no parked approval for unknown correlation', async () => {
    const out = await agentApproveTool.execute({ correlation_id: 'corr-nope', approve: true } as never, {} as never);
    expect(out).toContain('No parked approval');
  });

  it('definitions_list lists built-ins and reports structure', async () => {
    const out = await definitionsListTool.execute({} as never, {} as never);
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some((d: any) => d.name === 'implementer')).toBe(true);
    const impl = parsed.find((d: any) => d.name === 'implementer');
    expect(impl.builtin).toBe(true);
    expect(impl.permissionMode).toBe('acceptEdits');
  });
});

describe('room regression guards (§7.2)', () => {
  it('AGENT_TOOLS has no roundtable_compose and carries the pipeline tools', async () => {
    const { AGENT_TOOLS } = await import('./agent-tools');
    const { ALL_TOOLS } = await import('../ai/tool-definitions');
    const names = AGENT_TOOLS.map(t => t.name);
    expect(names).not.toContain('roundtable_compose');
    expect(names).toContain('agent_spawn');
    expect(names).toContain('agent_broadcast');
    expect(names).toContain('pipeline_status');
    expect(names).toContain('pipeline_confirm');
    expect(names).toContain('pipeline_reset');
    // 11 tools: spawn, dispatch, broadcast, wait, status, kill, approve,
    // pipeline_status, pipeline_confirm, pipeline_reset, definitions_list.
    expect(AGENT_TOOLS.length).toBe(11);
    const allNames = ALL_TOOLS.map(t => t.name);
    expect(allNames).not.toContain('roundtable_compose');
  });

  it('ORCHESTRATION_SECTION promotes persona + the shared conversation, with no roundtable guidance', async () => {
    const { ORCHESTRATION_SECTION, AGENT_SHARED_PREAMBLE } = await import('./prompts');
    const text = ORCHESTRATION_SECTION + '\n' + AGENT_SHARED_PREAMBLE;
    expect(text.toLowerCase()).not.toContain('roundtable');
    expect(text).toContain('Designing a sub-agent');
    expect(text).toContain('Running a panel');
    expect(text).toContain('You get 6 broadcasts per run');
  });
});

describe('SDLC pipeline tools', () => {
  beforeEach(() => {
    getAgentExecutor().getPipeline().reset();
  });

  it('pipeline_status reports the fresh loop and canFinish false', async () => {
    const { pipelineStatusTool } = await import('./agent-tools');
    const out = JSON.parse(await pipelineStatusTool.execute({} as never, {} as never));
    expect(out.stages).toHaveLength(4);
    expect(out.canFinish).toBe(false);
    expect(out.next).toBe('plan');
    expect(out.stages.find((s: any) => s.stage === 'plan').confirmed).toBe(false);
  });

  it('pipeline_confirm enforces order through the tool', async () => {
    const { pipelineConfirmTool, pipelineStatusTool } = await import('./agent-tools');
    const early = JSON.parse(await pipelineConfirmTool.execute({ stage: 'implement' } as never, {} as never));
    expect(early.ok).toBe(false);
    expect(early.error).toContain('plan');

    const plan = JSON.parse(await pipelineConfirmTool.execute({ stage: 'plan' } as never, {} as never));
    expect(plan.ok).toBe(true);
    expect(plan.pipeline.canFinish).toBe(false);

    // Order first: test still needs implement confirmed.
    const order = JSON.parse(await pipelineConfirmTool.execute({ stage: 'test' } as never, {} as never));
    expect(order.ok).toBe(false);
    expect(order.error).toContain('implement');

    const impl = JSON.parse(await pipelineConfirmTool.execute({ stage: 'implement' } as never, {} as never));
    expect(impl.ok).toBe(true);

    // Ran requirement: a tester must have actually run before test can be confirmed.
    const noRun = JSON.parse(await pipelineConfirmTool.execute({ stage: 'test' } as never, {} as never));
    expect(noRun.ok).toBe(false);
    expect(noRun.error).toContain('no test sub-agent has run');

    getAgentExecutor().getPipeline().recordRun('test');
    const test2 = JSON.parse(await pipelineConfirmTool.execute({ stage: 'test' } as never, {} as never));
    expect(test2.ok).toBe(true);

    const done = JSON.parse(await pipelineStatusTool.execute({} as never, {} as never));
    expect(done.canFinish).toBe(false);
  });

  it('pipeline_reset clears the loop', async () => {
    const { pipelineConfirmTool, pipelineResetTool, pipelineStatusTool } = await import('./agent-tools');
    await pipelineConfirmTool.execute({ stage: 'plan' } as never, {} as never);
    await pipelineResetTool.execute({} as never, {} as never);
    const out = JSON.parse(await pipelineStatusTool.execute({} as never, {} as never));
    expect(out.stages.find((s: any) => s.stage === 'plan').confirmed).toBe(false);
    expect(out.next).toBe('plan');
  });

  it('agent_spawn refuses an implementer before plan is confirmed (closed-loop gate)', async () => {
    const { agentSpawnTool } = await import('./agent-tools');
    const out = await agentSpawnTool.execute({
      skill: 'implementer',
      context: 'build it',
      expected_result: 'built',
    } as never, {} as never);
    expect(out).toContain('Guardrail: cannot spawn a "implement" agent');
    expect(out).toContain('plan');
    // No agent was actually spawned.
    expect(getAgentExecutor().status().length).toBe(0);
  });

  it('agent_spawn allows a plan-stage agent (the loop starts here)', async () => {
    const { agentSpawnTool } = await import('./agent-tools');
    const out = await agentSpawnTool.execute({
      skill: 'planner',
      context: 'plan the cache work',
      expected_result: 'a plan',
    } as never, {} as never);
    expect(out).toContain('agentId');
  });
});
