// Turns any LLM failure into the one thing the chat should say about it.
//
// Lives outside llm-loop.ts because the loop is at the 700-line guardrail and
// because the mapping is presentation, not control flow: same classification,
// same escape rules, same "should this also pop a toast" rule.

import { describeLLMError } from '../../ai/llm-errors';
import { escapeHtml } from './render';
import { showToast } from '../toast';

/** Kinds the user must act on — they also deserve a toast, not just a bubble. */
const URGENT = new Set(['auth', 'forbidden', 'model', 'routing', 'unsupported']);

/**
 * Build the chat bubble content for an error, and toast it when the failure is
 * something the user has to fix (expired key, model not available, …).
 */
export function buildErrorBubble(err: unknown): string {
  const info = describeLLMError(err);
  const suffix = info.action ? `\n\n${info.action.url}` : '';
  if (URGENT.has(info.kind)) showToast(info.message, 'error');
  return `**${escapeHtml(info.title)}:** ${escapeHtml(info.message)}${escapeHtml(suffix)}`;
}
