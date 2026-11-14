import { describe, it, expect, vi } from 'vitest';
import { ContextWindow, type ContextWindowHost } from './context-window';
import type { ChatMessage } from './types';

function makeHost(messages: ChatMessage[], prompt = 'SYSTEM PROMPT') {
  const host: ContextWindowHost = {
    getMessages: () => messages,
    setMessages: vi.fn(),
    getActiveSession: () => undefined,
    renderMessages: vi.fn(),
    renderTokenUsage: vi.fn(),
    updateCurrentSession: vi.fn(),
    buildSystemPrompt: vi.fn(() => prompt),
    createClient: vi.fn() as any,
    getStreamResponses: () => false,
    getContextTokenLimit: () => 8192,
    streamPlainText: vi.fn() as any,
    escapeHtml: (s: string) => s,
  };
  return host;
}

function userMsg(content: string): ChatMessage {
  return { role: 'user', content, timestamp: 1 };
}

describe('ContextWindow.estimateContextTokens — memoisation', () => {
  it('returns 0 with no user messages', () => {
    const cw = new ContextWindow(makeHost([{ role: 'assistant', content: 'hi', timestamp: 1 }]));
    expect(cw.estimateContextTokens()).toBe(0);
  });

  it('counts the base prompt plus history', () => {
    const host = makeHost([userMsg('abcd')]); // 1 token + 4 overhead
    const cw = new ContextWindow(host);
    // prompt 'SYSTEM PROMPT' = 13 chars → ceil(13/4) = 4, + 4 framing = 8
    expect(cw.estimateContextTokens()).toBe(8 + 4 + 1);
  });

  it('builds the system prompt once across repeated renders', () => {
    const host = makeHost([userMsg('hello')]);
    const cw = new ContextWindow(host);
    for (let i = 0; i < 20; i++) cw.estimateContextTokens();
    expect(host.buildSystemPrompt).toHaveBeenCalledTimes(1);
  });

  it('returns the memoised value while the transcript is unchanged', () => {
    const messages = [userMsg('hello')];
    const host = makeHost(messages);
    const cw = new ContextWindow(host);
    const first = cw.estimateContextTokens();
    expect(cw.estimateContextTokens()).toBe(first);
    // Only the first call needed the prompt.
    expect(host.buildSystemPrompt).toHaveBeenCalledTimes(1);
  });

  it('recomputes when a message is appended', () => {
    const messages = [userMsg('hello')];
    const cw = new ContextWindow(makeHost(messages));
    const before = cw.estimateContextTokens();
    messages.push({ role: 'assistant', content: 'a much longer reply from the model', timestamp: 2 });
    expect(cw.estimateContextTokens()).toBeGreaterThan(before);
  });

  it('recomputes when the last message grows (streaming)', () => {
    const messages = [userMsg('hello')];
    const cw = new ContextWindow(makeHost(messages));
    const before = cw.estimateContextTokens();
    messages[0].content = 'hello and a great deal more text appended while streaming';
    expect(cw.estimateContextTokens()).toBeGreaterThan(before);
  });

  it('recomputes when a tool result lands', () => {
    const messages: ChatMessage[] = [
      userMsg('read the file'),
      { role: 'tool', content: 'read_file', timestamp: 2, toolName: 'read_file' },
    ];
    const cw = new ContextWindow(makeHost(messages));
    const before = cw.estimateContextTokens();
    messages[1].toolResult = 'x'.repeat(400); // 100 tokens
    expect(cw.estimateContextTokens()).toBe(before + 100);
  });

  it('rebuilds the prompt when the workspace path changes', () => {
    const messages = [userMsg('hello')];
    const host = makeHost(messages);
    const cw = new ContextWindow(host);
    cw.estimateContextTokens();
    // No tool context in this test → wsPath is always '' → one build.
    expect(host.buildSystemPrompt).toHaveBeenCalledTimes(1);
  });

  it('uses the compacted session context when present', () => {
    const host = makeHost([userMsg('hello')]);
    host.getActiveSession = () => ({
      id: 's1',
      title: 't',
      createdAt: 1,
      updatedAt: 1,
      messages: [],
      context: [{ role: 'system', content: 'x'.repeat(400) }],
    });
    const cw = new ContextWindow(host);
    // base 8 + (4 overhead + 100 tokens)
    expect(cw.estimateContextTokens()).toBe(8 + 4 + 100);
  });
});
