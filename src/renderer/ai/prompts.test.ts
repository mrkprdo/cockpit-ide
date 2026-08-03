import { describe, it, expect } from 'vitest';
import {
  AGENT_SYSTEM_PROMPT,
  ROUTING_POLICY,
  buildPlatformPrompt,
  detectHostPlatform,
  resetHostPlatform,
} from './prompts';

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

describe('ROUTING_POLICY', () => {
  it('is a non-empty string', () => {
    expect(typeof ROUTING_POLICY).toBe('string');
    expect(ROUTING_POLICY.length).toBeGreaterThan(0);
  });

  it('defines all three routing modes', () => {
    expect(ROUTING_POLICY).toContain('Just respond');
    expect(ROUTING_POLICY).toContain('Call tools directly');
    expect(ROUTING_POLICY).toContain('Delegate to a sub-agent');
  });

  it('states the cost ladder', () => {
    expect(ROUTING_POLICY).toContain('respond < tools < sub-agent');
  });

  it('discourages sub-agents for small tasks', () => {
    expect(ROUTING_POLICY).toContain('Do NOT spawn them for');
  });

  it('is a well-formed markdown section', () => {
    expect(ROUTING_POLICY).toMatch(/## /);
    expect(ROUTING_POLICY).toContain('\n');
  });
});

describe('buildPlatformPrompt', () => {
  it('injects Windows-native command guidance on Windows hosts', () => {
    const prompt = buildPlatformPrompt('win32');
    expect(prompt).toContain('Host Platform: Windows');
    expect(prompt).toContain('dir (not ls)');
    expect(prompt).toContain('findstr (not grep)');
    expect(prompt).toContain('cmd.exe');
  });

  it('accepts navigator-style platform strings', () => {
    expect(buildPlatformPrompt('Win32')).toContain('Host Platform: Windows');
    expect(buildPlatformPrompt('win32')).toContain('Host Platform: Windows');
  });

  it('injects Unix guidance for macOS', () => {
    const prompt = buildPlatformPrompt('darwin');
    expect(prompt).toContain('Host Platform: macOS');
    expect(prompt).toContain('standard Unix commands');
  });

  it('injects Unix guidance for Linux', () => {
    const prompt = buildPlatformPrompt('linux');
    expect(prompt).toContain('Host Platform: Linux');
    expect(prompt).toContain('standard Unix commands');
  });

  it('returns an empty string for unknown platforms', () => {
    expect(buildPlatformPrompt('')).toBe('');
    expect(buildPlatformPrompt('haiku-ppc')).toBe('');
  });

  it('detectHostPlatform reads the electronAPI platform value once', () => {
    resetHostPlatform();
    (window as any).electronAPI = { platform: 'win32' };
    expect(detectHostPlatform()).toBe('win32');
  });

  it('detectHostPlatform caches the first detection', () => {
    resetHostPlatform();
    (window as any).electronAPI = { platform: 'linux' };
    expect(detectHostPlatform()).toBe('linux');
    // Changing the bridge afterwards must NOT re-detect — the host is pinned.
    (window as any).electronAPI = { platform: 'darwin' };
    expect(detectHostPlatform()).toBe('linux');
  });
});
