import { describe, it, expect } from 'vitest';
import { ALL_TOOLS, KEY_SEQUENCES, readFileTool, writeFileTool } from './tool-definitions';

describe('ALL_TOOLS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(ALL_TOOLS)).toBe(true);
    expect(ALL_TOOLS.length).toBeGreaterThan(0);
  });

  it('every tool has name, description, parameters, and execute', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool).toHaveProperty('name');
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool).toHaveProperty('description');
      expect(typeof tool.description).toBe('string');
      expect(tool).toHaveProperty('parameters');
      expect(tool).toHaveProperty('execute');
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('no duplicate tool names', () => {
    const names = ALL_TOOLS.map(t => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('includes read_file tool', () => {
    const tool = ALL_TOOLS.find(t => t.name === 'read_file');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('Read file');
  });

  it('includes write_file tool', () => {
    const tool = ALL_TOOLS.find(t => t.name === 'write_file');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('Write');
  });

  it('includes specs_explore tool', () => {
    const tool = ALL_TOOLS.find(t => t.name === 'specs_explore');
    expect(tool).toBeDefined();
  });

  it('includes git tools', () => {
    expect(ALL_TOOLS.find(t => t.name === 'git_status')).toBeDefined();
    expect(ALL_TOOLS.find(t => t.name === 'git_commit')).toBeDefined();
    expect(ALL_TOOLS.find(t => t.name === 'git_push')).toBeDefined();
  });

  it('includes terminal tools', () => {
    expect(ALL_TOOLS.find(t => t.name === 'write_to_terminal')).toBeDefined();
    expect(ALL_TOOLS.find(t => t.name === 'send_key_to_terminal')).toBeDefined();
    expect(ALL_TOOLS.find(t => t.name === 'kill_terminal')).toBeDefined();
  });

  it('includes canvas card tools', () => {
    expect(ALL_TOOLS.find(t => t.name === 'move_card')).toBeDefined();
    expect(ALL_TOOLS.find(t => t.name === 'resize_card')).toBeDefined();
    expect(ALL_TOOLS.find(t => t.name === 'focus_card')).toBeDefined();
  });

  it('includes clipboard tools', () => {
    expect(ALL_TOOLS.find(t => t.name === 'get_clipboard')).toBeDefined();
    expect(ALL_TOOLS.find(t => t.name === 'set_clipboard')).toBeDefined();
  });
});

describe('KEY_SEQUENCES', () => {
  it('maps all expected key names to escape sequences', () => {
    expect(KEY_SEQUENCES.Tab).toBe('\x09');
    expect(KEY_SEQUENCES.Enter).toBe('\r');
    expect(KEY_SEQUENCES.Escape).toBe('\x1b');
    expect(KEY_SEQUENCES.Backspace).toBe('\x7f');
    expect(KEY_SEQUENCES.ArrowUp).toBe('\x1b[A');
    expect(KEY_SEQUENCES.ArrowDown).toBe('\x1b[B');
    expect(KEY_SEQUENCES.ArrowRight).toBe('\x1b[C');
    expect(KEY_SEQUENCES.ArrowLeft).toBe('\x1b[D');
    expect(KEY_SEQUENCES.Delete).toBe('\x1b[3~');
    expect(KEY_SEQUENCES.Home).toBe('\x1b[H');
    expect(KEY_SEQUENCES.End).toBe('\x1b[F');
    expect(KEY_SEQUENCES.PageUp).toBe('\x1b[5~');
    expect(KEY_SEQUENCES.PageDown).toBe('\x1b[6~');
    expect(KEY_SEQUENCES['Ctrl+c']).toBe('\x03');
    expect(KEY_SEQUENCES['Ctrl+d']).toBe('\x04');
    expect(KEY_SEQUENCES['Ctrl+z']).toBe('\x1a');
  });

  it('includes all F-keys', () => {
    for (let i = 1; i <= 12; i++) {
      expect(KEY_SEQUENCES[`F${i}`]).toBeDefined();
    }
  });

  it('does not have empty or whitespace-only sequences', () => {
    for (const [key, seq] of Object.entries(KEY_SEQUENCES)) {
      expect(seq.length).toBeGreaterThan(0);
    }
  });
});

describe('individual tool exports', () => {
  it('readFileTool has correct metadata', () => {
    expect(readFileTool.name).toBe('read_file');
    expect(readFileTool.parameters).toBeDefined();
  });

  it('writeFileTool has correct metadata', () => {
    expect(writeFileTool.name).toBe('write_file');
    expect(writeFileTool.parameters).toBeDefined();
  });
});
