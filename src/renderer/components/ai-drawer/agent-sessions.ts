// AgentSessionStore — persistence for sub-agent PoV session files (D8).
//
// Layout:
//   .cockpit/sessions/
//     index.json              # unchanged: { currentSessionId, order }  (T14)
//     <mainSessionId>.json    # gains an `agents` link array
//     agents/<mainSessionId>-<suffix>.json   # one file per sub-agent
//
// Writes are throttled to 1s per agent while running and flushed on `final` and
// `purgeFinished`. The first write for an agent appends its AgentLink to the
// main session and triggers the existing saveSessions() debounce, so the link
// and the file land together. All writes are best-effort `.catch(() => {})`
// (T20) — a failed write never breaks a run.
//
// This module mirrors the sessions.ts idioms (sessionsDirEnsured pattern,
// debounce, `window.electronAPI.fs.*` access through `__cockpit`).

import type { AgentId, AgentPersona } from '../../agents/types';
import type { AgentFeed, AgentTranscript } from './agent-feed';
import type { SessionStore } from './sessions';
import type { AgentLink } from './types';

interface AgentSessionFile {
  v: number;
  id: string;
  mainSessionId: string;
  agentId: AgentId;
  persona: AgentPersona;
  adhoc: boolean;
  brief: string;
  expectedResult: string;
  guardrails: string[];
  state: string;
  startedAt: number;
  finishedAt: number | null;
  steps: number;
  tokensUsed: number;
  broadcastsUsed: number;
  messages: unknown[];
}

export class AgentSessionStore {
  private sessionsDirEnsured = false;
  private writeTimers = new Map<AgentId, ReturnType<typeof setTimeout>>();
  private linked = new Set<AgentId>();

  constructor(private feed: AgentFeed, private sessions: SessionStore) {}

  /** Workspace switch / new session — drop all pending writes + link state. */
  reset(): void {
    this.sessionsDirEnsured = false;
    for (const t of this.writeTimers.values()) clearTimeout(t);
    this.writeTimers.clear();
    this.linked.clear();
  }

  /**
   * Called on every feed change (the AiDrawer wires feed.onChange here too).
   * Schedules a throttled write per live agent; finished agents flush at 0ms.
   */
  scheduleWrites(): void {
    for (const t of this.feed.all()) {
      if (t.archived) continue;
      const id = t.persona.id;
      if (this.writeTimers.has(id)) continue;
      const running = ['spawning', 'active', 'waiting'].includes(t.state);
      const timer = setTimeout(() => {
        this.writeTimers.delete(id);
        void this.writeTranscript(t);
      }, running ? 1000 : 0);
      this.writeTimers.set(id, timer);
    }
  }

  /** Forced immediate write for one transcript (final verdict, purge). */
  flush(t: AgentTranscript): Promise<void> {
    const timer = this.writeTimers.get(t.persona.id);
    if (timer) clearTimeout(timer);
    this.writeTimers.delete(t.persona.id);
    return this.writeTranscript(t);
  }

  /** Delete every linked agent file for a session (T15 cascade). */
  deleteSessionFiles(sessionId: string): Promise<void> {
    const session = this.sessions.sessions.find(s => s.id === sessionId);
    const dir = this.sessions.getSessionsDir();
    if (!dir || !session?.agents) return Promise.resolve();
    return Promise.all(
      session.agents.map(link =>
        window.electronAPI!.fs.delete(`${dir}/${link.file}`).catch(() => {})
      )
    ).then(() => undefined);
  }

  private async writeTranscript(t: AgentTranscript): Promise<void> {
    const dir = this.sessions.getSessionsDir();
    const session = this.sessions.getActiveSession();
    if (!dir || !session || t.archived) return;
    const mainId = session.id;
    const suffix = t.persona.id.slice(6);
    const file = `agents/${mainId}-${suffix}.json`;

    const payload: AgentSessionFile = {
      v: 1,
      id: `${mainId}-${suffix}`,
      mainSessionId: mainId,
      agentId: t.persona.id,
      persona: {
        id: t.persona.id,
        name: t.persona.name,
        icon: t.persona.icon,
        color: t.persona.color,
        definition: t.persona.definition,
      },
      adhoc: t.adhoc,
      brief: t.brief,
      expectedResult: t.expectedResult,
      guardrails: t.guardrails,
      state: t.state,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt,
      steps: t.stepsCount,
      tokensUsed: t.tokensUsed,
      broadcastsUsed: t.broadcastsUsed,
      messages: t.steps,
    };

    const ok = await this.writeFile(`${dir}/${file}`, JSON.stringify(payload, null, 2));
    if (!ok) return;
    t.sessionFile = file;

    // First successful write → append the AgentLink to the main session (once).
    if (!this.linked.has(t.persona.id)) {
      this.linked.add(t.persona.id);
      const link: AgentLink = {
        agentId: t.persona.id,
        file,
        name: t.persona.name,
        icon: t.persona.icon,
        color: t.persona.color,
        definition: t.persona.definition,
        state: t.state,
        startedAt: t.startedAt,
        finishedAt: t.finishedAt,
      };
      session.agents = session.agents ?? [];
      if (!session.agents.some(a => a.agentId === link.agentId)) {
        session.agents.push(link);
      }
      this.sessions.saveSessions();
    }
  }

  private async writeFile(path: string, content: string): Promise<boolean> {
    try {
      if (!this.sessionsDirEnsured) {
        const agentsDir = path.slice(0, path.lastIndexOf('/'));
        await window.electronAPI!.fs.mkdir(agentsDir);
        this.sessionsDirEnsured = true;
      }
      return !!(await window.electronAPI!.fs.writeFile(path, content));
    } catch {
      return false; // best-effort (T20)
    }
  }
}
