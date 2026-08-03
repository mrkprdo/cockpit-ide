import { describe, it, expect } from 'vitest';
import { z } from 'zod/v3';
import { zodToJsonSchema } from '../ai/zod-to-openai';
import {
  AgentSpawnArgs,
  AgentDispatchArgs,
  AgentWaitArgs,
  AgentKillArgs,
  AgentApproveArgs,
  AgentBroadcastArgs,
  RoundtableComposeArgs,
  agentApproveTool,
  definitionsListTool,
  agentBroadcastTool,
  roundtableComposeTool,
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

  it('agent_broadcast accepts message + topic (both spellings)', () => {
    const parsed = AgentBroadcastArgs.safeParse({
      message: 'found a lead',
      topic: 'roundtable.rt-abc.findings',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.message).toBe('found a lead');
      expect(parsed.data.topic).toBe('roundtable.rt-abc.findings');
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
        { message: 'panel update', topic: 'roundtable.rt-x.findings' } as never,
        {} as never,
      );
      expect(out).toContain('messageId');
      expect(out).toContain('topic');
      expect(mailbox.length).toBeGreaterThan(0);
      expect(mailbox.peek()[0].topic).toBe('roundtable.rt-x.findings');
    } finally {
      // @ts-expect-error test seam: restore the bus
      ex.bus = original;
      bus.unregisterMailbox('agent:probe');
    }
  });

  it('roundtable_compose accepts camelCase panelSize/quorumRatio/excludeAreas', () => {
    const parsed = RoundtableComposeArgs.safeParse({
      issue: 'editor undo crashes',
      panelSize: 5,
      seed: 42,
      quorumRatio: 0.6,
      excludeAreas: ['expert-business'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.panel_size).toBe(5);
      expect(parsed.data.seed).toBe(42);
      expect(parsed.data.quorum_ratio).toBe(0.6);
      expect(parsed.data.exclude_areas).toEqual(['expert-business']);
    }
  });

  it('roundtable_compose returns a spawn-ready panel plan', async () => {
    const out = await roundtableComposeTool.execute(
      { issue: 'editor undo crashes', panel_size: 5, seed: 7 } as never,
      {} as never,
    );
    const plan = JSON.parse(out);
    expect(plan.sessionId).toMatch(/^rt-/);
    expect(plan.topic).toMatch(/^roundtable\.rt-/);
    expect(plan.panelSize).toBe(5);
    expect(plan.quorum).toBe(3);
    expect(plan.experts).toHaveLength(5);
    for (const e of plan.experts) {
      expect(e.definition).toMatch(/^expert-/);
      expect(e.context).toContain('editor undo crashes');
      expect(e.expectedResult).toBeTruthy();
      expect(Array.isArray(e.guardrails)).toBe(true);
    }
  });

  it('roundtable_compose is deterministic with a seed', async () => {
    const a = JSON.parse(await roundtableComposeTool.execute({ issue: 'x', panel_size: 5, seed: 3 } as never, {} as never));
    const b = JSON.parse(await roundtableComposeTool.execute({ issue: 'x', panel_size: 5, seed: 3 } as never, {} as never));
    // Same seed → same experts/traits (session id/time suffix differs).
    expect(a.experts.map((e: any) => e.definition)).toEqual(b.experts.map((e: any) => e.definition));
    expect(a.experts[0].traits).toEqual(b.experts[0].traits);
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
