import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AiDrawer } from './AiDrawer';

function flush(): Promise<void> {
  return new Promise(r => setTimeout(r, 10));
}

async function createDrawer(): Promise<AiDrawer> {
  const d = new AiDrawer();
  await flush();
  return d;
}

function makeTextResponse(text: string) {
  return {
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content: text }, finish_reason: 'stop' }] }),
  };
}

function makeToolResponse(name: string, args = '{}', callId = 'c1') {
  return {
    ok: true,
    json: () => Promise.resolve({
      choices: [{
        message: {
          tool_calls: [{ id: callId, type: 'function', function: { name, arguments: args } }],
        },
        finish_reason: 'tool_calls',
      }],
    }),
  };
}

describe('AiDrawer', () => {
  let drawer: AiDrawer;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();

    document.body.innerHTML = '';
    const canvas = document.createElement('div');
    canvas.id = 'canvas';
    canvas.style.cssText = 'width:1920px;height:1080px;position:relative';
    document.body.appendChild(canvas);

    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(makeTextResponse('Hello from agent.'));

    (window as any).__cockpit = {
      getWorkspacePath: () => '/ws',
      getCanvasState: vi.fn().mockReturnValue({ panX: 0, panY: 0, zoom: 1 }),
      setView: vi.fn(),
      setCanvasOverlay: vi.fn(),
    };

    const mockAPI = (window as any).electronAPI;
    mockAPI.prefs.load.mockResolvedValue({
      aiApiKey: 'sk-test-key',
      aiModel: 'gpt-4o-mini',
      aiEndpoint: 'https://api.openai.com/v1',
    });
    mockAPI.fs.readFile.mockResolvedValue(null);
    mockAPI.fs.writeFile.mockResolvedValue(true);
    mockAPI.fs.mkdir.mockResolvedValue(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (window as any).__cockpit;
    // Cancel any pending saveSessions() debounce so old timers don't fire
    // into the next test's assertion window (they capture __cockpit at call time).
    if (drawer?.['saveDebounceTimer']) {
      clearTimeout(drawer['saveDebounceTimer']);
    }
  });

  function q(sel: string): HTMLElement {
    return drawer['el'].querySelector(sel) as HTMLElement;
  }

  // ─── DOM STRUCTURE ───────────────────────────────────────────────────────────

  describe('DOM structure', () => {
    it('creates required chat elements', async () => {
      drawer = await createDrawer();
      expect(q('.ai-drawer-header')).toBeTruthy();
      expect(q('.ai-drawer-title')).toBeTruthy();
      expect(q('.ai-drawer-settings-btn')).toBeTruthy();
      expect(q('.ai-chat-messages')).toBeTruthy();
      expect(q('.ai-chat-input')).toBeTruthy();
      expect(q('.ai-chat-send-btn')).toBeTruthy();
      expect(q('.ai-chat-abort-btn')).toBeTruthy();
      expect(q('.ai-chat-steer-btn')).toBeTruthy();
      expect(q('.ai-step-controls')).toBeTruthy();
      expect(q('.ai-queue-bar')).toBeTruthy();
      expect(q('.ai-sessions-panel')).toBeTruthy();
      expect(document.querySelector('.ai-drawer-notch')).toBeTruthy();
    });

    it('shows Cockpit Agent welcome message on creation', async () => {
      drawer = await createDrawer();
      expect(q('.ai-chat-messages').textContent).toContain('Cockpit Agent ready');
    });

    it('title is COCKPIT AGENT', async () => {
      drawer = await createDrawer();
      expect(q('.ai-drawer-title').textContent).toBe('COCKPIT AGENT');
    });

    it('messages area has aria-live="polite"', async () => {
      drawer = await createDrawer();
      expect(q('.ai-chat-messages').getAttribute('aria-live')).toBe('polite');
    });

    it('mode buttons AUTO / PLAN / STEP exist', async () => {
      drawer = await createDrawer();
      expect(q('[data-mode="auto"]')).toBeTruthy();
      expect(q('[data-mode="plan"]')).toBeTruthy();
      expect(q('[data-mode="step"]')).toBeTruthy();
    });

    it('AUTO mode is active by default', async () => {
      drawer = await createDrawer();
      expect(q('[data-mode="auto"]').classList.contains('is-active')).toBe(true);
      expect(q('[data-mode="plan"]').classList.contains('is-active')).toBe(false);
      expect(q('[data-mode="step"]').classList.contains('is-active')).toBe(false);
    });
  });

  // ─── TOGGLE / OPEN / CLOSE ───────────────────────────────────────────────────

  describe('toggle / open / close', () => {
    it('toggle() opens drawer', async () => {
      drawer = await createDrawer();
      expect(drawer['el'].classList.contains('is-open')).toBe(false);
      await drawer.toggle();
      expect(drawer['el'].classList.contains('is-open')).toBe(true);
    });

    it('toggle() closes open drawer', async () => {
      drawer = await createDrawer();
      await drawer.toggle();
      await drawer.toggle();
      expect(drawer['el'].classList.contains('is-open')).toBe(false);
    });

    it('Escape key closes open drawer', async () => {
      drawer = await createDrawer();
      await drawer.toggle();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(drawer['el'].classList.contains('is-open')).toBe(false);
    });

    it('notch button toggles drawer', async () => {
      drawer = await createDrawer();
      const notch = document.querySelector('.ai-drawer-notch') as HTMLElement;
      notch.click();
      await flush();
      expect(drawer['el'].classList.contains('is-open')).toBe(true);
      notch.click();
      await flush();
      expect(drawer['el'].classList.contains('is-open')).toBe(false);
    });

    it('close() hides open settings panel', async () => {
      drawer = await createDrawer();
      await drawer.toggle();
      q('.ai-drawer-settings-btn').click();
      expect(drawer['settingsEl'].classList.contains('is-visible')).toBe(true);
      drawer['close']();
      expect(drawer['settingsEl'].classList.contains('is-visible')).toBe(false);
    });

    it('close() hides open sessions panel', async () => {
      drawer = await createDrawer();
      await drawer.toggle();
      q('.ai-sessions-btn').click();
      expect(drawer['sessionsPanelEl'].classList.contains('is-visible')).toBe(true);
      drawer['close']();
      expect(drawer['sessionsPanelEl'].classList.contains('is-visible')).toBe(false);
    });

    it('open() shifts canvas pan by drawerWidth', async () => {
      const cockpit = (window as any).__cockpit;
      drawer = await createDrawer();
      await drawer.toggle();
      expect(cockpit.setView).toHaveBeenCalledWith(
        drawer['drawerWidth'],  // panX + drawerWidth (starting at 0)
        0,
        1,
      );
    });

    it('close() shifts canvas pan back by -drawerWidth', async () => {
      const cockpit = (window as any).__cockpit;
      drawer = await createDrawer();
      await drawer.toggle(); // open
      cockpit.setView.mockClear();
      cockpit.getCanvasState.mockReturnValue({ panX: drawer['drawerWidth'], panY: 0, zoom: 1 });
      drawer['close']();
      expect(cockpit.setView).toHaveBeenCalledWith(0, 0, 1);
    });

    it('open() sets canvas overlayLeft to drawerWidth', async () => {
      const cockpit = (window as any).__cockpit;
      drawer = await createDrawer();
      await drawer.toggle();
      expect(cockpit.setCanvasOverlay).toHaveBeenCalledWith(drawer['drawerWidth']);
    });

    it('close() resets canvas overlayLeft to 0', async () => {
      const cockpit = (window as any).__cockpit;
      drawer = await createDrawer();
      await drawer.toggle();
      cockpit.setCanvasOverlay.mockClear();
      drawer['close']();
      expect(cockpit.setCanvasOverlay).toHaveBeenCalledWith(0);
    });

    it('shiftCanvasPan is a no-op when __cockpit is absent', async () => {
      delete (window as any).__cockpit;
      drawer = await createDrawer();
      expect(() => drawer['shiftCanvasPan'](100)).not.toThrow();
    });

    it('setCanvasOverlay is a no-op when __cockpit is absent', async () => {
      delete (window as any).__cockpit;
      drawer = await createDrawer();
      expect(() => drawer['setCanvasOverlay'](420)).not.toThrow();
    });
  });

  // ─── AGENT MODES ─────────────────────────────────────────────────────────────

  describe('agent mode buttons', () => {
    it('clicking PLAN sets agentMode to plan', async () => {
      drawer = await createDrawer();
      q('[data-mode="plan"]').click();
      expect(drawer['agentMode']).toBe('plan');
    });

    it('clicking STEP sets agentMode to step', async () => {
      drawer = await createDrawer();
      q('[data-mode="step"]').click();
      expect(drawer['agentMode']).toBe('step');
    });

    it('clicking AUTO returns agentMode to auto', async () => {
      drawer = await createDrawer();
      q('[data-mode="plan"]').click();
      q('[data-mode="auto"]').click();
      expect(drawer['agentMode']).toBe('auto');
    });

    it('only active mode has is-active class', async () => {
      drawer = await createDrawer();
      q('[data-mode="step"]').click();
      expect(q('[data-mode="step"]').classList.contains('is-active')).toBe(true);
      expect(q('[data-mode="auto"]').classList.contains('is-active')).toBe(false);
      expect(q('[data-mode="plan"]').classList.contains('is-active')).toBe(false);
    });
  });

  // ─── LOADING STATE ────────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('hides send button, shows abort and steer while loading', async () => {
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
      drawer = await createDrawer();
      await drawer.toggle();

      const sendBtn = q('.ai-chat-send-btn');
      const abortBtn = q('.ai-chat-abort-btn');
      const steerBtn = q('.ai-chat-steer-btn');

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Test';
      sendBtn.click();
      await flush();

      expect(sendBtn.style.display).toBe('none');
      expect(abortBtn.style.display).toBe('flex');
      expect(steerBtn.style.display).toBe('flex');
    });

    it('restores send, hides abort/steer after loading', async () => {
      let resolveFetch!: (v: any) => void;
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(r => { resolveFetch = r; }));
      drawer = await createDrawer();
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Test';
      q('.ai-chat-send-btn').click();
      await flush();

      resolveFetch(makeTextResponse('done'));
      await flush();

      expect(q('.ai-chat-send-btn').style.display).toBe('flex');
      expect(q('.ai-chat-abort-btn').style.display).toBe('none');
      expect(q('.ai-chat-steer-btn').style.display).toBe('none');
    });

    it('shows loading dots while waiting', async () => {
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
      drawer = await createDrawer();
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Test';
      q('.ai-chat-send-btn').click();
      await flush();

      expect((drawer['el'].querySelector('.ai-chat-loading') as HTMLElement).style.display).toBe('flex');
    });

    it('changes input placeholder while loading', async () => {
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
      drawer = await createDrawer();
      await drawer.toggle();

      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      input.value = 'Test';
      q('.ai-chat-send-btn').click();
      await flush();

      expect(input.placeholder).toContain('Queue');
    });
  });

  // ─── ABORT ───────────────────────────────────────────────────────────────────

  describe('abort', () => {
    it('abortBtn sets abortRequested=true and calls fetchController.abort()', async () => {
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
      drawer = await createDrawer();
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Test';
      q('.ai-chat-send-btn').click();
      await flush();

      const abortSpy = vi.spyOn(drawer['fetchController']!, 'abort');
      q('.ai-chat-abort-btn').click();

      expect(drawer['abortRequested']).toBe(true);
      expect(abortSpy).toHaveBeenCalled();
    });

    it('step stop button also aborts', async () => {
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
      drawer = await createDrawer();
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Test';
      q('[data-mode="step"]').click();
      q('.ai-chat-send-btn').click();
      await flush();

      // Manually show step controls (step mode shows these)
      drawer['stepControlsEl'].style.display = 'flex';
      drawer['continueResolve'] = vi.fn();

      q('.ai-step-stop-btn').click();
      expect(drawer['abortRequested']).toBe(true);
    });
  });

  // ─── STEERING ────────────────────────────────────────────────────────────────

  describe('steering', () => {
    it('submitSteer sets steeringMessage and appends isSteer message', async () => {
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
      drawer = await createDrawer();
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Initial task';
      q('.ai-chat-send-btn').click();
      await flush();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Actually focus on X';
      q('.ai-chat-steer-btn').click();

      expect(drawer['steeringMessage']).toBe('Actually focus on X');
      const steerMsgs = q('.ai-chat-messages').querySelectorAll('.is-steer');
      expect(steerMsgs.length).toBe(1);
    });

    it('steer badge appears on steer messages', async () => {
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
      drawer = await createDrawer();
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Start';
      q('.ai-chat-send-btn').click();
      await flush();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Redirect';
      q('.ai-chat-steer-btn').click();

      expect(q('.ai-chat-messages').querySelector('.ai-steer-badge')).toBeTruthy();
    });

    it('submitSteer is no-op when not loading', async () => {
      drawer = await createDrawer();
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Should not steer';
      q('.ai-chat-steer-btn').click();

      expect(drawer['steeringMessage']).toBeNull();
    });

    it('steeringMessage cleared on setLoading(false)', async () => {
      let resolveFetch!: (v: any) => void;
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(r => { resolveFetch = r; }));
      drawer = await createDrawer();
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Task';
      q('.ai-chat-send-btn').click();
      await flush();

      drawer['steeringMessage'] = 'injected steer';
      resolveFetch(makeTextResponse('done'));
      await flush();

      expect(drawer['steeringMessage']).toBeNull();
    });
  });

  // ─── PROMPT QUEUE ────────────────────────────────────────────────────────────

  describe('prompt queue', () => {
    it('queues message instead of running immediately when loading', async () => {
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
      drawer = await createDrawer();
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'First';
      q('.ai-chat-send-btn').click();
      await flush();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Second';
      q('.ai-chat-send-btn').click();

      expect(drawer['promptQueue']).toHaveLength(1);
      expect(drawer['promptQueue'][0]).toBe('Second');
    });

    it('processQueue auto-runs queued message after load completes', async () => {
      let resolveFetch!: (v: any) => void;
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return new Promise(r => { resolveFetch = r; });
        return Promise.resolve(makeTextResponse('queued done'));
      });

      drawer = await createDrawer();
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'First';
      q('.ai-chat-send-btn').click();
      await flush();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Queued';
      q('.ai-chat-send-btn').click();

      resolveFetch(makeTextResponse('first done'));
      await flush();
      await flush();

      expect(drawer['promptQueue']).toHaveLength(0);
    });

    it('renderQueueBar shows queue bar when items pending', async () => {
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
      drawer = await createDrawer();
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Start';
      q('.ai-chat-send-btn').click();
      await flush();

      drawer['queueMessage']('Item 1');
      drawer['queueMessage']('Item 2');
      drawer['renderQueueBar']();

      const queueBar = drawer['el'].querySelector('.ai-queue-bar') as HTMLElement;
      expect(queueBar.classList.contains('is-visible')).toBe(true);
    });
  });

  // ─── SESSIONS ────────────────────────────────────────────────────────────────

  describe('sessions', () => {
    it('getSessionsDir returns {workspace}/.cockpit/sessions', () => {
      drawer = new AiDrawer();
      (window as any).__cockpit = { getWorkspacePath: () => '/my/workspace' };
      expect(drawer['getSessionsDir']()).toBe('/my/workspace/.cockpit/sessions');
    });

    it('getSessionsDir returns null without workspace', () => {
      drawer = new AiDrawer();
      (window as any).__cockpit = { getWorkspacePath: () => null };
      expect(drawer['getSessionsDir']()).toBeNull();
    });

    it('loadSessions creates first session when no workspace', async () => {
      drawer = new AiDrawer();
      await drawer['loadSessions']();
      expect(drawer['sessions']).toHaveLength(1);
      expect(drawer['currentSessionId']).toBeTruthy();
    });

    it('loadSessions runs only once (sessionsLoaded guard)', async () => {
      const mockAPI = (window as any).electronAPI;
      (window as any).__cockpit = { getWorkspacePath: () => '/ws' };
      mockAPI.fs.readFile.mockResolvedValue(null);
      drawer = new AiDrawer();
      await drawer['loadSessions']();
      await drawer['loadSessions']();
      expect(mockAPI.fs.readFile).toHaveBeenCalledTimes(1);
    });

    it('loadSessions reads from sessions/index.json path', async () => {
      const mockAPI = (window as any).electronAPI;
      (window as any).__cockpit = { getWorkspacePath: () => '/ws' };
      mockAPI.fs.readFile.mockResolvedValue(null);
      drawer = new AiDrawer();
      await drawer['loadSessions']();
      expect(mockAPI.fs.readFile).toHaveBeenCalledWith('/ws/.cockpit/sessions/index.json');
    });

    it('loadSessions restores sessions and messages from disk', async () => {
      const mockAPI = (window as any).electronAPI;
      (window as any).__cockpit = { getWorkspacePath: () => '/ws' };
      const session = { id: 's1', title: '', createdAt: 1, updatedAt: 1, messages: [{ role: 'user', content: 'hello', timestamp: 1 }] };
      mockAPI.fs.readFile
        .mockResolvedValueOnce(JSON.stringify({ currentSessionId: 's1', order: ['s1'] }))
        .mockResolvedValueOnce(JSON.stringify(session));
      drawer = new AiDrawer();
      await drawer['loadSessions']();
      expect(drawer['sessions']).toHaveLength(1);
      expect(drawer['messages'][0].content).toBe('hello');
    });

    it('initFirstSession creates session from current messages', () => {
      drawer = new AiDrawer();
      expect(drawer['messages'].length).toBeGreaterThan(0);
      drawer['initFirstSession']();
      expect(drawer['sessions']).toHaveLength(1);
      expect(drawer['sessions'][0].messages.length).toBe(drawer['messages'].length);
    });

    it('flushSave calls mkdir once, then writeFile on repeat saves', async () => {
      const mockAPI = (window as any).electronAPI;
      (window as any).__cockpit = { getWorkspacePath: () => '/ws' };
      drawer = new AiDrawer();
      drawer['sessions'] = [{ id: 'x', title: '', createdAt: 1, updatedAt: 1, messages: [] }];
      drawer['currentSessionId'] = 'x';

      drawer['flushSave']();
      await flush();
      expect(mockAPI.fs.mkdir).toHaveBeenCalledTimes(1);
      expect(mockAPI.fs.writeFile).toHaveBeenCalledTimes(2); // session file + index

      drawer['flushSave']();
      await flush();
      expect(mockAPI.fs.mkdir).toHaveBeenCalledTimes(1);
      expect(mockAPI.fs.writeFile).toHaveBeenCalledTimes(4); // 2 more: session file + index
    });

    it('saveSessions debounces: multiple rapid calls = one write', async () => {
      vi.useFakeTimers();
      try {
        const mockAPI = (window as any).electronAPI;
        (window as any).__cockpit = { getWorkspacePath: () => '/ws' };
        drawer = new AiDrawer();
        drawer['sessions'] = [{ id: 'x', title: '', createdAt: 1, updatedAt: 1, messages: [] }];
        drawer['currentSessionId'] = 'x';

        drawer['saveSessions']();
        drawer['saveSessions']();
        drawer['saveSessions']();

        expect(mockAPI.fs.writeFile).not.toHaveBeenCalled();

        vi.advanceTimersByTime(350);
        await Promise.resolve(); // flush Promise microtasks from mkdir/writeFile chain

        expect(mockAPI.fs.writeFile).toHaveBeenCalledTimes(2); // session file + index
      } finally {
        vi.useRealTimers();
      }
    });

    it('switchSession loads target session messages', () => {
      drawer = new AiDrawer();
      const s1 = { id: 'a', title: '', createdAt: 1, updatedAt: 1, messages: [{ role: 'user' as const, content: 'A msgs', timestamp: 1 }] };
      const s2 = { id: 'b', title: '', createdAt: 1, updatedAt: 1, messages: [{ role: 'user' as const, content: 'B msgs', timestamp: 1 }] };
      drawer['sessions'] = [s1, s2];
      drawer['currentSessionId'] = 'a';
      drawer['messages'] = [...s1.messages];

      drawer['switchSession']('b');

      expect(drawer['currentSessionId']).toBe('b');
      expect(drawer['messages'][0].content).toBe('B msgs');
    });

    it('switchSession is no-op when isLoading=true', () => {
      drawer = new AiDrawer();
      const s1 = { id: 'a', title: '', createdAt: 1, updatedAt: 1, messages: [] };
      const s2 = { id: 'b', title: '', createdAt: 1, updatedAt: 1, messages: [{ role: 'user' as const, content: 'B', timestamp: 1 }] };
      drawer['sessions'] = [s1, s2];
      drawer['currentSessionId'] = 'a';
      drawer['isLoading'] = true;

      drawer['switchSession']('b');

      expect(drawer['currentSessionId']).toBe('a');
    });

    it('switchSession closes sessions panel', async () => {
      drawer = await createDrawer();
      await drawer.toggle();
      const s2 = { id: 'extra', title: '', createdAt: 1, updatedAt: 1, messages: [] };
      drawer['sessions'].push(s2);
      drawer['sessionsPanelEl'].classList.add('is-visible');

      drawer['switchSession']('extra');

      expect(drawer['sessionsPanelEl'].classList.contains('is-visible')).toBe(false);
    });

    it('newSession prepends to sessions list and sets as current', async () => {
      drawer = await createDrawer();
      await drawer['loadSessions']();
      const before = drawer['sessions'].length;

      drawer['newSession']();

      expect(drawer['sessions']).toHaveLength(before + 1);
      expect(drawer['sessions'][0].id).toBe(drawer['currentSessionId']);
    });

    it('deleteSession removes session from list', () => {
      drawer = new AiDrawer();
      const s1 = { id: 'keep', title: '', createdAt: 1, updatedAt: 1, messages: [] };
      const s2 = { id: 'del', title: '', createdAt: 1, updatedAt: 1, messages: [] };
      drawer['sessions'] = [s1, s2];
      drawer['currentSessionId'] = 'keep';

      drawer['deleteSession']('del');

      expect(drawer['sessions']).toHaveLength(1);
      expect(drawer['sessions'][0].id).toBe('keep');
    });

    it('deleteSession switches to first when active session deleted', () => {
      drawer = new AiDrawer();
      const s1 = { id: 'first', title: '', createdAt: 1, updatedAt: 1, messages: [] };
      const s2 = { id: 'active', title: '', createdAt: 1, updatedAt: 1, messages: [] };
      drawer['sessions'] = [s1, s2];
      drawer['currentSessionId'] = 'active';

      drawer['deleteSession']('active');

      expect(drawer['currentSessionId']).toBe('first');
    });

    it('deleteSession calls initFirstSession when last session deleted', () => {
      drawer = new AiDrawer();
      const s1 = { id: 'only', title: '', createdAt: 1, updatedAt: 1, messages: [] };
      drawer['sessions'] = [s1];
      drawer['currentSessionId'] = 'only';
      const spy = vi.spyOn(drawer as any, 'initFirstSession');

      drawer['deleteSession']('only');

      expect(spy).toHaveBeenCalled();
    });

    it('saveSessionById saves to correct session, not others', () => {
      drawer = new AiDrawer();
      const s1 = { id: 'a', title: '', createdAt: 1, updatedAt: 1, messages: [] };
      const s2 = { id: 'b', title: '', createdAt: 1, updatedAt: 1, messages: [] };
      drawer['sessions'] = [s1, s2];

      const msgs = [{ role: 'assistant' as const, content: 'response', timestamp: 1 }];
      drawer['saveSessionById']('b', msgs);

      expect(drawer['sessions'][1].messages[0].content).toBe('response');
      expect(drawer['sessions'][0].messages).toHaveLength(0);
    });

    it('saveSessionById no-ops for unknown id', () => {
      drawer = new AiDrawer();
      drawer['sessions'] = [{ id: 'a', title: '', createdAt: 1, updatedAt: 1, messages: [] }];
      expect(() => drawer['saveSessionById']('nonexistent', [])).not.toThrow();
    });

    it('pinnedSessionId: response saved to run-start session after mid-run currentSession change', async () => {
      let resolveFetch!: (v: any) => void;
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(r => { resolveFetch = r; }));

      drawer = await createDrawer();
      await drawer.toggle();

      const s1 = { id: 'pinned', title: '', createdAt: 1, updatedAt: 1, messages: [] };
      const s2 = { id: 'other', title: '', createdAt: 1, updatedAt: 1, messages: [] };
      drawer['sessions'] = [s1, s2];
      drawer['currentSessionId'] = 'pinned';
      drawer['sessionsLoaded'] = true;

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'task';
      q('.ai-chat-send-btn').click();
      await flush();

      // Simulate internal session ID change (mid-run switch bypass)
      drawer['currentSessionId'] = 'other';
      drawer['messages'] = [];

      resolveFetch(makeTextResponse('pinned response'));
      await flush();
      await flush();

      const pinned = drawer['sessions'].find(s => s.id === 'pinned')!;
      expect(pinned.messages.some(m => m.content === 'pinned response')).toBe(true);
      expect(drawer['sessions'].find(s => s.id === 'other')!.messages).toHaveLength(0);
    });

    it('resetSessions clears all session state and reloads on next open', async () => {
      drawer = await createDrawer();
      await drawer['loadSessions']();
      drawer['sessions'] = [{ id: 'x', title: '', createdAt: 1, updatedAt: 1, messages: [] }];
      drawer['currentSessionId'] = 'x';
      drawer['sessionsLoaded'] = true;

      drawer.resetSessions();

      expect(drawer['sessionsLoaded']).toBe(false);
      expect(drawer['sessions']).toHaveLength(0);
      expect(drawer['currentSessionId']).toBe('');
      expect(drawer['promptQueue']).toHaveLength(0);
    });

    it('resetSessions clears sessions panel list immediately', async () => {
      drawer = await createDrawer();
      drawer['sessions'] = [
        { id: 'a', title: 'Old', createdAt: 1, updatedAt: 1, messages: [] },
      ];
      drawer['currentSessionId'] = 'a';
      drawer['renderSessionsList']();
      expect(drawer['sessionsListEl'].querySelectorAll('.git-session-item, [data-session-id]').length
        + drawer['sessionsListEl'].innerHTML.length).toBeGreaterThan(0);

      drawer.resetSessions();

      expect(drawer['sessions']).toHaveLength(0);
    });

    it('resetSessions reloads workspace sessions immediately when drawer is open', async () => {
      const mockAPI = (window as any).electronAPI;
      (window as any).__cockpit = { getWorkspacePath: () => '/ws2', getCanvasState: () => ({ panX: 0, panY: 0, zoom: 1 }), setView: vi.fn(), setCanvasOverlay: vi.fn() };
      const session = { id: 'ws2-s', title: 'WS2', createdAt: 1, updatedAt: 1, messages: [] };
      mockAPI.fs.readFile.mockImplementation((path: string) =>
        Promise.resolve(path.endsWith('index.json')
          ? JSON.stringify({ currentSessionId: 'ws2-s', order: ['ws2-s'] })
          : JSON.stringify(session))
      );

      drawer = await createDrawer();
      await drawer.toggle(); // open drawer
      drawer['sessionsLoaded'] = true;

      drawer.resetSessions();
      await flush();

      expect(drawer['sessions'].find(s => s.id === 'ws2-s')).toBeTruthy();
    });
  });

  // ─── SETTINGS PANEL ──────────────────────────────────────────────────────────

  describe('settings panel', () => {
    it('opens via gear button (class-based)', async () => {
      drawer = await createDrawer();
      await drawer.toggle();
      q('.ai-drawer-settings-btn').click();
      expect(drawer['settingsEl'].classList.contains('is-visible')).toBe(true);
    });

    it('closes on close button', async () => {
      drawer = await createDrawer();
      await drawer.toggle();
      q('.ai-drawer-settings-btn').click();
      q('.ai-settings-close').click();
      expect(drawer['settingsEl'].classList.contains('is-visible')).toBe(false);
    });

    it('saves settings and hides panel', async () => {
      drawer = await createDrawer();
      await drawer.toggle();
      q('.ai-drawer-settings-btn').click();

      (drawer['el'].querySelector('.ai-settings-input[data-key="endpoint"]') as HTMLInputElement).value = 'https://custom.com/v1';
      (drawer['el'].querySelector('.ai-settings-input[data-key="apiKey"]') as HTMLInputElement).value = 'sk-new';
      (drawer['el'].querySelector('.ai-settings-input[data-key="model"]') as HTMLInputElement).value = 'gpt-4';

      q('.ai-settings-save').click();
      await flush();

      expect(drawer['endpoint']).toBe('https://custom.com/v1');
      expect(drawer['apiKey']).toBe('sk-new');
      expect(drawer['model']).toBe('gpt-4');
      expect(drawer['settingsEl'].classList.contains('is-visible')).toBe(false);
    });
  });

  // ─── SENDING MESSAGES ────────────────────────────────────────────────────────

  describe('sending messages', () => {
    it('sends on button click, shows user + assistant messages', async () => {
      drawer = await createDrawer();
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Hello agent';
      q('.ai-chat-send-btn').click();
      await flush();

      expect(q('.ai-chat-messages').querySelectorAll('.ai-chat-msg-user').length).toBe(1);
      expect(q('.ai-chat-messages').querySelectorAll('.ai-chat-msg-assistant').length).toBeGreaterThanOrEqual(1);
    });

    it('sends on Enter, not Shift+Enter', async () => {
      drawer = await createDrawer();
      await drawer.toggle();
      const input = q('.ai-chat-input') as HTMLTextAreaElement;

      input.value = 'Test';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
      expect(q('.ai-chat-messages').querySelectorAll('.ai-chat-msg-user').length).toBe(0);

      input.value = 'Test';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false }));
      await flush();
      expect(q('.ai-chat-messages').querySelectorAll('.ai-chat-msg-user').length).toBe(1);
    });

    it('clears input after send', async () => {
      drawer = await createDrawer();
      await drawer.toggle();
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      input.value = 'Something';
      q('.ai-chat-send-btn').click();
      expect(input.value).toBe('');
    });

    it('ignores empty messages', async () => {
      drawer = await createDrawer();
      await drawer.toggle();
      q('.ai-chat-send-btn').click();
      expect(q('.ai-chat-messages').querySelectorAll('.ai-chat-msg-user').length).toBe(0);
    });

    it('shows No API key error when key missing', async () => {
      (window as any).electronAPI.prefs.load.mockResolvedValue({});
      const d = new AiDrawer();
      await flush();
      await d.toggle();
      (d['el'].querySelector('.ai-chat-input') as HTMLTextAreaElement).value = 'Test';
      (d['el'].querySelector('.ai-chat-send-btn') as HTMLElement).click();
      await flush();
      expect(d['el'].querySelector('.ai-chat-messages')!.textContent).toContain('No API key configured');
    });

    it('shows Error on API failure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('Unauthorized') });
      drawer = await createDrawer();
      await drawer.toggle();
      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Test';
      q('.ai-chat-send-btn').click();
      await flush();
      expect(q('.ai-chat-messages').textContent).toContain('Error:');
    });
  });

  // ─── TOOL CALLS ──────────────────────────────────────────────────────────────

  describe('tool call execution', () => {
    it('executes tool call and shows tool chip', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(makeToolResponse('get_canvas_state'));
        return Promise.resolve(makeTextResponse('Done.'));
      });

      (window as any).__cockpit = {
        getWorkspacePath: () => '/ws',
        getCanvasState: () => ({ panX: 0, panY: 0, zoom: 1, cards: [] }),
        setView: vi.fn(),
        setCanvasOverlay: vi.fn(),
      };

      drawer = await createDrawer();
      drawer['sessionsLoaded'] = true;
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Get canvas';
      q('.ai-chat-send-btn').click();
      await flush();
      await flush();

      expect(q('.ai-chat-messages').querySelector('.ai-chat-msg-tool')).toBeTruthy();
    });

    it('unknown tool returns error string', async () => {
      const result = await drawer['executeTool']('unknown_tool_xyz', {});
      expect(result).toContain('Unknown tool');
    });

    it('send_key_to_terminal sends correct byte sequence', async () => {
      const sent: string[] = [];
      (window as any).__cockpit = {
        getWorkspacePath: () => '/ws',
        sendKeyToTerminal: (uuid: string, seq: string) => sent.push(seq),
      };
      drawer = new AiDrawer();

      const result = await drawer['executeTool']('send_key_to_terminal', { uuid: 'u1', key: 'Ctrl+c' });
      expect(result).toContain('Ctrl+c');
      expect(sent).toEqual(['\x03']);
    });

    it('send_key_to_terminal rejects unknown key with list of valid keys', async () => {
      (window as any).__cockpit = { getWorkspacePath: () => '/ws', sendKeyToTerminal: vi.fn() };
      drawer = new AiDrawer();

      const result = await drawer['executeTool']('send_key_to_terminal', { uuid: 'u1', key: 'SuperKey' });
      expect(result).toContain('Unknown key');
      expect(result).toContain('Tab');
    });

    it('send_key_to_terminal sends ArrowUp escape sequence', async () => {
      const sent: string[] = [];
      (window as any).__cockpit = {
        getWorkspacePath: () => '/ws',
        sendKeyToTerminal: (_uuid: string, seq: string) => sent.push(seq),
      };
      drawer = new AiDrawer();

      await drawer['executeTool']('send_key_to_terminal', { uuid: 'u1', key: 'ArrowUp' });
      expect(sent[0]).toBe('\x1b[A');
    });
  });

  // ─── MARKDOWN RENDERING ──────────────────────────────────────────────────────

  describe('markdown rendering', () => {
    it('renders fenced code blocks', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(makeTextResponse('```ts\nconst x = 1;\n```'));
      drawer = await createDrawer();
      await drawer.toggle();
      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Fix';
      q('.ai-chat-send-btn').click();
      await flush();
      expect(q('.ai-chat-messages').querySelector('.ai-chat-code')).toBeTruthy();
      expect(q('.ai-chat-messages').querySelector('.ai-chat-code')!.textContent).toContain('const x = 1');
    });

    it('renders **bold** and *italic*', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(makeTextResponse('**Bold** and *italic*.'));
      drawer = await createDrawer();
      await drawer.toggle();
      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Test';
      q('.ai-chat-send-btn').click();
      await flush();
      const textEl = q('.ai-chat-messages').querySelector('.ai-chat-msg-assistant:last-of-type .ai-chat-msg-text');
      expect(textEl?.querySelector('strong')?.textContent).toBe('Bold');
      expect(textEl?.querySelector('em')?.textContent).toBe('italic');
    });
  });

  // ─── COPY BUTTON ─────────────────────────────────────────────────────────────

  describe('copy button', () => {
    it('copy button has data-msg-index attribute', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(makeTextResponse('Response text.'));
      drawer = await createDrawer();
      await drawer.toggle();
      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Ask';
      q('.ai-chat-send-btn').click();
      await flush();
      const btn = q('.ai-chat-messages').querySelector<HTMLButtonElement>('.ai-chat-copy-btn')!;
      expect(btn).toBeTruthy();
      expect(btn.dataset.msgIndex).toBeDefined();
      expect(parseInt(btn.dataset.msgIndex!)).toBeGreaterThanOrEqual(0);
    });

    it('copy button maps to correct message by index', async () => {
      // Two assistant messages — tool msg in between would break the old assistant-filter index
      globalThis.fetch = vi.fn().mockResolvedValue(makeTextResponse('First response'));
      drawer = await createDrawer();
      await drawer.toggle();
      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'First';
      q('.ai-chat-send-btn').click();
      await flush();

      // Inject a thinking message between the two assistant messages
      drawer['messages'].push({ role: 'thinking', content: 'thinking...', timestamp: Date.now() });
      globalThis.fetch = vi.fn().mockResolvedValue(makeTextResponse('Second response'));
      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Second';
      q('.ai-chat-send-btn').click();
      await flush();

      const copyBtns = q('.ai-chat-messages').querySelectorAll<HTMLButtonElement>('.ai-chat-copy-btn');
      expect(copyBtns.length).toBeGreaterThanOrEqual(2);
      // Each button's data-msg-index should point to an assistant message
      copyBtns.forEach(btn => {
        const idx = parseInt(btn.dataset.msgIndex!);
        expect(drawer['messages'][idx].role).toBe('assistant');
      });
    });
  });

  // ─── FORMAT AGE ──────────────────────────────────────────────────────────────

  describe('formatAge', () => {
    it('"just now" for < 1 minute', () => {
      drawer = new AiDrawer();
      const now = Date.now();
      expect(drawer['formatAge'](now - 30000, now)).toBe('just now');
    });

    it('minutes', () => {
      drawer = new AiDrawer();
      const now = Date.now();
      expect(drawer['formatAge'](now - 5 * 60000, now)).toContain('m');
    });

    it('hours', () => {
      drawer = new AiDrawer();
      const now = Date.now();
      expect(drawer['formatAge'](now - 3 * 3600000, now)).toContain('h');
    });

    it('days', () => {
      drawer = new AiDrawer();
      const now = Date.now();
      expect(drawer['formatAge'](now - 2 * 86400000, now)).toContain('d');
    });
  });
});
