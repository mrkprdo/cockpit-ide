// The AI drawer's LLM loop — callLLMWithTools, SSE streaming, tool-call
// execution, empty-completion recovery, and runMessage orchestration. Owns the
// agentic control state (agentMode, abort/fetch controller, continue gate).
//
// Constructor-injected deps keep this module acyclic: the ToolRegistry, the
// cockpit context provider (getToolContext), a render callback surface, the
// SessionStore/SettingsStore/ContextWindow sub-controllers, plus narrow facade
// accessors for the control state the facade's buttons still touch.
//
// Stream/call failures are reported through health/monitor's reportFailure
// (refactor.md §B.4) instead of console.error — the ai-drawer modules keep the
// no-new-console-error discipline.

import { ORCHESTRATION_SECTION } from '../../agents/prompts';
import { listDefinitions } from '../../agents/definitions';
import { SKILL_NAMES } from '../../agents/skills';
import { getToolContext } from '../../ai/cockpit-context';
import { LLMClient } from '../../ai/llm-client';
import { memoryStore } from '../../ai/memory-store';
import { AGENT_SYSTEM_PROMPT } from '../../ai/prompts';
import { ToolRegistry } from '../../ai/tool-registry';
import { executeToolCall } from '../../ai/tool-executor';
import type { LLMMessage, LLMToolCall, ToolContext } from '../../ai/types';
import { reportFailure } from '../../health/monitor';
import { escapeHtml } from './render';
import type { ContextWindow } from './context-window';
import type { RenderController } from './render';
import type { SessionStore } from './sessions';
import type { SettingsStore } from './settings';
import type { AgentMode, AiDrawerDom, ChatMessage, FloatPreviewState } from './types';

/** How many consecutive empty completions before the endpoint is considered wedged. */
export const MAX_CONSECUTIVE_EMPTIES = 5;

export interface LlmLoopHost {
  toolRegistry: ToolRegistry;
  getToolContext(): ToolContext | null;
  getAgentMode(): AgentMode;
  setAgentMode(mode: AgentMode): void;
  getAbortRequested(): boolean;
  setAbortRequested(aborted: boolean): void;
  getFetchController(): AbortController | null;
  setFetchController(controller: AbortController | null): void;
  getContinueResolve(): (() => void) | null;
  setContinueResolve(resolve: (() => void) | null): void;
  getSteeringMessage(): string | null;
  setSteeringMessage(message: string | null): void;
  setLoading(loading: boolean): void;
  isDetached(): boolean;
  updateFloatPreview(state: FloatPreviewState, text?: string): void;
  loadSettings(): Promise<void>;
}

interface EmptyRecoveryState {
  emptyRecoveries: number;
  autoCompacted: boolean;
  consecutiveEmpties: number;
}

export class LlmLoop {
  // Agentic control state (facade buttons read/write through accessors)
  abortRequested = false;
  continueResolve: (() => void) | null = null;
  fetchController: AbortController | null = null;
  agentMode: AgentMode = 'auto';

  constructor(
    private host: LlmLoopHost,
    private dom: AiDrawerDom,
    private render: RenderController,
    private sessions: SessionStore,
    private settings: SettingsStore,
    private contextWindow: ContextWindow,
  ) {}

  async runMessage(text: string): Promise<void> {
    if (!this.settings.apiKey) await this.settings.loadSettings();

    const pinnedSessionId = this.sessions.currentSessionId;

    if (this.host.isDetached()) this.host.updateFloatPreview('hidden');
    this.render.messages.push({ role: 'user', content: text, timestamp: Date.now() });
    this.render.renderMessages();
    this.render.renderTokenUsage();

    await this.contextWindow.maybeAutoCompact();

    if (!this.settings.apiKey) {
      this.render.messages.push({
        role: 'assistant',
        content: '**No API key configured.** Open settings (gear icon) and add your API key.',
        timestamp: Date.now(),
      });
      this.render.renderMessages();
      return;
    }

    this.host.setLoading(true);
    try {
      const response = await this.callLLMWithTools(text);
      // null means streaming already finalized the message in-place — don't double-push
      if (response !== null) {
        this.render.messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
      }
    } catch (err: any) {
      this.render.messages.push({
        role: 'assistant',
        content: `**Error:** ${escapeHtml(err.message || 'Unknown error')}`,
        timestamp: Date.now(),
      });
    }
    this.host.setLoading(false);
    this.render.renderMessages();
    this.render.renderTokenUsage();
    this.sessions.saveSessionById(pinnedSessionId, this.render.messages);
  }

  buildSystemPrompt(wsPath: string): string {
    const parts = [AGENT_SYSTEM_PROMPT];
    if (wsPath) parts.push(`Workspace: ${wsPath}`);
    parts.push(memoryStore.buildIndexPrompt());
    parts.push(ORCHESTRATION_SECTION);
    const customs = listDefinitions().filter(d => !SKILL_NAMES.includes(d.name as never));
    if (customs.length > 0) {
      parts.push(
        '## Custom subagents\n' +
        customs.map(d => `- ${d.name}: ${d.description}`).join('\n')
      );
    }
    return parts.join('\n\n');
  }

  /**
   * Backward-compatible wrapper used by tests and the agent loop.
   * Delegates to the shared tool executor with the current IDE context.
   */
  async executeTool(name: string, args: Record<string, any>): Promise<string> {
    if (!this.host.toolRegistry.has(name)) {
      return `Unknown tool: ${name}`;
    }
    const ctx = this.host.getToolContext();
    if (!ctx) return 'Canvas not ready';
    const result = await executeToolCall(this.host.toolRegistry, name, JSON.stringify(args), ctx);
    return result.output;
  }

  private formatToolChip(name: string, args: Record<string, any>): string {
    const argStr = Object.entries(args)
      .map(([k, v]) => {
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        return `${k}=${s.length > 40 ? s.slice(0, 40) + '…' : s}`;
      })
      .join(' ');
    return argStr;
  }

  private waitForAction(label: string): Promise<boolean> {
    return new Promise(resolve => {
      this.dom.stepLabelEl.textContent = label;
      this.dom.stepControlsEl.classList.add('is-visible');
      this.host.setContinueResolve(() => {
        this.host.setContinueResolve(null);
        resolve(!this.host.getAbortRequested());
      });
    });
  }

  /**
   * Handle an empty completion mid-task (the model exhausted its context window).
   * Recovery escalates and NEVER gives up — the run only ends on a final model
   * answer, the stall detector, a wedged endpoint (MAX_CONSECUTIVE_EMPTIES), or
   * the user aborting:
   *   1. first empty → fold older tool rounds and retry,
   *   2. second empty → auto-compact the session and continue from the compacted
   *      context (rebuilds the in-flight request so it starts small),
   *   3. any further empty → keep folding with a shrinking budget and retry.
   * The only exception is the very first call of the run: a tiny request coming
   * back empty is an endpoint/config problem, not context, so we surface the
   * diagnostic instead of retrying.
   */
  private handleEmptyCompletion(
    apiMessages: LLMMessage[],
    placeholderIndex: number,
    recoveryState: EmptyRecoveryState,
    firstIter: boolean,
    systemContent: string,
  ): string | null {
    if (firstIter) return this.emptyCompletionMessage();

    recoveryState.consecutiveEmpties++;
    // A genuinely wedged endpoint keeps returning empty even on a tiny request —
    // auto-compact can't fix that, so stop instead of burning credits forever.
    if (recoveryState.consecutiveEmpties >= MAX_CONSECUTIVE_EMPTIES) {
      return this.emptyCompletionMessage();
    }
    recoveryState.emptyRecoveries++;

    if (!recoveryState.autoCompacted && recoveryState.emptyRecoveries >= 2) {
      // Second empty: structurally compact the session and rebuild the request.
      recoveryState.autoCompacted = true;
      this.contextWindow.persistCompactedContext(apiMessages);
      apiMessages.length = 0;
      apiMessages.push({ role: 'system', content: systemContent });
      const session = this.sessions.getActiveSession();
      if (session?.context) apiMessages.push(...session.context);
      apiMessages.push({
        role: 'user',
        content: 'Continue the task. The conversation was auto-compacted because the model ran out of context.',
      });
      this.render.messages.push({
        role: 'system',
        content: '**Auto-compacted:** the model ran out of context mid-task; older tool results were trimmed so it can continue.',
        timestamp: Date.now(),
      });
      if (placeholderIndex >= 0 && this.render.messages[placeholderIndex]) {
        this.render.messages[placeholderIndex].role = 'thinking';
        this.render.messages[placeholderIndex].content = '⚠️ Model ran out of context — auto-compacting the conversation and continuing…';
        this.render.renderMessages();
      }
      return null;
    }

    // First empty (or empties after compaction): shrink the request and retry.
    // Fold with a progressively tighter budget so repeated empties keep driving
    // the request smaller until the model can respond.
    const budget = Math.max(4_000, this.contextWindow.loopContextLimit() - recoveryState.emptyRecoveries * 4_000);
    this.contextWindow.foldToolContext(apiMessages, budget);
    if (placeholderIndex >= 0 && this.render.messages[placeholderIndex]) {
      this.render.messages[placeholderIndex].role = 'thinking';
      this.render.messages[placeholderIndex].content = '⚠️ Model returned an empty completion (out of context). Trimming older tool rounds and retrying…';
      this.render.renderMessages();
    }
    return null;
  }

  /** Diagnostic surfaced when the very first call of a run — or a wedged endpoint — comes back empty. */
  private emptyCompletionMessage(): string {
    return (
      '⚠️ The model returned an empty completion (no text, no tool call) — the endpoint responded without output, even on a minimal request. ' +
      'This is usually hidden reasoning consuming the output budget (max_tokens) or an endpoint hiccup. ' +
      'Retry the message, or try a different model/endpoint in settings.'
    );
  }

  private async callLLMWithTools(userMessage: string): Promise<string | null> {
    const ctx = this.host.getToolContext();
    const wsPath = ctx?.cockpit.getWorkspacePath() || '';

    const systemContent = this.buildSystemPrompt(wsPath);

    const apiMessages: LLMMessage[] = [
      { role: 'system', content: systemContent },
    ];

    const history = this.contextWindow.buildHistoryForLLM();
    for (const m of history) {
      apiMessages.push({ role: m.role, content: m.content });
    }
    const last = apiMessages[apiMessages.length - 1];
    if (!last || last.role !== 'user') {
      apiMessages.push({ role: 'user', content: userMessage });
    }

    const client = this.settings.createClient();
    const tools = this.host.toolRegistry.toOpenAISchemas();

    // PLAN mode: first get a plain text plan, then ask user to confirm before executing
    if (this.host.getAgentMode() === 'plan') {
      this.host.setFetchController(new AbortController());
      try {
        const planMessages: LLMMessage[] = [
          ...apiMessages,
          { role: 'user', content: 'Before using any tools, write a numbered step-by-step plan of what you will do. Do NOT call any tools yet — only write the plan.' },
        ];
        let planText: string;
        if (this.settings.streamResponses) {
          // keepAsRole:'thinking' converts the placeholder in-place — no splice flash
          planText = await this.streamPlainText(client, planMessages, 1024, 'thinking');
          // Add the Plan header to match the non-streaming rendering
          const thinkingMsg = this.render.messages[this.render.messages.length - 1];
          if (thinkingMsg?.role === 'thinking' && planText) {
            thinkingMsg.content = `**Plan**\n\n${planText}`;
            this.render.renderMessages();
          }
        } else {
          planText = (await client.chatCompletion({
            messages: planMessages,
            temperature: 0.2,
            max_tokens: 1024,
            signal: this.host.getFetchController()?.signal,
          })).choices?.[0]?.message?.content || 'No plan generated.';
          this.render.messages.push({ role: 'thinking', content: `**Plan**\n\n${planText}`, timestamp: Date.now() });
          this.render.renderMessages();
        }

        const proceed = await this.waitForAction('Approve plan to execute?');
        if (!proceed || this.host.getAbortRequested()) return 'Aborted.';

        // Inject as a proper assistant→user turn so the model sees alternating roles.
        // Appending two user messages back-to-back causes many models to skip tool calls.
        apiMessages.push({ role: 'assistant', content: `**Plan:**\n\n${planText}` });
        apiMessages.push({ role: 'user', content: 'Approved. Execute the plan step by step.' });
      } catch (err: any) {
        if (err?.name === 'AbortError') return 'Aborted.';
        throw err;
      }
    }

    let firstIter = true;
    let stepCount = 0;
    const recoveryState: EmptyRecoveryState = { emptyRecoveries: 0, autoCompacted: false, consecutiveEmpties: 0 };
    for (;;) {
      if (this.host.getAbortRequested()) return 'Aborted.';

      // Keep the in-flight request inside a safety ceiling. A model that
      // receives far more input than its context window can hold responds with
      // an EMPTY completion (no content, no tool call), which used to end the
      // run with a bare "No response." — folding older tool rounds prevents it.
      this.contextWindow.foldToolContext(apiMessages);

      this.host.setFetchController(new AbortController());

      let toolCalls: LLMToolCall[] | null = null;
      let streamedContent = '';
      let placeholderIndex = -1;

      try {
        if (this.settings.streamResponses) {
          placeholderIndex = this.render.messages.length;
          this.render.messages.push({ role: 'assistant', content: '', timestamp: Date.now() });
          this.render.renderMessages();

          for await (const event of client.streamChatCompletion({
            messages: apiMessages,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: this.settings.getMaxOutputTokens(),
            signal: this.host.getFetchController()?.signal,
          })) {
            if (this.host.getAbortRequested()) break;

            if (event.type === 'content') {
              streamedContent += event.delta;
              if (this.render.messages[placeholderIndex]) {
                this.render.messages[placeholderIndex].content = streamedContent;
                this.render.updateStreamingMessage(placeholderIndex);
              }
            } else if (event.type === 'tool_calls') {
              toolCalls = event.tool_calls;
              // Convert the streaming placeholder into a reasoning entry.
              const toolNames = toolCalls.map(tc => tc.function.name).join(', ');
              if (this.render.messages[placeholderIndex]) {
                this.render.messages[placeholderIndex].role = 'thinking';
                this.render.messages[placeholderIndex].content = streamedContent.trim()
                  ? `${streamedContent.trim()}\n\n→ **${toolNames}**`
                  : `→ **${toolNames}**`;
                this.render.messages[placeholderIndex].toolCalls = toolCalls;
                this.render.renderMessages();
              }
              break;
            }
          }

          if (this.host.getAbortRequested()) {
            const kept = this.render.messages[placeholderIndex]?.content || streamedContent || '';
            if (this.render.messages[placeholderIndex]) {
              this.render.messages.splice(placeholderIndex, 1);
              this.render.renderMessages();
            }
            return kept || 'Aborted.';
          }

          if (!toolCalls) {
            const finalContent = streamedContent || this.render.messages[placeholderIndex]?.content || '';
            if (finalContent) {
              // Finalize the placeholder in-place — no splice, no re-add flash.
              if (this.render.messages[placeholderIndex]) {
                this.render.messages[placeholderIndex].content = finalContent;
                this.render.renderMessages();
                return null; // signals runMessage: already in messages, skip push
              }
              // Placeholder was displaced (e.g. messages reset mid-run) — let runMessage add it
              return finalContent;
            }
            // Empty completion mid-task: fold + retry, then auto-compact, instead
            // of ending the run with a dead "No response.".
            const outcome = this.handleEmptyCompletion(apiMessages, placeholderIndex, recoveryState, firstIter, systemContent);
            if (outcome === null) continue;
            return outcome;
          }
        } else {
          const data = await client.chatCompletion({
            messages: apiMessages,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: this.settings.getMaxOutputTokens(),
            signal: this.host.getFetchController()?.signal,
          });
          const msg = data.choices?.[0]?.message;
          if (!msg) throw new Error('Empty response from model');

          if (!msg.tool_calls || msg.tool_calls.length === 0) {
            if (msg.content) return msg.content;
            // Same empty-completion recovery as the streaming path.
            const outcome = this.handleEmptyCompletion(apiMessages, -1, recoveryState, firstIter, systemContent);
            if (outcome === null) continue;
            return outcome;
          }

          toolCalls = msg.tool_calls;
          streamedContent = msg.content || '';
          const toolNames = toolCalls.map(tc => tc.function.name).join(', ');
          const stepContent = streamedContent.trim()
            ? `${streamedContent.trim()}\n\n→ **${toolNames}**`
            : `→ **${toolNames}**`;
          this.render.messages.push({ role: 'thinking', content: stepContent, timestamp: Date.now(), toolCalls });
          this.render.renderMessages();
        }

        firstIter = false;
      } catch (err: any) {
        if (err?.name === 'AbortError') return 'Aborted.';
        // If tools param rejected on first call, retry without tools (some proxies strip tool support)
        if (firstIter && err?.message?.includes('400')) {
          return this.callLLMBasic(apiMessages);
        }
        // Remove any streaming placeholder before surfacing the error.
        if (placeholderIndex >= 0 && this.render.messages[placeholderIndex]) {
          this.render.messages.splice(placeholderIndex, 1);
          this.render.renderMessages();
        }
        reportFailure({ kind: 'llm.stream-error', source: 'ai-drawer/llm-loop.ts', message: String(err?.message ?? err) });
        throw err;
      }

      if (!toolCalls || toolCalls.length === 0) {
        if (streamedContent) return streamedContent;
        // Same empty-completion recovery as the branches above.
        const outcome = this.handleEmptyCompletion(apiMessages, -1, recoveryState, firstIter, systemContent);
        if (outcome === null) continue;
        return outcome;
      }

      // A real tool round — reset the consecutive-empty counter.
      recoveryState.consecutiveEmpties = 0;

      // STEP mode pauses before every batch. auto and plan already run without
      // per-call confirmation (plan gates upfront on the approved plan), so a
      // destructive tool batch proceeds immediately in those modes.
      if (this.host.getAgentMode() === 'step') {
        stepCount++;
        const toolNames = toolCalls.map(tc => tc.function.name).join(', ');
        const proceed = await this.waitForAction(`Step ${stepCount}: run ${toolNames}?`);
        if (!proceed || this.host.getAbortRequested()) return 'Aborted.';
      }

      // Add assistant turn with tool_calls
      apiMessages.push({ role: 'assistant', content: streamedContent || null, tool_calls: toolCalls });

      // Execute each tool and collect results
      for (const tc of toolCalls) {
        if (this.host.getAbortRequested()) return 'Aborted.';

        const toolName: string = tc.function.name;
        let toolArgs: Record<string, any> = {};
        try { toolArgs = JSON.parse(tc.function.arguments || '{}'); } catch {}

        // Show chip in UI immediately (pending state)
        this.render.messages.push({
          role: 'tool',
          content: this.formatToolChip(toolName, toolArgs),
          timestamp: Date.now(),
          toolName,
          toolCallId: tc.id,
        });
        this.render.renderMessages();

        const result = await this.executeTool(toolName, toolArgs);

        // Update chip with result so it becomes collapsible
        this.render.messages[this.render.messages.length - 1].toolResult = result;
        this.render.renderMessages();

        apiMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Inject any steering message the user submitted mid-run
      if (this.host.getSteeringMessage()) {
        const steer = this.host.getSteeringMessage()!;
        this.host.setSteeringMessage(null);
        apiMessages.push({ role: 'user', content: steer });
      }
    }

    return 'Aborted.';
  }

  /**
   * Stream a plain text response (no tools) into a temporary message and return
   * the final content. Used by PLAN mode and the basic fallback.
   *
   * keepAsRole: when set, converts the placeholder to that role in-place instead
   * of splicing it out. Plan mode uses 'thinking' to avoid the splice→repush flash.
   */
  async streamPlainText(
    client: LLMClient,
    messages: LLMMessage[],
    maxTokens = this.settings.getMaxOutputTokens(),
    keepAsRole: ChatMessage['role'] | null = null,
  ): Promise<string> {
    const placeholderIndex = this.render.messages.length;
    this.render.messages.push({ role: 'assistant', content: '', timestamp: Date.now() });
    this.render.renderMessages();

    let content = '';
    try {
      for await (const event of client.streamChatCompletion({
        messages,
        temperature: 0.2,
        max_tokens: maxTokens,
        signal: this.host.getFetchController()?.signal,
      })) {
        if (this.host.getAbortRequested()) break;
        if (event.type === 'content') {
          content += event.delta;
          if (this.render.messages[placeholderIndex]) {
            this.render.messages[placeholderIndex].content = content;
            this.render.updateStreamingMessage(placeholderIndex);
          }
        }
      }
    } catch (err: any) {
      if (this.render.messages[placeholderIndex]) {
        this.render.messages.splice(placeholderIndex, 1);
        this.render.renderMessages();
      }
      if (err?.name === 'AbortError') return content || 'Aborted.';
      reportFailure({ kind: 'llm.stream-error', source: 'ai-drawer/llm-loop.ts', message: String(err?.message ?? err) });
      throw err;
    }

    if (keepAsRole !== null && this.render.messages[placeholderIndex]) {
      this.render.messages[placeholderIndex].role = keepAsRole;
      this.render.messages[placeholderIndex].content = content || '…';
      this.render.renderMessages();
    } else if (this.render.messages[placeholderIndex]) {
      this.render.messages.splice(placeholderIndex, 1);
      this.render.renderMessages();
    }
    return content;
  }

  private async callLLMBasic(apiMessages: LLMMessage[]): Promise<string> {
    const client = this.settings.createClient();
    if (this.settings.streamResponses) {
      return this.streamPlainText(client, apiMessages.map(m => ({ role: m.role, content: m.content || '' })));
    }
    const msgs = apiMessages.map(m => ({ role: m.role, content: m.content || '' }));
    return client.complete(msgs, this.host.getFetchController()?.signal);
  }
}
