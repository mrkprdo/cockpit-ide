import type { LLMMessage } from './types';

interface LooseMessage {
  role?: string;
  content?: string | null;
  tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
  toolResult?: string;
}

/**
 * Rough token estimator for English + code text. No external tokenizer is
 * required; we approximate 1 token per 4 characters on average, which is close
 * enough for budget checks and compaction triggers.
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  // Whitespace-only strings still cost something.
  const trimmed = text.trim();
  if (trimmed.length === 0) return 1;
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Estimate tokens for a single chat message. Adds a small per-message overhead
 * for the role/name framing used by OpenAI-compatible chat formats.
 */
export function estimateMessageTokens(message: LLMMessage | LooseMessage): number {
  const overhead = 4;
  let content = 0;
  if (typeof message.content === 'string') {
    content = estimateTokens(message.content);
  }
  let toolCalls = 0;
  if ('tool_calls' in message && Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      toolCalls += estimateTokens(tc.function?.name);
      toolCalls += estimateTokens(tc.function?.arguments);
      toolCalls += 4;
    }
  }
  let toolResult = 0;
  if ('toolResult' in message && typeof message.toolResult === 'string') {
    toolResult = estimateTokens(message.toolResult);
  }
  return overhead + content + toolCalls + toolResult;
}

/**
 * Estimate the total token count for an array of chat messages.
 */
export function estimateMessagesTokens(messages: Array<LLMMessage | LooseMessage>): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

export interface ContextBudget {
  limit: number;
  used: number;
  percent: number;
  shouldCompact: boolean;
}

/**
 * Compare used tokens against a context limit and report whether compaction
 * should run. The trigger is 80 % of the available context budget.
 */
export function checkContextBudget(usedTokens: number, limitTokens: number): ContextBudget {
  const limit = Math.max(1, limitTokens);
  const used = Math.max(0, usedTokens);
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return {
    limit,
    used,
    percent,
    shouldCompact: used >= limit * 0.8,
  };
}
