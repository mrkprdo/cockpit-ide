// Token estimation, folding, and compaction for the AI drawer. Owns the
// estimate*/checkContextBudget wrappers, the mid-loop tool-context folding
// ceiling (foldToolContext / persistCompactedContext / loopContextLimit), and
// the summarization/compaction prompt logic. All cross-controller access
// (messages, active session, LLM streaming, rendering) comes through the
// injected ContextWindowHost.

import { getToolContext } from '../../ai/cockpit-context';
import type { LLMClient } from '../../ai/llm-client';
import { estimateMessagesTokens, estimateMessageTokens, checkContextBudget } from '../../ai/token-counter';
import type { LLMMessage } from '../../ai/types';
import type { ChatMessage, Session } from './types';

/** Safety ceiling for the in-flight tool-loop request — older tool rounds are folded above this. */
export const LOOP_CONTEXT_MIN_LIMIT = 131_072;
/** Mid-loop folding ceiling is this multiple of the configured context budget. */
export const LOOP_CONTEXT_MULTIPLIER = 3;

export interface ContextWindowHost {
  getMessages(): ChatMessage[];
  setMessages(messages: ChatMessage[]): void;
  getActiveSession(): Session | undefined;
  renderMessages(): void;
  renderTokenUsage(): void;
  updateCurrentSession(): void;
  buildSystemPrompt(wsPath: string): string;
  createClient(): LLMClient;
  getStreamResponses(): boolean;
  getContextTokenLimit(): number;
  /** Streams a plain text completion into a temporary message (llm-loop's streamPlainText). */
  streamPlainText(
    client: LLMClient,
    messages: LLMMessage[],
    maxTokens?: number,
    keepAsRole?: ChatMessage['role'] | null,
  ): Promise<string>;
  escapeHtml(str: string): string;
}

export class ContextWindow {
  constructor(private host: ContextWindowHost) {}

  estimateContextTokens(): number {
    const messages = this.host.getMessages();
    const hasUserMessages = messages.some(m => m.role === 'user');
    if (!hasUserMessages) return 0;
    const session = this.host.getActiveSession();
    const ctx = getToolContext();
    const wsPath = ctx?.cockpit.getWorkspacePath() || '';
    const base = [
      { role: 'system', content: this.host.buildSystemPrompt(wsPath) },
    ];
    if (session?.context && session.context.length > 0) {
      return estimateMessagesTokens([...base, ...session.context]);
    }
    const history = messages.filter(m =>
      m.role === 'user' || m.role === 'assistant' || m.role === 'tool'
    );
    return estimateMessagesTokens([...base, ...history]);
  }

  formatTokenCount(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  /**
   * Summarize the current conversation using a short, non-stored LLM call and
   * store the result as the session's compacted context. Subsequent LLM turns
   * will use this context in place of the full message history.
   */
  async compactSession(): Promise<void> {
    const session = this.host.getActiveSession();
    if (!session) return;

    const messages = this.host.getMessages();
    const conversation = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role}: ${m.content}`)
      .join('\n\n');

    if (!conversation.trim()) {
      messages.push({
        role: 'system',
        content: 'Nothing to compact yet.',
        timestamp: Date.now(),
      });
      this.host.renderMessages();
      return;
    }

    const summaryMessages: LLMMessage[] = [
      {
        role: 'system',
        content: 'Summarize the following conversation into a concise context that captures the user\'s goals, decisions, and any incomplete work. Omit pleasantries. Keep the summary short but actionable.',
      },
      { role: 'user', content: conversation },
    ];

    const client = this.host.createClient();
    let summary = '';
    try {
      if (this.host.getStreamResponses()) {
        summary = await this.host.streamPlainText(client, summaryMessages, 1024);
      } else {
        summary = await client.complete(summaryMessages);
      }
    } catch (err: any) {
      messages.push({
        role: 'system',
        content: `**Compaction failed:** ${this.host.escapeHtml(err.message || 'Unknown error')}`,
        timestamp: Date.now(),
      });
      this.host.renderMessages();
      return;
    }

    if (!summary.trim()) {
      summary = 'No summary generated.';
    }

    session.context = [{ role: 'system', content: `Previous conversation summary:\n\n${summary}` }];
    messages.push({
      role: 'system',
      content: 'Context compacted. Continuing from summary.',
      timestamp: Date.now(),
    });
    this.host.renderMessages();
    this.host.updateCurrentSession();
    this.host.renderTokenUsage();
  }

  async maybeAutoCompact(): Promise<void> {
    const used = this.estimateContextTokens();
    const budget = checkContextBudget(used, this.host.getContextTokenLimit());
    if (!budget.shouldCompact) return;
    await this.compactSession();
  }

  buildHistoryForLLM(): LLMMessage[] {
    const session = this.host.getActiveSession();
    if (session?.context && session.context.length > 0) {
      // Preserve tool pairing from compacted context; drop malformed tool
      // messages that lack a call id (stale sessions) — a tool message
      // without tool_call_id makes strict gateways reject the request.
      const out: LLMMessage[] = [];
      for (const m of session.context) {
        if (m.role === 'tool') {
          if (!m.tool_call_id) continue;
          out.push({ role: 'tool', tool_call_id: m.tool_call_id, content: m.content || '' });
          continue;
        }
        out.push({ role: m.role, content: m.content || '' });
      }
      return out;
    }
    // Rebuild the API message list from the rendered transcript. Tool results
    // MUST survive between runs — dropping them (as we used to) leaves the model
    // without the data its earlier calls returned, so it hallucinates contents
    // or reaches for the terminal (cat/grep) to "re-fetch" it.
    const messages = this.host.getMessages();
    const out: LLMMessage[] = [];
    let i = 0;
    while (i < messages.length) {
      const m = messages[i];
      if (m.role === 'user') {
        out.push({ role: 'user', content: m.content });
        i++;
        continue;
      }
      if (m.role === 'assistant') {
        out.push({ role: 'assistant', content: m.content });
        i++;
        continue;
      }
      // Assistant turn that issued tool calls (rendered as a thinking chip with
      // the payload stored on toolCalls). Only emit it when every tool result
      // that follows is present — the OpenAI API requires a tool message for
      // each tool_call_id, otherwise it rejects the request.
      if (m.role === 'thinking' && m.toolCalls && m.toolCalls.length > 0) {
        const ids = new Set(m.toolCalls.map(tc => tc.id));
        const results: LLMMessage[] = [];
        let j = i + 1;
        while (j < messages.length && messages[j].role === 'tool') {
          const r = messages[j];
          if (r.toolCallId && ids.has(r.toolCallId)) {
            results.push({ role: 'tool', tool_call_id: r.toolCallId, content: r.toolResult ?? r.content });
          }
          j++;
        }
        if (results.length === ids.size) {
          // Omit `content` (not `null`) — strict gateways fail to deserialize
          // a null content on an assistant tool-call message.
          out.push({ role: 'assistant', tool_calls: m.toolCalls });
          out.push(...results);
        }
        i = j;
        continue;
      }
      i++;
    }
    return out;
  }

  /** Mid-loop folding ceiling — safely above the between-run compaction budget. */
  loopContextLimit(): number {
    return Math.max(this.host.getContextTokenLimit() * LOOP_CONTEXT_MULTIPLIER, LOOP_CONTEXT_MIN_LIMIT);
  }

  /**
   * Trim the in-flight tool-loop request once it approaches the model's context
   * window. The ceiling applies to the WHOLE request — the kept system prompt +
   * user messages still cost tokens, so the trailing tool rounds get only the
   * leftover budget. Keeps the system prompt, every user message, and as many
   * trailing assistant→tool pairs as fit; folds older pairs into a short system
   * note. Mirrors the sub-agent session's rolling window so long tool rounds
   * can't overflow the model and make it reply with an empty completion.
   * Returns true if anything was folded.
   */
  foldToolContext(apiMessages: LLMMessage[], limit = this.loopContextLimit()): boolean {
    if (estimateMessagesTokens(apiMessages) < limit) return false;

    // Keep the system prompt (index 0) and every user message — they carry the task.
    let keepStart = 1;
    for (let i = 1; i < apiMessages.length; i++) {
      if (apiMessages[i].role === 'user') keepStart = i + 1;
    }

    // Greedily keep the newest messages that fit inside the leftover budget.
    const prefixTokens = estimateMessagesTokens(apiMessages.slice(0, keepStart));
    const tailBudget = Math.max(0, limit - prefixTokens);
    let tailEnd = apiMessages.length;
    let tailTokens = 0;
    while (tailEnd > keepStart) {
      const tokens = estimateMessageTokens(apiMessages[tailEnd - 1]);
      if (tailTokens + tokens > tailBudget) break;
      tailTokens += tokens;
      tailEnd--;
    }
    if (tailEnd <= keepStart + 1) return false;
    // Align to a whole assistant(tool_calls) → tool pair — never fold a tool
    // result while its assistant call stays behind.
    while (tailEnd < apiMessages.length && apiMessages[tailEnd]?.role === 'tool') tailEnd++;
    if (tailEnd <= keepStart + 1) return false;

    const foldedCount = tailEnd - keepStart;
    const note: LLMMessage = {
      role: 'system',
      content: `[Context trimmed mid-task: ${foldedCount} earlier tool-result messages were removed to stay within the context window. You already processed their contents; call tools again only if you still need that data.]`,
    };
    apiMessages.splice(keepStart, foldedCount, note);
    return true;
  }

  /**
   * Structurally compact the conversation into the active session's context so
   * the model gets room to continue. Deliberately avoids the LLM summary call
   * (`compactSession`) — that request itself can overflow on a long transcript.
   * Keeps the task and the most recent tool rounds as readable text so the next
   * request starts small but still knows where things stand.
   */
  persistCompactedContext(apiMessages: LLMMessage[]): void {
    const session = this.host.getActiveSession();
    if (!session) return;
    const copy = [...apiMessages];
    this.foldToolContext(copy, 8_000); // hard-trim to a small tail
    const lines: string[] = [];
    for (const m of copy.slice(1)) {
      if (m.role === 'system') lines.push(m.content || '');
      else if (m.role === 'user') lines.push(`User: ${m.content}`);
      else if (m.role === 'assistant') lines.push(m.content || '(tool call)');
      else if (m.role === 'tool') lines.push(`Tool result: ${String(m.content || '').slice(0, 300)}`);
    }
    session.context = [{
      role: 'system',
      content: `[Auto-compacted mid-task because the model ran out of context. Continuing state:\n${lines.join('\n')}]`,
    }];
  }
}
