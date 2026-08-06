import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentFeed } from './agent-feed';
import { AgentSessionStore } from './agent-sessions';
import { SessionStore } from './sessions';
import type { AgentEvent, AgentId } from '../../agents/types';
import type { AiDrawerDom, AgentLink, Session } from './types';
import { mockElectronAPI } from '../../../test/setup';

function spawnEvent(id: AgentId = 'agent:x'): AgentEvent {
  return {
    kind: 'spawn',
    persona: { id, name: 'Reviewer', icon: 'RV', color: '#ffd54f', definition: 'reviewer' },
    brief: 'review the cache',
    expectedResult: 'findings brief',
    guardrails: [],
  };
}

function fire(feed: AgentFeed, id: AgentId, ev: AgentEvent): void {
  (feed as any).handleEvent(id, ev);
}

function makeHarness(): { feed: AgentFeed; store: AgentSessionStore; sessions: SessionStore; main: Session } {
  (window as any).__cockpit = { getWorkspacePath: () => '/ws' };
  const dom = {} as AiDrawerDom;
  const sessions = new SessionStore(dom, {
    getMessages: () => [],
    setMessages: () => {},
    getIsLoading: () => false,
    renderMessages: () => {},
    syncFloatPreviewToMessages: () => {},
    onInitFirstSession: () => {},
  });
  const main: Session = { id: 'msd1', title: '', createdAt: 1, updatedAt: 1, messages: [] };
  sessions.sessions = [main];
  sessions.currentSessionId = 'msd1';
  const feed = new AgentFeed();
  const store = new AgentSessionStore(feed, sessions);
  return { feed, store, sessions, main };
}

function link(agentId: AgentId, file: string): AgentLink {
  return { agentId, file, name: 'X', icon: '🤖', color: '#fff', definition: 'x', state: 'done', startedAt: 1, finishedAt: 2 };
}

/** Writes that target the per-agent session files (not the main session). */
function agentWrites(): any[][] {
  return (mockElectronAPI.fs.writeFile as any).mock.calls.filter((c: any[]) => String(c[0]).includes('/agents/'));
}

describe('AgentSessionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes to sessions/agents/<main>-<suffix>.json and links the main session once', async () => {
    const { feed, store, main } = makeHarness();
    fire(feed, 'agent:x', spawnEvent());
    const t = feed.transcripts.get('agent:x')!;

    await store.flush(t);
    expect(mockElectronAPI.fs.mkdir).toHaveBeenCalledWith('/ws/.cockpit/sessions/agents');
    const writes = agentWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe('/ws/.cockpit/sessions/agents/msd1-x.json');
    expect(writes[0][1]).toContain('Reviewer');
    expect(writes[0][1]).toContain('review the cache');
    expect(main.agents).toHaveLength(1);
    expect(main.agents![0].file).toBe('agents/msd1-x.json');
    expect(t.sessionFile).toBe('agents/msd1-x.json');

    // A second flush must not duplicate the link.
    await store.flush(t);
    expect(main.agents).toHaveLength(1);
    expect(agentWrites()).toHaveLength(2);
  });

  it('scheduleWrites throttles rapid steps into a single write per agent', async () => {
    vi.useFakeTimers();
    try {
      const { feed, store, main } = makeHarness();
      fire(feed, 'agent:x', spawnEvent());
      // Spawning state counts as running → 1s throttle.
      store.scheduleWrites();
      store.scheduleWrites();
      store.scheduleWrites();
      expect(agentWrites()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(agentWrites()).toHaveLength(1);
      expect(main.agents).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('final forces a flush even when a throttle timer is pending', async () => {
    vi.useFakeTimers();
    try {
      const { feed, store } = makeHarness();
      fire(feed, 'agent:x', spawnEvent());
      const t = feed.transcripts.get('agent:x')!;
      store.scheduleWrites(); // pending 1s timer
      await store.flush(t);   // forced flush clears the timer
      expect(agentWrites()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(agentWrites()).toHaveLength(1); // no double write
    } finally {
      vi.useRealTimers();
    }
  });

  it('a corrupt file on hydrate is skipped', async () => {
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('not json {');
    const { feed } = makeHarness();
    await feed.hydrate([link('agent:x', 'agents/msd1-x.json')]);
    expect(feed.transcripts.size).toBe(0);
  });

  it('a written agent file hydrates back into an archived transcript (D8 round-trip)', async () => {
    const { feed, store, main } = makeHarness();
    fire(feed, 'agent:x', spawnEvent());
    fire(feed, 'agent:x', { kind: 'say', text: 'finding A', intent: 'finding' });
    fire(feed, 'agent:x', { kind: 'final', text: 'VERDICT', state: 'done' });
    const t = feed.transcripts.get('agent:x')!;
    await store.flush(t);
    expect(main.agents).toHaveLength(1);

    const written = (mockElectronAPI.fs.writeFile as any).mock.calls.find((c: any[]) => String(c[0]).includes('/agents/'));
    const payload = JSON.parse(written[1]);
    expect(payload.persona.name).toBe('Reviewer');
    expect(payload.state).toBe('done');

    // Simulate a fresh load: readFile returns the written file.
    (mockElectronAPI.fs.readFile as any).mockResolvedValue(JSON.stringify(payload));
    const feed2 = new AgentFeed();
    await feed2.hydrate(main.agents!);
    const rt = feed2.transcripts.get('agent:x')!;
    expect(rt.archived).toBe(true);
    expect(rt.persona.name).toBe('Reviewer');
    expect(rt.state).toBe('done');
    expect(rt.steps.some(m => m.content === 'finding A')).toBe(true);
    expect(rt.steps.some(m => m.content === 'VERDICT')).toBe(true);
  });

  it('deleteSessionFiles removes every linked agent file (T15 cascade)', async () => {
    const { store, main } = makeHarness();
    main.agents = [link('agent:x', 'agents/msd1-x.json'), link('agent:y', 'agents/msd1-y.json')];
    await store.deleteSessionFiles('msd1');
    expect(mockElectronAPI.fs.delete).toHaveBeenCalledWith('/ws/.cockpit/sessions/agents/msd1-x.json');
    expect(mockElectronAPI.fs.delete).toHaveBeenCalledWith('/ws/.cockpit/sessions/agents/msd1-y.json');
  });
});
