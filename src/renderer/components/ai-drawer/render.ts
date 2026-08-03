// AI drawer DOM rendering — builds the drawer skeleton, renders the message
// list / queue bar / token-usage bar, and handles delegated copy actions.
// Stateless formatting helpers (escapeHtml, formatBody) live here as plain
// functions so sibling modules can import them without an import cycle.

import { checkContextBudget } from '../../ai/token-counter';
import { ZEN_MODELS, type SettingsSnapshot } from './settings';
import type { AiDrawerDom, ChatMessage } from './types';

/** Two-overlapping-squares copy icon (stroke inherits button color). */
export const COPY_ICON_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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
}

export class RenderController {
  messages: ChatMessage[] = [];

  constructor(private dom: AiDrawerDom, private host: RenderHost) {}

  /** Rebuild the drawer chrome HTML and re-query every element ref in place. */
  buildSkeleton(): void {
    const snap = this.host.getSettings();
    this.dom.el.innerHTML = `
      <div class="ai-drawer-content">
        <div class="ai-drawer-header">
          <div class="ai-drawer-header-row">
            <span class="ai-drawer-title">COCKPIT AGENT</span>
            <button class="ai-drawer-close-btn" aria-label="Close AI panel" title="Close"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4l-4 4 4 4"/><path d="M6 4l-4 4 4 4"/></svg></button>
          </div>
        </div>
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
  }

  renderMessages(): void {
    if (this.messages.length === 0) {
      this.dom.messagesEl.innerHTML = `<div class="ai-chat-empty">
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
      this.renderTokenUsage();
      return;
    }
    this.dom.messagesEl.innerHTML = this.messages.map((m, i) => this.renderMessage(m, i)).join('');
    // Mark only the last message for entrance animation; previous messages render instantly
    const last = this.dom.messagesEl.lastElementChild as HTMLElement | null;
    if (last) last.classList.add('is-new');
    this.renderTokenUsage();
    // Defer scroll so browser has painted the new content and scrollHeight is final
    requestAnimationFrame(() => {
      this.dom.messagesEl.scrollTop = this.dom.messagesEl.scrollHeight;
    });
  }

  /**
   * Partially update a single streaming message in place instead of re-rendering
   * the whole list. This preserves selection and avoids flicker while chunks arrive.
   */
  updateStreamingMessage(index: number): void {
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

    requestAnimationFrame(() => {
      this.dom.messagesEl.scrollTop = this.dom.messagesEl.scrollHeight;
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
      const codeBtn = target.closest<HTMLButtonElement>('.ai-chat-code-copy');
      if (codeBtn) {
        const pre = codeBtn.closest('.ai-chat-code-wrap')?.querySelector<HTMLElement>('pre');
        if (pre) window.electronAPI?.clipboard.writeText(pre.textContent ?? '').catch(() => {});
      }
    });
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

    const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const body = this.renderMessageText(m);

    if (m.role === 'system') {
      return `<div class="ai-chat-msg ai-chat-msg-system"><div class="ai-chat-msg-bubble">${body}</div></div>`;
    }

    const steerBadge = m.isSteer ? '<span class="ai-steer-badge">&#x21B3; steer</span>' : '';
    return `
      <div class="ai-chat-msg ai-chat-msg-${m.role}${m.isSteer ? ' is-steer' : ''}" data-msg-index="${index}">
        <div class="ai-chat-msg-bubble">
          ${steerBadge}
          <div class="ai-chat-msg-text">${body}</div>
          <div class="ai-chat-msg-meta">
            <span class="ai-chat-msg-time">${time}</span>
            ${m.role === 'assistant' ? `<button class="ai-chat-copy-btn" data-msg-index="${index}" title="Copy text">${COPY_ICON_SVG}</button>` : ''}
          </div>
        </div>
      </div>`;
  }
}
