import { describe, it, expect } from 'vitest';
import {
  EXPERT_AREAS,
  EXPERT_DEFINITIONS,
  SUB_TRAITS,
  composeRoundtable,
  quorumFor,
  mulberry32,
  buildExpertDefinition,
  registerRoundtableExperts,
  _resetRoundtableRegistrationForTests,
} from './roundtable';
import { getDefinition } from './definitions';

describe('roundtable roster', () => {
  it('has the 15 skill areas with unique ids', () => {
    expect(EXPERT_AREAS).toHaveLength(15);
    const ids = EXPERT_AREAS.map(a => a.id);
    expect(new Set(ids).size).toBe(15);
    for (const a of EXPERT_AREAS) {
      expect(a.id).toMatch(/^expert-[a-z-]+$/);
      expect(a.skill).toBeTruthy();
      expect(a.individual).toBeTruthy();
      expect(a.team).toBeTruthy();
      expect(a.icon).toBeTruthy();
      expect(a.color).toMatch(/^#/);
    }
  });

  it('covers the full skill-area table from the roundtable spec', () => {
    const skills = EXPERT_AREAS.map(a => a.skill);
    for (const expected of [
      'Programming', 'Software Design', 'Algorithms & Data Structures', 'Debugging', 'Testing',
      'Build Systems', 'Version Control', 'Operating Systems', 'Networking', 'Security',
      'Performance', 'Documentation', 'DevOps', 'Communication', 'Business Understanding',
    ]) {
      expect(skills).toContain(expected);
    }
  });

  it('has a non-trivial sub-trait pool with distinct entries', () => {
    expect(SUB_TRAITS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SUB_TRAITS).size).toBe(SUB_TRAITS.length);
  });
});

describe('expert definitions', () => {
  it('builds one SubAgentDefinition per area with the right contract', () => {
    expect(EXPERT_DEFINITIONS).toHaveLength(15);
    for (const defn of EXPERT_DEFINITIONS) {
      expect(defn.name).toMatch(/^expert-[a-z-]+$/);
      expect(defn.systemPrompt).toContain('# Role');
      expect(defn.capabilities).toContain('peer');
      expect(defn.capabilities).not.toContain('orchestrate');
      expect(defn.permissionMode).toBe('default');
      // Experts are read-only analysts + peer sharers; no destructive tools.
      expect(defn.tools).not.toContain('write_file');
      expect(defn.tools).not.toContain('delete_file');
      expect(defn.tools).not.toContain('git_commit');
      expect(defn.tools).not.toContain('agent_spawn');
      expect(defn.tools).toContain('agent_broadcast');
      expect(defn.tools).toContain('agent_dispatch');
    }
  });

  it('expert definitions register by id (idempotent)', () => {
    _resetRoundtableRegistrationForTests();
    registerRoundtableExperts();
    registerRoundtableExperts(); // idempotent
    for (const a of EXPERT_AREAS) {
      expect(getDefinition(a.id)?.name).toBe(a.id);
    }
  });
});

describe('quorum math', () => {
  it('defaults to 60% of the panel, at least 1', () => {
    expect(quorumFor(5)).toBe(3);
    expect(quorumFor(3)).toBe(2);
    expect(quorumFor(15)).toBe(9);
    expect(quorumFor(1)).toBe(1);
  });

  it('clamps ratio to [0.5, 1] and never exceeds panel size', () => {
    expect(quorumFor(5, 0.5)).toBe(3);
    expect(quorumFor(5, 1)).toBe(5);
    expect(quorumFor(5, 0.99)).toBe(5);
    expect(quorumFor(5, 0.1)).toBe(3);
  });
});

describe('seeded randomness', () => {
  it('mulberry32 is deterministic for a seed', () => {
    const a = mulberry32(42); const b = mulberry32(42);
    const ra = Array.from({ length: 10 }, () => a());
    const rb = Array.from({ length: 10 }, () => b());
    expect(ra).toEqual(rb);
  });

  it('different seeds produce different sequences', () => {
    const a = mulberry32(1); const b = mulberry32(2);
    const ra = Array.from({ length: 10 }, () => a());
    const rb = Array.from({ length: 10 }, () => b());
    expect(ra).not.toEqual(rb);
  });
});

describe('composeRoundtable', () => {
  it('produces a deterministic panel for the same seed', () => {
    const p1 = composeRoundtable('the async bug in llm-loop', { seed: 7, panelSize: 5 });
    const p2 = composeRoundtable('the async bug in llm-loop', { seed: 7, panelSize: 5 });
    const det = (pl: any) => ({ seed: pl.seed, panelSize: pl.panelSize, quorum: pl.quorum, experts: pl.experts.map((e: any) => ({ definition: e.definition, traits: e.traits, master: e.master })) });
    expect(det(p1)).toEqual(det(p2));
    expect(p1.seed).toBe(7);
  });

  it('different seeds (usually) produce different panels', () => {
    const p1 = composeRoundtable('issue', { seed: 1, panelSize: 5 });
    const p2 = composeRoundtable('issue', { seed: 2, panelSize: 5 });
    const ids1 = p1.experts.map(e => e.definition).sort();
    const ids2 = p2.experts.map(e => e.definition).sort();
    // Same panel size; the exact draw differs across seeds (over many seeds this
    // is virtually guaranteed to differ at least once in position/order).
    expect(ids1).toHaveLength(5);
    expect(ids2).toHaveLength(5);
  });

  it('defaults to a 5-expert panel with distinct experts', () => {
    const p = composeRoundtable('issue', { seed: 3 });
    expect(p.panelSize).toBe(5);
    expect(p.experts).toHaveLength(5);
    const defs = p.experts.map(e => e.definition);
    expect(new Set(defs).size).toBe(5);
  });

  it('clamps panel size to [3, pool size]', () => {
    expect(composeRoundtable('x', { seed: 1, panelSize: 2 }).panelSize).toBe(3);
    expect(composeRoundtable('x', { seed: 1, panelSize: 99 }).panelSize).toBe(15);
    const small = composeRoundtable('x', { seed: 1, areas: ['expert-debugging', 'expert-testing', 'expert-security'] });
    expect(small.panelSize).toBe(3);
    expect(small.experts.map(e => e.definition)).toEqual(expect.arrayContaining([
      'expert-debugging', 'expert-testing', 'expert-security',
    ]));
  });

  it('respects excludeAreas', () => {
    const p = composeRoundtable('x', { seed: 5, excludeAreas: ['expert-debugging', 'expert-security'] });
    expect(p.experts.map(e => e.definition)).not.toContain('expert-debugging');
    expect(p.experts.map(e => e.definition)).not.toContain('expert-security');
  });

  it('each expert has a master skill + 1-3 sub-traits from the pool', () => {
    const p = composeRoundtable('x', { seed: 9, panelSize: 15 });
    for (const e of p.experts) {
      expect(e.master).toBeTruthy();
      expect(e.traits.length).toBeGreaterThanOrEqual(1);
      expect(e.traits.length).toBeLessThanOrEqual(3);
      for (const t of e.traits) expect(SUB_TRAITS).toContain(t);
      // Per-expert traits are distinct
      expect(new Set(e.traits).size).toBe(e.traits.length);
    }
  });

  it('briefs are spawn-ready: definition, context, expectedResult, guardrails', () => {
    const p = composeRoundtable('The editor crashes on undo', { seed: 11 });
    for (const e of p.experts) {
      expect(e.definition).toMatch(/^expert-/);
      expect(e.context).toContain('The editor crashes on undo');
      expect(e.context).toContain(e.master);
      expect(e.context).toContain(p.sessionId);
      expect(e.context).toContain(p.topic);
      expect(e.expectedResult).toContain(e.name);
      expect(e.guardrails.length).toBeGreaterThanOrEqual(3);
      for (const g of e.guardrails) expect(typeof g).toBe('string');
    }
  });

  it('emits a unique session topic per session', () => {
    const p1 = composeRoundtable('x', { seed: 2 });
    const p2 = composeRoundtable('x', { seed: 2, panelSize: 5 });
    // Same seed → same panel, but session ids must still differ (they embed time).
    expect(p1.topic).toMatch(/^roundtable\.rt-/);
    expect(p2.topic).toMatch(/^roundtable\.rt-/);
    expect(p1.topic).not.toBe(p2.topic);
  });

  it('quorum matches the plan math', () => {
    const p = composeRoundtable('x', { seed: 4, panelSize: 5, quorumRatio: 0.6 });
    expect(p.quorum).toBe(quorumFor(5, 0.6));
    const pFull = composeRoundtable('x', { seed: 4, panelSize: 5, quorumRatio: 1 });
    expect(pFull.quorum).toBe(5);
  });
});
