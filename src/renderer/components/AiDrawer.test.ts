import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AiDrawer } from './AiDrawer';
import { estimateMessagesTokens } from '../ai/token-counter';
import { mockElectronAPI } from '../../test/setup';

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
      addTerminal: vi.fn().mockResolvedValue('term-uuid'),
      writeToTerminal: vi.fn(),
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

    it('shows centered empty-state welcome, not a conversation card', async () => {
      drawer = await createDrawer();
      expect(drawer['messages']).toEqual([]);
      expect(q('.ai-chat-empty')).toBeTruthy();
      expect(q('.ai-chat-empty-logo')).toBeTruthy();
      expect(q('.ai-chat-empty-icon').querySelectorAll('circle').length).toBe(4);
      expect(q('.ai-chat-empty').textContent).toContain('Cockpit Agent ready');
      expect(q('.ai-chat-messages').querySelectorAll('.ai-chat-msg').length).toBe(0);
    });

    it('title is COCKPIT AGENT', async () => {
      drawer = await createDrawer();
      expect(q('.ai-drawer-title').textContent).toBe('COCKPIT AGENT');
    });

    it('messages area has aria-live="polite"', async () => {
      drawer = await createDrawer();
      expect(q('.ai-chat-messages').getAttribute('aria-live')).toBe('polite');
    });

    it('mode cycle button exists in input toolbar', async () => {
      drawer = await createDrawer();
      expect(q('.ai-input-mode-btn')).toBeTruthy();
    });

    it('AUTO mode is active by default', async () => {
      drawer = await createDrawer();
      expect(q('.ai-input-mode-btn').textContent).toBe('AUTO');
      expect(drawer['agentMode']).toBe('auto');
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

    it('notch chip opens drawer', async () => {
      drawer = await createDrawer();
      const notch = document.querySelector('.ai-drawer-notch') as HTMLElement;
      notch.click();
      await flush();
      expect(drawer['el'].classList.contains('is-open')).toBe(true);
      expect(notch.classList.contains('is-open')).toBe(true);
    });

    it('header close button closes drawer', async () => {
      drawer = await createDrawer();
      await drawer.toggle();
      expect(drawer['el'].classList.contains('is-open')).toBe(true);
      q('.ai-drawer-close-btn').click();
      expect(drawer['el'].classList.contains('is-open')).toBe(false);
      expect(document.querySelector('.ai-drawer-notch')!.classList.contains('is-open')).toBe(false);
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

    it('open() shifts canvas pan by occupiedLeft (inset glass card)', async () => {
      const cockpit = (window as any).__cockpit;
      drawer = await createDrawer();
      const occ = drawer['occupiedLeft'](drawer['drawerWidth']);
      await drawer.toggle();
      expect(cockpit.setView).toHaveBeenCalledWith(
        occ,  // panX + shellInset + width + shellInset (starting at 0)
        0,
        1,
      );
    });

    it('close() shifts canvas pan back by -occupiedLeft', async () => {
      const cockpit = (window as any).__cockpit;
      drawer = await createDrawer();
      const occ = drawer['occupiedLeft'](drawer['drawerWidth']);
      await drawer.toggle(); // open
      cockpit.setView.mockClear();
      cockpit.getCanvasState.mockReturnValue({ panX: occ, panY: 0, zoom: 1 });
      drawer['close']();
      expect(cockpit.setView).toHaveBeenCalledWith(0, 0, 1);
    });

    it('open() sets canvas overlayLeft to occupiedLeft', async () => {
      const cockpit = (window as any).__cockpit;
      drawer = await createDrawer();
      await drawer.toggle();
      expect(cockpit.setCanvasOverlay).toHaveBeenCalledWith(
        drawer['occupiedLeft'](drawer['drawerWidth']),
      );
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

  describe('agent mode cycle button', () => {
    it('one click cycles to plan', async () => {
      drawer = await createDrawer();
      q('.ai-input-mode-btn').click();
      expect(drawer['agentMode']).toBe('plan');
    });

    it('two clicks cycle to step', async () => {
      drawer = await createDrawer();
      q('.ai-input-mode-btn').click();
      q('.ai-input-mode-btn').click();
      expect(drawer['agentMode']).toBe('step');
    });

    it('three clicks return to auto', async () => {
      drawer = await createDrawer();
      q('.ai-input-mode-btn').click();
      q('.ai-input-mode-btn').click();
      q('.ai-input-mode-btn').click();
      expect(drawer['agentMode']).toBe('auto');
    });

    it('label tracks active mode', async () => {
      drawer = await createDrawer();
      q('.ai-input-mode-btn').click();
      expect(q('.ai-input-mode-btn').textContent).toBe('PLAN');
      q('.ai-input-mode-btn').click();
      expect(q('.ai-input-mode-btn').textContent).toBe('STEP');
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
      q('.ai-input-mode-btn').click();
      q('.ai-input-mode-btn').click();
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
      expect(drawer['messages']).toEqual([]);
      drawer['messages'] = [{ role: 'user', content: 'hi', timestamp: 1 }];
      drawer['initFirstSession']();
      expect(drawer['sessions']).toHaveLength(1);
      expect(drawer['sessions'][0].messages).toHaveLength(1);
      expect(drawer['sessions'][0].messages[0].content).toBe('hi');
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

    it('newSession clears detached float preview response', async () => {
      drawer = await createDrawer();
      await drawer['loadSessions']();
      drawer.detach();
      drawer['messages'] = [
        { role: 'user', content: 'hi', timestamp: 1 },
        { role: 'assistant', content: 'previous reply', timestamp: 2 },
      ];
      drawer['syncFloatPreviewToMessages']();
      const preview = document.querySelector('.ai-float-preview') as HTMLElement;
      expect(preview.style.display).not.toBe('none');
      expect(preview.textContent).toContain('previous reply');

      drawer['newSession']();

      expect(preview.style.display).toBe('none');
      expect(preview.textContent).toBe('');
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
      // Wait for runMessage() to finish — the in-flight run pushes the assistant
      // message and then calls saveSessionById(pinnedSessionId, this.messages).
      // Without waiting for isLoading to clear, the test can race the microtask
      // that finalizes the streaming placeholder.
      await vi.waitFor(() => expect(drawer['isLoading']).toBe(false), { timeout: 200, interval: 5 });
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
      const modelSelect = drawer['el'].querySelector<HTMLSelectElement>('.ai-settings-select[data-key="model-select"]')!;
      modelSelect.value = '__custom__';
      modelSelect.dispatchEvent(new Event('change'));
      (drawer['el'].querySelector('.ai-settings-input[data-key="model-custom"]') as HTMLInputElement).value = 'gpt-4';

      q('.ai-settings-save').click();
      await flush();

      expect(drawer['endpoint']).toBe('https://custom.com/v1');
      expect(drawer['apiKey']).toBe('sk-new');
      expect(drawer['model']).toBe('gpt-4');
      expect(drawer['settingsEl'].classList.contains('is-visible')).toBe(false);
    });

    it('toggles keep-view-still and persists aiSuppressViewMove', async () => {
      const { viewPrefs } = await import('../ai/view-prefs');
      drawer = await createDrawer();
      await drawer.toggle();
      q('.ai-drawer-settings-btn').click();

      const toggle = drawer['el'].querySelector<HTMLInputElement>('.ai-settings-input[data-key="suppressViewMove"]')!;
      expect(toggle).toBeTruthy();
      toggle.checked = true;
      q('.ai-settings-save').click();
      await flush();

      expect(viewPrefs.suppressViewMove).toBe(true);
      const prefs = (mockElectronAPI.prefs.save as any).mock.calls.at(-1)?.[0];
      expect(prefs?.aiSuppressViewMove).toBe(true);
    });
  });

  // ─── SENDING MESSAGES ────────────────────────────────────────────────────────

  describe('sending messages', () => {
    it('sends on button click, shows user + assistant messages', async () => {
      drawer = await createDrawer();
      await drawer.toggle();

      expect(q('.ai-chat-empty')).toBeTruthy();
      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Hello agent';
      q('.ai-chat-send-btn').click();
      await flush();

      expect(q('.ai-chat-empty')).toBeNull();
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

    it('ArrowUp/ArrowDown recall previous user messages', async () => {
      drawer = await createDrawer();
      await drawer.toggle();
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      drawer['messages'] = [
        { role: 'user', content: 'first', timestamp: 1 },
        { role: 'assistant', content: 'reply', timestamp: 2 },
        { role: 'user', content: 'second', timestamp: 3 },
      ];

      input.value = 'draft';
      input.setSelectionRange(0, 0);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(input.value).toBe('second');

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(input.value).toBe('first');

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(input.value).toBe('second');

      // Past newest entry restores the saved draft
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(input.value).toBe('draft');
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

    it('auto-escalates when the same tool fails 3 times in a row', async () => {
      let call = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        call++;
        if (call <= 3) return Promise.resolve(makeToolResponse('nonexistent_tool_xyz'));
        return Promise.resolve(makeTextResponse('Done after escalation.'));
      });

      drawer = await createDrawer();
      drawer['sessionsLoaded'] = true;
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'do a thing';
      q('.ai-chat-send-btn').click();
      await flush();
      await flush();

      const texts = drawer['messages'].map((m: any) => m.content).join('\n');
      expect(texts).toContain('Auto-escalation');
      expect(texts).toContain('nonexistent_tool_xyz');
      expect(texts).toContain('Done after escalation.');
      expect(call).toBe(4);
    });

    it('does not auto-escalate when different tools fail instead of the same one 3x', async () => {
      let call = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        call++;
        if (call === 1) return Promise.resolve(makeToolResponse('nonexistent_tool_a'));
        if (call === 2) return Promise.resolve(makeToolResponse('nonexistent_tool_b'));
        if (call === 3) return Promise.resolve(makeToolResponse('nonexistent_tool_a'));
        return Promise.resolve(makeTextResponse('Done.'));
      });

      drawer = await createDrawer();
      drawer['sessionsLoaded'] = true;
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'do a thing';
      q('.ai-chat-send-btn').click();
      await flush();
      await flush();

      const texts = drawer['messages'].map((m: any) => m.content).join('\n');
      expect(texts).not.toContain('Auto-escalation');
    });

    it('combines an auto-escalation with a same-round steering message into one user turn', async () => {
      let call = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        call++;
        // Steering arrives mid-run, right as the 3rd same-tool failure lands.
        if (call === 3) drawer['steeringMessage'] = 'focus on the config file instead';
        if (call <= 3) return Promise.resolve(makeToolResponse('nonexistent_tool_xyz'));
        return Promise.resolve(makeTextResponse('Done.'));
      });

      drawer = await createDrawer();
      drawer['sessionsLoaded'] = true;
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'do a thing';
      q('.ai-chat-send-btn').click();
      await flush();
      await flush();

      const bodies = (globalThis.fetch as any).mock.calls.map((c: any[]) => JSON.parse(c[1].body));
      const lastMessages = bodies[bodies.length - 1].messages;
      // No two consecutive user-role turns — many models skip tool calls when
      // they see back-to-back user messages.
      for (let i = 1; i < lastMessages.length; i++) {
        if (lastMessages[i].role === 'user') {
          expect(lastMessages[i - 1].role).not.toBe('user');
        }
      }
      const combined = lastMessages.filter((m: any) => m.role === 'user').map((m: any) => m.content).join('\n');
      expect(combined).toContain('AUTO-ESCALATION');
      expect(combined).toContain('focus on the config file instead');
    });

    it('runs a destructive tool call immediately in auto mode (no confirmation)', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(makeToolResponse('delete_file', JSON.stringify({ path: '/ws/foo.ts' })));
        return Promise.resolve(makeTextResponse('Done.'));
      });

      (window as any).__cockpit = {
        getWorkspacePath: () => '/ws',
        getCanvasState: () => ({ panX: 0, panY: 0, zoom: 1, cards: [] }),
        setView: vi.fn(),
        setCanvasOverlay: vi.fn(),
        revealFile: vi.fn().mockResolvedValue(undefined),
      };

      drawer = await createDrawer();
      drawer['sessionsLoaded'] = true;
      await drawer.toggle();
      expect(drawer['agentMode']).toBe('auto');

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Delete foo.ts';
      q('.ai-chat-send-btn').click();
      await flush();
      await flush();

      // No confirmation pause — the destructive tool runs immediately.
      expect((window as any).electronAPI.fs.delete).toHaveBeenCalledWith('/ws/foo.ts');
      expect(drawer['stepControlsEl'].classList.contains('is-visible')).toBe(false);
    });

    it('does not pause for a non-destructive tool call in auto mode', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(makeToolResponse('read_file', JSON.stringify({ path: '/ws/foo.ts' })));
        return Promise.resolve(makeTextResponse('Done.'));
      });

      drawer = await createDrawer();
      drawer['sessionsLoaded'] = true;
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Read foo.ts';
      q('.ai-chat-send-btn').click();
      await flush();
      await flush();

      expect((window as any).electronAPI.fs.readFile).toHaveBeenCalledWith('/ws/foo.ts');
      expect(drawer['stepControlsEl'].classList.contains('is-visible')).toBe(false);
    });

    it('pauses before every tool batch in step mode', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(makeToolResponse('read_file', JSON.stringify({ path: '/ws/foo.ts' })));
        return Promise.resolve(makeTextResponse('Done.'));
      });

      drawer = await createDrawer();
      drawer['sessionsLoaded'] = true;
      await drawer.toggle();
      drawer['agentMode'] = 'step';
      drawer['inputModeBtn'].textContent = 'STEP';

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Read foo.ts';
      q('.ai-chat-send-btn').click();
      await flush();

      expect((window as any).electronAPI.fs.readFile).not.toHaveBeenCalled();
      expect(drawer['stepControlsEl'].classList.contains('is-visible')).toBe(true);

      q('.ai-step-continue-btn').click();
      await flush();
      await flush();

      expect((window as any).electronAPI.fs.readFile).toHaveBeenCalledWith('/ws/foo.ts');
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

    it('shows loading dots in empty assistant messages', async () => {
      drawer = await createDrawer();
      drawer['messages'].push({ role: 'assistant', content: '', timestamp: Date.now() });
      drawer['renderMessages']();
      const loading = q('.ai-chat-messages').querySelector('.ai-chat-msg-assistant .ai-chat-msg-loading');
      expect(loading).toBeTruthy();
      expect(loading?.querySelectorAll('span').length).toBe(3);
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

    it('message copy button copies the full message text', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(makeTextResponse('Intro\n```js\nconst x = 1\n```\nOutro'));
      drawer = await createDrawer();
      await drawer.toggle();
      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Ask';
      q('.ai-chat-send-btn').click();
      await flush();
      const btn = q('.ai-chat-messages').querySelector<HTMLButtonElement>('.ai-chat-copy-btn')!;
      expect(btn.title).toBe('Copy text');
      expect(btn.querySelector('svg')).toBeTruthy();
      btn.click();
      await flush();
      expect((window as any).electronAPI.clipboard.writeText).toHaveBeenCalledWith('Intro\n```js\nconst x = 1\n```\nOutro');
    });

    it('code block renders a copy button that copies only the code', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(makeTextResponse('Here is code:\n```ts\nconst y = 2;\n\nconst z = 3;\n```\nDone.'));
      drawer = await createDrawer();
      await drawer.toggle();
      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'Ask';
      q('.ai-chat-send-btn').click();
      await flush();
      const codeBtn = q('.ai-chat-messages').querySelector<HTMLButtonElement>('.ai-chat-code-copy')!;
      expect(codeBtn).toBeTruthy();
      expect(codeBtn.title).toBe('Copy code');
      expect(codeBtn.querySelector('svg')).toBeTruthy();
      codeBtn.click();
      await flush();
      expect((window as any).electronAPI.clipboard.writeText).toHaveBeenCalledWith('const y = 2;\n\nconst z = 3;');
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

  // ─── SLASH COMMANDS ──────────────────────────────────────────────────────────

  describe('slash commands', () => {
    function type(input: HTMLTextAreaElement, text: string): void {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function press(input: HTMLTextAreaElement, key: string, shift = false): void {
      input.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true }));
    }

    it('typing "/" opens the slash command popup', async () => {
      drawer = await createDrawer();
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/');
      expect((q('.ai-slash-popup') as HTMLElement).style.display).toBe('flex');
    });

    it('popup lists default slash commands', async () => {
      drawer = await createDrawer();
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/');
      const items = q('.ai-slash-list').querySelectorAll('.ai-slash-item');
      const names = Array.from(items).map(el => el.querySelector('.ai-slash-name')?.textContent);
      expect(names).toContain('/new');
      expect(names).toContain('/opencode');
      expect(names).toContain('/compact');
    });

    it('filters commands as user types', async () => {
      drawer = await createDrawer();
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/n');
      expect(q('.ai-slash-list').querySelectorAll('.ai-slash-item').length).toBe(1);
      type(input, '/x');
      expect(q('.ai-slash-empty').style.display).toBe('');
      expect(q('.ai-slash-list').style.display).toBe('none');
    });

    it('pressing Enter with exact /new creates a new session', async () => {
      drawer = await createDrawer();
      await drawer['loadSessions']();
      const before = drawer['sessions'].length;
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/new');
      press(input, 'Enter');
      await flush();
      expect(drawer['sessions']).toHaveLength(before + 1);
      expect(input.value).toBe('');
      expect((q('.ai-slash-popup') as HTMLElement).style.display).toBe('none');
    });

    it('pressing Enter with /new and trailing spaces creates a new session', async () => {
      drawer = await createDrawer();
      await drawer['loadSessions']();
      const before = drawer['sessions'].length;
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/new   ');
      press(input, 'Enter');
      await flush();
      expect(drawer['sessions']).toHaveLength(before + 1);
    });

    it('typing /new with extra text sends a normal message, not a command', async () => {
      drawer = await createDrawer();
      await drawer.toggle();
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/new explain this');
      press(input, 'Enter');
      await flush();
      expect(q('.ai-chat-messages').querySelectorAll('.ai-chat-msg-user').length).toBe(1);
      expect(q('.ai-chat-messages').textContent).toContain('/new explain this');
    });

    it('ArrowDown and ArrowUp navigate popup items', async () => {
      drawer = await createDrawer();
      drawer.registerSlashCommand({ name: 'a', label: '/a', description: 'A', action: () => {} });
      drawer.registerSlashCommand({ name: 'b', label: '/b', description: 'B', action: () => {} });
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/');
      const items = () => q('.ai-slash-list').querySelectorAll('.ai-slash-item');
      expect(items().length).toBe(6);
      expect(items()[0].classList.contains('is-selected')).toBe(true);
      press(input, 'ArrowDown');
      expect(items()[1].classList.contains('is-selected')).toBe(true);
      press(input, 'ArrowUp');
      expect(items()[0].classList.contains('is-selected')).toBe(true);
    });

    it('Escape closes the popup', async () => {
      drawer = await createDrawer();
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/');
      expect((q('.ai-slash-popup') as HTMLElement).style.display).toBe('flex');
      press(input, 'Escape');
      expect((q('.ai-slash-popup') as HTMLElement).style.display).toBe('none');
    });

    it('clicking a command item autocompletes it into the input', async () => {
      drawer = await createDrawer();
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/');
      q('.ai-slash-item').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await flush();
      expect(input.value).toBe('/new');
      expect((q('.ai-slash-popup') as HTMLElement).style.display).toBe('flex');
    });

    it('Tab autocompletes the selected command into the input', async () => {
      drawer = await createDrawer();
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/');
      press(input, 'Tab');
      await flush();
      expect(input.value).toBe('/new');
    });

    it('autocompleting from a partial filter fills the full command', async () => {
      drawer = await createDrawer();
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/n');
      q('.ai-slash-item').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await flush();
      expect(input.value).toBe('/new');
    });

    it('registerSlashCommand can add a custom command', async () => {
      drawer = await createDrawer();
      const calls: string[] = [];
      drawer.registerSlashCommand({
        name: 'custom',
        label: '/custom',
        description: 'Custom command',
        action: () => { calls.push('custom'); },
      });
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/custom');
      press(input, 'Enter');
      await flush();
      expect(calls).toEqual(['custom']);
    });

    it('registerSlashCommand overwrites existing command with same name', async () => {
      drawer = await createDrawer();
      const calls: string[] = [];
      drawer.registerSlashCommand({
        name: 'new',
        label: '/new',
        description: 'Overridden',
        action: () => { calls.push('overridden'); },
      });
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/new');
      press(input, 'Enter');
      await flush();
      expect(calls).toEqual(['overridden']);
    });

    it('/opencode opens a new terminal and runs opencode', async () => {
      drawer = await createDrawer();
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/opencode');
      press(input, 'Enter');
      await flush();

      const cockpit = (window as any).__cockpit;
      expect(cockpit.addTerminal).toHaveBeenCalled();
      expect(cockpit.writeToTerminal).toHaveBeenCalledWith('term-uuid', 'opencode');
    });

    it('/opencode shows error when addTerminal is unavailable', async () => {
      drawer = await createDrawer();
      (window as any).__cockpit = {
        getWorkspacePath: () => '/ws',
        getCanvasState: vi.fn().mockReturnValue({ panX: 0, panY: 0, zoom: 1 }),
        setView: vi.fn(),
        setCanvasOverlay: vi.fn(),
      };
      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/opencode');
      press(input, 'Enter');
      await flush();

      expect(q('.ai-chat-messages').textContent).toContain('/opencode failed');
    });

    it('/compact summarizes conversation into session context', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(makeTextResponse('Summary text'));
      drawer = await createDrawer();
      await drawer['loadSessions']();

      drawer['messages'].push({ role: 'user', content: 'Plan the feature', timestamp: 1 });
      drawer['messages'].push({ role: 'assistant', content: 'Okay I will plan it.', timestamp: 2 });

      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/compact');
      press(input, 'Enter');
      await flush();

      const session = drawer['sessions'].find(s => s.id === drawer['currentSessionId']);
      expect(session?.context?.length).toBe(1);
      expect(session?.context?.[0].content).toContain('Summary text');
      expect(q('.ai-chat-messages').textContent).toContain('Context compacted');
    });

    it('/compact is a no-op when there is no conversation', async () => {
      drawer = await createDrawer();
      await drawer['loadSessions']();
      drawer['messages'] = [];

      const input = q('.ai-chat-input') as HTMLTextAreaElement;
      type(input, '/compact');
      press(input, 'Enter');
      await flush();

      expect(q('.ai-chat-messages').textContent).toContain('Nothing to compact');
    });
  });

  // ─── CONTEXT & COMPACTION ────────────────────────────────────────────────────

  describe('context and compaction', () => {
    it('buildHistoryForLLM uses session context when present', () => {
      drawer = new AiDrawer();
      const session = {
        id: 's1',
        title: '',
        createdAt: 1,
        updatedAt: 1,
        messages: [{ role: 'user' as const, content: 'old message', timestamp: 1 }],
        context: [{ role: 'system' as const, content: ' compacted context' }],
      };
      drawer['sessions'] = [session];
      drawer['currentSessionId'] = 's1';

      const history = drawer['buildHistoryForLLM']();
      expect(history).toEqual([{ role: 'system', content: ' compacted context' }]);
    });

    it('buildHistoryForLLM falls back to full user/assistant messages when context is empty', () => {
      drawer = new AiDrawer();
      drawer['messages'] = [
        { role: 'user' as const, content: 'first', timestamp: 1 },
        { role: 'assistant' as const, content: 'second', timestamp: 2 },
        { role: 'thinking' as const, content: 'thought', timestamp: 3 },
      ];
      const session = {
        id: 's1',
        title: '',
        createdAt: 1,
        updatedAt: 1,
        messages: [...drawer['messages']],
        context: [],
      };
      drawer['sessions'] = [session];
      drawer['currentSessionId'] = 's1';

      const history = drawer['buildHistoryForLLM']();
      expect(history).toEqual([
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'second' },
      ]);
    });

    it('buildHistoryForLLM carries tool results and assistant tool_calls across runs', () => {
      drawer = new AiDrawer();
      const toolCalls = [
        { id: 'call_a', type: 'function' as const, function: { name: 'read_file', arguments: '{"path":"/x.ts"}' } },
        { id: 'call_b', type: 'function' as const, function: { name: 'grep_workspace', arguments: '{"pattern":"foo"}' } },
      ];
      drawer['messages'] = [
        { role: 'user' as const, content: 'read the file', timestamp: 1 },
        { role: 'thinking' as const, content: '→ **read_file, grep_workspace**', timestamp: 2, toolCalls },
        { role: 'tool' as const, content: 'read_file=/x.ts', toolName: 'read_file', toolCallId: 'call_a', toolResult: 'export const x = 1;', timestamp: 3 },
        { role: 'tool' as const, content: 'grep_workspace=foo', toolName: 'grep_workspace', toolCallId: 'call_b', toolResult: '/x.ts:3: foo()', timestamp: 4 },
        { role: 'assistant' as const, content: 'done', timestamp: 5 },
      ];
      const session = {
        id: 's1',
        title: '',
        createdAt: 1,
        updatedAt: 1,
        messages: [...drawer['messages']],
        context: [],
      };
      drawer['sessions'] = [session];
      drawer['currentSessionId'] = 's1';

      const history = drawer['buildHistoryForLLM']();
      expect(history).toEqual([
        { role: 'user', content: 'read the file' },
        { role: 'assistant', tool_calls: toolCalls },
        { role: 'tool', tool_call_id: 'call_a', content: 'export const x = 1;' },
        { role: 'tool', tool_call_id: 'call_b', content: '/x.ts:3: foo()' },
        { role: 'assistant', content: 'done' },
      ]);
    });

    it('buildHistoryForLLM drops a tool-call turn when its results are missing (no broken pairing)', () => {
      drawer = new AiDrawer();
      const toolCalls = [
        { id: 'call_a', type: 'function' as const, function: { name: 'read_file', arguments: '{}' } },
      ];
      drawer['messages'] = [
        { role: 'user' as const, content: 'read', timestamp: 1 },
        { role: 'thinking' as const, content: '→ **read_file**', timestamp: 2, toolCalls },
      ];
      const session = {
        id: 's1',
        title: '',
        createdAt: 1,
        updatedAt: 1,
        messages: [...drawer['messages']],
        context: [],
      };
      drawer['sessions'] = [session];
      drawer['currentSessionId'] = 's1';

      const history = drawer['buildHistoryForLLM']();
      expect(history).toEqual([{ role: 'user', content: 'read' }]);
    });

    it('rebuilds the next run\'s history with tool_call_id intact (no gateway rejection)', async () => {
      let call = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        call++;
        if (call === 1) return Promise.resolve(makeToolResponse('read_file', '{"path":"/x.ts"}', 'call_a'));
        if (call === 2) return Promise.resolve(makeTextResponse('Done reading.'));
        return Promise.resolve(makeTextResponse('Continuing.'));
      });

      drawer = await createDrawer();
      drawer['sessionsLoaded'] = true;
      await drawer.toggle();

      // First run: model calls a tool, the tool executes, the model answers.
      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'read /x.ts';
      q('.ai-chat-send-btn').click();
      await flush();
      await flush();

      // Second run: the transcript now holds the previous tool round. The rebuilt
      // history MUST keep tool_call_id / tool_calls — collapsing it to
      // {role, content} makes strict gateways reject with "missing field tool_call_id".
      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'continue';
      q('.ai-chat-send-btn').click();
      await flush();
      await flush();

      const bodies = (globalThis.fetch as any).mock.calls.map((c: any[]) => JSON.parse(c[1].body));
      const lastMessages = bodies[bodies.length - 1].messages;
      const toolMsgs = lastMessages.filter((m: any) => m.role === 'tool');
      expect(toolMsgs.length).toBeGreaterThan(0);
      for (const m of toolMsgs) expect(m.tool_call_id).toBeTruthy();
      const assistantToolMsg = lastMessages.find((m: any) => m.tool_calls);
      expect(assistantToolMsg?.tool_calls?.[0]?.id).toBeTruthy();
    });

    it('auto-compacts when context usage reaches 80%', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(makeTextResponse('Compacted summary'));
      drawer = await createDrawer();
      await drawer.toggle();
      await drawer['loadSessions']();

      // Force a low context limit so a short conversation crosses the threshold.
      drawer['contextTokenLimit'] = 100;
      drawer['messages'] = [{ role: 'assistant', content: 'Cockpit Agent ready.', timestamp: 1 }];
      for (let i = 0; i < 15; i++) {
        drawer['messages'].push({ role: 'user', content: 'message number ' + i + ' with extra words', timestamp: 2 + i });
        drawer['messages'].push({ role: 'assistant', content: 'response number ' + i + ' with extra words back', timestamp: 3 + i });
      }

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'trigger compact';
      q('.ai-chat-send-btn').click();
      await flush();
      await flush();

      const session = drawer['sessions'].find(s => s.id === drawer['currentSessionId']);
      expect(session?.context?.length).toBe(1);
      expect(session?.context?.[0].content).toContain('Compacted summary');
    });

    it('estimateContextTokens counts system prompt plus messages', () => {
      drawer = new AiDrawer();
      const before = drawer['estimateContextTokens']();
      drawer['messages'].push({ role: 'user', content: 'a'.repeat(40), timestamp: 1 });
      const after = drawer['estimateContextTokens']();
      expect(after).toBeGreaterThan(before);
    });

    it('renderTokenUsage updates the token progress label', () => {
      drawer = new AiDrawer();
      drawer['render']();
      drawer['renderTokenUsage']();
      expect(q('.ai-token-progress-label').textContent).toContain('/');
    });

  });

  describe('empty-completion recovery', () => {
    it('recovers from an empty completion after a tool round and retries once', async () => {
      let call = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        call++;
        if (call === 1) return Promise.resolve(makeToolResponse('get_canvas_state'));
        // Round 2: empty completion — the stall that used to end with "No response."
        if (call === 2) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ choices: [{ message: { content: '', role: 'assistant' } }] }),
          });
        }
        return Promise.resolve(makeTextResponse('Done with the task.'));
      });

      drawer = await createDrawer();
      drawer['sessionsLoaded'] = true;
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'read the file and finish';
      q('.ai-chat-send-btn').click();
      await flush();
      await flush();

      const texts = drawer['messages'].map((m: any) => m.content).join('\n');
      expect(texts).toContain('Done with the task.');
      expect(texts).not.toContain('No response.');
      expect(call).toBe(3);
    });

    it('does not retry when the first call is already empty', async () => {
      let call = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        call++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ choices: [{ message: { content: '', role: 'assistant' } }] }),
        });
      });

      drawer = await createDrawer();
      drawer['sessionsLoaded'] = true;
      await drawer.toggle();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'say hi';
      q('.ai-chat-send-btn').click();
      await flush();
      await flush();

      const texts = drawer['messages'].map((m: any) => m.content).join('\n');
      expect(texts).toContain('empty completion');
      expect(call).toBe(1);
    });

    it('auto-compacts and continues when the retry is also empty', async () => {
      let call = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        call++;
        if (call === 1) return Promise.resolve(makeToolResponse('get_canvas_state'));
        // Rounds 2-3: two empty completions → fold+retry, then auto-compact.
        if (call <= 3) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ choices: [{ message: { content: '', role: 'assistant' } }] }),
          });
        }
        return Promise.resolve(makeTextResponse('Resumed after auto-compact.'));
      });

      drawer = await createDrawer();
      await drawer.toggle();
      await drawer['loadSessions']();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'read the file and finish';
      q('.ai-chat-send-btn').click();
      await flush();
      await flush();

      const texts = drawer['messages'].map((m: any) => m.content).join('\n');
      expect(texts).toContain('Resumed after auto-compact.');
      expect(texts).toContain('Auto-compacted');
      // The compacted context must be persisted for the next run to resume from.
      const session = drawer['sessions'].find(s => s.id === drawer['currentSessionId']);
      expect(session?.context?.length).toBe(1);
      expect(call).toBe(4);
    });

    it('keeps going through repeated empties after auto-compact instead of giving up', async () => {
      let call = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        call++;
        if (call === 1) return Promise.resolve(makeToolResponse('get_canvas_state'));
        // 2nd-4th calls empty: fold → auto-compact → keep retrying.
        if (call <= 4) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ choices: [{ message: { content: '', role: 'assistant' } }] }),
          });
        }
        return Promise.resolve(makeTextResponse('Finally done.'));
      });

      drawer = await createDrawer();
      await drawer.toggle();
      await drawer['loadSessions']();

      (q('.ai-chat-input') as HTMLTextAreaElement).value = 'read the file and finish';
      q('.ai-chat-send-btn').click();
      await flush();
      await flush();

      const texts = drawer['messages'].map((m: any) => m.content).join('\n');
      expect(texts).toContain('Finally done.');
      // The run must NOT have ended with the endpoint-diagnostic message.
      expect(texts).not.toContain('endpoint responded without output');
      expect(call).toBe(5);
    });

    it('foldToolContext trims old tool rounds so the whole request stays under the ceiling', async () => {
      drawer = await createDrawer();
      const big = 'x'.repeat(120000); // ~30k estimated tokens — one big read_file result
      const apiMessages: any[] = [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'task' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'a', content: big },
        { role: 'assistant', content: null, tool_calls: [{ id: 'b', type: 'function', function: { name: 'write_file', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'b', content: 'Written' },
      ];
      const folded = drawer['foldToolContext'](apiMessages, 16000);
      expect(folded).toBe(true);
      expect(apiMessages.some((m: any) => (m.content || '').startsWith('[Context trimmed'))).toBe(true);
      // The folded note must not split an assistant tool_call from its tool result,
      // and the WHOLE request (system + users + kept tail) must stay under the budget.
      expect(estimateMessagesTokens(apiMessages)).toBeLessThan(16000);
    });
  });
});
