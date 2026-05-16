import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateMessageTokens,
  estimateMessagesTokens,
  checkContextBudget,
} from './token-counter';
import type { LLMMessage } from './types';

describe('token-counter', () => {
  describe('estimateTokens', () => {
    it('returns 0 for null/undefined/empty', () => {
      expect(estimateTokens(null)).toBe(0);
      expect(estimateTokens(undefined)).toBe(0);
      expect(estimateTokens('')).toBe(0);
    });

    it('returns at least 1 for whitespace', () => {
      expect(estimateTokens('   ')).toBe(1);
    });

    it('approximates 1 token per 4 characters', () => {
      expect(estimateTokens('a'.repeat(4))).toBe(1);
      expect(estimateTokens('a'.repeat(8))).toBe(2);
      expect(estimateTokens('a'.repeat(9))).toBe(3);
    });
  });

  describe('estimateMessageTokens', () => {
    it('counts per-message overhead plus content', () => {
      const msg: LLMMessage = { role: 'user', content: 'a'.repeat(40) };
      expect(estimateMessageTokens(msg)).toBe(4 + 10);
    });

    it('counts tool calls and results', () => {
      const msg: LLMMessage = {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'c1',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"/file"}' },
        }],
      };
      expect(estimateMessageTokens(msg)).toBeGreaterThan(4);
    });
  });

  describe('estimateMessagesTokens', () => {
    it('sums multiple messages', () => {
      const messages: LLMMessage[] = [
        { role: 'user', content: 'a'.repeat(8) },
        { role: 'assistant', content: 'b'.repeat(12) },
      ];
      expect(estimateMessagesTokens(messages)).toBe(
        estimateMessageTokens(messages[0]) + estimateMessageTokens(messages[1])
      );
    });
  });

  describe('checkContextBudget', () => {
    it('reports shouldCompact false below 80%', () => {
      const budget = checkContextBudget(6000, 10000);
      expect(budget.percent).toBe(60);
      expect(budget.shouldCompact).toBe(false);
    });

    it('reports shouldCompact true at 80%', () => {
      const budget = checkContextBudget(8000, 10000);
      expect(budget.percent).toBe(80);
      expect(budget.shouldCompact).toBe(true);
    });

    it('caps percent at 100', () => {
      const budget = checkContextBudget(99999, 10000);
      expect(budget.percent).toBe(100);
    });
  });
});
