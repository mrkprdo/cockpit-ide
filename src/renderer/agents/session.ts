import { ToolRegistry } from '../ai/tool-registry';
import { executeToolCall } from '../ai/tool-executor';
import { estimateMessagesTokens, estimateTokens, checkContextBudget } from '../ai/token-counter';
import type { ToolContext, LLMMessage } from '../ai/types';
import type { LLMClient } from '../ai/llm-client';
import type { AgentBus } from './bus';
import { definitionToSkill, guardToolCall } from './skills';
import { evaluatePermission, applyMode } from './permissions';
import { HookRunner } from './hooks';
import { AGENT_SHARED_PREAMBLE, COMPACTION_PROMPT } from './prompts';
import type {
  AgentBrief,
  AgentId,
  AgentMessage,
  AgentState,
  Skill,
  SubAgentDefinition,
} from './types';

export interface SessionDeps {
  bus: AgentBus;
  registry: ToolRegistry;
  llm: Pick<LLMClient, 'chatCompletion' | 'complete'>;
  ctx: () => ToolContext | null;
  /** Hook runner (uses window.electronAPI.shell.exec when available). */
  hooks?: HookRunner;
  /** Resolve the current workspace path (for permission path matching). */
  workspacePath?: () => string | null;
  onStateChange?: (s: SubAgentSession) => void;
}

/** How many recent tool result turns are kept before older ones are folded. */
const ROLLING_WINDOW = 10;

/** Tool result string shown when a PreToolUse hook blocks the call. */
const HOOK_BLOCK_PREFIX = 'HOOK BLOCKED';
/** Tool result string shown while an ask-gated tool awaits approval. */
const PENDING_APPROVAL_PREFIX = 'AWAITING APPROVAL';

export interface PendingApproval {
  toolName: string;
  rawArgs: string;
  toolCallId: string;
  permissionDecision: string;
}

export class SubAgentSession {
  readonly id: AgentId;
  readonly def: SubAgentDefinition;
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
  /** Set when an ask-gated tool is awaiting agent_approve; tool call is parked. */
  pendingApproval: PendingApproval | null = null;

  private transcript: LLMMessage[] = [];
  private controller = new AbortController();
  private running = false;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private deps: SessionDeps;
  private mode = 'acceptEdits';
  /** Resolver queue for ask-gated approvals (agent_approve). */
  private approvalWaiters: Array<{ corrId: string; resolve: (yes: boolean) => void }> = [];

  constructor(id: AgentId, def: SubAgentDefinition, brief: AgentBrief, correlationId: string, deps: SessionDeps) {
    this.id = id;
    this.def = def;
    this.skill = definitionToSkill(def);
    this.brief = brief;
    this.correlationId = correlationId;
    this.deps = deps;
    this.mode = def.permissionMode ?? 'acceptEdits';
    this.lastActivityAt = Date.now();
  }

  get mailboxCount(): number {
    return this.deps.bus.getMailbox(this.id)?.length ?? 0;
  }

  /** Read-only view of the transcript (tests/UI inspection). */
  get transcriptSnapshot(): readonly LLMMessage[] {
    return this.transcript;
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

  private getWorkspacePath(): string {
    try {
      return this.deps.workspacePath?.() ?? this.deps.ctx()?.cockpit.getWorkspacePath() ?? '';
    } catch {
      return '';
    }
  }

  /**
   * Resolve a pending ask-gated tool call. Called by the executor when the main
   * session runs agent_approve. If `yes`, the parked tool is re-queued into the
   * transcript as an approved call that the loop re-executes.
   */
  approve(corrId: string, yes: boolean): boolean {
    if (!this.pendingApproval) return false;
    if (this.pendingApproval.toolCallId !== corrId && this.correlationId !== corrId) return false;
    const waiter = this.approvalWaiters.shift();
    waiter?.resolve(yes);
    return true;
  }

  /**
   * Run the full agent loop to completion. Returns the final result text.
   * Throws on abort; posts a respond (or error status) on the bus.
   */
  async run(): Promise<string> {
    this.running = true;
    this.startedAt = Date.now();
    this.setState('active');

    const timeoutMs = this.brief.timeoutMs ?? this.def.timeoutMs ?? 300_000;
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
      await this.fireLifecycleHook('SubagentStart');

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
            max_tokens: 65536,
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
              max_tokens: 65536,
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

        // Execute each tool (guarded + permission-gated + hook-checked).
        for (const tc of msg.tool_calls) {
          if (this.controller.signal.aborted) throw new Error(this.error ?? 'Aborted');
          const name = tc.function?.name || '';
          const rawArgs = tc.function?.arguments || '{}';

          const output = await this.guardedExecute(name, rawArgs, tc.id || `tc-${this.steps}`);
          this.tokensUsed += estimateTokens(output);
          this.transcript.push({ role: 'tool', tool_call_id: tc.id || `tc-${this.steps}`, content: output });
          this.markActivity();
        }

        // Roll the window: keep the system brief + last N tool turns + peer context.
        this.rollWindow();
      }

      this.result = final;
      this.setState('done');
      this.postRespond(final, 'done');
      return final;
    } catch (err: any) {
      this.error = err?.message || String(err);
      const aborted = this.controller.signal.aborted;
      this.setState(aborted ? 'killed' : 'error');
      this.postStatus(this.state, this.error ?? undefined);
      // Resolve any pending agent_wait on our correlationId FAST — a failed or
      // killed agent must not leave the main session hanging for the full wait
      // timeout. The payload carries the error so the orchestrator can adapt.
      this.postRespond(`[${this.state.toUpperCase()}] ${this.error}`, this.state);
      throw err;
    } finally {
      await this.fireLifecycleHook('SubagentStop');
      this.running = false;
      this.finishedAt = Date.now();
      if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
      // Release any parked approvals so waiters don't leak.
      for (const w of this.approvalWaiters) w.resolve(false);
      this.approvalWaiters = [];
      this.deps.onStateChange?.(this);
    }
  }

  // ── Guarded execution pipeline ─────────────────────────────────────────────

  /**
   * The full guardrail chain for one tool call, in order:
   * 1. skill allowlist + capability hard-deny (guardToolCall)
   * 2. permission patterns (evaluatePermission → applyMode)
   *    - deny   → guardrail error string
   *    - ask    → park the call, post status, await agent_approve
   * 3. PreToolUse hooks (exit 2 blocks)
   * 4. executeToolCall
   * 5. PostToolUse hooks (non-blocking)
   */
  private async guardedExecute(name: string, rawArgs: string, toolCallId: string): Promise<string> {
    // 1. Skill allowlist + capability hard-deny (fast path, stays strict).
    const guard = guardToolCall(this.skill, name);
    if (!guard.ok) return guard.error || `Guardrail denied: ${name}`;

    // Parse args once for permission matching.
    let args: Record<string, unknown> = {};
    try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { args = {}; }

    // 2. Permission patterns + session mode.
    const wsPath = this.getWorkspacePath();
    const decision = evaluatePermission(this.def, name, args, wsPath);
    const verdict = applyMode(decision, this.mode as never, name);
    if (verdict === 'deny') {
      return `Permission denied (${decision}): ${name} ${rawArgs}`;
    }
    if (verdict === 'ask') {
      return await this.parkForApproval(name, rawArgs, toolCallId, decision);
    }

    // 3. PreToolUse hooks.
    const pre = await this.fireToolHook('PreToolUse', name, args);
    if (pre.blocked) {
      return `${HOOK_BLOCK_PREFIX} by PreToolUse hook: ${pre.output || 'hook rejected the call'}`;
    }
    if (pre.output) {
      this.injectHookOutput(`PreToolUse hook output:\n${pre.output}`);
    }

    // 4. Execute.
    const ctx = this.deps.ctx();
    const result = ctx
      ? await executeToolCall(this.deps.registry, name, rawArgs, ctx)
      : { ok: false, output: 'ToolContext unavailable (canvas not ready)' };
    const output = result.output;

    // 5. PostToolUse hooks (non-blocking; result is passed for validation).
    const post = await this.fireToolHook('PostToolUse', name, args, output);
    if (post.output) {
      this.injectHookOutput(`PostToolUse hook output:\n${post.output}`);
    }
    return output;
  }

  /** Park an ask-gated call: post status + wait for agent_approve. */
  private async parkForApproval(name: string, rawArgs: string, toolCallId: string, decision: string): Promise<string> {
    this.pendingApproval = { toolName: name, rawArgs, toolCallId, permissionDecision: decision };
    this.setState('waiting');
    this.postStatus('waiting', `needs approval for ${name}`);

    const yes = await new Promise<boolean>((resolve) => {
      this.approvalWaiters.push({ corrId: toolCallId, resolve });
    });
    this.pendingApproval = null;
    this.setState('active');

    if (yes) {
      // Re-run the call now that it's approved (guards re-checked above).
      const ctx = this.deps.ctx();
      const result = ctx
        ? await executeToolCall(this.deps.registry, name, rawArgs, ctx)
        : { ok: false, output: 'ToolContext unavailable (canvas not ready)' };
      return `APPROVED by main session. ${result.output}`;
    }
    return `Approval declined for ${name}`;
  }

  private async fireLifecycleHook(event: 'SubagentStart' | 'SubagentStop'): Promise<void> {
    if (!this.deps.hooks) return;
    const res = await this.deps.hooks.run(this.def, this.id, event);
    if (res.output) {
      this.transcript.push({ role: 'user', content: `## ${event} hook output\n${res.output}` });
    }
  }

  private async fireToolHook(event: 'PreToolUse' | 'PostToolUse', toolName: string, toolInput: Record<string, unknown>, result?: string): Promise<{ blocked: boolean; output: string }> {
    if (!this.deps.hooks) return { blocked: false, output: '' };
    const res = await this.deps.hooks.run(this.def, this.id, event, {
      toolName,
      toolInput: { ...toolInput, result },
    });
    return { blocked: res.blocked, output: res.output };
  }

  private injectHookOutput(text: string): void {
    if (this.transcript.length === 0) return;
    // Append as a user-role note so the model sees the hook feedback.
    this.transcript.push({ role: 'user', content: text.slice(0, 2000) });
  }

  // ── Prompt assembly ─────────────────────────────────────────────────────────

  private buildSystemPrompt(): string {
    const guardrailLine = this.brief.guardrails.length > 0
      ? `\n## Explicit guardrails (must obey)\n- ${this.brief.guardrails.join('\n- ')}`
      : '';
    const seedLine = this.brief.seedSummary
      ? `\n## Memory seed from a prior agent\n${this.brief.seedSummary}`
      : '';
    const modeLine = `\n## Permission mode\n${this.mode} — write tools are ${this.mode === 'plan' ? 'denied' : 'allowed per allowlist'}.`;
    return [
      AGENT_SHARED_PREAMBLE,
      this.def.systemPrompt,
      `## Tool allowlist\nYou may only call: ${this.skill.allowedTools.join(', ')}. Anything else returns a Guardrail error.`,
      modeLine,
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

  /** Post the final respond. `state` selects the topic (done/error/killed). */
  private postRespond(text: string, state: AgentState = 'done'): void {
    const msg: AgentMessage = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'respond',
      from: this.id,
      to: 'main',
      topic: `${this.def.name}.${state}`,
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
