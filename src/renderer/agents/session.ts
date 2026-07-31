import { ToolRegistry } from '../ai/tool-registry';
import { executeToolCall } from '../ai/tool-executor';
import { estimateMessagesTokens, estimateTokens, checkContextBudget } from '../ai/token-counter';
import type { ToolContext, LLMMessage } from '../ai/types';
import type { LLMClient } from '../ai/llm-client';
import type { AgentBus } from './bus';
import { guardToolCall } from './skills';
import { AGENT_SHARED_PREAMBLE, COMPACTION_PROMPT } from './prompts';
import type {
  AgentBrief,
  AgentId,
  AgentMessage,
  AgentState,
  Skill,
} from './types';

export interface SessionDeps {
  bus: AgentBus;
  registry: ToolRegistry;
  llm: Pick<LLMClient, 'chatCompletion' | 'complete'>;
  ctx: () => ToolContext | null;
  onStateChange?: (s: SubAgentSession) => void;
}

/** How many recent tool result turns are kept before older ones are folded. */
const ROLLING_WINDOW = 10;

export class SubAgentSession {
  readonly id: AgentId;
  readonly skill: Skill;
  readonly brief: AgentBrief;
  readonly correlationId: string;

  state: AgentState = 'spawning';
  steps = 0;
  tokensUsed = 0;
  startedAt: number | null = null;
  finishedAt: number | null = null;
  result: string | null = null;
  error: string | null = null;
  lastActivityAt = 0;
  /** Compaction summary accumulated across the run (seed for next dispatch). */
  summary: string | null = null;

  private transcript: LLMMessage[] = [];
  private controller = new AbortController();
  private running = false;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private deps: SessionDeps;

  constructor(id: AgentId, skill: Skill, brief: AgentBrief, correlationId: string, deps: SessionDeps) {
    this.id = id;
    this.skill = skill;
    this.brief = brief;
    this.correlationId = correlationId;
    this.deps = deps;
    this.lastActivityAt = Date.now();
  }

  get mailboxCount(): number {
    return this.deps.bus.getMailbox(this.id)?.length ?? 0;
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** Abort the loop at its next yield (kill/timeout). */
  abort(): void {
    this.controller.abort();
  }

  private setState(s: AgentState): void {
    this.state = s;
    this.lastActivityAt = Date.now();
    this.deps.onStateChange?.(this);
  }

  private markActivity(): void {
    this.lastActivityAt = Date.now();
    this.deps.onStateChange?.(this);
  }

  /**
   * Run the full agent loop to completion. Returns the final result text.
   * Throws on abort; posts a respond (or error status) on the bus.
   */
  async run(): Promise<string> {
    this.running = true;
    this.startedAt = Date.now();
    this.setState('active');

    const timeoutMs = this.brief.timeoutMs ?? this.skill.timeoutMs;
    this.timeoutTimer = setTimeout(() => {
      this.error = `Timed out after ${Math.round(timeoutMs / 1000)}s`;
      this.controller.abort();
    }, timeoutMs);

    const systemContent = this.buildSystemPrompt();
    this.transcript = [{ role: 'system', content: systemContent }];
    this.transcript.push({
      role: 'user',
      content: this.buildBriefText(),
    });

    let final = '';
    try {
      for (;;) {
        if (this.controller.signal.aborted) throw new Error(this.error ?? 'Aborted');

        // Drain mailbox: peer messages become injectable context.
        this.injectMailbox();

        if (this.steps >= this.skill.maxSteps) {
          final = `[step cap reached: ${this.skill.maxSteps}] ` + (final || this.snapshotOfTranscript());
          break;
        }

        // Compaction on overflow (short-context policy).
        await this.maybeCompact();

        const tools = this.skillTools();
        let data;
        try {
          data = await this.deps.llm.chatCompletion({
            messages: this.transcript,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: 4096,
            signal: this.controller.signal,
          });
        } catch (err: any) {
          if (err?.name === 'AbortError' || this.controller.signal.aborted) {
            throw new Error(this.error ?? 'Aborted');
          }
          // Some proxies reject the tools array on first call — retry bare once.
          if (this.steps === 0 && err?.message?.includes('400')) {
            data = await this.deps.llm.chatCompletion({
              messages: this.transcript,
              temperature: 0.2,
              max_tokens: 4096,
              signal: this.controller.signal,
            });
          } else {
            throw err;
          }
        }

        const msg = data.choices?.[0]?.message;
        if (!msg) throw new Error('Empty response from model');
        this.steps++;
        this.markActivity();

        const content = msg.content || '';
        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          final = content || 'No response.';
          break;
        }

        this.transcript.push({ role: 'assistant', content: content || null, tool_calls: msg.tool_calls });
        this.tokensUsed += estimateTokens(content) + msg.tool_calls.reduce((n, tc) => n + estimateTokens(tc.function?.name) + estimateTokens(tc.function?.arguments), 0);

        // Execute each tool (guarded) and append results.
        for (const tc of msg.tool_calls) {
          if (this.controller.signal.aborted) throw new Error(this.error ?? 'Aborted');
          const name = tc.function?.name || '';
          const rawArgs = tc.function?.arguments || '{}';

          const guard = guardToolCall(this.skill, name);
          let output: string;
          if (!guard.ok) {
            output = guard.error || `Guardrail denied: ${name}`;
          } else {
            const ctx = this.deps.ctx();
            const result = ctx
              ? await executeToolCall(this.deps.registry, name, rawArgs, ctx)
              : { ok: false, output: 'ToolContext unavailable (canvas not ready)' };
            output = result.output;
          }
          this.tokensUsed += estimateTokens(output);
          this.transcript.push({ role: 'tool', tool_call_id: tc.id || `tc-${this.steps}`, content: output });
          this.markActivity();
        }

        // Roll the window: keep the system brief + last N tool turns + peer context.
        this.rollWindow();
      }

      this.result = final;
      this.setState('done');
      this.postRespond(final);
      return final;
    } catch (err: any) {
      this.error = err?.message || String(err);
      const aborted = this.controller.signal.aborted;
      this.setState(aborted ? 'killed' : 'error');
      this.postStatus(this.state, this.error ?? undefined);
      throw err;
    } finally {
      this.running = false;
      this.finishedAt = Date.now();
      if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
      this.deps.onStateChange?.(this);
    }
  }

  // ── Prompt assembly ─────────────────────────────────────────────────────────

  private buildSystemPrompt(): string {
    const guardrailLine = this.brief.guardrails.length > 0
      ? `\n## Explicit guardrails (must obey)\n- ${this.brief.guardrails.join('\n- ')}`
      : '';
    const seedLine = this.brief.seedSummary
      ? `\n## Memory seed from a prior agent\n${this.brief.seedSummary}`
      : '';
    return [
      AGENT_SHARED_PREAMBLE,
      this.skill.promptTemplate,
      `## Tool allowlist\nYou may only call: ${this.skill.allowedTools.join(', ')}. Anything else returns a Guardrail error.`,
      guardrailLine,
      seedLine,
    ].join('\n\n');
  }

  private buildBriefText(): string {
    return [
      `# Dispatch brief (correlationId: ${this.correlationId})`,
      ``,
      `## Context`,
      this.brief.context,
      ``,
      `## Expected result`,
      this.brief.expectedResult,
    ].join('\n');
  }

  // ── Mailbox ─────────────────────────────────────────────────────────────────

  private injectMailbox(): void {
    const mb = this.deps.bus.getMailbox(this.id);
    if (!mb || mb.length === 0) return;
    const pending = mb.drain();
    if (pending.length === 0) return;

    if (this.state === 'waiting') this.setState('active');

    const parts = pending.map(m => {
      const body = typeof m.payload === 'string' ? m.payload : JSON.stringify(m.payload, null, 2);
      return `[${m.type} from ${m.from}${m.topic ? ` topic=${m.topic}` : ''}${m.correlationId ? ` corrId=${m.correlationId}` : ''}]\n${body}`;
    });
    this.transcript.push({ role: 'user', content: `## Peer messages received\n${parts.join('\n\n---\n\n')}` });
    this.markActivity();
  }

  // ── Short context policy ────────────────────────────────────────────────────

  /** Keep only the system message + recent turns; older context folds into summary. */
  private rollWindow(): void {
    const keepTail = ROLLING_WINDOW * 2 + 2; // assistant + tool pairs
    if (this.transcript.length <= keepTail + 4) return;

    const head = this.transcript.slice(0, 2); // system + brief
    const tail = this.transcript.slice(-keepTail);
    const folded = this.transcript.slice(2, this.transcript.length - keepTail);

    const stateSoFar = this.summary
      ? `${this.summary}\n\n[further transcript folded: ${folded.length} entries]`
      : `[transcript folded: ${folded.length} earlier entries — see summary below]`;

    this.summary = stateSoFar;
    this.transcript = [...head, { role: 'system', content: `## State so far (compacted)\n${stateSoFar}` }, ...tail];
  }

  private async maybeCompact(): Promise<void> {
    const used = estimateMessagesTokens(this.transcript);
    const budget = checkContextBudget(used, this.skill.contextTokens);
    if (!budget.shouldCompact) return;

    let summary = '';
    try {
      const summaryMessages: LLMMessage[] = [
        { role: 'system', content: COMPACTION_PROMPT },
        { role: 'user', content: this.transcript
            .filter(m => m.role !== 'system')
            .map(m => m.role === 'tool'
              ? `tool result: ${(m.content || '').slice(0, 800)}`
              : `${m.role}: ${(m.content || '').slice(0, 1200)}`)
            .join('\n\n') },
      ];
      summary = (await this.deps.llm.complete(summaryMessages, this.controller.signal)) || '';
      this.tokensUsed += estimateTokens(summary);
    } catch {
      // Compaction is best-effort; if the LLM is unavailable, trim the transcript instead.
      summary = this.snapshotOfTranscript();
    }

    this.summary = summary.slice(0, 2000);
    const head = this.transcript.slice(0, 2);
    this.transcript = [
      ...head,
      { role: 'system', content: `## Compacted state so far\n${this.summary}` },
    ];
  }

  /** Emergency trim without LLM: keep system + brief + last 4 turns. */
  private snapshotOfTranscript(): string {
    const tail = this.transcript.slice(-6);
    return tail
      .map(m => m.role === 'tool' ? `tool: ${(m.content || '').slice(0, 300)}` : `${m.role}: ${(m.content || '').slice(0, 300)}`)
      .join('\n');
  }

  // ── Bus output ──────────────────────────────────────────────────────────────

  private skillTools() {
    const all = this.deps.registry.toOpenAISchemas();
    return all.filter(s => this.skill.allowedTools.includes(s.function.name));
  }

  private postRespond(text: string): void {
    const msg: AgentMessage = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'respond',
      from: this.id,
      to: 'main',
      topic: `${this.skill.name}.done`,
      correlationId: this.correlationId,
      replyTo: 'main',
      expectsResponse: false,
      payload: text,
      ts: Date.now(),
    };
    this.deps.bus.publish(msg);
  }

  private postStatus(state: AgentState, note?: string): void {
    const msg: AgentMessage = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'status',
      from: this.id,
      to: '*',
      topic: `agent.status.${this.id}`,
      payload: { state, note: note ?? null, steps: this.steps, tokens: this.tokensUsed },
      ts: Date.now(),
    };
    this.deps.bus.publish(msg);
  }
}
