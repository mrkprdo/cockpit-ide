// Session CRUD + persistence (.cockpit/sessions). Owns the session list,
// active-session pointer, and the debounced session/index file writes.
// State moves here with the logic (refactor.md §A.3.3): the facade delegates
// through thin accessors and the SessionsHost callbacks.

import { escapeHtml } from './render';
import type { AiDrawerDom, ChatMessage, Session } from './types';

export interface SessionsHost {
  getMessages(): ChatMessage[];
  setMessages(messages: ChatMessage[]): void;
  getIsLoading(): boolean;
  renderMessages(): void;
  syncFloatPreviewToMessages(): void;
  /** Facade hook for the "first session" path — lets tests/spies intercept it. */
  onInitFirstSession(): void;
}

export class SessionStore {
  sessions: Session[] = [];
  currentSessionId = '';
  sessionsLoaded = false;
  sessionsDirEnsured = false;
  saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private dom: AiDrawerDom, private host: SessionsHost) {}

  generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  getSessionTitle(session: Session): string {
    const first = session.messages.find(m => m.role === 'user');
    if (!first) return 'New session';
    return first.content.slice(0, 48).replace(/\n/g, ' ');
  }

  getSessionsDir(): string | null {
    const cockpit = (window as any).__cockpit;
    const wp = cockpit?.getWorkspacePath?.();
    return wp ? `${wp}/.cockpit/sessions` : null;
  }

  async loadSessions(): Promise<void> {
    if (this.sessionsLoaded) return;
    this.sessionsLoaded = true;
    const dir = this.getSessionsDir();
    if (!dir) { this.host.onInitFirstSession(); return; }

    try {
      const indexRaw = await window.electronAPI?.fs.readFile(`${dir}/index.json`);
      if (!indexRaw) { this.host.onInitFirstSession(); return; }
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
      if (this.sessions.length === 0) { this.host.onInitFirstSession(); return; }
      const current = this.sessions.find(s => s.id === this.currentSessionId) ?? this.sessions[0];
      this.currentSessionId = current.id;
      this.host.setMessages([...current.messages]);
      this.host.renderMessages();
      this.host.syncFloatPreviewToMessages();
    } catch { this.host.onInitFirstSession(); }
  }

  private writeSessionsIndex(dir: string): Promise<boolean | undefined> {
    const index = { currentSessionId: this.currentSessionId, order: this.sessions.map(s => s.id) };
    return window.electronAPI!.fs.writeFile(`${dir}/index.json`, JSON.stringify(index, null, 2)).catch(() => undefined);
  }

  initFirstSession(): void {
    const session: Session = {
      id: this.generateId(),
      title: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [...this.host.getMessages()],
      context: [],
    };
    this.sessions = [session];
    this.currentSessionId = session.id;
  }

  saveSessions(): void {
    if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(() => {
      this.saveDebounceTimer = null;
      this.flushSave();
    }, 300);
  }

  flushSave(): void {
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

  updateCurrentSession(): void {
    if (!this.currentSessionId) return;
    this.saveSessionById(this.currentSessionId, this.host.getMessages());
  }

  newSession(): void {
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
    this.host.setMessages([]);
    this.host.renderMessages();
    this.host.syncFloatPreviewToMessages();
    this.renderSessionsList();
    this.saveSessions();
  }

  switchSession(id: string): void {
    if (this.host.getIsLoading()) return;
    if (id === this.currentSessionId) { this.dom.sessionsPanelEl.classList.remove('is-visible'); return; }
    this.updateCurrentSession();
    this.currentSessionId = id;
    const session = this.sessions.find(s => s.id === id);
    if (!session) return;
    this.host.setMessages([...session.messages]);
    if (this.host.getMessages().length === 0) this.host.setMessages([]);
    this.host.renderMessages();
    this.host.syncFloatPreviewToMessages();
    this.renderSessionsList();
    this.dom.sessionsPanelEl.classList.remove('is-visible');
    this.saveSessions();
  }

  deleteSession(id: string): void {
    const dir = this.getSessionsDir();
    if (dir) window.electronAPI?.fs.delete(`${dir}/${id}.json`).catch(() => {});
    this.sessions = this.sessions.filter(s => s.id !== id);
    if (this.sessions.length === 0) {
      this.host.onInitFirstSession();
      this.host.setMessages([]);
      this.host.renderMessages();
    } else if (id === this.currentSessionId) {
      this.currentSessionId = this.sessions[0].id;
      this.host.setMessages([...this.sessions[0].messages]);
      this.host.renderMessages();
    }
    this.renderSessionsList();
    this.saveSessions();
  }

  renderSessionsList(): void {
    if (!this.dom.sessionsListEl) return;
    const now = Date.now();
    if (this.sessions.length === 0) {
      this.dom.sessionsListEl.innerHTML = '<div class="ai-sessions-empty">No sessions</div>';
      return;
    }
    this.dom.sessionsListEl.innerHTML = this.sessions.map(s => {
      const title = this.getSessionTitle(s);
      const age = this.formatAge(s.updatedAt, now);
      const active = s.id === this.currentSessionId;
      return `<div class="ai-session-item${active ? ' is-active' : ''}" data-id="${s.id}">
        <div class="ai-session-info">
          <span class="ai-session-title">${escapeHtml(title)}</span>
          <span class="ai-session-age">${age}</span>
        </div>
        <button class="ai-session-delete" data-id="${s.id}" title="Delete">&times;</button>
      </div>`;
    }).join('');

    this.dom.sessionsListEl.querySelectorAll<HTMLElement>('.ai-session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.ai-session-delete')) return;
        this.switchSession(item.dataset.id!);
      });
    });
    this.dom.sessionsListEl.querySelectorAll<HTMLButtonElement>('.ai-session-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSession(btn.dataset.id!);
      });
    });
  }

  formatAge(ts: number, now: number): string {
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

  getActiveSession(): Session | undefined {
    return this.sessions.find(s => s.id === this.currentSessionId);
  }

  saveSessionById(id: string, messages: ChatMessage[]): void {
    const idx = this.sessions.findIndex(s => s.id === id);
    if (idx === -1) return;
    this.sessions[idx].messages = messages.map(m => ({ ...m }));
    this.sessions[idx].updatedAt = Date.now();
    this.saveSessions();
  }

  /** Reset all session state (workspace switch) — does not touch the DOM. */
  reset(): void {
    this.sessionsLoaded = false;
    this.sessionsDirEnsured = false;
    this.sessions = [];
    this.currentSessionId = '';
  }
}
