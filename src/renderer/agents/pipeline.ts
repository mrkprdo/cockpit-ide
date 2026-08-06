/**
 * SDLC pipeline guard — code-enforced ordering for how the main session
 * orchestrates sub-agents (plan → implement → test → verify → done).
 *
 * The executor tracks four stages. A stage becomes `ran` when an agent of
 * that stage responds successfully; it becomes `confirmed` when the main
 * session calls pipeline_confirm. `agent_spawn` refuses to spawn a stage
 * agent before its prerequisites are confirmed, so the main session cannot
 * skip ahead (e.g. run tests before an implementation, or review before
 * tests). A task is only ready to be marked done once every stage is
 * confirmed (canFinish).
 *
 * Pure module — no DOM, no bus. Fully unit-testable.
 */

export type PipelineStage = 'plan' | 'implement' | 'test' | 'verify';

export const PIPELINE_STAGES: PipelineStage[] = ['plan', 'implement', 'test', 'verify'];

/** A stage may only be confirmed / spawned once its prerequisites are confirmed. */
export const STAGE_PREREQS: Record<PipelineStage, PipelineStage[]> = {
  plan: [],
  implement: ['plan'],
  test: ['implement'],
  verify: ['implement', 'test'],
};

/** Built-in SDLC skills and the pipeline stage they belong to. */
export const SKILL_TO_STAGE: Record<string, PipelineStage> = {
  planner: 'plan',
  'spec-orienter': 'plan',
  scaffolder: 'implement',
  implementer: 'implement',
  debugger: 'implement',
  tester: 'test',
  reviewer: 'verify',
  'git-committer': 'verify',
  'docs-writer': 'verify',
  'spec-sync': 'verify',
};

/** Example agent to spawn for a stage — used in guardrail error hints. */
const STAGE_EXAMPLES: Record<PipelineStage, string> = {
  plan: 'a planner or spec-orienter',
  implement: 'an implementer (or scaffolder / debugger)',
  test: 'a tester',
  verify: 'a reviewer',
};

/** Map a definition/skill name to its pipeline stage (null for personas/custom). */
export function stageForSkill(skill: string): PipelineStage | null {
  return SKILL_TO_STAGE[skill] ?? null;
}

export class Pipeline {
  ran = new Set<PipelineStage>();
  confirmed = new Set<PipelineStage>();

  hasRun(stage: PipelineStage): boolean {
    return this.ran.has(stage);
  }

  isConfirmed(stage: PipelineStage): boolean {
    return this.confirmed.has(stage);
  }

  /** Record that an agent of this stage responded successfully. */
  recordRun(stage: PipelineStage): void {
    this.ran.add(stage);
  }

  /**
   * Confirm a stage as complete. Order is enforced against STAGE_PREREQS;
   * `test` and `verify` additionally require an agent of that stage to have
   * actually run (the loop's point is that tests/verification happen, not that
   * the main session asserts them). plan/implement may be confirmed directly —
   * the main session can plan or implement itself.
   */
  confirm(stage: PipelineStage): { ok: boolean; error?: string } {
    if (this.confirmed.has(stage)) return { ok: true };
    const missing = STAGE_PREREQS[stage].filter(p => !this.confirmed.has(p));
    if (missing.length > 0) {
      return {
        ok: false,
        error: `Cannot confirm "${stage}" before ${missing.map(p => `"${p}"`).join(', ')}. Confirm ${missing.map(p => `"${p}"`).join(', ')} first.`,
      };
    }
    if (stage !== 'plan' && stage !== 'implement' && !this.ran.has(stage)) {
      return {
        ok: false,
        error: `Cannot confirm "${stage}" — no ${stage} sub-agent has run yet. Spawn ${STAGE_EXAMPLES[stage]} and wait for its respond first.`,
      };
    }
    this.confirmed.add(stage);
    return { ok: true };
  }

  /** Gate an agent_spawn for a stage's skill. Returns {ok} / {ok:false, error}. */
  checkSpawn(stage: PipelineStage): { ok: boolean; error?: string } {
    const missing = STAGE_PREREQS[stage].filter(p => !this.confirmed.has(p));
    if (missing.length > 0) {
      return {
        ok: false,
        error: `Guardrail: cannot spawn a "${stage}" agent before ${missing.map(p => `"${p}"`).join(', ')}. Run ${STAGE_EXAMPLES[missing[0]]} and pipeline_confirm("${missing[0]}") first.`,
      };
    }
    return { ok: true };
  }

  /** What is left, what is next, and whether the loop can close. */
  status(): { next: PipelineStage | null; completed: PipelineStage[]; pending: PipelineStage[]; canFinish: boolean } {
    const completed = PIPELINE_STAGES.filter(s => this.confirmed.has(s));
    const pending = PIPELINE_STAGES.filter(s => !this.confirmed.has(s));
    const next = pending.find(s => STAGE_PREREQS[s].every(p => this.confirmed.has(p))) ?? null;
    return { next, completed, pending, canFinish: pending.length === 0 };
  }

  reset(): void {
    this.ran.clear();
    this.confirmed.clear();
  }
}
