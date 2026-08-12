// AI drawer DOM rendering — builds the drawer skeleton, renders the message
// list / queue bar / token-usage bar, and handles delegated copy actions.
// Stateless formatting helpers (escapeHtml, formatBody) live here as plain
// functions so sibling modules can import them without an import cycle.

import { ROOM_BROADCAST_BUDGET } from '../../agents/definitions';
import { checkContextBudget } from '../../ai/token-counter';
import { ZEN_MODELS, type SettingsSnapshot } from './settings';
import type { AgentFeed } from './agent-feed';
import type { AiDrawerDom, ChatMessage, PanelView } from './types';

/** Two-overlapping-squares copy icon (stroke inherits button color). */
export const COPY_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Persona colours reach an inline `style="--agent-color:…"`, where escaping is
 * not enough — anything but a plain hex must not survive. Ad-hoc personas are
 * already sanitised in the executor (T11), but custom `.cockpit/agents/*.json`
 * definitions and hydrated agent session files are unvalidated on disk.
 */
export function safeAgentColor(color: string | undefined): string {
  return /^#[0-9a-f]{6}$/i.test(color ?? '') ? color! : 'var(--accent)';
}

/** "just now" / "12m ago" / "3h ago" / "2d ago" / a date. Shared with the session list. */
export function formatAge(ts: number, now: number): string {
  const d = now - ts;
  const mins = Math.floor(d / 60000);
  const hours = Math.floor(d / 3600000);
  const days = Math.floor(d / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

/** A replayed room spans days; a bare clock time reads as "today" and misleads. */
export function formatMsgTime(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const sameDay = d.getFullYear() === today.getFullYear()
    && d.getMonth() === today.getMonth()
    && d.getDate() === today.getDate();
  return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`;
}

/** Elapsed run time, "4m 12s" / "38s" / "1h 04m". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/**
 * Scroll a chat container to the bottom, but ONLY if it is already near it —
 * a user who scrolled up to read earlier content must not be yanked back down
 * by a new response, tool chip, or streaming chunk. Once they scroll back to
 * the bottom the guard lets auto-follow resume.
 */
export function scrollToBottomIfNearBottom(el: HTMLElement, threshold = 80): void {
  if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
    el.scrollTop = el.scrollHeight;
  }
}

/** Messages longer than this collapse to a preview with a show-more toggle. */
export const LONG_MESSAGE_CHARS = 200;

export function formatBody(content: string): string {
  // Escape all HTML first so raw LLM output can never inject tags.
  // Fenced code blocks are pulled aside so the bold/italic/line-break rules
  // never touch code content (newlines and ** are preserved verbatim).
  const blocks: string[] = [];
  const prose = escapeHtml(content).replace(/```(\w*)\n([\s\S]*?)```/g, (_: string, lang: string, code: string) => {
    // code is already escaped; lang is \w* so safe in class attribute
    blocks.push(
      `<div class="ai-chat-code-wrap">` +
      `<button class="ai-chat-code-copy" title="Copy code" aria-label="Copy code">${COPY_ICON_SVG}</button>` +
      `<pre class="ai-chat-code"><code class="${lang ? `lang-${lang}` : ''}">${code.trim()}</code></pre>` +
      `</div>`
    );
    return `\u0000${blocks.length - 1}\u0000`;
  });
  return prose
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
    .replace(/\u0000(\d+)\u0000/g, (_: string, i: string) => blocks[parseInt(i, 10)]);
}

export interface RenderHost {
  estimateContextTokens(): number;
  getPromptQueue(): string[];
  setPromptQueue(queue: string[]): void;
  /** Keep a detached float card's stream preview in sync (facade wires to layout). */
  syncFloatStream(content: string): void;
  getSettings(): SettingsSnapshot;
  /** The live sub-agent feed (room + PoV transcripts). */
  getFeed(): AgentFeed;
}

export class RenderController {
  messages: ChatMessage[] = [];
  /** Which conversation surface is rendered (T4: token bar measures chat only). */
  activeView: PanelView = 'chat';
  /** Long messages the user has expanded (keyed by message object, per session). */
  private expanded = new WeakSet<ChatMessage>();

  constructor(private dom: AiDrawerDom, private host: RenderHost) {}

  /** Rebuild the drawer chrome HTML and re-query every element ref in place. */
  buildSkeleton(): void {
    const snap = this.host.getSettings();
    this.dom.el.innerHTML = `
      <div class="ai-drawer-content">
        <div class="ai-drawer-header">
          <div class="ai-drawer-header-row">
            <span class="ai-drawer-title">COCKPIT AGENT</span>
            <div class="ai-drawer-header-actions">
              <button class="ai-drawer-back-btn" aria-label="Close AI panel" title="Close panel"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4l-4 4 4 4"/><path d="M6 4l-4 4 4 4"/></svg></button>
              <button class="ai-drawer-expand-btn" aria-label="Expand AI panel" title="Expand to full width"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4l4 4-4 4"/><path d="M10 4l4 4-4 4"/></svg></button>
              <button class="ai-drawer-close-btn" aria-label="Close AI panel" title="Close"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4l8 8"/><path d="M12 4l-8 8"/></svg></button>
            </div>
          </div>
        </div>
        <div class="ai-pov-strip is-hidden" role="tablist" aria-label="Conversation view"></div>
        <div class="ai-drawer-body">
          <div class="ai-chat-messages" aria-live="polite" aria-label="Conversation"></div>
          <div class="ai-chat-loading" style="display:none">
            <span class="ai-chat-loading-dot"></span>
            <span class="ai-chat-loading-dot"></span>
            <span class="ai-chat-loading-dot"></span>
          </div>
        </div>
        <div class="ai-step-controls" role="status">
          <div class="ai-step-controls-inner">
            <span class="ai-step-label"></span>
            <div class="ai-step-btns">
              <button class="ai-step-continue-btn">&#x25B6; Continue</button>
              <button class="ai-step-stop-btn">&#x2298; Stop</button>
            </div>
          </div>
        </div>
        <div class="ai-queue-bar"></div>
        <div class="ai-token-progress">
          <div class="ai-token-progress-fill" style="transform: scaleX(0)"></div>
          <div class="ai-token-progress-label">0 / 8,192 (0%)</div>
        </div>
        <div class="ai-chat-input-area">
          <div class="ai-slash-popup" style="display:none">
            <div class="ai-slash-popup-header">Commands</div>
            <div class="ai-slash-list"></div>
            <div class="ai-slash-empty" style="display:none">No matching commands</div>
          </div>
          <div class="ai-input-box">
            <textarea class="ai-chat-input" placeholder="Ask the agent to do something..." rows="2"></textarea>
            <div class="ai-input-toolbar">
              <div class="ai-input-toolbar-left">
                <button class="ai-new-session-btn" aria-label="New session" title="New session">&#x2B;</button>
                <button class="ai-sessions-btn" aria-label="Sessions" title="Sessions">&#x25A4;</button>
                <button class="ai-drawer-settings-btn" aria-label="Settings" title="Settings">&#x2699;</button>
                <button class="ai-chat-detach-btn" title="Detach to floating panel">&#x2934;</button>
              </div>
              <div class="ai-input-toolbar-right">
                <button class="ai-input-mode-btn" title="Agent mode — click to cycle (auto / plan / step)">AUTO</button>
                <button class="ai-chat-steer-btn" aria-label="Steer agent" title="Inject guidance into active run" style="display:none">&#x21B3;</button>
                <button class="ai-chat-abort-btn" aria-label="Abort" title="Abort agent" style="display:none">&#x2298;</button>
                <button class="ai-chat-send-btn" aria-label="Send" title="Send">&#x2191;</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="ai-drawer-settings">
        <div class="ai-settings-content">
          <div class="ai-settings-header">
            <span>Settings</span>
            <button class="ai-settings-close" aria-label="Close settings">&times;</button>
          </div>
          <label class="ai-settings-label">
            API Endpoint
            <input class="ai-settings-input" type="text" value="${escapeHtml(snap.endpoint)}" data-key="endpoint" placeholder="https://api.openai.com/v1">
          </label>
          <label class="ai-settings-label">
            API Key
            <input class="ai-settings-input" type="password" value="${escapeHtml(snap.apiKey)}" data-key="apiKey" placeholder="sk-...">
          </label>
          <label class="ai-settings-label">
            Model
            <select class="ai-settings-select" data-key="model-select">
              <optgroup label="Zen">
                ${ZEN_MODELS.filter(m => m.group === 'free').map(m => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join('')}
              </optgroup>
              <optgroup label="Go">
                ${ZEN_MODELS.filter(m => m.group === 'paid').map(m => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join('')}
              </optgroup>
              <option value="__custom__">Custom…</option>
            </select>
            <input class="ai-settings-input" type="text" data-key="model-custom" style="display:none" placeholder="deepseek-v4-flash">
          </label>
          <label class="ai-settings-label ai-settings-checkbox">
            <input class="ai-settings-input" type="checkbox" ${snap.streamResponses ? 'checked' : ''} data-key="stream">
            Stream responses
          </label>
          <label class="ai-settings-label ai-settings-checkbox">
            <input class="ai-settings-input" type="checkbox" ${snap.suppressViewMove ? 'checked' : ''} data-key="suppressViewMove">
            Keep view still on tool calls
          </label>
          <label class="ai-settings-label">
            Context limit (tokens)
            <input class="ai-settings-input" type="number" min="1024" step="1024" value="${snap.contextTokenLimit}" data-key="contextLimit" placeholder="8192">
          </label>
          <button class="ai-settings-save">Save</button>
        </div>
      </div>
      <div class="ai-sessions-panel">
        <div class="ai-sessions-header">
          <span class="ai-sessions-title">Sessions</span>
          <button class="ai-sessions-close" aria-label="Close sessions">&times;</button>
        </div>
        <div class="ai-sessions-list"></div>
      </div>
    `;

    const el = this.dom.el;
    this.dom.bodyEl = el.querySelector('.ai-drawer-body')!;
    this.dom.messagesEl = el.querySelector('.ai-chat-messages')!;
    this.dom.povStripEl = el.querySelector('.ai-pov-strip')!;
    this.dom.inputEl = el.querySelector('.ai-chat-input')!;
    this.dom.sendBtn = el.querySelector('.ai-chat-send-btn')!;
    this.dom.abortBtn = el.querySelector('.ai-chat-abort-btn')!;
    this.dom.steerBtn = el.querySelector('.ai-chat-steer-btn')!;
    this.dom.queueBarEl = el.querySelector('.ai-queue-bar')!;
    this.dom.settingsEl = el.querySelector('.ai-drawer-settings')!;
    this.dom.sessionsPanelEl = el.querySelector('.ai-sessions-panel')!;
    this.dom.sessionsListEl = el.querySelector('.ai-sessions-list')!;
    this.dom.loadingEl = el.querySelector('.ai-chat-loading')!;
    this.dom.stepControlsEl = el.querySelector('.ai-step-controls')!;
    this.dom.stepLabelEl = el.querySelector('.ai-step-label')!;
    this.dom.stepContinueBtn = el.querySelector('.ai-step-continue-btn')!;
    this.dom.stepStopBtn = el.querySelector('.ai-step-stop-btn')!;
    this.dom.tokenProgressFillEl = el.querySelector('.ai-token-progress-fill')!;
    this.dom.tokenProgressLabelEl = el.querySelector('.ai-token-progress-label')!;
    this.dom.slashPopupEl = el.querySelector('.ai-slash-popup')!;
    this.dom.slashListEl = el.querySelector('.ai-slash-list')!;
    this.dom.slashEmptyEl = el.querySelector('.ai-slash-empty')!;
    this.dom.inputAreaEl = el.querySelector('.ai-chat-input-area')!;
    this.dom.inputModeBtn = el.querySelector('.ai-input-mode-btn')!;
    this.dom.drawerContentEl = el.querySelector('.ai-drawer-content')!;
    this.dom.detachBtn = el.querySelector('.ai-chat-detach-btn')!;
    this.dom.expandBtn = el.querySelector('.ai-drawer-expand-btn')!;
    this.dom.backBtn = el.querySelector('.ai-drawer-back-btn')!;
  }

  renderMessages(): void {
    this.renderStrip();
    const source = this.currentSource();
    if (source.length === 0) {
      this.dom.messagesEl.innerHTML = this.viewHeader() + this.emptyHtml();
      this.renderTokenUsage();
      return;
    }
    this.dom.messagesEl.innerHTML = this.viewHeader() + source.map((m, i) => this.renderMessage(m, i)).join('');
    // Mark only the last message for entrance animation; previous messages render instantly
    const last = this.dom.messagesEl.lastElementChild as HTMLElement | null;
    if (last) last.classList.add('is-new');
    this.renderTokenUsage();
    // Defer scroll so browser has painted the new content and scrollHeight is
    // final — and never yank a user who is reading earlier messages.
    requestAnimationFrame(() => {
      scrollToBottomIfNearBottom(this.dom.messagesEl);
    });
  }

  /** The rendered message list depends on the active view (chat / an agent PoV). */
  private currentSource(): ChatMessage[] {
    if (this.activeView === 'chat') return this.messages;
    return this.host.getFeed().transcripts.get(this.activeView)?.steps ?? [];
  }

  /** The tab strip between header and messages — the "show active agents" surface. */
  private renderStrip(): void {
    if (!this.dom.povStripEl) return;
    const feed = this.host.getFeed();
    const agents = feed.all();
    if (agents.length === 0 && this.activeView === 'chat') {
      this.dom.povStripEl.classList.add('is-hidden');
      this.dom.povStripEl.innerHTML = '';
      return;
    }
    this.dom.povStripEl.classList.remove('is-hidden');

    const tabCls = (view: string) => `ai-pov-tab${this.activeView === view ? ' is-selected' : ''}`;
    const selected = (view: string) => String(this.activeView === view);
    const chatTab = `<button class="${tabCls('chat')}" role="tab" aria-selected="${selected('chat')}" data-view="chat">Chat</button>`;
    const agentTabs = agents.map(a => {
      const unread = a.unread > 0 ? `<span class="ai-pov-badge" aria-label="${a.unread} unread">${a.unread}</span>` : '';
      const archived = a.archived ? ' is-archived' : '';
      const title = a.archived ? ' title="Replayed from this session\'s saved run"' : '';
      return `<button class="${tabCls(a.persona.id)} is-agent${archived}" role="tab" aria-selected="${selected(a.persona.id)}" data-view="${a.persona.id}" style="--agent-color:${safeAgentColor(a.persona.color)}"${title}><span class="ai-pov-ring is-${a.state}" aria-hidden="true"></span><span class="ai-pov-icon" aria-hidden="true">${escapeHtml(a.persona.icon)}</span> ${escapeHtml(a.persona.name)}${unread}</button>`;
    }).join('');
    const hasFinished = agents.some(a => ['done', 'error', 'killed'].includes(a.state));
    const purge = hasFinished
      ? '<button class="ai-pov-purge" title="Purge finished agents" aria-label="Purge finished agents">⌫</button>'
      : '';
    this.dom.povStripEl.innerHTML = chatTab + agentTabs + purge;
  }

  /** Header above an agent PoV: the run card with its kill control (D6). */
  private viewHeader(): string {
    if (this.activeView === 'chat') return '';
    return this.renderPovHeader();
  }

  /** PoV run card: who, how it ended, how long, and the kill control (D6). */
  private renderPovHeader(): string {
    const view = this.activeView;
    if (view === 'chat') return '';   // narrows PanelView → AgentId
    const t = this.host.getFeed().transcripts.get(view);
    if (!t) return '';
    const finished = ['done', 'error', 'killed'].includes(t.state);
    const killHidden = finished || t.archived;
    const elapsed = (t.finishedAt ?? Date.now()) - t.startedAt;
    const facts = [
      `${t.stepsCount} step${t.stepsCount === 1 ? '' : 's'}`,
      `${(t.tokensUsed / 1000).toFixed(1)}k tokens`,
      `${t.broadcastsUsed} of ${ROOM_BROADCAST_BUDGET} broadcasts`,
      finished ? `ran ${formatDuration(elapsed)}` : `running ${formatDuration(elapsed)}`,
      finished && t.finishedAt ? formatAge(t.finishedAt, Date.now()) : '',
    ].filter(Boolean).join(' · ');

    return `<div class="ai-pov-header${t.archived ? ' is-replay' : ''}" style="--agent-color:${safeAgentColor(t.persona.color)}">
      <span class="ai-pov-persona"><span class="ai-pov-icon" aria-hidden="true">${escapeHtml(t.persona.icon)}</span> ${escapeHtml(t.persona.name)}</span>
      <span class="ai-run-badge is-${t.state}">${t.state}</span>
      ${t.archived ? '<span class="ai-run-badge is-replay">replay</span>' : ''}
      <span class="ai-pov-stat">${facts}</span>
      ${killHidden ? '' : `<button class="ai-pov-kill" data-id="${t.persona.id}">✕ Kill</button>`}
    </div>`;
  }

  private emptyHtml(): string {
    if (this.activeView !== 'chat') {
      return `<div class="ai-chat-empty">
        <div class="ai-chat-empty-sub">No messages yet.</div>
      </div>`;
    }
    return `<div class="ai-chat-empty">
      <div class="ai-chat-empty-logo" aria-hidden="true">
        <svg class="ai-chat-empty-icon" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
          <circle class="ai-logo-c ai-logo-c1" cx="72" cy="72" r="56"/>
          <circle class="ai-logo-c ai-logo-c2" cx="184" cy="72" r="56"/>
          <circle class="ai-logo-c ai-logo-c3" cx="72" cy="184" r="56"/>
          <circle class="ai-logo-c ai-logo-c4" cx="184" cy="184" r="56"/>
        </svg>
      </div>
      <div class="ai-chat-empty-title">Cockpit Agent ready.</div>
      <div class="ai-chat-empty-sub">I can read/write files, open them in the editor, and arrange the canvas.</div>
    </div>`;
  }

  /**
   * Partially update a single streaming message in place instead of re-rendering
   * the whole list. This preserves selection and avoids flicker while chunks arrive.
   */
  updateStreamingMessage(index: number): void {
    // Indices address `this.messages`; while a room/PoV view is rendered the DOM
    // holds someone else's messages at that index. The next full render catches up.
    if (this.activeView !== 'chat') return;
    const msg = this.messages[index];
    const el = this.dom.messagesEl.querySelector(`[data-msg-index="${index}"]`) as HTMLElement | null;
    if (!msg || !el) return;

    if (msg.role === 'thinking') {
      const body = el.querySelector('.ai-thinking-body') as HTMLElement | null;
      if (body) body.innerHTML = formatBody(msg.content);
    } else {
      const text = el.querySelector('.ai-chat-msg-text') as HTMLElement | null;
      if (text) text.innerHTML = this.renderMessageText(msg);
    }

    if (msg.content) {
      this.host.syncFloatStream(msg.content);
    }

    // Same guard as renderMessages: streaming must not drag a scrolled-up
    // reader back to the newest chunk.
    requestAnimationFrame(() => {
      scrollToBottomIfNearBottom(this.dom.messagesEl);
    });
  }

  renderMessageText(m: ChatMessage): string {
    if ((m.role === 'assistant' || m.role === 'user') && !m.content) {
      return '<span class="ai-chat-msg-loading"><span></span><span></span><span></span></span>';
    }
    return formatBody(m.content);
  }

  renderTokenUsage(): void {
    const used = this.host.estimateContextTokens();
    const budget = checkContextBudget(used, this.host.getSettings().contextTokenLimit);
    const pct = Math.min(budget.percent, 100);
    const label = `${used.toLocaleString()} / ${budget.limit.toLocaleString()} (${budget.percent}%)`;
    if (this.dom.tokenProgressFillEl) {
      this.dom.tokenProgressFillEl.style.transform = `scaleX(${pct / 100})`;
      this.dom.tokenProgressFillEl.classList.toggle('is-high', budget.percent >= 80);
    }
    if (this.dom.tokenProgressLabelEl) {
      this.dom.tokenProgressLabelEl.textContent = label;
    }
  }

  renderQueueBar(): void {
    if (!this.dom.queueBarEl) return;
    const queue = this.host.getPromptQueue();
    if (queue.length === 0) {
      this.dom.queueBarEl.classList.remove('is-visible');
      this.dom.queueBarEl.innerHTML = '';
      return;
    }
    this.dom.queueBarEl.innerHTML = `
      <div class="ai-queue-bar-inner">
        <div class="ai-queue-header">
          <span class="ai-queue-label">&#x25B8; ${queue.length} queued</span>
          <button class="ai-queue-clear" title="Clear queue">&times; Clear all</button>
        </div>
        ${queue.map((q, i) => `
          <div class="ai-queue-item">
            <span class="ai-queue-text">${escapeHtml(q.slice(0, 60))}${q.length > 60 ? '…' : ''}</span>
            <button class="ai-queue-remove" data-index="${i}">&times;</button>
          </div>
        `).join('')}
      </div>
    `;
    this.dom.queueBarEl.classList.add('is-visible');
    this.dom.queueBarEl.querySelector('.ai-queue-clear')!.addEventListener('click', () => {
      this.host.setPromptQueue([]);
      this.renderQueueBar();
    });
    this.dom.queueBarEl.querySelectorAll<HTMLButtonElement>('.ai-queue-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index!);
        const next = [...this.host.getPromptQueue()];
        next.splice(idx, 1);
        this.host.setPromptQueue(next);
        this.renderQueueBar();
      });
    });
  }

  /** Delegated copy handling survives innerHTML rewrites (incl. streaming text updates). */
  bindMessageActions(): void {
    this.dom.messagesEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const copyBtn = target.closest<HTMLButtonElement>('.ai-chat-copy-btn');
      if (copyBtn) {
        const idx = parseInt(copyBtn.dataset.msgIndex ?? '-1', 10);
        const msg = idx >= 0 ? this.messages[idx] : undefined;
        if (msg) window.electronAPI?.clipboard.writeText(msg.content).catch(() => {});
        return;
      }
      const toggleBtn = target.closest<HTMLButtonElement>('.ai-msg-toggle');
      if (toggleBtn) {
        const idx = parseInt(toggleBtn.dataset.msgIndex ?? '-1', 10);
        const msg = idx >= 0 ? this.currentSource()[idx] : undefined;
        if (msg) {
          if (this.expanded.has(msg)) this.expanded.delete(msg);
          else this.expanded.add(msg);
          this.renderMessages();
        }
        return;
      }
      const codeBtn = target.closest<HTMLButtonElement>('.ai-chat-code-copy');
      if (codeBtn) {
        const pre = codeBtn.closest('.ai-chat-code-wrap')?.querySelector<HTMLElement>('pre');
        if (pre) window.electronAPI?.clipboard.writeText(pre.textContent ?? '').catch(() => {});
      }
    });
  }

  /**
   * Render a message's text body. Long messages (>{@link LONG_MESSAGE_CHARS}
   * chars) collapse to a clamped preview with a show-more/show-less toggle; the
   * expanded state is tracked per message object so a full re-render keeps it.
   */
  private renderTextBlock(m: ChatMessage, body: string, index: number): string {
    const isLong = m.content.length > LONG_MESSAGE_CHARS;
    if (!isLong) return `<div class="ai-chat-msg-text">${body}</div>`;
    const expanded = this.expanded.has(m);
    return (
      `<div class="ai-chat-msg-text${expanded ? '' : ' is-clamped'}">${body}</div>` +
      `<button class="ai-msg-toggle" data-msg-index="${index}" aria-expanded="${String(expanded)}" title="${expanded ? 'Show less' : 'Show more'}">${expanded ? 'Show less ▴' : 'Show more ▾'}</button>`
    );
  }

  private renderMessage(m: ChatMessage, index = 0): string {
    if (m.role === 'tool') {
      const name = m.toolName || '';
      const pending = m.toolResult === undefined;
      const resultHtml = pending
        ? `<div class="ai-tool-result ai-tool-result-pending">running…</div>`
        : `<pre class="ai-tool-result">${escapeHtml(m.toolResult!)}</pre>`;
      return `<div class="ai-chat-msg ai-chat-msg-tool" data-msg-index="${index}"><details class="ai-tool-details"${pending ? ' open' : ''}><summary class="ai-tool-chip"><span class="ai-tool-icon">⚙</span><span class="ai-tool-name">${escapeHtml(name)}</span><span class="ai-tool-args">${escapeHtml(m.content)}</span><span class="ai-tool-toggle">▸</span></summary>${resultHtml}</details></div>`;
    }

    if (m.role === 'thinking') {
      const body = formatBody(m.content);
      return `<div class="ai-chat-msg ai-chat-msg-thinking" data-msg-index="${index}"><details class="ai-thinking-details" open><summary class="ai-thinking-header"><span class="ai-thinking-icon">◈</span><span class="ai-thinking-label">Agent reasoning</span><span class="ai-thinking-toggle">▸</span></summary><div class="ai-thinking-body">${body}</div></details></div>`;
    }

    const time = formatMsgTime(m.timestamp);
    const body = this.renderMessageText(m);

    if (m.role === 'system') {
      // A join marker (system + speaker) reads as a labelled rule, not a bubble.
      if (m.speaker) {
        return `<div class="ai-room-join" style="--agent-color:${safeAgentColor(m.speaker.color)}">
          <span class="ai-room-join-icon">${escapeHtml(m.speaker.icon)}</span>
          <span class="ai-room-join-label">${escapeHtml(m.speaker.name)} joined</span>
          <span class="ai-room-join-time">${time}</span>
        </div>`;
      }
      return `<div class="ai-chat-msg ai-chat-msg-system"><div class="ai-chat-msg-bubble">${this.renderTextBlock(m, body, index)}</div></div>`;
    }

    // A sub-agent turn: role stays 'assistant' but carries a speaker identity.
    if (m.speaker) {
      const intentBadge = m.intent
        ? `<span class="ai-intent-badge is-${m.intent}">${m.intent}</span>`
        : '';
      const reply = m.replyTo ? `<span class="ai-agent-reply">↩ ${escapeHtml(m.replyTo)}</span>` : '';
      const toName = m.toName ? `<span class="ai-agent-to">→ ${escapeHtml(m.toName)}</span>` : '';
      const isError = m.intent === 'verdict' && /^\[(ERROR|KILLED)\]/.test(m.content);
      return `
        <div class="ai-chat-msg ai-chat-msg-agent${isError ? ' is-error' : ''}" style="--agent-color:${safeAgentColor(m.speaker.color)}" data-msg-index="${index}">
          <div class="ai-agent-head">
            <span class="ai-agent-icon">${escapeHtml(m.speaker.icon)}</span>
            <span class="ai-agent-name">${escapeHtml(m.speaker.name)}</span>
            ${intentBadge}${reply}${toName}
          </div>
          ${this.renderTextBlock(m, body, index)}
          <div class="ai-chat-msg-meta">
            <span class="ai-chat-msg-time">${time}</span>
          </div>
        </div>`;
    }

    const steerBadge = m.isSteer ? '<span class="ai-steer-badge">&#x21B3; steer</span>' : '';
    return `
      <div class="ai-chat-msg ai-chat-msg-${m.role}${m.isSteer ? ' is-steer' : ''}" data-msg-index="${index}">
        <div class="ai-chat-msg-bubble">
          ${steerBadge}
          ${this.renderTextBlock(m, body, index)}
          <div class="ai-chat-msg-meta">
            <span class="ai-chat-msg-time">${time}</span>
            ${m.role === 'assistant' ? `<button class="ai-chat-copy-btn" data-msg-index="${index}" title="Copy text">${COPY_ICON_SVG}</button>` : ''}
          </div>
        </div>
      </div>`;
  }
}
