import {
  AGENT_SYSTEM_PROMPT,
  ALL_TOOLS,
  LLMClient,
  ToolRegistry,
  executeToolCall,
  getToolContext,
  type LLMMessage,
  type LLMResponse,
  type OpenAIFunctionSchema,
} from '../ai';

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
}


export class AiDrawer {
  private el: HTMLDivElement;
  private wrapper: HTMLDivElement;
  private notch: HTMLButtonElement;
  private resizeHandle: HTMLDivElement;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;
  private isDragging = false;
  private drawerWidth = 420;

  private messages: ChatMessage[] = [];
  private isLoading = false;
  private apiKey = '';
  private model = 'deepseek-v4-flash';
  private endpoint = 'https://opencode.ai/zen/go/v1';
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
    this.notch.setAttribute('aria-label', 'Toggle AI panel');
    this.notch.innerHTML = '<span class="ai-drawer-notch-arrow">&#x25B6;</span>';
    this.notch.addEventListener('click', () => this.toggle());

    this.wrapper.appendChild(this.el);
    this.wrapper.appendChild(this.resizeHandle);
    canvasParent.replaceChild(this.wrapper, canvas);
    this.wrapper.appendChild(canvas);

    document.body.appendChild(this.notch);
    this.bindResize();

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
          this.model = prefs.aiModel
            .replace(/^opencode(?:-go)?\//, '')
            .replace(/-free$/, '');
        }
        if (prefs.aiEndpoint) {
          this.endpoint = prefs.aiEndpoint.replace(
            'opencode.ai/zen/v1',
            'opencode.ai/zen/go/v1',
          );
        }
      }
      const endpointInput = this.settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="endpoint"]');
      const apiKeyInput = this.settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="apiKey"]');
      const modelInput = this.settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="model"]');
      if (endpointInput) endpointInput.value = this.endpoint;
      if (apiKeyInput) apiKeyInput.value = this.apiKey;
      if (modelInput) modelInput.value = this.model;
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
      window.electronAPI?.prefs.save(prefs);
    } catch {}
  }

  private showWelcome(): void {
    this.messages = [{
      role: 'assistant',
      content: '**Cockpit Agent ready.** I can read/write files, open them in the editor, add plugins, and arrange the canvas. Ask me to do something in your workspace.',
      timestamp: Date.now(),
    }];
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
      this.renderMessages();
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
    };
    this.sessions.unshift(session);
    this.currentSessionId = session.id;
    this.showWelcome();
    this.renderMessages();
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
    this.renderMessages();
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
            <div class="ai-header-actions">
              <button class="ai-new-session-btn" title="New session">&#x2B; New</button>
              <button class="ai-sessions-btn" aria-label="Sessions" title="Sessions">&#x25A4;</button>
              <button class="ai-drawer-settings-btn" aria-label="Settings" title="Settings">&#x2699;</button>
            </div>
          </div>
          <div class="ai-mode-bar" role="group" aria-label="Agent mode">
            <button class="ai-mode-btn is-active" data-mode="auto" title="Run all steps automatically">AUTO</button>
            <button class="ai-mode-btn" data-mode="plan" title="Write a plan first, then execute on approval">PLAN</button>
            <button class="ai-mode-btn" data-mode="step" title="Pause between each tool step">STEP</button>
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
        <div class="ai-chat-input-area">
          <textarea class="ai-chat-input" placeholder="Ask the agent to do something..." rows="3"></textarea>
          <button class="ai-chat-send-btn" aria-label="Send" title="Send">&#x27A4;</button>
          <button class="ai-chat-abort-btn" aria-label="Abort" title="Abort agent" style="display:none">&#x2298;</button>
          <button class="ai-chat-steer-btn" aria-label="Steer agent" title="Inject guidance into active run" style="display:none">&#x21B3;</button>
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
            <input class="ai-settings-input" type="text" value="${this.escapeHtml(this.model)}" data-key="model" placeholder="deepseek-v4-flash">
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

    this.bindEvents();
    this.renderMessages();
  }

  private formatBody(content: string): string {
    return content
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_: string, lang: string, code: string) => {
        return `<pre class="ai-chat-code"><code class="${lang ? `lang-${lang}` : ''}">${this.escapeHtml(code.trim())}</code></pre>`;
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
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    this.steerBtn.addEventListener('click', () => this.submitSteer());

    // Mode selector
    this.el.querySelectorAll<HTMLButtonElement>('.ai-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.agentMode = btn.dataset.mode as 'auto' | 'plan' | 'step';
        this.el.querySelectorAll('.ai-mode-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
      });
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
      this.sessionsPanelEl.classList.remove('is-visible');
      this.settingsEl.classList.toggle('is-visible');
    });

    const closeBtn = this.el.querySelector('.ai-settings-close')!;
    closeBtn.addEventListener('click', () => {
      this.settingsEl.classList.remove('is-visible');
    });

    const saveBtn = this.el.querySelector('.ai-settings-save')!;
    saveBtn.addEventListener('click', () => {
      const inputs = this.settingsEl.querySelectorAll<HTMLInputElement>('.ai-settings-input');
      inputs.forEach((input) => {
        const key = input.dataset.key;
        if (key === 'endpoint') this.endpoint = input.value;
        else if (key === 'apiKey') this.apiKey = input.value;
        else if (key === 'model') this.model = input.value;
      });
      this.saveSettings();
      this.settingsEl.classList.remove('is-visible');
    });
  }

  private renderMessages(): void {
    this.messagesEl.innerHTML = this.messages.map((m, i) => this.renderMessage(m, i)).join('');
    // Mark only the last message for entrance animation; previous messages render instantly
    const last = this.messagesEl.lastElementChild as HTMLElement | null;
    if (last) last.classList.add('is-new');
    this.bindMessageActions();
    // Defer scroll so browser has painted the new content and scrollHeight is final
    requestAnimationFrame(() => {
      this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
    });
  }

  private renderMessage(m: ChatMessage, index = 0): string {
    if (m.role === 'tool') {
      const name = m.toolName || '';
      const pending = m.toolResult === undefined;
      const resultHtml = pending
        ? `<div class="ai-tool-result ai-tool-result-pending">running…</div>`
        : `<pre class="ai-tool-result">${this.escapeHtml(m.toolResult!)}</pre>`;
      return `<div class="ai-chat-msg ai-chat-msg-tool"><details class="ai-tool-details"${pending ? ' open' : ''}><summary class="ai-tool-chip"><span class="ai-tool-icon">⚙</span><span class="ai-tool-name">${this.escapeHtml(name)}</span><span class="ai-tool-args">${this.escapeHtml(m.content)}</span><span class="ai-tool-toggle">▸</span></summary>${resultHtml}</details></div>`;
    }

    if (m.role === 'thinking') {
      const body = this.formatBody(m.content);
      return `<div class="ai-chat-msg ai-chat-msg-thinking"><details class="ai-thinking-details" open><summary class="ai-thinking-header"><span class="ai-thinking-icon">◈</span><span class="ai-thinking-label">Agent reasoning</span><span class="ai-thinking-toggle">▸</span></summary><div class="ai-thinking-body">${body}</div></details></div>`;
    }

    const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let body = this.formatBody(m.content);

    if (m.role === 'system') {
      return `<div class="ai-chat-msg ai-chat-msg-system"><div class="ai-chat-msg-bubble">${body}</div></div>`;
    }

    const steerBadge = m.isSteer ? '<span class="ai-steer-badge">&#x21B3; steer</span>' : '';
    return `
      <div class="ai-chat-msg ai-chat-msg-${m.role}${m.isSteer ? ' is-steer' : ''}">
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

    this.messages.push({ role: 'user', content: text, timestamp: Date.now() });
    this.renderMessages();

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
      this.messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
    } catch (err: any) {
      this.messages.push({
        role: 'assistant',
        content: `**Error:** ${this.escapeHtml(err.message || 'Unknown error')}`,
        timestamp: Date.now(),
      });
    }
    this.setLoading(false);
    this.renderMessages();
    this.saveSessionById(pinnedSessionId, this.messages);
  }

  private saveSessionById(id: string, messages: ChatMessage[]): void {
    const idx = this.sessions.findIndex(s => s.id === id);
    if (idx === -1) return;
    this.sessions[idx].messages = messages.map(m => ({ ...m }));
    this.sessions[idx].updatedAt = Date.now();
    this.saveSessions();
  }

  private async sendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text) return;

    // While loading: queue the message instead of running immediately
    if (this.isLoading) {
      this.inputEl.value = '';
      this.queueMessage(text);
      return;
    }

    this.inputEl.value = '';
    this.runMessage(text);
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.loadingEl.style.display = loading ? 'flex' : 'none';
    this.sendBtn.style.display = loading ? 'none' : 'flex';
    this.abortBtn.style.display = loading ? 'flex' : 'none';
    this.steerBtn.style.display = loading ? 'flex' : 'none';
    this.notch.classList.toggle('is-loading', loading);
    this.inputEl.placeholder = loading
      ? 'Queue next message (Enter) or steer agent (↳)…'
      : 'Ask the agent to do something…';
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

  private async callLLMWithTools(userMessage: string): Promise<string> {
    const ctx = getToolContext();
    const wsPath = ctx?.cockpit.getWorkspacePath() || '';

    const systemContent = wsPath
      ? `${AGENT_SYSTEM_PROMPT}\n\nWorkspace: ${wsPath}`
      : AGENT_SYSTEM_PROMPT;

    const apiMessages: LLMMessage[] = [
      { role: 'system', content: systemContent },
    ];

    const history = this.messages.filter((m): m is ChatMessage & { role: 'user' | 'assistant' } =>
      m.role === 'user' || m.role === 'assistant'
    ).slice(-12);
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
    let planModeFirstIter = false;
    if (this.agentMode === 'plan') {
      this.fetchController = new AbortController();
      try {
        const planData = await client.chatCompletion({
          messages: [
            ...apiMessages,
            { role: 'user', content: 'Before using any tools, write a numbered step-by-step plan of what you will do. Do NOT call any tools yet — only write the plan.' },
          ],
          temperature: 0.2,
          max_tokens: 1024,
          signal: this.fetchController.signal,
        });
        const planText = planData.choices?.[0]?.message?.content || 'No plan generated.';
        this.messages.push({ role: 'thinking', content: `**Plan**\n\n${planText}`, timestamp: Date.now() });
        this.renderMessages();

        const proceed = await this.waitForAction('Approve plan to execute?');
        if (!proceed || this.abortRequested) return 'Aborted.';

        planModeFirstIter = true;
        // Do NOT add plan to apiMessages — execution proceeds on original context
        // The plan was preview-only; the model will naturally call tools on the original request
      } catch (err: any) {
        if (err?.name === 'AbortError') return 'Aborted.';
        throw err;
      }
    }

    let firstIter = true;
    let stepCount = 0;
    for (;;) {
      if (this.abortRequested) return 'Aborted.';

      let data: LLMResponse;
      this.fetchController = new AbortController();
      try {
        data = await client.chatCompletion({
          messages: apiMessages,
          tools,
          tool_choice: planModeFirstIter ? 'required' : 'auto',
          temperature: 0.2,
          max_tokens: 4096,
          signal: this.fetchController.signal,
        });
        planModeFirstIter = false;
        firstIter = false;
      } catch (err: any) {
        if (err?.name === 'AbortError') return 'Aborted.';
        // If tools param rejected on first call, retry without tools (some proxies strip tool support)
        if (firstIter && err?.message?.includes('400')) {
          return this.callLLMBasic(apiMessages);
        }
        throw err;
      }

      const choice = data.choices?.[0];
      if (!choice) throw new Error('Empty response from model');

      const msg = choice.message;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return msg.content || 'No response.';
      }

      // Always show a step entry: model reasoning (if any) + which tools are being called
      const thinkingContent = msg.content?.trim();
      const toolNames = msg.tool_calls.map(tc => tc.function.name).join(', ');
      const stepContent = thinkingContent
        ? `${thinkingContent}\n\n→ **${toolNames}**`
        : `→ **${toolNames}**`;
      this.messages.push({ role: 'thinking', content: stepContent, timestamp: Date.now() });
      this.renderMessages();

      // STEP mode: pause before executing this batch
      if (this.agentMode === 'step') {
        stepCount++;
        const proceed = await this.waitForAction(`Step ${stepCount}: run ${toolNames}?`);
        if (!proceed || this.abortRequested) return 'Aborted.';
      }

      // Add assistant turn with tool_calls
      apiMessages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });

      // Execute each tool and collect results
      for (const tc of msg.tool_calls) {
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

  private async callLLMBasic(apiMessages: LLMMessage[]): Promise<string> {
    const client = new LLMClient({ endpoint: this.endpoint, apiKey: this.apiKey, model: this.model });
    const msgs = apiMessages.map(m => ({ role: m.role, content: m.content || '' }));
    return client.complete(msgs, this.fetchController?.signal);
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
    this.renderSessionsList();
    // If drawer is already open, load the new workspace's sessions immediately
    // rather than waiting for the user to close and reopen.
    if (this.el.classList.contains('is-open')) {
      this.loadSessions().then(() => this.renderSessionsList());
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

  private open(): void {
    this.shiftCanvasPan(this.drawerWidth);
    this.setCanvasOverlay(this.drawerWidth);
    this.setOpenWidth(this.drawerWidth);
    this.el.classList.add('is-open');
    this.notch.classList.add('is-open');
    this.escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this.escHandler);
  }

  private close(): void {
    this.shiftCanvasPan(-this.drawerWidth);
    this.setCanvasOverlay(0);
    this.el.style.width = '0';
    this.el.classList.remove('is-open');
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
    this.resizeHandle.style.left = w + 'px';
    this.notch.style.left = w + 'px';
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
      this.setCanvasOverlay(w);
    });

    document.addEventListener('mouseup', () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }
}
