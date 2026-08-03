import { describe, it, expect, afterEach } from 'vitest';
import { AgentsPlugin } from './AgentsPlugin';
import { getAgentExecutor } from '../agents/executor';
import { roundtableComposeTool, agentSpawnTool } from '../agents/agent-tools';

/**
 * End-to-end smoke coverage for the "no manual setup" goal: the real
 * AgentsPlugin against a real DOM, driven only through the same tool-call
 * path the LLM uses (roundtable_compose + agent_spawn) — no manual
 * spawn/compose form exists to drive instead.
 */
describe('AgentsPlugin smoke', () => {
  afterEach(() => {
    getAgentExecutor().purgeAll();
  });

  it('renders live-telemetry shell with no manual spawn/compose forms', () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    const plugin = new AgentsPlugin(body, '/ws');

    // No manual controls anywhere.
    expect(body.querySelector('.agents-spawn')).toBeNull();
    expect(body.querySelector('.agents-spawn-btn')).toBeNull();
    expect(body.querySelector('.agents-rt-compose-btn')).toBeNull();
    expect(body.querySelector('.agents-rt-issue')).toBeNull();
    expect(body.querySelector('select')).toBeNull();
    expect(body.querySelectorAll('input').length).toBe(0);
    expect(body.querySelectorAll('textarea').length).toBe(0);

    // Fleet hygiene ops kept.
    expect(body.querySelector('.agents-purge-btn')).not.toBeNull();
    expect(body.querySelector('.agents-killall-btn')).not.toBeNull();

    // Live view scaffolding present.
    expect(body.querySelector('.agents-svg')).not.toBeNull();
    expect(body.querySelector('.agents-bubbles')).not.toBeNull();
    expect(body.querySelector('.agents-inspector')).not.toBeNull();
    // No live roundtable session yet → hidden.
    expect((body.querySelector('.agents-rt') as HTMLElement).hidden).toBe(true);

    plugin.destroy();
  });

  it('shows a live quorum tracker for an LLM-driven roundtable_compose + agent_spawn, no manual composer involved', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    const plugin = new AgentsPlugin(body, '/ws');

    // Exactly what the LLM does per ROUNDTABLE_SECTION: compose, then spawn
    // each expert tagged with roundtable_session_id — no UI form touched.
    const planJson = await roundtableComposeTool.execute({ issue: 'flaky test in CI', panel_size: 3 } as never, {} as never);
    const plan = JSON.parse(planJson);
    for (const e of plan.experts) {
      await agentSpawnTool.execute({
        agent: e.definition,
        context: e.context,
        expected_result: e.expectedResult,
        guardrails: e.guardrails,
        roundtable_session_id: plan.sessionId,
      } as never, {} as never);
    }

    (plugin as any).refreshStatuses();
    (plugin as any).renderRoundtable();

    const rtEl = body.querySelector('.agents-rt') as HTMLElement;
    expect(rtEl.hidden).toBe(false);
    expect(body.querySelectorAll('.agents-rt-chip').length).toBe(3);
    expect(body.querySelector('.agents-rt-plan-id')?.textContent).toBe(plan.sessionId);
    // The removed manual controls stay removed even with a live session up.
    expect(body.querySelector('.agents-rt-compose-btn')).toBeNull();
    expect(body.querySelector('.agents-rt-issue')).toBeNull();

    plugin.destroy();
  });
});
