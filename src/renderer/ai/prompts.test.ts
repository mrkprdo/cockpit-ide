import { describe, it, expect } from 'vitest';
import { AGENT_SYSTEM_PROMPT } from './prompts';

describe('AGENT_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof AGENT_SYSTEM_PROMPT).toBe('string');
    expect(AGENT_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('describes the agent role', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('Cockpit Agent');
  });

  it('includes tool categories', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('**Files**');
    expect(AGENT_SYSTEM_PROMPT).toContain('**Editor**');
    expect(AGENT_SYSTEM_PROMPT).toContain('**Terminal**');
    expect(AGENT_SYSTEM_PROMPT).toContain('**Canvas cards**');
    expect(AGENT_SYSTEM_PROMPT).toContain('**Git**');
    expect(AGENT_SYSTEM_PROMPT).toContain('**System**');
    expect(AGENT_SYSTEM_PROMPT).toContain('**SpecsMap**');
    expect(AGENT_SYSTEM_PROMPT).toContain('**Memory**');
  });

  it('includes Memory Protocol and tools', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('Memory Protocol');
    expect(AGENT_SYSTEM_PROMPT).toContain('memory_list');
    expect(AGENT_SYSTEM_PROMPT).toContain('memory_get');
    expect(AGENT_SYSTEM_PROMPT).toContain('memory_set');
  });

  it('includes the Specs-First Protocol (mandatory)', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('Specs-First Protocol');
    expect(AGENT_SYSTEM_PROMPT).toContain('MANDATORY');
  });

  it('mentions specs_explore for spec traversal', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('specs_explore');
  });

  it('is a well-formed markdown string with sections', () => {
    // Should have at least one h2 heading
    expect(AGENT_SYSTEM_PROMPT).toMatch(/## /);
    // Should have at least some markdown formatting
    expect(AGENT_SYSTEM_PROMPT).toContain('**');
    // Should have line breaks
    expect(AGENT_SYSTEM_PROMPT).toContain('\n');
  });

  it('does not contain obvious placeholders or template markers', () => {
    expect(AGENT_SYSTEM_PROMPT).not.toContain('TODO');
    expect(AGENT_SYSTEM_PROMPT).not.toContain('{{');
  });
});
