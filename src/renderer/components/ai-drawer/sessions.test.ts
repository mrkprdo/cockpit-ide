import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionStore } from './sessions';
import type { AiDrawerDom, Session } from './types';
import { mockElectronAPI } from '../../../test/setup';

function makeDom(): AiDrawerDom {
  document.body.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'ai-sessions-panel';
  const list = document.createElement('div');
  list.className = 'ai-sessions-list';
  panel.appendChild(list);
  document.body.appendChild(panel);
  return { sessionsPanelEl: panel, sessionsListEl: list } as unknown as AiDrawerDom;
}

function makeStore(dom: AiDrawerDom): SessionStore {
  (window as any).__cockpit = { getWorkspacePath: () => '/ws' };
  return new SessionStore(dom, {
    getMessages: () => [],
    setMessages: () => {},
    getIsLoading: () => false,
    renderMessages: () => {},
    syncFloatPreviewToMessages: () => {},
    onInitFirstSession: () => {},
  });
}

function session(id: string, firstUserMessage: string): Session {
  return {
    id,
    title: '',
    createdAt: 1,
    updatedAt: 1,
    messages: firstUserMessage ? [{ role: 'user', content: firstUserMessage, timestamp: 1 }] : [],
    context: [],
  };
}

describe('SessionStore — list rendering', () => {
  let dom: AiDrawerDom;
  let store: SessionStore;

  beforeEach(() => {
    vi.clearAllMocks();
    dom = makeDom();
    store = makeStore(dom);
  });

  it('renders one row per session with title and age', () => {
    store.sessions = [session('a', 'fix the cache'), session('b', 'review the diff')];
    store.currentSessionId = 'a';
    store.renderSessionsList();

    const items = dom.sessionsListEl.querySelectorAll('.ai-session-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('fix the cache');
    expect(items[0].classList.contains('is-active')).toBe(true);
  });

  it('shows the empty state when there are no sessions', () => {
    store.renderSessionsList();
    expect(dom.sessionsListEl.textContent).toContain('No sessions');
  });

  it('adds a filter input above the list exactly once', () => {
    store.sessions = [session('a', 'one')];
    store.renderSessionsList();
    store.renderSessionsList();
    expect(dom.sessionsPanelEl.querySelectorAll('.ai-session-filter')).toHaveLength(1);
  });

  it('filters the list by title', () => {
    store.sessions = [session('a', 'fix the cache'), session('b', 'review the diff')];
    store.renderSessionsList();

    const filter = dom.sessionsPanelEl.querySelector('.ai-session-filter') as HTMLInputElement;
    filter.value = 'cache';
    filter.dispatchEvent(new Event('input'));

    const items = dom.sessionsListEl.querySelectorAll('.ai-session-item');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('fix the cache');
  });

  it('says so when the filter matches nothing', () => {
    store.sessions = [session('a', 'fix the cache')];
    store.sessionFilter = 'zzz';
    store.renderSessionsList();
    expect(dom.sessionsListEl.textContent).toContain('No matching sessions');
  });
});

describe('SessionStore — delete confirmation', () => {
  let dom: AiDrawerDom;
  let store: SessionStore;

  beforeEach(() => {
    vi.clearAllMocks();
    dom = makeDom();
    store = makeStore(dom);
    store.sessions = [session('a', 'keep me'), session('b', 'delete me')];
    store.currentSessionId = 'a';
    store.renderSessionsList();
  });

  it('clicking × asks first and does nothing when cancelled', async () => {
    const btn = dom.sessionsListEl.querySelectorAll<HTMLButtonElement>('.ai-session-delete')[1];
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    expect(document.querySelector('.confirm-modal-msg')?.textContent).toContain('delete me');
    document.querySelector<HTMLButtonElement>('#confirm-cancel')!.click();
    await new Promise(r => setTimeout(r, 0));

    expect(store.sessions.map(s => s.id)).toEqual(['a', 'b']);
  });

  it('clicking × deletes the session once confirmed', async () => {
    const btn = dom.sessionsListEl.querySelectorAll<HTMLButtonElement>('.ai-session-delete')[1];
    btn.click();
    await new Promise(r => setTimeout(r, 0));

    document.querySelector<HTMLButtonElement>('#confirm-ok')!.click();
    await new Promise(r => setTimeout(r, 0));

    expect(store.sessions.map(s => s.id)).toEqual(['a']);
    expect(mockElectronAPI.fs.delete).toHaveBeenCalledWith('/ws/.cockpit/sessions/b.json');
  });

  it('deleteSession() itself stays unconditional (programmatic path)', () => {
    store.deleteSession('b');
    expect(store.sessions.map(s => s.id)).toEqual(['a']);
    expect(document.querySelector('.confirm-modal-msg')).toBeNull();
  });
});
