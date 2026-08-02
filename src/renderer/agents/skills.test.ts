import { describe, it, expect } from 'vitest';
import { SKILLS, getSkill, guardToolCall, SKILL_NAMES } from './skills';
import type { Skill, SkillName } from './types';

describe('skills registry', () => {
  it('exposes all ten SDLC skills', () => {
    expect(SKILL_NAMES).toHaveLength(10);
    for (const name of SKILL_NAMES) {
      const s = getSkill(name);
      expect(s.icon).toBeTruthy();
      expect(s.color).toMatch(/^#/);
      expect(s.promptTemplate).toContain('# Role');
      expect(s.maxSteps).toBeGreaterThan(0);
      expect(s.timeoutMs).toBeGreaterThan(0);
    }
  });

  it('read-only skills (reviewer, spec-orienter, planner) have no mutating tools', () => {
    const mutating = ['write_file', 'delete_file', 'git_commit', 'write_to_terminal', 'specs_reconcile', 'memory_set'];
    for (const skillName of ['reviewer', 'spec-orienter', 'planner'] as SkillName[]) {
      const s = SKILLS[skillName];
      for (const tool of mutating) {
        expect(s.allowedTools, `${skillName} must not allow ${tool}`).not.toContain(tool);
      }
    }
  });

  it('implementer may write files and peer-message', () => {
    const s = SKILLS.implementer;
    expect(s.allowedTools).toContain('write_file');
    expect(s.capabilities).toContain('destructive');
    expect(s.capabilities).toContain('peer');
  });
});

describe('guardToolCall', () => {
  it('allows tools in the allowlist', () => {
    const r = guardToolCall(SKILLS.reviewer, 'read_file');
    expect(r.ok).toBe(true);
  });

  it('denies tools outside the allowlist with a readable error', () => {
    const r = guardToolCall(SKILLS.reviewer, 'write_file');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Guardrail');
    expect(r.error).toContain('reviewer');
  });

  it('hard-denies orchestration tools without the capability', () => {
    // reviewer has peer but not orchestrate
    expect(guardToolCall(SKILLS.reviewer, 'agent_spawn').ok).toBe(false);
    expect(guardToolCall(SKILLS.reviewer, 'agent_kill').ok).toBe(false);
    // reviewer DOES have peer → agent_dispatch allowed
    expect(guardToolCall(SKILLS.reviewer, 'agent_dispatch').ok).toBe(true);
  });

  it('hard-denies destructive tools without the capability, allows with it', () => {
    // delete_file requires capability 'destructive' AND allowlist membership.
    expect(guardToolCall(SKILLS.planner, 'delete_file').ok).toBe(false);

    // Synthetic skill: destructive capability + allowlisted → allowed.
    const dangerous: Skill = {
      ...SKILLS.implementer,
      allowedTools: [...SKILLS.implementer.allowedTools, 'delete_file'],
      capabilities: [...SKILLS.implementer.capabilities, 'destructive'],
    };
    expect(guardToolCall(dangerous, 'delete_file').ok).toBe(true);

    // Same allowlist but no destructive capability → denied by capability.
    const noCap: Skill = {
      ...dangerous,
      capabilities: dangerous.capabilities.filter(c => c !== 'destructive'),
    };
    expect(guardToolCall(noCap, 'delete_file').ok).toBe(false);
  });

  it('git-committer can commit but never push or checkout', () => {
    expect(guardToolCall(SKILLS['git-committer'], 'git_commit').ok).toBe(true);
    expect(guardToolCall(SKILLS['git-committer'], 'git_push').ok).toBe(false);
    expect(guardToolCall(SKILLS['git-committer'], 'git_checkout').ok).toBe(false);
  });

  it('tester can run terminal commands but not edit files', () => {
    expect(guardToolCall(SKILLS.tester, 'write_to_terminal').ok).toBe(true);
    expect(guardToolCall(SKILLS.tester, 'write_file').ok).toBe(false);
  });
});
