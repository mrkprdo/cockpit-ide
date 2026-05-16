import { describe, it, expect } from 'vitest';

describe('ai barrel index', () => {
  it('exports all expected modules', async () => {
    const ai = await import('./index');
    // Classes / constructors (runtime values)
    expect(ai.ToolRegistry).toBeDefined();
    expect(ai.LLMClient).toBeDefined();
    // Functions (runtime values)
    expect(typeof ai.zodToJsonSchema).toBe('function');
    expect(typeof ai.getCockpitGlobal).toBe('function');
    expect(typeof ai.getToolContext).toBe('function');
    expect(typeof ai.requireToolContext).toBe('function');
    expect(typeof ai.estimateTokens).toBe('function');
    expect(typeof ai.estimateMessageTokens).toBe('function');
    expect(typeof ai.estimateMessagesTokens).toBe('function');
    expect(typeof ai.checkContextBudget).toBe('function');
    expect(typeof ai.executeToolCall).toBe('function');
    // Constants (runtime values)
    expect(ai.ALL_TOOLS).toBeDefined();
    expect(ai.KEY_SEQUENCES).toBeDefined();
    expect(ai.AGENT_SYSTEM_PROMPT).toBeDefined();
    // Verify ALL_TOOLS is an array with content
    expect(Array.isArray(ai.ALL_TOOLS)).toBe(true);
    expect(ai.ALL_TOOLS.length).toBeGreaterThan(0);
    // Verify KEY_SEQUENCES has expected entries
    expect(ai.KEY_SEQUENCES.Tab).toBe('\x09');
    expect(ai.KEY_SEQUENCES.Enter).toBe('\r');
    // Verify AGENT_SYSTEM_PROMPT is a non-empty string
    expect(typeof ai.AGENT_SYSTEM_PROMPT).toBe('string');
    expect(ai.AGENT_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });
});
