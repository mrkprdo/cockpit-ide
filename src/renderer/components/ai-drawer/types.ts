// Shared types for the ai-drawer split (refactor.md §A.4 AiDrawer table).
// Types-only: every ai-drawer module imports from here so the module graph
// stays acyclic (no module imports another that imports it back).

import type { LLMMessage, LLMToolCall } from '../../ai/types';
import type { AgentId, AgentState, SpeechIntent } from '../../agents/types';

export type AgentMode = 'auto' | 'plan' | 'step';

/** The visible conversation surface: the main chat or one agent's PoV. */
export type PanelView = 'chat' | AgentId;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'thinking';
  content: string;
  timestamp: number;
  toolName?: string;
  toolResult?: string;
  /** Full tool-call payload on an assistant/thinking turn that issued tool calls. */
  toolCalls?: LLMToolCall[];
  /** The tool_call_id of the call whose result this tool message carries. */
  toolCallId?: string;
  isSteer?: boolean;
  /** Agent identity for room/PoV messages (role stays 'assistant' when set). */
  speaker?: { id: string; name: string; icon: string; color: string };
  /** Room intent tag (note/finding/suggestion/rebuttal/question/verdict). */
  intent?: SpeechIntent;
  /** Persona name this message answers (from the broadcast `re` param). */
  replyTo?: string;
  /** Directed-message target, renders '→ Reviewer'. */
  toName?: string;
  /** Set on a user @mention message (Chat shows what was said). */
  mentionTo?: string;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  /** Compacted context used in place of the full message history. */
  context?: LLMMessage[];
  /** Links to this session's sub-agent session files (additive, optional). */
  agents?: AgentLink[];
}

/** Link from the main session file to one sub-agent's session file (D8/T14). */
export interface AgentLink {
  agentId: AgentId;
  /** Relative to the sessions dir, e.g. 'agents/msd1-a4f2.json'. */
  file: string;
  name: string;
  icon: string;
  color: string;
  definition: string;
  state: AgentState;
  startedAt: number;
  finishedAt: number | null;
}

export interface SlashCommand {
  name: string;
  label: string;
  description: string;
  action: () => void | Promise<void>;
}

export type FloatPreviewState = 'loading' | 'stream' | 'done' | 'hidden';

/**
 * DOM element refs the AiDrawer facade builds and hands to sub-controllers.
 * Sub-controllers read refs from this shared object at call time (never cached
 * across rebuilds), so a `render()` that re-queries refs in place stays in sync
 * for every controller.
 */
export interface AiDrawerDom {
  el: HTMLDivElement;
  wrapper: HTMLDivElement;
  notch: HTMLButtonElement;
  resizeHandle: HTMLDivElement;
  bodyEl: HTMLDivElement;
  messagesEl: HTMLDivElement;
  povStripEl: HTMLDivElement;
  inputEl: HTMLTextAreaElement;
  sendBtn: HTMLButtonElement;
  abortBtn: HTMLButtonElement;
  steerBtn: HTMLButtonElement;
  queueBarEl: HTMLDivElement;
  settingsEl: HTMLDivElement;
  sessionsPanelEl: HTMLDivElement;
  sessionsListEl: HTMLDivElement;
  loadingEl: HTMLDivElement;
  stepControlsEl: HTMLDivElement;
  stepLabelEl: HTMLSpanElement;
  stepContinueBtn: HTMLButtonElement;
  stepStopBtn: HTMLButtonElement;
  tokenProgressFillEl: HTMLDivElement;
  tokenProgressLabelEl: HTMLDivElement;
  inputAreaEl: HTMLDivElement;
  drawerContentEl: HTMLDivElement;
  detachBtn: HTMLButtonElement;
  expandBtn: HTMLButtonElement;
  backBtn: HTMLButtonElement;
  inputModeBtn: HTMLButtonElement;
  slashPopupEl: HTMLDivElement;
  slashListEl: HTMLDivElement;
  slashEmptyEl: HTMLDivElement;
}
