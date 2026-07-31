import { AGENT_SYSTEM_PROMPT } from '../ai/prompts';
import { getAgentExecutor } from '../agents/executor';
import { ORCHESTRATION_SECTION } from '../agents/prompts';
import { ALL_TOOLS } from '../ai/tool-definitions';
import { LLMClient } from '../ai/llm-client';
import { ToolRegistry } from '../ai/tool-registry';
import { executeToolCall } from '../ai/tool-executor';
import { getToolContext } from '../ai/cockpit-context';
import { estimateMessagesTokens, checkContextBudget } from '../ai/token-counter';
import { memoryStore } from '../ai/memory-store';
import type { LLMMessage, LLMResponse, OpenAIFunctionSchema, LLMToolCall, LLMStreamEvent } from '../ai/types';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'thinking';
  content: string;
  timestamp: number;
  toolName?: string;
  toolResult?: string;
  isSteer?: boolean;
}

interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  /** Compacted context used in place of the full message history. */
  context?: LLMMessage[];
}

interface SlashCommand {
  name: string;
  label: string;
  description: string;
  action: () => void | Promise<void>;
}


export class AiDrawer {
  private el: HTMLDivElement;
  private wrapper: HTMLDivElement;
  private notch: HTMLButtonElement;
  private resizeHandle: HTMLDivElement;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;
  private isDragging = false;
  private drawerWidth = 420;
  /** Matches CSS `--ai-shell-inset` — gap so canvas peeks around the glass card. */
  private readonly shellInset = 8;

  private messages: ChatMessage[] = [];
  private isLoading = false;
  private apiKey = '';
  private model = 'deepseek-v4-flash';
  private endpoint = 'https://opencode.ai/zen/go/v1';
  private streamResponses = true;
  private contextTokenLimit = 8192;
  private toolRegistry = new ToolRegistry(ALL_TOOLS);

  // Agentic control state
  private agentMode: 'auto' | 'plan' | 'step' = 'auto';
  private abortRequested = false;
  private continueResolve: (() => void) | null = null;
  private fetchController: AbortController | null = null;

  // Session state
  private sessions: Session[] = [];
  private currentSessionId = '';
  private sessionsLoaded = false;
  private sessionsDirEnsured = false;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Queue + steer state
  private promptQueue: string[] = [];
  private steeringMessage: string | null = null;

  private bodyEl!: HTMLDivElement;
  private messagesEl!: HTMLDivElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private abortBtn!: HTMLButtonElement;
  private steerBtn!: HTMLButtonElement;
  private queueBarEl!: HTMLDivElement;
  private settingsEl!: HTMLDivElement;
  private sessionsPanelEl!: HTMLDivElement;
  private sessionsListEl!: HTMLDivElement;
  private loadingEl!: HTMLDivElement;
  private stepControlsEl!: HTMLDivElement;
  private stepLabelEl!: HTMLSpanElement;
  private stepContinueBtn!: HTMLButtonElement;
  private stepStopBtn!: HTMLButtonElement;
  private tokenProgressFillEl!: HTMLDivElement;
  private tokenProgressLabelEl!: HTMLDivElement;
  private inputAreaEl!: HTMLDivElement;
  private drawerContentEl!: HTMLDivElement;
  onDetachChange?: (detached: boolean) => void;
  private detachBtn!: HTMLButtonElement;
  private inputModeBtn!: HTMLButtonElement;
  private historyIndex = -1;
  private historyDraft = '';
  isDetached = false;
  private floatEl: HTMLDivElement | null = null;
  private floatPreviewEl: HTMLDivElement | null = null;
  private dockBtnEl: HTMLButtonElement | null = null;
  private floatResizeHandler: (() => void) | null = null;

  private slashCommands: SlashCommand[] = [];
  private slashPopupEl!: HTMLDivElement;
  private slashListEl!: HTMLDivElement;
  private slashEmptyEl!: HTMLDivElement;
  private slashSelectedIndex = 0;
  private slashFiltered: SlashCommand[] = [];

  private static readonly ZEN_MODELS = [
    // Free (Zen endpoint)
    { id: 'deepseek-v4-flash-free', label: 'DeepSeek V4 Flash (Free)', group: 'free' as const, maxContext: 131072 },
    { id: 'north-mini-code-free', label: 'North Mini Code (Free)', group: 'free' as const, maxContext: 131072 },
    { id: 'nemotron-3-ultra-free', label: 'Nemotron 3 Ultra (Free)', group: 'free' as const, maxContext: 131072 },
    { id: 'mimo-v2.5-free', label: 'MiMo V2.5 (Free)', group: 'free' as const, maxContext: 131072 },
    { id: 'big-pickle', label: 'Big Pickle (Free)', group: 'free' as const, maxContext: 131072 },
    // Paid (Go endpoint)
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', group: 'paid' as const, maxContext: 131072 },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', group: 'paid' as const, maxContext: 131072 },
    { id: 'minimax-m2.7', label: 'MiniMax M2.7', group: 'paid' as const, maxContext: 131072 },
    { id: 'grok-build-0.1', label: 'Grok Build 0.1', group: 'paid' as const, maxContext: 131072 },
    { id: 'kimi-k2.5', label: 'Kimi K2.5', group: 'paid' as const, maxContext: 131072 },
  ];

  constructor() {
    const canvas = document.getElementById('canvas')!;
    const canvasParent = canvas.parentElement!;

    this.wrapper = document.createElement('div');
    this.wrapper.id = 'app-main';

    this.el = document.createElement('div');
    this.el.className = 'ai-drawer';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'AI Panel');

    this.resizeHandle = document.createElement('div');
    this.resizeHandle.className = 'ai-drawer-resize';

    this.notch = document.createElement('button');
    this.notch.className = 'ai-drawer-notch';
    this.notch.setAttribute('aria-label', 'Open AI panel');
    this.notch.setAttribute('title', 'Open AI panel (Ctrl+Space)');
    this.notch.innerHTML = '<span class="ai-drawer-notch-label">AI</span>';
    this.notch.addEventListener('click', () => this.toggle());

    this.wrapper.appendChild(this.el);
    this.wrapper.appendChild(this.resizeHandle);
    canvasParent.replaceChild(this.wrapper, canvas);
    this.wrapper.appendChild(canvas);

    document.body.appendChild(this.notch);
    this.bindResize();

    this.registerDefaultSlashCommands();

    this.showWelcome();
    this.render();
    this.loadSettings();
  }

  private async loadSettings(): Promise<void> {
    try {
      const prefs = await window.electronAPI?.prefs.load();
      if (prefs) {
        if (prefs.aiApiKey) this.apiKey = prefs.aiApiKey;
        if (prefs.aiModel) {
          this.model = prefs.aiModel.replace(/^opencode(?:-go)?\//, '');
        }
        if (prefs.aiEndpoint) {
          this.endpoint = prefs.aiEndpoint;
        }
        if (typeof prefs.aiStreamResponses === 'boolean') {
          this.streamResponses = prefs.aiStreamResponses;
        }
        if (typeof prefs.aiContextLimit === 'number' && prefs.aiContextLimit >= 1024) {
          this.contextTokenLimit = prefs.aiContextLimit;
        }
      }
      getAgentExecutor().setConfigProvider(() => ({ endpoint: this.endpoint, apiKey: this.apiKey, model: this.model }));
      const endpointInput = this.settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="endpoint"]');
      const apiKeyInput = this.settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="apiKey"]');
      const modelSelect = this.settingsEl?.querySelector<HTMLSelectElement>('.ai-settings-select[data-key="model-select"]');
      const modelCustomInput = this.settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="model-custom"]');
      const streamInput = this.settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="stream"]');
      const contextLimitInput = this.settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="contextLimit"]');
      if (endpointInput) endpointInput.value = this.endpoint;
      if (apiKeyInput) apiKeyInput.value = this.apiKey;
      if (modelSelect) {
        const known = AiDrawer.ZEN_MODELS.find(m => m.id === this.model);
        if (known) {
          modelSelect.value = this.model;
          if (modelCustomInput) { modelCustomInput.style.display = 'none'; modelCustomInput.value = ''; }
          if (contextLimitInput) contextLimitInput.max = String(known.maxContext);
        } else {
          modelSelect.value = '__custom__';
          if (modelCustomInput) { modelCustomInput.style.display = 'block'; modelCustomInput.value = this.model; }
          if (contextLimitInput) contextLimitInput.removeAttribute('max');
        }
      }
      if (streamInput) streamInput.checked = this.streamResponses;
      if (contextLimitInput) contextLimitInput.value = String(this.contextTokenLimit);
      if (prefs && (prefs.aiModel !== this.model || prefs.aiEndpoint !== this.endpoint)) {
        this.saveSettings();
      }
    } catch {}
  }

  private async saveSettings(): Promise<void> {
    try {
      const prefs = (await window.electronAPI?.prefs.load()) || {};
      prefs.aiApiKey = this.apiKey;
      prefs.aiModel = this.model;
      prefs.aiEndpoint = this.endpoint;
      prefs.aiStreamResponses = this.streamResponses;
      prefs.aiContextLimit = this.contextTokenLimit;
      window.electronAPI?.prefs.save(prefs);
    } catch {}
  }

  private showWelcome(): void {
    this.messages = [];
  }

  // ── Sessions ────────────────────────────────────────────────────────────────

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  private getSessionTitle(session: Session): string {
    const first = session.messages.find(m => m.role === 'user');
    if (!first) return 'New session';
    return first.content.slice(0, 48).replace(/\n/g, ' ');
  }

  private getSessionsDir(): string | null {
    const cockpit = (window as any).__cockpit;
    const wp = cockpit?.getWorkspacePath?.();
    return wp ? `${wp}/.cockpit/sessions` : null;
  }

  private async loadSessions(): Promise<void> {
    if (this.sessionsLoaded) return;
    this.sessionsLoaded = true;
    const dir = this.getSessionsDir();
    if (!dir) { this.initFirstSession(); return; }

    try {
      const indexRaw = await window.electronAPI?.fs.readFile(`${dir}/index.json`);
      if (!indexRaw) { this.initFirstSession(); return; }
      const index = JSON.parse(indexRaw) as { currentSessionId: string; order: string[] };
      const loaded = await Promise.all(
        index.order.map(id =>
          window.electronAPI!.fs.readFile(`${dir}/${id}.json`)
            .then(raw => raw ? JSON.parse(raw) as Session : null)
            .catch(() => null)
        )
      );
      this.sessions = loaded.filter(Boolean) as Session[];
      this.currentSessionId = index.currentSessionId || '';
      if (this.sessions.length === 0) { this.initFirstSession(); return; }
      const current = this.sessions.find(s => s.id === this.currentSessionId) ?? this.sessions[0];
      this.currentSessionId = current.id;
      this.messages = [...current.messages];
      if (this.messages.length === 0) this.showWelcome();
      this.renderMessages();
      this.syncFloatPreviewToMessages();
    } catch { this.initFirstSession(); }
  }

  private writeSessionsIndex(dir: string): Promise<boolean | undefined> {
    const index = { currentSessionId: this.currentSessionId, order: this.sessions.map(s => s.id) };
    return window.electronAPI!.fs.writeFile(`${dir}/index.json`, JSON.stringify(index, null, 2)).catch(() => undefined);
  }

  private initFirstSession(): void {
    const session: Session = {
      id: this.generateId(),
      title: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [...this.messages],
      context: [],
    };
    this.sessions = [session];
    this.currentSessionId = session.id;
  }

  private saveSessions(): void {
    if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(() => {
      this.saveDebounceTimer = null;
      this.flushSave();
    }, 300);
  }

  private flushSave(): void {
    const dir = this.getSessionsDir();
    if (!dir) return;
    const session = this.sessions.find(s => s.id === this.currentSessionId);
    if (!session) return;
    const sessionJson = JSON.stringify(session, null, 2);
    const doWrite = () => {
      window.electronAPI!.fs.writeFile(`${dir}/${session.id}.json`, sessionJson).catch(() => {});
      this.writeSessionsIndex(dir);
    };
    if (this.sessionsDirEnsured) {
      doWrite();
    } else {
      window.electronAPI?.fs.mkdir(dir)
        .then(() => { this.sessionsDirEnsured = true; doWrite(); })
        .catch(() => {});
    }
  }

  private updateCurrentSession(): void {
    if (!this.currentSessionId) return;
    this.saveSessionById(this.currentSessionId, this.messages);
  }

  private newSession(): void {
    this.updateCurrentSession();
    const session: Session = {
      id: this.generateId(),
      title: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      context: [],
    };
    this.sessions.unshift(session);
    this.currentSessionId = session.id;
    this.showWelcome();
    this.renderMessages();
    this.syncFloatPreviewToMessages();
    this.renderSessionsList();
    this.saveSessions();
  }

  private switchSession(id: string): void {
    if (this.isLoading) return;
    if (id === this.currentSessionId) { this.sessionsPanelEl.classList.remove('is-visible'); return; }
    this.updateCurrentSession();
    this.currentSessionId = id;
    const session = this.sessions.find(s => s.id === id);
    if (!session) return;
    this.messages = [...session.messages];
    if (this.messages.length === 0) this.showWelcome();
    this.renderMessages();
    this.syncFloatPreviewToMessages();
    this.renderSessionsList();
    this.sessionsPanelEl.classList.remove('is-visible');
    this.saveSessions();
  }

  private deleteSession(id: string): void {
    const dir = this.getSessionsDir();
    if (dir) window.electronAPI?.fs.delete(`${dir}/${id}.json`).catch(() => {});
    this.sessions = this.sessions.filter(s => s.id !== id);
    if (this.sessions.length === 0) {
      this.initFirstSession();
      this.showWelcome();
      this.renderMessages();
    } else if (id === this.currentSessionId) {
      this.currentSessionId = this.sessions[0].id;
      this.messages = [...this.sessions[0].messages];
      this.renderMessages();
    }
    this.renderSessionsList();
    this.saveSessions();
  }

  private renderSessionsList(): void {
    if (!this.sessionsListEl) return;
    const now = Date.now();
    if (this.sessions.length === 0) {
      this.sessionsListEl.innerHTML = '<div class="ai-sessions-empty">No sessions</div>';
      return;
    }
    this.sessionsListEl.innerHTML = this.sessions.map(s => {
      const title = this.getSessionTitle(s);
      const age = this.formatAge(s.updatedAt, now);
      const active = s.id === this.currentSessionId;
      return `<div class="ai-session-item${active ? ' is-active' : ''}" data-id="${s.id}">
        <div class="ai-session-info">
          <span class="ai-session-title">${this.escapeHtml(title)}</span>
          <span class="ai-session-age">${age}</span>
        </div>
        <button class="ai-session-delete" data-id="${s.id}" title="Delete">&times;</button>
      </div>`;
    }).join('');

    this.sessionsListEl.querySelectorAll<HTMLElement>('.ai-session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.ai-session-delete')) return;
        this.switchSession(item.dataset.id!);
      });
    });
    this.sessionsListEl.querySelectorAll<HTMLButtonElement>('.ai-session-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSession(btn.dataset.id!);
      });
    });
  }

  private formatAge(ts: number, now: number): string {
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

  private render(): void {
    this.el.innerHTML = `
      <div class="ai-drawer-content">
        <div class="ai-drawer-header">
          <div class="ai-drawer-header-row">
            <span class="ai-drawer-title">COCKPIT AGENT</span>
            <button class="ai-drawer-close-btn" aria-label="Close AI panel" title="Close">&#x2715;</button>
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
        <div class="ai-queue-bar" style="display:none"></div>
        <div class="ai-token-progress">
          <div class="ai-token-progress-fill" style="width: 0%"></div>
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
            <input class="ai-settings-input" type="text" value="${this.escapeHtml(this.endpoint)}" data-key="endpoint" placeholder="https://api.openai.com/v1">
          </label>
          <label class="ai-settings-label">
            API Key
            <input class="ai-settings-input" type="password" value="${this.escapeHtml(this.apiKey)}" data-key="apiKey" placeholder="sk-...">
          </label>
          <label class="ai-settings-label">
            Model
            <select class="ai-settings-select" data-key="model-select">
              <optgroup label="Zen">
                ${AiDrawer.ZEN_MODELS.filter(m => m.group === 'free').map(m => `<option value="${m.id}">${this.escapeHtml(m.label)}</option>`).join('')}
              </optgroup>
              <optgroup label="Go">
                ${AiDrawer.ZEN_MODELS.filter(m => m.group === 'paid').map(m => `<option value="${m.id}">${this.escapeHtml(m.label)}</option>`).join('')}
              </optgroup>
              <option value="__custom__">Custom…</option>
            </select>
            <input class="ai-settings-input" type="text" data-key="model-custom" style="display:none" placeholder="deepseek-v4-flash">
          </label>
          <label class="ai-settings-label ai-settings-checkbox">
            <input class="ai-settings-input" type="checkbox" ${this.streamResponses ? 'checked' : ''} data-key="stream">
            Stream responses
          </label>
          <label class="ai-settings-label">
            Context limit (tokens)
            <input class="ai-settings-input" type="number" min="1024" step="1024" value="${this.contextTokenLimit}" data-key="contextLimit" placeholder="8192">
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

    this.bodyEl = this.el.querySelector('.ai-drawer-body')!;
    this.messagesEl = this.el.querySelector('.ai-chat-messages')!;
    this.inputEl = this.el.querySelector('.ai-chat-input')!;
    this.sendBtn = this.el.querySelector('.ai-chat-send-btn')!;
    this.abortBtn = this.el.querySelector('.ai-chat-abort-btn')!;
    this.steerBtn = this.el.querySelector('.ai-chat-steer-btn')!;
    this.queueBarEl = this.el.querySelector('.ai-queue-bar')!;
    this.settingsEl = this.el.querySelector('.ai-drawer-settings')!;
    this.sessionsPanelEl = this.el.querySelector('.ai-sessions-panel')!;
    this.sessionsListEl = this.el.querySelector('.ai-sessions-list')!;
    this.loadingEl = this.el.querySelector('.ai-chat-loading')!;
    this.stepControlsEl = this.el.querySelector('.ai-step-controls')!;
    this.stepLabelEl = this.el.querySelector('.ai-step-label')!;
    this.stepContinueBtn = this.el.querySelector('.ai-step-continue-btn')!;
    this.stepStopBtn = this.el.querySelector('.ai-step-stop-btn')!;
    this.tokenProgressFillEl = this.el.querySelector('.ai-token-progress-fill')!;
    this.tokenProgressLabelEl = this.el.querySelector('.ai-token-progress-label')!;
    this.slashPopupEl = this.el.querySelector('.ai-slash-popup')!;
    this.slashListEl = this.el.querySelector('.ai-slash-list')!;
    this.slashEmptyEl = this.el.querySelector('.ai-slash-empty')!;
    this.inputAreaEl = this.el.querySelector('.ai-chat-input-area')!;
    this.inputModeBtn = this.el.querySelector('.ai-input-mode-btn')!;
    this.drawerContentEl = this.el.querySelector('.ai-drawer-content')!;
    this.detachBtn = this.el.querySelector('.ai-chat-detach-btn')!;

    this.bindEvents();
    this.renderMessages();
  }

  private formatBody(content: string): string {
    // Escape all HTML first so raw LLM output can never inject tags.
    // Backticks and asterisks are not HTML-special — patterns still match below.
    return this.escapeHtml(content)
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_: string, lang: string, code: string) => {
        // code is already escaped; lang is \w* so safe in class attribute
        return `<pre class="ai-chat-code"><code class="${lang ? `lang-${lang}` : ''}">${code.trim()}</code></pre>`;
      })
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  private bindEvents(): void {
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.detachBtn.addEventListener('click', () => this.detach());
    this.el.querySelector('.ai-drawer-close-btn')?.addEventListener('click', () => this.close());
    this.inputEl.addEventListener('input', () => this.handleInput());
    this.inputEl.addEventListener('keydown', (e) => {
      if (this.isSlashPopupOpen()) {
        this.handleSlashKeydown(e);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        this.handleHistoryNav(e);
      }
    });
    this.steerBtn.addEventListener('click', () => this.submitSteer());

    // Mode selector — cycles auto → plan → step
    this.inputModeBtn.addEventListener('click', () => {
      const order: Array<'auto' | 'plan' | 'step'> = ['auto', 'plan', 'step'];
      this.agentMode = order[(order.indexOf(this.agentMode) + 1) % order.length];
      this.inputModeBtn.textContent = this.agentMode.toUpperCase();
    });

    // Step controls
    this.stepContinueBtn.addEventListener('click', () => {
      this.stepControlsEl.classList.remove('is-visible');
      this.continueResolve?.();
    });
    this.stepStopBtn.addEventListener('click', () => {
      this.abortRequested = true;
      this.fetchController?.abort();
      this.stepControlsEl.classList.remove('is-visible');
      this.continueResolve?.();
    });

    // Abort button
    this.abortBtn.addEventListener('click', () => {
      this.abortRequested = true;
      this.fetchController?.abort();
      this.stepControlsEl.classList.remove('is-visible');
      this.continueResolve?.();
    });

    // Sessions panel
    const sessionsBtn = this.el.querySelector('.ai-sessions-btn')!;
    sessionsBtn.addEventListener('click', () => {
      if (this.isDetached) this.ensureDrawerOpen();
      const opening = !this.sessionsPanelEl.classList.contains('is-visible');
      this.settingsEl.classList.remove('is-visible');
      this.sessionsPanelEl.classList.toggle('is-visible');
      if (opening) this.renderSessionsList();
    });
    this.el.querySelector('.ai-sessions-close')!.addEventListener('click', () => {
      this.sessionsPanelEl.classList.remove('is-visible');
    });
    this.el.querySelector('.ai-new-session-btn')!.addEventListener('click', () => {
      this.newSession();
      this.sessionsPanelEl.classList.remove('is-visible');
    });

    const settingsBtn = this.el.querySelector('.ai-drawer-settings-btn')!;
    settingsBtn.addEventListener('click', () => {
      if (this.isDetached) this.ensureDrawerOpen();
      this.sessionsPanelEl.classList.remove('is-visible');
      this.settingsEl.classList.toggle('is-visible');
    });

    const closeBtn = this.el.querySelector('.ai-settings-close')!;
    closeBtn.addEventListener('click', () => {
      this.settingsEl.classList.remove('is-visible');
    });

    this.settingsEl.addEventListener('click', (e) => {
      if (e.target === this.settingsEl) {
        this.settingsEl.classList.remove('is-visible');
      }
    });

    // Model select change handler — show/hide custom input + auto-detect endpoint for Zen models
    const modelSelect = this.el.querySelector<HTMLSelectElement>('.ai-settings-select[data-key="model-select"]')!;
    const modelCustomInput = this.el.querySelector<HTMLInputElement>('.ai-settings-input[data-key="model-custom"]')!;
    modelSelect.addEventListener('change', () => {
      const isCustom = modelSelect.value === '__custom__';
      modelCustomInput.style.display = isCustom ? 'block' : 'none';
      if (!isCustom) {
        const entry = AiDrawer.ZEN_MODELS.find(m => m.id === modelSelect.value);
        this.endpoint = entry?.group === 'free'
          ? 'https://opencode.ai/zen/v1'
          : 'https://opencode.ai/zen/go/v1';
        const epInput = this.el.querySelector<HTMLInputElement>('.ai-settings-input[data-key="endpoint"]');
        if (epInput) epInput.value = this.endpoint;
        if (entry) {
          const ctxInput = this.el.querySelector<HTMLInputElement>('.ai-settings-input[data-key="contextLimit"]');
          if (ctxInput) {
            this.contextTokenLimit = entry.maxContext;
            ctxInput.value = String(entry.maxContext);
            ctxInput.max = String(entry.maxContext);
          }
        }
      }
    });

    const saveBtn = this.el.querySelector('.ai-settings-save')!;
    saveBtn.addEventListener('click', () => {
      const modelSelect = this.settingsEl.querySelector<HTMLSelectElement>('.ai-settings-select[data-key="model-select"]');
      const modelCustomInput = this.settingsEl.querySelector<HTMLInputElement>('.ai-settings-input[data-key="model-custom"]');
      const inputs = this.settingsEl.querySelectorAll<HTMLInputElement>('.ai-settings-input');
      inputs.forEach((input) => {
        const key = input.dataset.key;
        if (key === 'endpoint') this.endpoint = input.value;
        else if (key === 'apiKey') this.apiKey = input.value;
        else if (key === 'stream') this.streamResponses = input.checked;
        else if (key === 'contextLimit') {
          const parsed = parseInt(input.value, 10);
          let limit = isNaN(parsed) || parsed < 1024 ? 8192 : parsed;
          const modelEntry = modelSelect && modelSelect.value !== '__custom__'
            ? AiDrawer.ZEN_MODELS.find(m => m.id === modelSelect.value)
            : undefined;
          if (modelEntry && limit > modelEntry.maxContext) {
            limit = modelEntry.maxContext;
          }
          this.contextTokenLimit = limit;
        }
      });
      if (modelSelect) {
        if (modelSelect.value === '__custom__') {
          const customVal = modelCustomInput?.value.trim();
          if (customVal) this.model = customVal;
        } else {
          this.model = modelSelect.value;
        }
      }
      this.saveSettings();
      this.settingsEl.classList.remove('is-visible');
    });
  }

  private renderMessages(): void {
    if (this.messages.length === 0) {
      this.messagesEl.innerHTML = `<div class="ai-chat-empty">
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
    this.messagesEl.innerHTML = this.messages.map((m, i) => this.renderMessage(m, i)).join('');
    // Mark only the last message for entrance animation; previous messages render instantly
    const last = this.messagesEl.lastElementChild as HTMLElement | null;
    if (last) last.classList.add('is-new');
    this.bindMessageActions();
    this.renderTokenUsage();
    // Defer scroll so browser has painted the new content and scrollHeight is final
    requestAnimationFrame(() => {
      this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
    });
  }

  /**
   * Partially update a single streaming message in place instead of re-rendering
   * the whole list. This preserves selection and avoids flicker while chunks arrive.
   */
  private updateStreamingMessage(index: number): void {
    const msg = this.messages[index];
    const el = this.messagesEl.querySelector(`[data-msg-index="${index}"]`) as HTMLElement | null;
    if (!msg || !el) return;

    if (msg.role === 'thinking') {
      const body = el.querySelector('.ai-thinking-body') as HTMLElement | null;
      if (body) body.innerHTML = this.formatBody(msg.content);
    } else {
      const text = el.querySelector('.ai-chat-msg-text') as HTMLElement | null;
      if (text) text.innerHTML = this.renderMessageText(msg);
    }

    if (this.isDetached && msg.content) {
      this.updateFloatPreview('stream', msg.content);
    }

    requestAnimationFrame(() => {
      this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
    });
  }

  private renderMessageText(m: ChatMessage): string {
    if ((m.role === 'assistant' || m.role === 'user') && !m.content) {
      return '<span class="ai-chat-msg-loading"><span></span><span></span><span></span></span>';
    }
    return this.formatBody(m.content);
  }

  private renderMessage(m: ChatMessage, index = 0): string {
    if (m.role === 'tool') {
      const name = m.toolName || '';
      const pending = m.toolResult === undefined;
      const resultHtml = pending
        ? `<div class="ai-tool-result ai-tool-result-pending">running…</div>`
        : `<pre class="ai-tool-result">${this.escapeHtml(m.toolResult!)}</pre>`;
      return `<div class="ai-chat-msg ai-chat-msg-tool" data-msg-index="${index}"><details class="ai-tool-details"${pending ? ' open' : ''}><summary class="ai-tool-chip"><span class="ai-tool-icon">⚙</span><span class="ai-tool-name">${this.escapeHtml(name)}</span><span class="ai-tool-args">${this.escapeHtml(m.content)}</span><span class="ai-tool-toggle">▸</span></summary>${resultHtml}</details></div>`;
    }

    if (m.role === 'thinking') {
      const body = this.formatBody(m.content);
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
            ${m.role === 'assistant' ? `<button class="ai-chat-copy-btn" data-msg-index="${index}" title="Copy code">&#x2398;</button>` : ''}
          </div>
        </div>
      </div>`;
  }

  private bindMessageActions(): void {
    this.messagesEl.querySelectorAll<HTMLButtonElement>('.ai-chat-copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.msgIndex ?? '-1', 10);
        const msg = idx >= 0 ? this.messages[idx] : undefined;
        if (msg) {
          const codeMatch = msg.content.match(/```\w*\n([\s\S]*?)```/);
          const text = codeMatch ? codeMatch[1].trim() : msg.content;
          navigator.clipboard.writeText(text).catch(() => {});
        }
      });
    });
  }

  private submitSteer(): void {
    const text = this.inputEl.value.trim();
    if (!text || !this.isLoading) return;
    this.historyIndex = -1;
    this.inputEl.value = '';
    this.steeringMessage = text;
    this.messages.push({ role: 'user', content: text, timestamp: Date.now(), isSteer: true });
    this.renderMessages();
    requestAnimationFrame(() => { this.bodyEl.scrollTop = this.bodyEl.scrollHeight; });
  }

  private queueMessage(text: string): void {
    this.promptQueue.push(text);
    this.renderQueueBar();
  }

  private processQueue(): void {
    if (this.promptQueue.length === 0 || this.isLoading) return;
    const next = this.promptQueue.shift()!;
    this.renderQueueBar();
    this.runMessage(next);
  }

  private renderQueueBar(): void {
    if (!this.queueBarEl) return;
    if (this.promptQueue.length === 0) {
      this.queueBarEl.classList.remove('is-visible');
      this.queueBarEl.innerHTML = '';
      return;
    }
    this.queueBarEl.innerHTML = `
      <div class="ai-queue-bar-inner">
        <div class="ai-queue-header">
          <span class="ai-queue-label">&#x25B8; ${this.promptQueue.length} queued</span>
          <button class="ai-queue-clear" title="Clear queue">&times; Clear all</button>
        </div>
        ${this.promptQueue.map((q, i) => `
          <div class="ai-queue-item">
            <span class="ai-queue-text">${this.escapeHtml(q.slice(0, 60))}${q.length > 60 ? '…' : ''}</span>
            <button class="ai-queue-remove" data-index="${i}">&times;</button>
          </div>
        `).join('')}
      </div>
    `;
    this.queueBarEl.classList.add('is-visible');
    this.queueBarEl.querySelector('.ai-queue-clear')!.addEventListener('click', () => {
      this.promptQueue = [];
      this.renderQueueBar();
    });
    this.queueBarEl.querySelectorAll<HTMLButtonElement>('.ai-queue-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index!);
        this.promptQueue.splice(idx, 1);
        this.renderQueueBar();
      });
    });
  }

  private async runMessage(text: string): Promise<void> {
    if (!this.apiKey) await this.loadSettings();

    const pinnedSessionId = this.currentSessionId;

    if (this.isDetached) this.updateFloatPreview('hidden');
    this.messages.push({ role: 'user', content: text, timestamp: Date.now() });
    this.renderMessages();
    this.renderTokenUsage();

    await this.maybeAutoCompact();

    if (!this.apiKey) {
      this.messages.push({
        role: 'assistant',
        content: '**No API key configured.** Open settings (gear icon) and add your API key.',
        timestamp: Date.now(),
      });
      this.renderMessages();
      return;
    }

    this.setLoading(true);
    try {
      const response = await this.callLLMWithTools(text);
      // null means streaming already finalized the message in-place — don't double-push
      if (response !== null) {
        this.messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
      }
    } catch (err: any) {
      this.messages.push({
        role: 'assistant',
        content: `**Error:** ${this.escapeHtml(err.message || 'Unknown error')}`,
        timestamp: Date.now(),
      });
    }
    this.setLoading(false);
    this.renderMessages();
    this.renderTokenUsage();
    this.saveSessionById(pinnedSessionId, this.messages);
  }

  private saveSessionById(id: string, messages: ChatMessage[]): void {
    const idx = this.sessions.findIndex(s => s.id === id);
    if (idx === -1) return;
    this.sessions[idx].messages = messages.map(m => ({ ...m }));
    this.sessions[idx].updatedAt = Date.now();
    this.saveSessions();
  }

  private getActiveSession(): Session | undefined {
    return this.sessions.find(s => s.id === this.currentSessionId);
  }

  private buildSystemPrompt(wsPath: string): string {
    const parts = [AGENT_SYSTEM_PROMPT];
    if (wsPath) parts.push(`Workspace: ${wsPath}`);
    parts.push(memoryStore.buildIndexPrompt());
    parts.push(ORCHESTRATION_SECTION);
    return parts.join('\n\n');
  }

  private estimateContextTokens(): number {
    const hasUserMessages = this.messages.some(m => m.role === 'user');
    if (!hasUserMessages) return 0;
    const session = this.getActiveSession();
    const ctx = getToolContext();
    const wsPath = ctx?.cockpit.getWorkspacePath() || '';
    const base = [
      { role: 'system', content: this.buildSystemPrompt(wsPath) },
    ];
    if (session?.context && session.context.length > 0) {
      return estimateMessagesTokens([...base, ...session.context]);
    }
    const history = this.messages.filter(m =>
      m.role === 'user' || m.role === 'assistant' || m.role === 'tool'
    );
    return estimateMessagesTokens([...base, ...history]);
  }

  private formatTokenCount(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  private renderTokenUsage(): void {
    const used = this.estimateContextTokens();
    const budget = checkContextBudget(used, this.contextTokenLimit);
    const pct = Math.min(budget.percent, 100);
    const label = `${used.toLocaleString()} / ${budget.limit.toLocaleString()} (${budget.percent}%)`;
    if (this.tokenProgressFillEl) {
      this.tokenProgressFillEl.style.width = `${pct}%`;
      this.tokenProgressFillEl.classList.toggle('is-high', budget.percent >= 80);
    }
    if (this.tokenProgressLabelEl) {
      this.tokenProgressLabelEl.textContent = label;
    }
  }

  /**
   * Summarize the current conversation using a short, non-stored LLM call and
   * store the result as the session's compacted context. Subsequent LLM turns
   * will use this context in place of the full message history.
   */
  async compactSession(): Promise<void> {
    const session = this.getActiveSession();
    if (!session) return;

    const conversation = this.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role}: ${m.content}`)
      .join('\n\n');

    if (!conversation.trim()) {
      this.messages.push({
        role: 'system',
        content: 'Nothing to compact yet.',
        timestamp: Date.now(),
      });
      this.renderMessages();
      return;
    }

    const summaryMessages: LLMMessage[] = [
      {
        role: 'system',
        content: 'Summarize the following conversation into a concise context that captures the user\'s goals, decisions, and any incomplete work. Omit pleasantries. Keep the summary short but actionable.',
      },
      { role: 'user', content: conversation },
    ];

    const client = new LLMClient({ endpoint: this.endpoint, apiKey: this.apiKey, model: this.model });
    let summary = '';
    try {
      if (this.streamResponses) {
        summary = await this.streamPlainText(client, summaryMessages, 1024);
      } else {
        summary = await client.complete(summaryMessages);
      }
    } catch (err: any) {
      this.messages.push({
        role: 'system',
        content: `**Compaction failed:** ${this.escapeHtml(err.message || 'Unknown error')}`,
        timestamp: Date.now(),
      });
      this.renderMessages();
      return;
    }

    if (!summary.trim()) {
      summary = 'No summary generated.';
    }

    session.context = [{ role: 'system', content: `Previous conversation summary:\n\n${summary}` }];
    this.messages.push({
      role: 'system',
      content: 'Context compacted. Continuing from summary.',
      timestamp: Date.now(),
    });
    this.renderMessages();
    this.updateCurrentSession();
    this.renderTokenUsage();
  }

  private async maybeAutoCompact(): Promise<void> {
    const used = this.estimateContextTokens();
    const budget = checkContextBudget(used, this.contextTokenLimit);
    if (!budget.shouldCompact) return;
    await this.compactSession();
  }

  private buildHistoryForLLM(): LLMMessage[] {
    const session = this.getActiveSession();
    if (session?.context && session.context.length > 0) {
      return session.context.map(m => ({ role: m.role, content: m.content || '' }));
    }
    return this.messages
      .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } =>
        m.role === 'user' || m.role === 'assistant'
      )
      .map(m => ({ role: m.role, content: m.content }));
  }

  private async sendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.historyIndex = -1;

    // Exact slash command (e.g. "/new" or "/new  ") bypasses the LLM.
    const slashCmd = this.slashCommands.find(cmd => text === cmd.label || text === `/${cmd.name}`);
    if (slashCmd) {
      this.inputEl.value = '';
      await this.executeSlashCommand(slashCmd);
      return;
    }

    // While loading: queue the message instead of running immediately
    if (this.isLoading) {
      this.inputEl.value = '';
      this.queueMessage(text);
      return;
    }

    this.inputEl.value = '';
    this.runMessage(text);
  }

  // ── Slash command autocomplete ──────────────────────────────────────────────

  registerSlashCommand(cmd: SlashCommand): void {
    const existing = this.slashCommands.findIndex(c => c.name === cmd.name);
    if (existing !== -1) {
      this.slashCommands[existing] = cmd;
    } else {
      this.slashCommands.push(cmd);
    }
  }

  private registerDefaultSlashCommands(): void {
    this.slashCommands = [];
    this.registerSlashCommand({
      name: 'new',
      label: '/new',
      description: 'Start a new session',
      action: () => this.newSession(),
    });
    this.registerSlashCommand({
      name: 'opencode',
      label: '/opencode',
      description: 'Open a terminal and run opencode',
      action: () => this.runOpencode(),
    });
    this.registerSlashCommand({
      name: 'compact',
      label: '/compact',
      description: 'Summarize conversation into compact context',
      action: () => this.compactSession(),
    });
    this.registerSlashCommand({
      name: 'exit',
      label: '/exit',
      description: 'Close the entire application',
      action: () => window.electronAPI?.window.close(),
    });
  }

  private async runOpencode(): Promise<void> {
    const cockpit = (window as any).__cockpit;
    if (!cockpit || typeof cockpit.addTerminal !== 'function') {
      throw new Error('Canvas not ready');
    }
    const uuid = await cockpit.addTerminal();
    if (cockpit.writeToTerminal) {
      cockpit.writeToTerminal(uuid, 'opencode');
    }
  }

  // Shell-style history recall: ArrowUp on first line / ArrowDown on last line
  private handleHistoryNav(e: KeyboardEvent): void {
    const input = this.inputEl;
    const history = this.messages.filter(m => m.role === 'user').map(m => m.content);
    if (history.length === 0) return;

    if (e.key === 'ArrowUp') {
      // Only recall when caret sits on the first line
      if (input.value.slice(0, input.selectionStart ?? 0).includes('\n')) return;
      if (this.historyIndex === -1) {
        this.historyDraft = input.value;
        this.historyIndex = history.length - 1;
      } else if (this.historyIndex > 0) {
        this.historyIndex--;
      }
    } else {
      if (this.historyIndex === -1) return;
      // Only advance when caret sits on the last line
      if (input.value.slice(input.selectionEnd ?? 0).includes('\n')) return;
      this.historyIndex++;
      if (this.historyIndex >= history.length) {
        this.historyIndex = -1;
        input.value = this.historyDraft;
        e.preventDefault();
        return;
      }
    }
    input.value = history[this.historyIndex];
    e.preventDefault();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  private handleInput(): void {
    this.historyIndex = -1; // typing starts a fresh draft
    const value = this.inputEl.value;
    if (value.startsWith('/')) {
      this.openSlashPopup(value);
    } else {
      this.closeSlashPopup();
    }
  }

  private isSlashPopupOpen(): boolean {
    return this.slashPopupEl?.style.display !== 'none';
  }

  private openSlashPopup(value: string): void {
    const query = value.slice(1).toLowerCase();
    this.slashFiltered = this.slashCommands.filter(cmd =>
      cmd.label.toLowerCase().startsWith('/' + query)
    );
    this.slashSelectedIndex = this.slashFiltered.length > 0 ? 0 : -1;
    this.renderSlashPopup();
    this.slashPopupEl.style.display = 'flex';
  }

  private closeSlashPopup(): void {
    if (!this.slashPopupEl) return;
    this.slashPopupEl.style.display = 'none';
    this.slashFiltered = [];
    this.slashSelectedIndex = -1;
  }

  private renderSlashPopup(): void {
    this.slashListEl.innerHTML = '';
    if (this.slashFiltered.length === 0) {
      this.slashListEl.style.display = 'none';
      this.slashEmptyEl.style.display = '';
      return;
    }
    this.slashListEl.style.display = '';
    this.slashEmptyEl.style.display = 'none';
    this.slashFiltered.forEach((cmd, i) => {
      const item = document.createElement('div');
      item.className = 'ai-slash-item' + (i === this.slashSelectedIndex ? ' is-selected' : '');
      item.dataset.command = cmd.name;
      item.innerHTML = `
        <span class="ai-slash-name">${this.escapeHtml(cmd.label)}</span>
        <span class="ai-slash-desc">${this.escapeHtml(cmd.description)}</span>
      `;
      item.addEventListener('mouseenter', () => {
        this.slashSelectedIndex = i;
        this.updateSlashSelection();
      });
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.autocompleteSlashCommand(cmd);
      });
      this.slashListEl.appendChild(item);
    });
  }

  private updateSlashSelection(): void {
    const items = this.slashListEl.querySelectorAll('.ai-slash-item');
    items.forEach((item, i) => {
      (item as HTMLElement).classList.toggle('is-selected', i === this.slashSelectedIndex);
    });
    const selected = items[this.slashSelectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }

  private handleSlashKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.slashFiltered.length > 0) {
        this.slashSelectedIndex = (this.slashSelectedIndex + 1) % this.slashFiltered.length;
        this.updateSlashSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.slashFiltered.length > 0) {
        this.slashSelectedIndex = (this.slashSelectedIndex - 1 + this.slashFiltered.length) % this.slashFiltered.length;
        this.updateSlashSelection();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = this.slashFiltered[this.slashSelectedIndex];
      if (cmd && this.inputMatchesSlashCommand(cmd)) {
        this.executeSlashCommand(cmd);
      } else {
        this.closeSlashPopup();
        this.sendMessage();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const cmd = this.slashFiltered[this.slashSelectedIndex];
      if (cmd) this.autocompleteSlashCommand(cmd);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.closeSlashPopup();
    }
  }

  private autocompleteSlashCommand(cmd: SlashCommand): void {
    this.inputEl.value = cmd.label;
    this.handleInput();
    this.inputEl.focus();
  }

  private inputMatchesSlashCommand(cmd: SlashCommand): boolean {
    const value = this.inputEl.value.trim();
    return value === cmd.label || value === `/${cmd.name}`;
  }

  private async executeSlashCommand(cmd: SlashCommand): Promise<void> {
    this.inputEl.value = '';
    this.closeSlashPopup();
    try {
      await cmd.action();
    } catch (err) {
      // Surface command errors as a transient system message.
      this.messages.push({
        role: 'system',
        content: `**/${cmd.name} failed:** ${this.escapeHtml((err as Error).message || 'Unknown error')}`,
        timestamp: Date.now(),
      });
      this.renderMessages();
    }
  }

  private ensureDrawerOpen(): void {
    if (!this.el.classList.contains('is-open')) {
      this.open();
    }
  }

  detach(): void {
    if (this.isDetached) return;
    this.isDetached = true;

    this.floatEl = document.createElement('div');
    this.floatEl.className = 'ai-float-input';

    // Inject dock button into input toolbar (takes detach button's slot)
    this.dockBtnEl = document.createElement('button');
    this.dockBtnEl.className = 'ai-float-dock-btn';
    this.dockBtnEl.setAttribute('title', 'Dock back to panel');
    this.dockBtnEl.innerHTML = '&#x2935;';
    this.dockBtnEl.addEventListener('click', () => this.attach());
    this.inputAreaEl.querySelector('.ai-input-toolbar-left')!.appendChild(this.dockBtnEl);

    // Move step controls and input area into float (header stays docked)
    this.floatEl.appendChild(this.stepControlsEl);
    this.floatPreviewEl = document.createElement('div');
    this.floatPreviewEl.className = 'ai-float-preview';
    this.floatPreviewEl.style.display = 'none';
    // Delegated so the close button survives innerHTML rewrites
    this.floatPreviewEl.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.ai-float-preview-close')) this.updateFloatPreview('hidden');
    });
    this.floatEl.appendChild(this.floatPreviewEl);
    this.floatEl.appendChild(this.inputAreaEl);

    this.detachBtn.style.display = 'none';
    this.wrapper.appendChild(this.floatEl);
    this.updateFloatPosition();
    this.floatResizeHandler = () => this.updateFloatPosition();
    window.addEventListener('resize', this.floatResizeHandler);
    this.inputEl.focus();
    this.onDetachChange?.(true);
  }

  attach(): void {
    if (!this.isDetached || !this.floatEl) return;
    this.isDetached = false;

    if (this.floatResizeHandler) {
      window.removeEventListener('resize', this.floatResizeHandler);
      this.floatResizeHandler = null;
    }

    // Remove injected dock button
    this.dockBtnEl?.remove();
    this.dockBtnEl = null;

    this.floatPreviewEl?.remove();
    this.floatPreviewEl = null;
    // Restore drawer order: step controls before queue bar, input last
    this.drawerContentEl.insertBefore(this.stepControlsEl, this.queueBarEl);
    this.drawerContentEl.appendChild(this.inputAreaEl);

    this.detachBtn.style.display = '';
    this.floatEl.remove();
    this.floatEl = null;
    this.onDetachChange?.(false);
  }

  private updateFloatPreview(state: 'loading' | 'stream' | 'done' | 'hidden', text?: string): void {
    const el = this.floatPreviewEl;
    if (!el) return;
    if (state === 'hidden') {
      el.style.display = 'none';
      el.className = 'ai-float-preview';
      el.textContent = '';
      return;
    }
    el.style.display = '';
    if (state === 'loading') {
      el.className = 'ai-float-preview is-loading';
      el.innerHTML = '<span class="ai-chat-loading-dot"></span><span class="ai-chat-loading-dot"></span><span class="ai-chat-loading-dot"></span>';
    } else {
      el.className = state === 'stream' ? 'ai-float-preview is-stream' : 'ai-float-preview is-done';
      el.innerHTML = `<button class="ai-float-preview-close" aria-label="Clear response" title="Clear response">&#215;</button><div class="ai-float-preview-body">${this.formatBody(text || '')}</div>`;
      if (state === 'stream') {
        const body = el.querySelector('.ai-float-preview-body')!;
        body.scrollTop = body.scrollHeight;
      }
    }
  }

  /** Keep detached float card in sync with the active session transcript. */
  private syncFloatPreviewToMessages(): void {
    if (!this.isDetached || this.isLoading) return;
    const last = [...this.messages].reverse().find(m => m.role === 'assistant');
    const text = last?.content ?? '';
    this.updateFloatPreview(text.length > 0 ? 'done' : 'hidden', text);
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.loadingEl.style.display = loading ? 'flex' : 'none';
    this.sendBtn.style.display = loading ? 'none' : 'flex';
    this.abortBtn.style.display = loading ? 'flex' : 'none';
    this.steerBtn.style.display = loading ? 'flex' : 'none';
    this.notch.classList.toggle('is-loading', loading);
    this.el.classList.toggle('is-loading', loading);
    this.inputEl.placeholder = loading
      ? 'Queue next message (Enter) or steer agent (↳)…'
      : 'Ask the agent to do something…';
    if (this.isDetached) {
      if (loading) {
        this.updateFloatPreview('loading');
      } else {
        this.syncFloatPreviewToMessages();
      }
    }
    if (!loading) {
      this.abortRequested = false;
      this.fetchController = null;
      this.steeringMessage = null;
      this.stepControlsEl.classList.remove('is-visible');
      this.renderQueueBar();
      this.processQueue();
    }
  }

  private waitForAction(label: string): Promise<boolean> {
    return new Promise(resolve => {
      this.stepLabelEl.textContent = label;
      this.stepControlsEl.classList.add('is-visible');
      this.continueResolve = () => {
        this.continueResolve = null;
        resolve(!this.abortRequested);
      };
    });
  }

  /**
   * Backward-compatible wrapper used by tests and the agent loop.
   * Delegates to the shared tool executor with the current IDE context.
   */
  private async executeTool(name: string, args: Record<string, any>): Promise<string> {
    if (!this.toolRegistry.has(name)) {
      return `Unknown tool: ${name}`;
    }
    const ctx = getToolContext();
    if (!ctx) return 'Canvas not ready';
    const result = await executeToolCall(this.toolRegistry, name, JSON.stringify(args), ctx);
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

  private async callLLMWithTools(userMessage: string): Promise<string | null> {
    const ctx = getToolContext();
    const wsPath = ctx?.cockpit.getWorkspacePath() || '';

    const systemContent = this.buildSystemPrompt(wsPath);

    const apiMessages: LLMMessage[] = [
      { role: 'system', content: systemContent },
    ];

    const history = this.buildHistoryForLLM();
    for (const m of history) {
      apiMessages.push({ role: m.role, content: m.content });
    }
    const last = apiMessages[apiMessages.length - 1];
    if (!last || last.role !== 'user') {
      apiMessages.push({ role: 'user', content: userMessage });
    }

    const client = new LLMClient({ endpoint: this.endpoint, apiKey: this.apiKey, model: this.model });
    const tools = this.toolRegistry.toOpenAISchemas();

    // PLAN mode: first get a plain text plan, then ask user to confirm before executing
    if (this.agentMode === 'plan') {
      this.fetchController = new AbortController();
      try {
        const planMessages: LLMMessage[] = [
          ...apiMessages,
          { role: 'user', content: 'Before using any tools, write a numbered step-by-step plan of what you will do. Do NOT call any tools yet — only write the plan.' },
        ];
        let planText: string;
        if (this.streamResponses) {
          // keepAsRole:'thinking' converts the placeholder in-place — no splice flash
          planText = await this.streamPlainText(client, planMessages, 1024, 'thinking');
          // Add the Plan header to match the non-streaming rendering
          const thinkingMsg = this.messages[this.messages.length - 1];
          if (thinkingMsg?.role === 'thinking' && planText) {
            thinkingMsg.content = `**Plan**\n\n${planText}`;
            this.renderMessages();
          }
        } else {
          planText = (await client.chatCompletion({
            messages: planMessages,
            temperature: 0.2,
            max_tokens: 1024,
            signal: this.fetchController.signal,
          })).choices?.[0]?.message?.content || 'No plan generated.';
          this.messages.push({ role: 'thinking', content: `**Plan**\n\n${planText}`, timestamp: Date.now() });
          this.renderMessages();
        }

        const proceed = await this.waitForAction('Approve plan to execute?');
        if (!proceed || this.abortRequested) return 'Aborted.';

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
    for (;;) {
      if (this.abortRequested) return 'Aborted.';

      this.fetchController = new AbortController();

      let toolCalls: LLMToolCall[] | null = null;
      let streamedContent = '';
      let placeholderIndex = -1;

      try {
        if (this.streamResponses) {
          placeholderIndex = this.messages.length;
          this.messages.push({ role: 'assistant', content: '', timestamp: Date.now() });
          this.renderMessages();

          for await (const event of client.streamChatCompletion({
            messages: apiMessages,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: 4096,
            signal: this.fetchController.signal,
          })) {
            if (this.abortRequested) break;

            if (event.type === 'content') {
              streamedContent += event.delta;
              if (this.messages[placeholderIndex]) {
                this.messages[placeholderIndex].content = streamedContent;
                this.updateStreamingMessage(placeholderIndex);
              }
            } else if (event.type === 'tool_calls') {
              toolCalls = event.tool_calls;
              // Convert the streaming placeholder into a reasoning entry.
              const toolNames = toolCalls.map(tc => tc.function.name).join(', ');
              if (this.messages[placeholderIndex]) {
                this.messages[placeholderIndex].role = 'thinking';
                this.messages[placeholderIndex].content = streamedContent.trim()
                  ? `${streamedContent.trim()}\n\n→ **${toolNames}**`
                  : `→ **${toolNames}**`;
                this.renderMessages();
              }
              break;
            }
          }

          if (this.abortRequested) {
            const kept = this.messages[placeholderIndex]?.content || streamedContent || '';
            if (this.messages[placeholderIndex]) {
              this.messages.splice(placeholderIndex, 1);
              this.renderMessages();
            }
            return kept || 'Aborted.';
          }

          if (!toolCalls) {
            // Finalize the placeholder in-place — no splice, no re-add flash.
            const finalContent = streamedContent || this.messages[placeholderIndex]?.content || 'No response.';
            if (this.messages[placeholderIndex]) {
              this.messages[placeholderIndex].content = finalContent;
              this.renderMessages();
              return null; // signals runMessage: already in messages, skip push
            }
            // Placeholder was displaced (e.g. messages reset mid-run) — let runMessage add it
            return finalContent;
          }
        } else {
          const data = await client.chatCompletion({
            messages: apiMessages,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: 4096,
            signal: this.fetchController.signal,
          });
          const msg = data.choices?.[0]?.message;
          if (!msg) throw new Error('Empty response from model');

          if (!msg.tool_calls || msg.tool_calls.length === 0) {
            return msg.content || 'No response.';
          }

          toolCalls = msg.tool_calls;
          streamedContent = msg.content || '';
          const toolNames = toolCalls.map(tc => tc.function.name).join(', ');
          const stepContent = streamedContent.trim()
            ? `${streamedContent.trim()}\n\n→ **${toolNames}**`
            : `→ **${toolNames}**`;
          this.messages.push({ role: 'thinking', content: stepContent, timestamp: Date.now() });
          this.renderMessages();
        }

        firstIter = false;
      } catch (err: any) {
        if (err?.name === 'AbortError') return 'Aborted.';
        // If tools param rejected on first call, retry without tools (some proxies strip tool support)
        if (firstIter && err?.message?.includes('400')) {
          return this.callLLMBasic(apiMessages);
        }
        // Remove any streaming placeholder before surfacing the error.
        if (placeholderIndex >= 0 && this.messages[placeholderIndex]) {
          this.messages.splice(placeholderIndex, 1);
          this.renderMessages();
        }
        throw err;
      }

      if (!toolCalls || toolCalls.length === 0) {
        return streamedContent || 'No response.';
      }

      // STEP mode pauses before every batch. auto and plan already run without
      // per-call confirmation (plan gates upfront on the approved plan), so a
      // destructive tool batch proceeds immediately in those modes.
      if (this.agentMode === 'step') {
        stepCount++;
        const toolNames = toolCalls.map(tc => tc.function.name).join(', ');
        const proceed = await this.waitForAction(`Step ${stepCount}: run ${toolNames}?`);
        if (!proceed || this.abortRequested) return 'Aborted.';
      }

      // Add assistant turn with tool_calls
      apiMessages.push({ role: 'assistant', content: streamedContent || null, tool_calls: toolCalls });

      // Execute each tool and collect results
      for (const tc of toolCalls) {
        if (this.abortRequested) return 'Aborted.';

        const toolName: string = tc.function.name;
        let toolArgs: Record<string, any> = {};
        try { toolArgs = JSON.parse(tc.function.arguments || '{}'); } catch {}

        // Show chip in UI immediately (pending state)
        this.messages.push({
          role: 'tool',
          content: this.formatToolChip(toolName, toolArgs),
          timestamp: Date.now(),
          toolName,
        });
        this.renderMessages();

        const result = await this.executeTool(toolName, toolArgs);

        // Update chip with result so it becomes collapsible
        this.messages[this.messages.length - 1].toolResult = result;
        this.renderMessages();

        apiMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Inject any steering message the user submitted mid-run
      if (this.steeringMessage) {
        const steer = this.steeringMessage;
        this.steeringMessage = null;
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
  private async streamPlainText(
    client: LLMClient,
    messages: LLMMessage[],
    maxTokens = 4096,
    keepAsRole: ChatMessage['role'] | null = null,
  ): Promise<string> {
    const placeholderIndex = this.messages.length;
    this.messages.push({ role: 'assistant', content: '', timestamp: Date.now() });
    this.renderMessages();

    let content = '';
    try {
      for await (const event of client.streamChatCompletion({
        messages,
        temperature: 0.2,
        max_tokens: maxTokens,
        signal: this.fetchController?.signal,
      })) {
        if (this.abortRequested) break;
        if (event.type === 'content') {
          content += event.delta;
          if (this.messages[placeholderIndex]) {
            this.messages[placeholderIndex].content = content;
            this.updateStreamingMessage(placeholderIndex);
          }
        }
      }
    } catch (err: any) {
      if (this.messages[placeholderIndex]) {
        this.messages.splice(placeholderIndex, 1);
        this.renderMessages();
      }
      if (err?.name === 'AbortError') return content || 'Aborted.';
      throw err;
    }

    if (keepAsRole !== null && this.messages[placeholderIndex]) {
      this.messages[placeholderIndex].role = keepAsRole;
      this.messages[placeholderIndex].content = content || '…';
      this.renderMessages();
    } else if (this.messages[placeholderIndex]) {
      this.messages.splice(placeholderIndex, 1);
      this.renderMessages();
    }
    return content;
  }

  private async callLLMBasic(apiMessages: LLMMessage[]): Promise<string> {
    const client = new LLMClient({ endpoint: this.endpoint, apiKey: this.apiKey, model: this.model });
    if (this.streamResponses) {
      return this.streamPlainText(client, apiMessages.map(m => ({ role: m.role, content: m.content || '' })));
    }
    const msgs = apiMessages.map(m => ({ role: m.role, content: m.content || '' }));
    return client.complete(msgs, this.fetchController?.signal);
  }

  private updateFloatPosition(): void {
    if (!this.floatEl) return;
    const overlayLeft = this.el.classList.contains('is-open') ? this.occupiedLeft(this.drawerWidth) : 0;
    const centerX = (window.innerWidth + overlayLeft) / 2;
    this.floatEl.style.left = `${Math.round(centerX)}px`;
  }

  resetSessions(): void {
    this.sessionsLoaded = false;
    this.sessionsDirEnsured = false;
    this.sessions = [];
    this.currentSessionId = '';
    this.promptQueue = [];
    this.steeringMessage = null;
    this.showWelcome();
    this.renderMessages();
    this.syncFloatPreviewToMessages();
    this.renderSessionsList();
    // If drawer is already open, load the new workspace's sessions immediately
    // rather than waiting for the user to close and reopen.
    if (this.el.classList.contains('is-open')) {
      this.loadSessions().then(() => {
        this.syncFloatPreviewToMessages();
        this.renderSessionsList();
      });
    }
  }

  async toggle(): Promise<void> {
    const isOpen = this.el.classList.contains('is-open');
    if (isOpen) {
      this.close();
    } else {
      await this.loadSessions();
      this.open();
    }
  }

  private shiftCanvasPan(delta: number): void {
    const cockpit = (window as any).__cockpit;
    if (!cockpit) return;
    const state = cockpit.getCanvasState();
    cockpit.setView(state.panX + delta, state.panY, state.zoom);
  }

  private setCanvasOverlay(left: number): void {
    (window as any).__cockpit?.setCanvasOverlay(left);
  }

  /** Left edge extent occupied by the inset glass card (+ trailing gap). */
  private occupiedLeft(w = this.drawerWidth): number {
    return w > 0 ? this.shellInset + w + this.shellInset : 0;
  }

  private open(): void {
    const occ = this.occupiedLeft(this.drawerWidth);
    this.shiftCanvasPan(occ);
    this.setCanvasOverlay(occ);
    this.setOpenWidth(this.drawerWidth);
    this.el.classList.add('is-open');
    this.notch.classList.add('is-open');
    if (this.isDetached) this.updateFloatPosition();
    this.escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this.escHandler);
  }

  close(): void {
    const occ = this.occupiedLeft(this.drawerWidth);
    this.shiftCanvasPan(-occ);
    this.setCanvasOverlay(0);
    this.el.style.width = '0';
    this.el.classList.remove('is-open');
    this.updateFloatPosition();
    this.notch.style.left = '0';
    this.notch.classList.remove('is-open');
    this.settingsEl?.classList.remove('is-visible');
    this.sessionsPanelEl?.classList.remove('is-visible');
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }
  }

  private setOpenWidth(w: number): void {
    this.el.style.width = w + 'px';
    const edge = w > 0 ? this.shellInset + w : 0;
    this.resizeHandle.style.left = edge + 'px';
    // Edge chip only used when closed; keep it parked at left origin.
    this.notch.style.left = '0';
  }

  private bindResize(): void {
    let startX = 0;
    let startW = 420;

    this.resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.isDragging = true;
      startX = e.clientX;
      startW = this.el.offsetWidth || this.drawerWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const delta = e.clientX - startX;
      const w = Math.max(280, Math.min(800, startW + delta));
      this.drawerWidth = w;
      this.setOpenWidth(w);
      this.setCanvasOverlay(this.occupiedLeft(w));
      this.updateFloatPosition();
    });

    document.addEventListener('mouseup', () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }
}
