// AiDrawer — facade for the AI panel (refactor.md §A.4). The chat chrome,
// state, and logic live in ai-drawer/* sub-controllers; this file keeps the
// constructor, bindEvents wiring, queue/steer + input handling, toggle /
// detach / resetSessions, and one-line forwarders for every public method.
// Consumers import { AiDrawer } from './AiDrawer' — the path is unchanged.

import { getToolContext } from '../ai/cockpit-context';
import type { LLMClient } from '../ai/llm-client';
import { detectHostPlatform } from '../ai/prompts';
import { ALL_TOOLS } from '../ai/tool-definitions';
import { ToolRegistry } from '../ai/tool-registry';
import type { LLMMessage } from '../ai/types';
import { getAgentExecutor } from '../agents/executor';
import { bindGuarded } from '../health/monitor';
import { createLogger } from '../logging/logger';
import { ContextWindow } from './ai-drawer/context-window';

const log = createLogger('ai-drawer');
import { AgentFeed } from './ai-drawer/agent-feed';
import { AgentSessionStore } from './ai-drawer/agent-sessions';
import { DrawerLayout } from './ai-drawer/layout';
import { LlmLoop } from './ai-drawer/llm-loop';
import { Mentions } from './ai-drawer/mentions';
import { RenderController, escapeHtml, scrollToBottomIfNearBottom } from './ai-drawer/render';
import { SessionStore } from './ai-drawer/sessions';
import { SettingsStore } from './ai-drawer/settings';
import { SlashCommands } from './ai-drawer/slash-commands';
import type { AgentMode, AiDrawerDom, ChatMessage, PanelView, Session, SlashCommand } from './ai-drawer/types';

export { MAX_CONSECUTIVE_EMPTIES } from './ai-drawer/llm-loop';
export { LOOP_CONTEXT_MIN_LIMIT, LOOP_CONTEXT_MULTIPLIER } from './ai-drawer/context-window';

export class AiDrawer {
  private dom: AiDrawerDom;
  private renderCtrl: RenderController;
  private sessionStore: SessionStore;
  private settingsStore: SettingsStore;
  private unbinders: (() => void)[] = [];
  private slash: SlashCommands;
  private contextWindow: ContextWindow;
  private llmLoop: LlmLoop;
  private layout: DrawerLayout;
  private feed: AgentFeed;
  private agentSessions: AgentSessionStore;
  private mentions: Mentions;

  // Queue + steer state (facade-owned; the sub-controllers read it via hosts)
  private promptQueue: string[] = [];
  private steeringMessage: string | null = null;
  private isLoading = false;
  // Shell-style input-history recall state
  private historyIndex = -1;
  private historyDraft = '';
  // rAF coalescing for feed-driven renders (step events can outpace frames).
  private feedRafPending = false;
  private announcedWave = false;
  onDetachChange?: (detached: boolean) => void;

  constructor() {
    // Detect the host OS ONCE at boot. buildSystemPrompt injects the matching
    // command guidance from this cached value — detection never re-runs per
    // prompt build (see ai/prompts.ts detectHostPlatform).
    detectHostPlatform();

    const canvas = document.getElementById('canvas')!;
    const canvasParent = canvas.parentElement!;

    const wrapper = document.createElement('div');
    wrapper.id = 'app-main';
    const el = document.createElement('div');
    el.className = 'ai-drawer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'AI Panel');
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'ai-drawer-resize';
    const notch = document.createElement('button');
    notch.className = 'ai-drawer-notch';
    notch.setAttribute('aria-label', 'Open AI panel');
    notch.setAttribute('title', 'Open AI panel (Ctrl+Space)');
    notch.innerHTML = '<span class="ai-drawer-notch-label">AI</span>';
    this.unbinders.push(bindGuarded(notch, 'click', () => this.toggle(), 'ai-drawer/AiDrawer.ts'));

    wrapper.appendChild(el);
    wrapper.appendChild(resizeHandle);
    canvasParent.replaceChild(wrapper, canvas);
    wrapper.appendChild(canvas);
    document.body.appendChild(notch);

    this.dom = { el, wrapper, notch, resizeHandle } as AiDrawerDom;

    this.feed = new AgentFeed();
    this.renderCtrl = new RenderController(this.dom, {
      estimateContextTokens: () => this.contextWindow.estimateContextTokens(),
      getPromptQueue: () => this.promptQueue,
      setPromptQueue: (queue) => { this.promptQueue = queue; },
      syncFloatStream: (content) => this.layout.updateFloatPreview('stream', content),
      getSettings: () => this.settingsStore.snapshot(),
      getFeed: () => this.feed,
    });

    this.settingsStore = new SettingsStore(this.dom);

    this.sessionStore = new SessionStore(this.dom, {
      getMessages: () => this.renderCtrl.messages,
      setMessages: (messages) => { this.renderCtrl.messages = messages; },
      getIsLoading: () => this.isLoading,
      renderMessages: () => this.renderCtrl.renderMessages(),
      syncFloatPreviewToMessages: () => this.layout.syncFloatPreviewToMessages(),
      onInitFirstSession: () => this.initFirstSession(),
      onSessionLoaded: (session) => {
        // Agents belong to the session that spawned them: leaving it kills them,
        // else they keep running (and writing) against the session now on screen.
        getAgentExecutor().purgeAll();
        this.feed.reset();
        this.agentSessions.reset();
        this.renderCtrl.activeView = 'chat';
        this.feed.activeView = 'chat';
        this.announcedWave = false;
        void this.feed.hydrate(session.agents ?? []).then(() => {
          this.renderMessages();
        });
      },
      onDeleteSession: (session) => {
        void this.agentSessions.deleteSessionFiles(session.id);
      },
    });

    this.agentSessions = new AgentSessionStore(this.feed, this.sessionStore);

    this.mentions = new Mentions({
      getFeed: () => this.feed,
      getMessages: () => this.renderCtrl.messages,
      renderMessages: () => this.renderMessages(),
      persistChat: () => this.persistChat(),
      runMessage: (text) => this.runMessage(text),
    });

    this.slash = new SlashCommands(this.dom, {
      getInputValue: () => this.dom.inputEl.value,
      setInputValue: (value) => { this.dom.inputEl.value = value; },
      getInputEl: () => this.dom.inputEl,
      handleInput: () => this.handleInput(),
      sendMessage: () => { void this.sendMessage(); },
      newSession: () => this.sessionStore.newSession(),
      compactSession: () => this.contextWindow.compactSession(),
      getMessages: () => this.renderCtrl.messages,
      setMessages: (messages) => { this.renderCtrl.messages = messages; },
      renderMessages: () => this.renderCtrl.renderMessages(),
      getActiveAgents: () => this.feed.activeAgents().map(a => ({
        id: a.persona.id,
        name: a.persona.name,
        icon: a.persona.icon,
        color: a.persona.color,
        state: a.state,
      })),
      purgeFinished: () => this.purgeFinished(),
    });

    // llm-loop's streamPlainText, wired after llm-loop exists (breaks the
    // context-window ↔ llm-loop construction cycle).
    const streamPlainTextRef: {
      fn: ((client: LLMClient, messages: LLMMessage[], maxTokens?: number, keepAsRole?: ChatMessage['role'] | null) => Promise<string>) | null;
    } = { fn: null };

    this.contextWindow = new ContextWindow({
      getMessages: () => this.renderCtrl.messages,
      setMessages: (messages) => { this.renderCtrl.messages = messages; },
      getActiveSession: () => this.sessionStore.getActiveSession(),
      renderMessages: () => this.renderCtrl.renderMessages(),
      renderTokenUsage: () => this.renderCtrl.renderTokenUsage(),
      updateCurrentSession: () => this.sessionStore.updateCurrentSession(),
      buildSystemPrompt: (wsPath) => this.llmLoop.buildSystemPrompt(wsPath),
      createClient: () => this.settingsStore.createClient(),
      getStreamResponses: () => this.settingsStore.streamResponses,
      getContextTokenLimit: () => this.settingsStore.contextTokenLimit,
      streamPlainText: (client, messages, maxTokens, keepAsRole) =>
        streamPlainTextRef.fn!(client, messages, maxTokens, keepAsRole),
      escapeHtml,
    });

    this.llmLoop = new LlmLoop(
      {
        toolRegistry: new ToolRegistry(ALL_TOOLS),
        getToolContext,
        getAgentMode: () => this.agentMode,
        setAgentMode: (mode) => { this.agentMode = mode; },
        getAbortRequested: () => this.abortRequested,
        setAbortRequested: (aborted) => { this.abortRequested = aborted; },
        getFetchController: () => this.fetchController,
        setFetchController: (controller) => { this.fetchController = controller; },
        getContinueResolve: () => this.continueResolve,
        setContinueResolve: (resolve) => { this.continueResolve = resolve; },
        getSteeringMessage: () => this.steeringMessage,
        setSteeringMessage: (message) => { this.steeringMessage = message; },
        setLoading: (loading) => this.setLoading(loading),
        isDetached: () => this.layout.isDetached,
        updateFloatPreview: (state, text) => this.layout.updateFloatPreview(state, text),
        loadSettings: () => this.settingsStore.loadSettings(),
      },
      this.dom,
      this.renderCtrl,
      this.sessionStore,
      this.settingsStore,
      this.contextWindow,
    );
    streamPlainTextRef.fn = (client, messages, maxTokens, keepAsRole) =>
      this.llmLoop.streamPlainText(client, messages, maxTokens, keepAsRole);

    this.layout = new DrawerLayout({
      dom: this.dom,
      getMessages: () => this.renderCtrl.messages,
      getIsLoading: () => this.isLoading,
      onDetachChange: (detached) => this.onDetachChange?.(detached),
    });

    this.showWelcome();
    this.render();
    this.layout.bindResize();
    this.slash.registerDefaults();
    this.bindEvents();
    this.settingsStore.loadSettings();

    // Live sub-agents: attach to the executor's event channel. The main chat
    // session IS the room — room-visible speech lands straight in `messages`.
    this.feed.attach(getAgentExecutor());
    this.feed.onChange = () => this.scheduleFeedRender();
    this.feed.onChatMessage = (msg) => {
      this.renderCtrl.messages.push(msg);
      this.persistChat();
    };
  }

  private scheduleFeedRender(): void {
    this.agentSessions.scheduleWrites();
    if (this.feedRafPending) return;
    this.feedRafPending = true;
    requestAnimationFrame(() => {
      this.feedRafPending = false;
      if (!this.announcedWave && this.feed.all().length > 0) {
        // One compact summary line in Chat; no auto-switch.
        this.announcedWave = true;
        const n = this.feed.all().length;
        this.renderCtrl.messages.push({
          role: 'system',
          content: `**${n} agent${n > 1 ? 's' : ''} working**`,
          timestamp: Date.now(),
        });
        this.persistChat();
      }
      this.renderMessages();
    });
  }

  // ── State accessors (thin views into sub-controllers) ─────────────────────

  private get messages(): ChatMessage[] { return this.renderCtrl.messages; }
  private set messages(messages: ChatMessage[]) { this.renderCtrl.messages = messages; }

  private get sessions(): Session[] { return this.sessionStore.sessions; }
  private set sessions(sessions: Session[]) { this.sessionStore.sessions = sessions; }

  private get currentSessionId(): string { return this.sessionStore.currentSessionId; }
  private set currentSessionId(id: string) { this.sessionStore.currentSessionId = id; }

  private get sessionsLoaded(): boolean { return this.sessionStore.sessionsLoaded; }
  private set sessionsLoaded(loaded: boolean) { this.sessionStore.sessionsLoaded = loaded; }

  private get endpoint(): string { return this.settingsStore.endpoint; }
  private set endpoint(value: string) { this.settingsStore.endpoint = value; }
  private get apiKey(): string { return this.settingsStore.apiKey; }
  private set apiKey(value: string) { this.settingsStore.apiKey = value; }
  private get model(): string { return this.settingsStore.model; }
  private set model(value: string) { this.settingsStore.model = value; }
  private get contextTokenLimit(): number { return this.settingsStore.contextTokenLimit; }
  private set contextTokenLimit(value: number) { this.settingsStore.contextTokenLimit = value; }

  private get abortRequested(): boolean { return this.llmLoop.abortRequested; }
  private set abortRequested(aborted: boolean) { this.llmLoop.abortRequested = aborted; }
  private get continueResolve(): (() => void) | null { return this.llmLoop.continueResolve; }
  private set continueResolve(resolve: (() => void) | null) { this.llmLoop.continueResolve = resolve; }
  private get fetchController(): AbortController | null { return this.llmLoop.fetchController; }
  private set fetchController(controller: AbortController | null) { this.llmLoop.fetchController = controller; }
  private get agentMode(): AgentMode { return this.llmLoop.agentMode; }
  private set agentMode(mode: AgentMode) { this.llmLoop.agentMode = mode; }

  private get drawerWidth(): number { return this.layout.drawerWidth; }
  private set drawerWidth(width: number) { this.layout.drawerWidth = width; }

  private get el(): HTMLDivElement { return this.dom.el; }
  private get settingsEl(): HTMLDivElement { return this.dom.settingsEl; }
  private get sessionsPanelEl(): HTMLDivElement { return this.dom.sessionsPanelEl; }
  private get sessionsListEl(): HTMLDivElement { return this.dom.sessionsListEl; }
  private get stepControlsEl(): HTMLDivElement { return this.dom.stepControlsEl; }
  private get inputModeBtn(): HTMLButtonElement { return this.dom.inputModeBtn; }
  private get saveDebounceTimer(): ReturnType<typeof setTimeout> | null { return this.sessionStore.saveDebounceTimer; }

  get isDetached(): boolean { return this.layout.isDetached; }

  // ── Public API (App.ts surface: toggle / detach / resetSessions / isDetached / onDetachChange) ──

  async toggle(): Promise<void> {
    const isOpen = this.dom.el.classList.contains('is-open');
    if (isOpen) {
      this.close();
    } else {
      await this.loadSessions();
      this.layout.open();
    }
  }

  detach(): void {
    this.layout.detach();
  }

  attach(): void {
    this.layout.attach();
  }

  close(): void {
    this.layout.close();
  }

  registerSlashCommand(cmd: SlashCommand): void {
    this.slash.register(cmd);
  }

  compactSession(): Promise<void> {
    return this.contextWindow.compactSession();
  }

  resetSessions(): void {
    // T12: kill running agents before the workspace path changes, then drop the feed.
    this.feed.reset();
    this.agentSessions.reset();
    getAgentExecutor().purgeAll();
    this.renderCtrl.activeView = 'chat';
    this.feed.activeView = 'chat';
    this.announcedWave = false;
    this.sessionStore.reset();
    this.promptQueue = [];
    this.steeringMessage = null;
    this.showWelcome();
    this.renderMessages();
    this.syncFloatPreviewToMessages();
    this.renderSessionsList();
    if (this.dom.el.classList.contains('is-open')) {
      this.loadSessions().then(() => {
        this.syncFloatPreviewToMessages();
        this.renderSessionsList();
      });
    }
  }

  // ── Private forwarders (facade delegates; sub-controllers stay private) ───

  private render(): void {
    this.renderCtrl.buildSkeleton();
    this.renderCtrl.bindMessageActions();
    this.renderCtrl.renderMessages();
  }

  private showWelcome(): void {
    this.renderCtrl.messages = [];
  }

  private async loadSessions(): Promise<void> { return this.sessionStore.loadSessions(); }
  private renderSessionsList(): void { this.sessionStore.renderSessionsList(); }
  private newSession(): void {
    this.feed.reset();
    this.agentSessions.reset();
    this.renderCtrl.activeView = 'chat';
    this.feed.activeView = 'chat';
    this.announcedWave = false;
    this.sessionStore.newSession();
  }
  private switchSession(id: string): void { this.sessionStore.switchSession(id); }
  private deleteSession(id: string): void { this.sessionStore.deleteSession(id); }
  private saveSessionById(id: string, messages: ChatMessage[]): void { this.sessionStore.saveSessionById(id, messages); }
  private initFirstSession(): void { this.sessionStore.initFirstSession(); }
  private flushSave(): void { this.sessionStore.flushSave(); }
  private saveSessions(): void { this.sessionStore.saveSessions(); }
  private getSessionsDir(): string | null { return this.sessionStore.getSessionsDir(); }
  private formatAge(ts: number, now: number): string { return this.sessionStore.formatAge(ts, now); }
  private occupiedLeft(w?: number): number { return this.layout.occupiedLeft(w); }
  private shiftCanvasPan(delta: number): void { this.layout.shiftCanvasPan(delta); }
  private setCanvasOverlay(left: number): void { this.layout.setCanvasOverlay(left); }
  private toggleMaximize(): void { this.layout.toggleMaximize(); }
  private backPanel(): void { this.layout.back(); }
  private renderMessages(): void { this.renderCtrl.renderMessages(); }
  private renderTokenUsage(): void { this.renderCtrl.renderTokenUsage(); }
  private buildHistoryForLLM(): LLMMessage[] { return this.contextWindow.buildHistoryForLLM(); }
  private estimateContextTokens(): number { return this.contextWindow.estimateContextTokens(); }
  private executeTool(name: string, args: Record<string, any>): Promise<string> { return this.llmLoop.executeTool(name, args); }
  private foldToolContext(apiMessages: LLMMessage[], limit?: number): boolean { return this.contextWindow.foldToolContext(apiMessages, limit); }
  private queueMessage(text: string): void { this.promptQueue.push(text); this.renderQueueBar(); }
  private renderQueueBar(): void { this.renderCtrl.renderQueueBar(); }
  private syncFloatPreviewToMessages(): void { this.layout.syncFloatPreviewToMessages(); }
  private async runMessage(text: string): Promise<void> { return this.llmLoop.runMessage(text); }

  // ── Queue + steer ──────────────────────────────────────────────────────────

  private submitSteer(): void {
    const text = this.dom.inputEl.value.trim();
    if (!text) return;
    log.debug('ai steer', text.slice(0, 80));
    if (!text || !this.isLoading) return;
    this.historyIndex = -1;
    this.dom.inputEl.value = '';
    this.steeringMessage = text;
    this.renderCtrl.messages.push({ role: 'user', content: text, timestamp: Date.now(), isSteer: true });
    this.renderMessages();
    requestAnimationFrame(() => scrollToBottomIfNearBottom(this.dom.messagesEl));
  }

  private processQueue(): void {
    if (this.promptQueue.length === 0 || this.isLoading) return;
    const next = this.promptQueue.shift()!;
    this.renderQueueBar();
    this.runMessage(next);
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.dom.loadingEl.style.display = loading ? 'flex' : 'none';
    this.dom.sendBtn.style.display = loading ? 'none' : 'flex';
    this.dom.abortBtn.style.display = loading ? 'flex' : 'none';
    this.dom.steerBtn.style.display = loading ? 'flex' : 'none';
    this.dom.notch.classList.toggle('is-loading', loading);
    this.dom.el.classList.toggle('is-loading', loading);
    this.dom.inputEl.placeholder = loading
      ? 'Queue next message (Enter) or steer agent (↳)…'
      : 'Ask the agent to do something…';
    if (this.isDetached) {
      if (loading) {
        this.layout.updateFloatPreview('loading');
      } else {
        this.layout.syncFloatPreviewToMessages();
      }
    }
    if (!loading) {
      this.abortRequested = false;
      this.fetchController = null;
      this.steeringMessage = null;
      this.dom.stepControlsEl.classList.remove('is-visible');
      this.renderQueueBar();
      this.processQueue();
    }
  }

  private switchView(view: PanelView): void {
    // T13: a detached float card only shows Chat, so tab clicks reopen the drawer.
    if (this.isDetached) this.layout.ensureDrawerOpen();
    this.renderCtrl.activeView = view;
    this.feed.activeView = view;
    this.feed.clearUnread(view);
    this.renderMessages();
  }

  private purgeFinished(): void {
    // Flush every finished verdict first — the purge deletes the transcripts.
    for (const t of this.feed.all()) {
      if (['done', 'error', 'killed'].includes(t.state) && !t.archived) {
        void this.agentSessions.flush(t);
      }
    }
    this.feed.purgeFinished();
    if (this.renderCtrl.activeView !== 'chat') {
      const t = this.feed.transcripts.get(this.renderCtrl.activeView);
      if (!t) this.switchView('chat');
    }
  }

  /**
   * Persist the main thread from paths that never enter the LLM loop (@mention
   * lines, the agent-wave banner) — llm-loop's save is the only other one.
   */
  private persistChat(): void {
    const id = this.sessionStore.getActiveSession()?.id;
    if (id) this.sessionStore.saveSessionById(id, this.renderCtrl.messages);
  }

  // ── Input handling ─────────────────────────────────────────────────────────

  private async sendMessage(): Promise<void> {
    const text = this.dom.inputEl.value.trim();
    if (!text) return;
    log.info('ai send', { mode: this.agentMode, len: text.length });
    if (!text) return;
    this.historyIndex = -1;

    // @mention: route one message to a live agent / the room (D5).
    if (text.startsWith('@')) {
      const mention = this.mentions.parse(text);
      if (mention) {
        this.dom.inputEl.value = '';
        this.mentions.send(mention.name, mention.rest, text);
        return;
      }
    }

    // Exact slash command (e.g. "/new" or "/new  ") bypasses the LLM.
    const slashCmd = this.slash.commands.find(cmd => text === cmd.label || text === `/${cmd.name}`);
    if (slashCmd) {
      this.dom.inputEl.value = '';
      await this.slash.execute(slashCmd);
      return;
    }

    // While loading: queue the message instead of running immediately
    if (this.isLoading) {
      this.dom.inputEl.value = '';
      this.queueMessage(text);
      return;
    }

    this.dom.inputEl.value = '';
    this.runMessage(text);
  }

  private handleInput(): void {
    this.historyIndex = -1; // typing starts a fresh draft
    const value = this.dom.inputEl.value;
    if (value.startsWith('/') || value.startsWith('@')) {
      this.slash.open(value);
    } else {
      this.slash.close();
    }
  }

  // Shell-style history recall: ArrowUp on first line / ArrowDown on last line
  private handleHistoryNav(e: KeyboardEvent): void {
    const input = this.dom.inputEl;
    const history = this.renderCtrl.messages.filter(m => m.role === 'user').map(m => m.content);
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

  // ── Event wiring (delegation only; logic lives in sub-controllers) ────────

  private bindEvents(): void {
    const src = 'ai-drawer/AiDrawer.ts';
    this.unbinders.push(bindGuarded(this.dom.sendBtn, 'click', () => { void this.sendMessage(); }, src));
    this.unbinders.push(bindGuarded(this.dom.detachBtn, 'click', () => this.layout.detach(), src));
    this.unbinders.push(bindGuarded(this.dom.expandBtn, 'click', () => this.toggleMaximize(), src));
    this.unbinders.push(bindGuarded(this.dom.backBtn, 'click', () => this.backPanel(), src));
    this.unbinders.push(bindGuarded(this.dom.el.querySelector('.ai-drawer-close-btn')!, 'click', () => this.layout.close(), src));
    this.unbinders.push(bindGuarded(this.dom.inputEl, 'input', () => this.handleInput(), src));
    this.unbinders.push(bindGuarded(this.dom.inputEl, 'keydown', (e: KeyboardEvent) => {
      if (this.slash.isPopupOpen()) {
        this.slash.handleKeydown(e);
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
    }, src));
    this.unbinders.push(bindGuarded(this.dom.steerBtn, 'click', () => this.submitSteer(), src));

    // Mode selector — cycles auto → plan → step
    this.unbinders.push(bindGuarded(this.dom.inputModeBtn, 'click', () => {
      const order: AgentMode[] = ['auto', 'plan', 'step'];
      this.agentMode = order[(order.indexOf(this.agentMode) + 1) % order.length];
      this.dom.inputModeBtn.textContent = this.agentMode.toUpperCase();
    }, src));

    // Step controls
    this.unbinders.push(bindGuarded(this.dom.stepContinueBtn, 'click', () => {
      this.dom.stepControlsEl.classList.remove('is-visible');
      this.continueResolve?.();
    }, src));
    this.unbinders.push(bindGuarded(this.dom.stepStopBtn, 'click', () => {
      this.abortRequested = true;
      this.fetchController?.abort();
      this.dom.stepControlsEl.classList.remove('is-visible');
      this.continueResolve?.();
    }, src));

    // Abort button
    this.unbinders.push(bindGuarded(this.dom.abortBtn, 'click', () => {
      this.abortRequested = true;
      this.fetchController?.abort();
      this.dom.stepControlsEl.classList.remove('is-visible');
      this.continueResolve?.();
    }, src));

    // Sessions panel
    const sessionsBtn = this.dom.el.querySelector('.ai-sessions-btn')!;
    this.unbinders.push(bindGuarded(sessionsBtn, 'click', () => {
      if (this.isDetached) this.layout.ensureDrawerOpen();
      const opening = !this.dom.sessionsPanelEl.classList.contains('is-visible');
      this.dom.settingsEl.classList.remove('is-visible');
      this.dom.sessionsPanelEl.classList.toggle('is-visible');
      if (opening) this.renderSessionsList();
    }, src));
    this.unbinders.push(bindGuarded(this.dom.el.querySelector('.ai-sessions-close')!, 'click', () => {
      this.dom.sessionsPanelEl.classList.remove('is-visible');
    }, src));
    this.unbinders.push(bindGuarded(this.dom.el.querySelector('.ai-new-session-btn')!, 'click', () => {
      this.newSession();
      this.dom.sessionsPanelEl.classList.remove('is-visible');
    }, src));

    const settingsBtn = this.dom.el.querySelector('.ai-drawer-settings-btn')!;
    this.unbinders.push(bindGuarded(settingsBtn, 'click', () => {
      if (this.isDetached) this.layout.ensureDrawerOpen();
      this.dom.sessionsPanelEl.classList.remove('is-visible');
      this.dom.settingsEl.classList.toggle('is-visible');
    }, src));

    this.unbinders.push(bindGuarded(this.dom.el.querySelector('.ai-settings-close')!, 'click', () => {
      this.dom.settingsEl.classList.remove('is-visible');
    }, src));

    this.unbinders.push(bindGuarded(this.dom.settingsEl, 'click', (e) => {
      if (e.target === this.dom.settingsEl) {
        this.dom.settingsEl.classList.remove('is-visible');
      }
    }, src));

    this.settingsStore.bindPanel();

    // Tab strip: switch view or purge finished agents (delegation — rebuilt every render).
    this.unbinders.push(bindGuarded(this.dom.povStripEl, 'click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-view]');
      if (target) {
        this.switchView(target.dataset.view as PanelView);
        return;
      }
      if ((e.target as HTMLElement).closest('.ai-pov-purge')) {
        this.purgeFinished();
      }
    }, src));

    // Per-agent kill (D6) lives in the PoV header inside the message list.
    this.unbinders.push(bindGuarded(this.dom.messagesEl, 'click', (e: MouseEvent) => {
      const kill = (e.target as HTMLElement).closest<HTMLElement>('.ai-pov-kill');
      if (!kill) return;
      getAgentExecutor().kill(kill.dataset.id as never);
      this.switchView('chat');
    }, src));
  }
}
