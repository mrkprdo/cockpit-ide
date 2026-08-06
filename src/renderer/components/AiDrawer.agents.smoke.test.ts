// AiDrawer.agents.smoke.test.ts — replaces the deleted AgentsWindow.smoke.test.ts
// (T19). Drives spawn → broadcast say → final purely through tool calls against
// a real DOM and asserts the strip, the main chat (which IS the room), and the
// PoV render. No manual UI setup: this is the exact path the LLM uses
// (agent_spawn + agent_broadcast).

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AiDrawer } from './AiDrawer';
import { agentSpawnTool } from '../agents/agent-tools';
import { getAgentExecutor } from '../agents/executor';
import { mockElectronAPI } from '../../test/setup';

function jsonResponse(content?: string, toolCalls?: any[]): Response {
  return new Response(JSON.stringify({
    choices: [{
      message: { role: 'assistant', content, tool_calls: toolCalls },
      finish_reason: toolCalls ? 'tool_calls' : 'stop',
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function flush(ms = 30): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function waitFor(check: () => boolean, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('timed out waiting for smoke condition');
    await flush();
  }
}

describe('AiDrawer agents smoke (tool-call driven)', () => {
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
    globalThis.fetch = vi.fn();

    (window as any).__cockpit = {
      getWorkspacePath: () => '/ws',
      getCanvasState: vi.fn().mockReturnValue({ panX: 0, panY: 0, zoom: 1 }),
      setView: vi.fn(),
      setCanvasOverlay: vi.fn(),
      addTerminal: vi.fn().mockResolvedValue('term-uuid'),
      writeToTerminal: vi.fn(),
    };
    (mockElectronAPI.fs.readFile as any).mockResolvedValue(null);
    (mockElectronAPI.fs.writeFile as any).mockResolvedValue(true);
    (mockElectronAPI.fs.mkdir as any).mockResolvedValue(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (window as any).__cockpit;
    drawer?.['saveDebounceTimer'] && clearTimeout(drawer['saveDebounceTimer']);
    // Leave no running agents behind for the next test.
    getAgentExecutor().purgeAll();
  });

  it('spawn → broadcast say → final all render in the chat (the room), strip, and PoV', async () => {
    // First completion: call agent_broadcast. Second: the verdict.
    let calls = 0;
    (globalThis.fetch as any).mockImplementation(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(jsonResponse('checking the cache key', [
          { id: 'tc-b', type: 'function', function: { name: 'agent_broadcast', arguments: '{"message":"the tenant id is missing","intent":"finding"}' } },
        ]));
      }
      return Promise.resolve(jsonResponse('VERDICT: cache key must include the tenant id'));
    });

    drawer = new AiDrawer();
    await flush();
    await drawer.toggle();
    await drawer['loadSessions']();

    // A reviewer is a verify-stage agent; satisfy the SDLC pipeline first
    // (plan → implement → test confirmed, with a tester having actually run).
    const pipeline = getAgentExecutor().getPipeline();
    pipeline.recordRun('test');
    pipeline.confirm('plan');
    pipeline.confirm('implement');
    pipeline.confirm('test');

    // Spawn through the exact tool the LLM uses.
    const spawn = JSON.parse(await agentSpawnTool.execute({
      skill: 'reviewer',
      context: 'Review the cache layer for tenant isolation.',
      expected_result: 'findings brief',
    } as never, {} as never));
    expect(spawn.agentId).toMatch(/^agent:/);

    // The session runs headless; wait for the final verdict to land in the feed.
    const feed = drawer['feed'];
    await waitFor(() => {
      const t = feed.transcripts.get(spawn.agentId);
      return t?.state === 'done';
    });

    // Strip appeared with the agent tab.
    const strip = drawer['el'].querySelector('.ai-pov-strip') as HTMLElement;
    expect(strip.classList.contains('is-hidden')).toBe(false);
    expect(strip.textContent).toContain('Reviewer');

    // The main chat IS the room — the broadcast say + the verdict landed there.
    const chatText = (drawer['el'].querySelector('.ai-chat-messages') as HTMLElement).textContent as string;
    expect(chatText).toContain('the tenant id is missing');
    expect(chatText).toContain('VERDICT: cache key must include the tenant id');

    // PoV shows the brief, the tool chip, the say, and the verdict.
    drawer['switchView'](spawn.agentId);
    const povText = (drawer['el'].querySelector('.ai-chat-messages') as HTMLElement).textContent as string;
    expect(povText).toContain('Review the cache layer for tenant isolation.');
    expect(povText).toContain('agent_broadcast');
    expect(povText).toContain('VERDICT: cache key must include the tenant id');
  });

  it('a persona spawn shows its initials (not emoji) and colour in the strip (sanitised)', async () => {
    (globalThis.fetch as any).mockResolvedValue(jsonResponse('persona done'));
    drawer = new AiDrawer();
    await flush();
    await drawer.toggle();
    await drawer['loadSessions']();

    const spawn = JSON.parse(await agentSpawnTool.execute({
      persona: {
        name: 'Cache Skeptic',
        icon: '🧊',
        color: '#00e5ff',
        system_prompt: 'Attack cache key correctness.',
      },
      context: 'the cache layer',
      expected_result: 'brief',
    } as never, {} as never));

    const feed = drawer['feed'];
    await waitFor(() => feed.transcripts.get(spawn.agentId)?.state === 'done');

    const strip = drawer['el'].querySelector('.ai-pov-strip') as HTMLElement;
    // Emoji icon is stripped to text initials.
    expect(strip.textContent).not.toContain('🧊');
    expect(strip.textContent).toContain('CS');
    expect(strip.textContent).toContain('Cache Skeptic');
    const tab = strip.querySelector(`[data-view="${spawn.agentId}"]`) as HTMLElement | null;
    expect(tab).toBeTruthy();
    expect(tab?.style.getPropertyValue('--agent-color')).toBe('#00e5ff');

    // status() reports the ad-hoc persona as custom with skill null (T10).
    const st = getAgentExecutor().status().find((s: any) => s.id === spawn.agentId);
    expect(st).toBeDefined();
    expect(st!.isCustom).toBe(true);
    expect(st!.skill).toBeNull();
    expect(st!.label).toContain('Cache Skeptic');
  });
});
