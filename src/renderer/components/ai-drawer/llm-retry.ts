// LLM retry controller — transient LLM/network failures retry indefinitely
// after an exponential cooldown instead of ending the run (the old behaviour
// "just shuts down"). Config errors (auth, bad request) surface immediately.
//
// Extracted from llm-loop.ts (700-LOC guardrail). withRetry wraps a single LLM
// operation and owns the cooldown, the in-chat notice, and the recovery note.
// The cooldown wait is abortable so the user can always stop a run mid-retry.

import { reportFailure } from '../../health/monitor';
import type { ChatMessage } from './types';

/** Retry cooldown for transient LLM failures — exponential backoff, capped. */
export const RETRY_BASE_DELAY_MS = 1_000;
export const RETRY_MAX_DELAY_MS = 30_000;

/** HTTP statuses worth retrying: rate limits and server-side hiccups. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Is an LLM error transient (worth an indefinite retry) or permanent (surface
 * it immediately)? Auth/bad-request 4xx are config problems a retry won't fix;
 * network failures, rate limits, and 5xx are the cases that used to kill a run.
 */
export function isRetryableError(err: unknown): boolean {
  const e = err as { name?: string; message?: string };
  if (e?.name === 'AbortError') return false;
  const msg = String(e?.message ?? err ?? '');
  const status = /API error (\d{3})/.exec(msg);
  if (status) return RETRYABLE_STATUS.has(Number(status[1]));
  if (e instanceof TypeError || /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|network|temporary failure/i.test(msg)) {
    return true;
  }
  // Unknown errors are treated as transient — indefinite retry is the ask.
  return true;
}

export interface RetryControllerDeps {
  getAbortRequested(): boolean;
  getFetchController(): AbortController | null;
  /** Read the CURRENT rendered messages array (it can be swapped on session load). */
  getMessages(): ChatMessage[];
  renderMessages(): void;
}

export class RetryController {
  /** Index of the in-chat retry notice (updated in place, per run). */
  retryNoticeIndex = -1;

  constructor(private deps: RetryControllerDeps) {}

  abortError(): Error {
    const e = new Error('Aborted');
    e.name = 'AbortError';
    return e;
  }

  retryDelayMs(attempt: number): number {
    return Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
  }

  /** Abortable wait so the user can stop a run mid-cooldown. */
  retryDelay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const signal = this.deps.getFetchController()?.signal;
      const timer = setTimeout(resolve, ms);
      if (signal) signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }

  /** Short human reason for the retry notice. */
  errorReason(err: unknown): string {
    const e = err as { message?: string };
    const msg = String(e?.message ?? err ?? '');
    const status = /API error (\d{3})/.exec(msg);
    if (status) {
      const map: Record<string, string> = {
        '408': 'request timed out', '425': 'too early', '429': 'rate limited',
        '500': 'server error', '502': 'bad gateway', '503': 'service unavailable', '504': 'gateway timeout',
      };
      return map[status[1]] ?? `HTTP ${status[1]}`;
    }
    if (e instanceof TypeError) return 'network error';
    return msg.slice(0, 120) || 'unknown error';
  }

  /** Show/update the in-chat retry notice (one per run, replaced on recovery). */
  retryNotice(text: string): void {
    const messages = this.deps.getMessages();
    if (this.retryNoticeIndex >= 0 && messages[this.retryNoticeIndex]) {
      messages[this.retryNoticeIndex].content = text;
    } else {
      this.retryNoticeIndex = messages.length;
      messages.push({ role: 'system', content: text, timestamp: Date.now() });
    }
    this.deps.renderMessages();
  }

  /** Replace the retry notice with a recovery note once the call goes through. */
  markRecovered(n: number): void {
    const messages = this.deps.getMessages();
    if (this.retryNoticeIndex >= 0 && messages[this.retryNoticeIndex]) {
      messages[this.retryNoticeIndex].content = `✓ Recovered after ${n} retr${n > 1 ? 'ies' : 'y'} — continuing.`;
      this.deps.renderMessages();
    }
    this.retryNoticeIndex = -1;
  }

  /**
   * Run an LLM operation, retrying indefinitely on transient failures with an
   * exponential cooldown. Aborts stop the loop; non-retryable errors (auth,
   * bad request) surface immediately.
   */
  async withRetry<T>(op: () => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      if (this.deps.getAbortRequested()) throw this.abortError();
      try {
        const result = await op();
        if (attempt > 0) this.markRecovered(attempt);
        return result;
      } catch (err: any) {
        if (err?.name === 'AbortError') throw err;
        // Non-retryable: propagate to the caller's catch, which reports + surfaces.
        if (!isRetryableError(err)) throw err;
        if (attempt === 0) {
          reportFailure({ kind: 'llm.stream-error', source: 'ai-drawer/llm-loop.ts', message: String(err?.message ?? err) });
        }
        attempt++;
        const delay = this.retryDelayMs(attempt);
        this.retryNotice(`⚠️ **LLM request failed** — ${this.errorReason(err)}. Retrying in ${Math.max(1, Math.round(delay / 1000))}s (attempt ${attempt}). Press stop to abort.`);
        await this.retryDelay(delay);
      }
    }
  }
}
