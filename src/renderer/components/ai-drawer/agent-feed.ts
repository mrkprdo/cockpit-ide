// AgentFeed — the AI panel's live sub-agent PoV transcript store.
//
// Attaches to the AgentExecutor's typed event channel (onAgentEvent, T1) and
// routes each event into the owning agent's PoV transcript. The main agent's
// chat session IS the room: a spawn join marker, an agent's broadcast say, and
// its verdict are forwarded to the chat via `onChatMessage` so the user sees
// the whole conversation in one place. Step/tool traffic stays in the PoV.
//
// This module owns NO persistence — AgentSessionStore reads the transcripts
// here and writes session files. This module owns NO DOM — RenderController
// reads the transcripts and draws them.

import type { AgentExecutor } from '../../agents/executor';
import type {
  AgentEvent,
  AgentId,
  AgentPersona,
  AgentState,
} from '../../agents/types';
import type { AgentLink, ChatMessage, PanelView } from './types';

/** Cap per agent transcript; oldest evicted. */
const TRANSCRIPT_CAP = 200;

export interface AgentTranscript {
  persona: AgentPersona;
  state: AgentState;
  steps: ChatMessage[];        // full PoV
  unread: number;
  startedAt: number;
  finishedAt: number | null;
  sessionFile: string | null;  // 'agents/<id>.json' once written
  archived: boolean;           // restored from disk — read-only, no kill button
  // Persisted metadata (from the spawn brief / status).
  brief: string;
  expectedResult: string;
  guardrails: string[];
  adhoc: boolean;
  stepsCount: number;
  tokensUsed: number;
  broadcastsUsed: number;
}

/** Fixed identity for the main session when it speaks (T5). */
const MAIN_PERSONA = { id: 'main', name: 'Main', icon: 'MA', color: 'var(--accent)' };

/**
 * A chat join marker. Carries `speaker` (so the renderer draws it as a labelled
 * rule, not a bubble). Only ever pushed to the chat via `onChatMessage` — never
 * into the PoV, so rehydrating an agent file never duplicates it.
 */
function joinLine(persona: AgentPersona, ts: number): ChatMessage {
  return {
    role: 'system',
    content: `${persona.name} joined`,
    timestamp: ts,
    speaker: { id: persona.id, name: persona.name, icon: persona.icon, color: persona.color },
  };
}

function truncate(cap: number, list: ChatMessage[]): ChatMessage[] {
  if (list.length <= cap) return list;
  return list.slice(list.length - cap);
}

/** Compact tool chip text (mirrors llm-loop's formatToolChip). */
function toolChip(name: string, rawArgs: string): string {
  let args: Record<string, unknown> = {};
  try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { args = {}; }
  return Object.entries(args)
    .map(([k, v]) => {
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return `${k}=${s.length > 40 ? s.slice(0, 40) + '…' : s}`;
    })
    .join(' ');
}

export class AgentFeed {
  transcripts = new Map<AgentId, AgentTranscript>();
  /** The view currently on screen — unread only counts for non-active views. */
  activeView: PanelView = 'chat';
  onChange: (() => void) | null = null;
  /** Forward room-visible speech (joins, says, verdicts) into the main chat. */
  onChatMessage: ((msg: ChatMessage) => void) | null = null;

  private ex: AgentExecutor | null = null;

  attach(ex: AgentExecutor): void {
    this.detach();
    this.ex = ex;
    ex.onAgentEvent = (id, ev) => this.handleEvent(id, ev);
    ex.onStatusChange = () => {
      this.syncFromStatus();
      this.onChange?.();
    };
  }

  detach(): void {
    if (!this.ex) return;
    this.ex.onAgentEvent = null;
    this.ex.onStatusChange = null;
    this.ex = null;
  }

  /** Transcripts still live (spawning|active|waiting). */
  activeAgents(): AgentTranscript[] {
    return Array.from(this.transcripts.values())
      .filter(t => ['spawning', 'active', 'waiting'].includes(t.state));
  }

  /** Every transcript, spawn order. */
  all(): AgentTranscript[] {
    return Array.from(this.transcripts.values())
      .sort((a, b) => a.startedAt - b.startedAt);
  }

  clearUnread(view: PanelView): void {
    if (view !== 'chat') {
      const t = this.transcripts.get(view);
      if (t) t.unread = 0;
    }
  }

  /** Drop finished tabs (files stay on disk — D8). */
  purgeFinished(): void {
    for (const [id, t] of this.transcripts) {
      if (['done', 'error', 'killed'].includes(t.state) && !t.archived) {
        this.transcripts.delete(id);
      }
    }
    this.onChange?.();
  }

  /** Workspace switch / new session. */
  reset(): void {
    this.transcripts.clear();
    this.activeView = 'chat';
  }

  /** Restore archived transcripts from a main session's agent links (D8). */
  async hydrate(links: AgentLink[]): Promise<void> {
    this.transcripts.clear();
    for (const link of links ?? []) {
      const file = await this.readSessionFile(link);
      if (!file) continue;
      const t: AgentTranscript = {
        persona: file.persona,
        state: file.state,
        steps: file.messages ?? [],
        unread: 0,
        startedAt: file.startedAt,
        finishedAt: file.finishedAt,
        sessionFile: file.id ? `agents/${file.id}.json` : link.file,
        archived: true,
        brief: file.brief,
        expectedResult: file.expectedResult,
        guardrails: file.guardrails ?? [],
        adhoc: file.adhoc ?? false,
        stepsCount: file.steps ?? 0,
        tokensUsed: file.tokensUsed ?? 0,
        broadcastsUsed: file.broadcastsUsed ?? 0,
      };
      this.transcripts.set(link.agentId, t);
    }
    this.onChange?.();
  }

  /** Push a message into one agent's PoV (used by the @mention path). */
  addToTranscript(id: AgentId, msg: ChatMessage): void {
    this.pushToTranscript(id, { ...msg, toName: undefined });
  }

  // ── Event routing ─────────────────────────────────────────────────────────

  private handleEvent(id: AgentId, ev: AgentEvent): void {
    switch (ev.kind) {
      case 'spawn':
        this.handleSpawn(id, ev.persona, ev.brief, ev.expectedResult, ev.guardrails);
        break;
      case 'step':
        this.pushToTranscript(id, { role: 'thinking', content: ev.text, timestamp: Date.now() });
        break;
      case 'tool':
        this.handleTool(id, ev);
        break;
      case 'say':
        this.handleSay(id, ev);
        break;
      case 'state':
        this.handleState(id, ev.state);
        break;
      case 'final':
        this.handleFinal(id, ev);
        break;
    }
    this.onChange?.();
  }

  private handleSpawn(id: AgentId, persona: AgentPersona, brief: string, expectedResult: string, guardrails: string[]): void {
    const now = Date.now();
    const t: AgentTranscript = {
      persona,
      state: 'spawning',
      // One assignment card, not four stacked bubbles — and never role 'user',
      // which reads as if the person typed the brief.
      steps: [{
        role: 'system',
        content: [
          `**${persona.icon} ${persona.name}** was given this task *(${persona.definition})*`,
          `**Task** — ${brief}`,
          `**Done when** — ${expectedResult}`,
          ...(guardrails.length > 0 ? [`**Must not** — ${guardrails.join('; ')}`] : []),
        ].join('\n'),
        timestamp: now,
      }],
      unread: 0,
      startedAt: now,
      finishedAt: null,
      sessionFile: null,
      archived: false,
      brief,
      expectedResult,
      guardrails,
      adhoc: persona.definition.startsWith('adhoc-'),
      stepsCount: 0,
      tokensUsed: 0,
      broadcastsUsed: 0,
    };
    this.transcripts.set(id, t);
    // The chat session is the room — announce the arrival there.
    this.emitChat(joinLine(persona, now));
    this.touchUnread(id);
  }

  private handleTool(id: AgentId, ev: Extract<AgentEvent, { kind: 'tool' }>): void {
    const t = this.transcripts.get(id);
    if (!t) return;
    const existing = t.steps.findIndex(m =>
      m.role === 'tool' && m.toolCallId === ev.callId && m.toolResult === undefined
    );
    if (ev.result !== undefined && existing !== -1) {
      t.steps[existing] = { ...t.steps[existing], toolResult: ev.result, content: toolChip(ev.name, ev.args) };
      return;
    }
    if (ev.result !== undefined) return; // orphan result without a pending chip
    t.steps.push({
      role: 'tool',
      content: toolChip(ev.name, ev.args),
      timestamp: Date.now(),
      toolName: ev.name,
      toolCallId: ev.callId,
    });
    t.steps = truncate(TRANSCRIPT_CAP, t.steps);
  }

  private handleSay(id: AgentId, ev: Extract<AgentEvent, { kind: 'say' }>): void {
    const t = this.transcripts.get(id);
    const speaker = t
      ? { id, name: t.persona.name, icon: t.persona.icon, color: t.persona.color }
      : MAIN_PERSONA;
    const toName = ev.to ? this.nameOf(ev.to) : undefined;
    const msg: ChatMessage = {
      role: 'assistant',
      content: ev.text,
      timestamp: Date.now(),
      speaker,
      intent: ev.intent,
      replyTo: ev.re,
      toName,
    };
    this.emitChat(msg);
    if (t) {
      t.steps.push(msg);
      t.steps = truncate(TRANSCRIPT_CAP, t.steps);
    }
    // Directed message also lands in the target's PoV (T5).
    if (ev.to && ev.to !== id) {
      const target = this.transcripts.get(ev.to);
      if (target) {
        target.steps.push({ ...msg, toName: undefined, speaker: { ...speaker, name: `${speaker.name}` } });
        target.steps = truncate(TRANSCRIPT_CAP, target.steps);
      }
    }
    this.touchUnread(id);
  }

  private handleState(id: AgentId, state: AgentState): void {
    const t = this.transcripts.get(id);
    if (!t) return;
    t.state = state;
    if (state === 'done' || state === 'error' || state === 'killed') {
      t.finishedAt = Date.now();
    }
  }

  private handleFinal(id: AgentId, ev: Extract<AgentEvent, { kind: 'final' }>): void {
    const t = this.transcripts.get(id);
    if (!t) return;
    t.state = ev.state;
    t.finishedAt = Date.now();
    const msg: ChatMessage = {
      role: 'assistant',
      content: ev.text,
      timestamp: Date.now(),
      speaker: { id, name: t.persona.name, icon: t.persona.icon, color: t.persona.color },
      intent: 'verdict',
    };
    t.steps.push(msg);
    t.steps = truncate(TRANSCRIPT_CAP, t.steps);
    this.emitChat(msg);
    this.touchUnread(id);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Forward a room-visible message to the main chat; a listener must never break a run. */
  private emitChat(msg: ChatMessage): void {
    try {
      this.onChatMessage?.(msg);
    } catch {
      // A throwing chat listener is a UI bug, not a run-killer.
    }
  }

  private pushToTranscript(id: AgentId, msg: ChatMessage): void {
    const t = this.transcripts.get(id);
    if (!t) return;
    t.steps.push(msg);
    t.steps = truncate(TRANSCRIPT_CAP, t.steps);
  }

  /** Resolve an agent id to its display name ('Main' for the main session). */
  nameOf(id: AgentId): string {
    if (id === 'main') return 'Main';
    const t = this.transcripts.get(id);
    return t ? t.persona.name : id;
  }

  private touchUnread(id: AgentId): void {
    if (this.activeView === id) return;
    const t = this.transcripts.get(id);
    if (t) t.unread++;
  }

  /** Re-poll the executor for token/broadcast counts + lifecycle states. */
  private syncFromStatus(): void {
    if (!this.ex) return;
    for (const s of this.ex.status()) {
      const t = this.transcripts.get(s.id);
      if (!t) continue;
      t.state = s.state;
      t.tokensUsed = s.tokensUsed;
      t.broadcastsUsed = s.broadcastsUsed;
      t.stepsCount = s.steps;
      if ((s.state === 'done' || s.state === 'error' || s.state === 'killed') && !t.finishedAt) {
        t.finishedAt = s.finishedAt;
      }
    }
  }

  private async readSessionFile(link: AgentLink): Promise<AgentSessionFileShape | null> {
    const cockpit = (window as any).__cockpit;
    const wp = cockpit?.getWorkspacePath?.();
    if (!wp) return null;
    try {
      const raw = await window.electronAPI?.fs.readFile(`${wp}/.cockpit/sessions/${link.file}`);
      if (!raw) return null;
      return JSON.parse(raw) as AgentSessionFileShape;
    } catch {
      return null; // corrupt/missing file — skipped; link dropped on next save
    }
  }
}

/** Shape of an archived agent session file (agents/…json). */
export interface AgentSessionFileShape {
  v: number;
  id: string;
  mainSessionId: string;
  agentId: string;
  persona: AgentPersona;
  definition: string;
  adhoc: boolean;
  brief: string;
  expectedResult: string;
  guardrails: string[];
  state: AgentState;
  startedAt: number;
  finishedAt: number | null;
  steps: number;
  tokensUsed: number;
  broadcastsUsed: number;
  messages: ChatMessage[];
}
