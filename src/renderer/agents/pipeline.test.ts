import { describe, it, expect } from 'vitest';
import { Pipeline, PIPELINE_STAGES, STAGE_PREREQS, SKILL_TO_STAGE, stageForSkill } from './pipeline';

describe('Pipeline', () => {
  it('maps built-in SDLC skills to their stages', () => {
    expect(stageForSkill('planner')).toBe('plan');
    expect(stageForSkill('spec-orienter')).toBe('plan');
    expect(stageForSkill('implementer')).toBe('implement');
    expect(stageForSkill('scaffolder')).toBe('implement');
    expect(stageForSkill('debugger')).toBe('implement');
    expect(stageForSkill('tester')).toBe('test');
    expect(stageForSkill('reviewer')).toBe('verify');
    expect(stageForSkill('git-committer')).toBe('verify');
    expect(stageForSkill('docs-writer')).toBe('verify');
    expect(stageForSkill('spec-sync')).toBe('verify');
    // Personas and custom defs do not map to a stage.
    expect(stageForSkill('adhoc-cache-skeptic-abc1')).toBeNull();
    expect(stageForSkill('db-reader')).toBeNull();
  });

  it('prerequisites form the closed loop plan→implement→test→verify', () => {
    expect(STAGE_PREREQS.plan).toEqual([]);
    expect(STAGE_PREREQS.implement).toEqual(['plan']);
    expect(STAGE_PREREQS.test).toEqual(['implement']);
    expect(STAGE_PREREQS.verify).toEqual(['implement', 'test']);
    expect(PIPELINE_STAGES).toEqual(['plan', 'implement', 'test', 'verify']);
  });

  it('checkSpawn refuses to spawn a stage before its prerequisites are confirmed', () => {
    const p = new Pipeline();
    expect(p.checkSpawn('implement').ok).toBe(false);
    expect(p.checkSpawn('test').ok).toBe(false);
    expect(p.checkSpawn('verify').ok).toBe(false);
    expect(p.checkSpawn('plan').ok).toBe(true); // plan has no prerequisites
    expect(p.checkSpawn('implement').error).toContain('plan');
    expect(p.checkSpawn('verify').error).toContain('implement');
    expect(p.checkSpawn('verify').error).toContain('test');
  });

  it('confirm enforces order and requires an agent to have run for test/verify', () => {
    const p = new Pipeline();
    // Cannot confirm implement before plan.
    expect(p.confirm('implement').ok).toBe(false);
    expect(p.confirm('implement').error).toContain('plan');
    // plan can be confirmed directly (the main session may plan itself).
    expect(p.confirm('plan').ok).toBe(true);
    // implement can be confirmed directly too.
    expect(p.confirm('implement').ok).toBe(true);
    // test needs a tester to have actually run.
    expect(p.confirm('test').ok).toBe(false);
    expect(p.confirm('test').error).toContain('no test sub-agent has run');
    p.recordRun('test');
    expect(p.confirm('test').ok).toBe(true);
    // verify needs a verify agent to have run, and implement+test confirmed.
    expect(p.confirm('verify').ok).toBe(false);
    p.recordRun('verify');
    expect(p.confirm('verify').ok).toBe(true);
  });

  it('confirm is idempotent for an already-confirmed stage', () => {
    const p = new Pipeline();
    expect(p.confirm('plan').ok).toBe(true);
    expect(p.confirm('plan').ok).toBe(true);
    expect(p.confirm('plan').error).toBeUndefined();
  });

  it('status reports progress, next, and canFinish only when all stages are confirmed', () => {
    const p = new Pipeline();
    expect(p.status().canFinish).toBe(false);
    expect(p.status().next).toBe('plan');
    expect(p.status().pending).toEqual(['plan', 'implement', 'test', 'verify']);

    p.confirm('plan');
    p.confirm('implement');
    p.recordRun('test');
    p.confirm('test');
    expect(p.status().next).toBe('verify');
    expect(p.status().canFinish).toBe(false);

    p.recordRun('verify');
    p.confirm('verify');
    const s = p.status();
    expect(s.canFinish).toBe(true);
    expect(s.next).toBeNull();
    expect(s.completed).toEqual(['plan', 'implement', 'test', 'verify']);
  });

  it('reset clears ran and confirmed state', () => {
    const p = new Pipeline();
    p.recordRun('test');
    p.confirm('plan');
    p.reset();
    expect(p.hasRun('test')).toBe(false);
    expect(p.isConfirmed('plan')).toBe(false);
    expect(p.status().next).toBe('plan');
  });

  it('SKILL_TO_STAGE covers every built-in SDLC skill', () => {
    expect(Object.keys(SKILL_TO_STAGE).sort()).toEqual([
      'debugger', 'docs-writer', 'git-committer', 'implementer', 'planner',
      'reviewer', 'scaffolder', 'spec-orienter', 'spec-sync', 'tester',
    ]);
  });
});
