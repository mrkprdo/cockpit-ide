import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DevConsolePlugin } from './DevConsolePlugin';
import { reportFailure } from '../../health/monitor';
import { getDefaultBus } from '../../agents/bus';
import type { AgentMessage } from '../../agents/types';
import { mockElectronAPI } from '../../../test/setup';

// installIpcTrace subscribes to window.electronAPI.__trace.subscribe exactly once
// (module-level, idempotent) — capture that callback so tests can inject trace
// entries into the shared unified stream.
const traceCbs: Array<(e: unknown) => void> = [];

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function contentOf(plugin: DevConsolePlugin): HTMLElement {
  return plugin.element.querySelector('.dev-console-content') as HTMLElement;
}

describe('DevConsolePlugin', () => {
  let container: HTMLElement;
  let plugin: DevConsolePlugin;

  beforeEach(() => {
    container = makeContainer();
    (window as any).electronAPI.__trace.subscribe = vi.fn((cb: (e: unknown) => void) => {
      traceCbs.push(cb);
      return vi.fn();
    });
    plugin = new DevConsolePlugin(container, '/test/ws');
  });

  afterEach(() => {
    plugin.destroy();
    container.remove();
  });

  it('renders the card root with a unified stream and a filter bar (no tabs)', () => {
    const el = plugin.element;
    expect(el.className).toContain('dev-console');
    expect(el.querySelector('.dev-console-tab')).toBeNull();
    expect(el.querySelector('.dev-console-filter-search')).not.toBeNull();
    expect(el.querySelector('.dev-console-filter-toggle')).not.toBeNull();
    expect(el.querySelector('.dev-console-content')).not.toBeNull();
  });

  it('shows an empty state when nothing has been logged', () => {
    expect(contentOf(plugin).textContent).toContain('No entries');
  });

  it('captures console.log into the unified stream', () => {
    console.log('a captured line');
    expect(contentOf(plugin).textContent).toContain('a captured line');
    expect(contentOf(plugin).textContent).toContain('console');
  });

  it('shows failure signals in the stream', () => {
    reportFailure({ kind: 'llm.stream-error', source: 'ai-drawer/llm-loop.ts', message: 'stream broke' });
    const text = contentOf(plugin).textContent;
    expect(text).toContain('llm.stream-error');
    expect(text).toContain('stream broke');
    expect(text).toContain('health');
  });

  it('shows agent bus messages in the stream', () => {
    const bus = getDefaultBus();
    bus.publish({
      id: 'm1',
      type: 'status',
      from: 'main',
      to: '*',
      topic: 'test',
      payload: 'heartbeat',
      ts: Date.now(),
    } as AgentMessage);
    expect(contentOf(plugin).textContent).toContain('heartbeat');
    expect(contentOf(plugin).textContent).toContain('agent');
  });

  it('shows IPC traces in the stream with formatted meta', () => {
    const cb = traceCbs[0];
    cb?.({
      channel: 'fs:readDir',
      type: 'invoke',
      at: Date.now(),
      payloadSize: 2048,
      durationMs: 3.5,
      ok: true,
    });
    const text = contentOf(plugin).textContent;
    expect(text).toContain('fs:readDir');
    expect(text).toContain('2.0 KB');
    expect(text).toContain('ok');
  });

  it('hides a category when its checkbox is unchecked', () => {
    console.log('kept line');
    const cb = traceCbs[0];
    cb?.({ channel: 'git:status', type: 'send', at: Date.now(), payloadSize: 10 });
    expect(contentOf(plugin).textContent).toContain('git:status');

    const ipcBox = plugin.element.querySelector<HTMLInputElement>('[data-cat="ipc"]')!;
    ipcBox.checked = false;
    ipcBox.dispatchEvent(new Event('change'));
    expect(contentOf(plugin).textContent).not.toContain('git:status');
    expect(contentOf(plugin).textContent).toContain('kept line');
  });

  it('filters console entries by minimum level', () => {
    console.log('a log line');
    console.error('an error line');
    const select = plugin.element.querySelector<HTMLSelectElement>('.dev-console-filter-level')!;
    select.value = 'error';
    select.dispatchEvent(new Event('change'));
    const text = contentOf(plugin).textContent;
    expect(text).toContain('an error line');
    expect(text).not.toContain('a log line');
  });

  it('filters by search text', () => {
    console.log('unique needle here');
    console.log('unrelated line');
    const input = plugin.element.querySelector<HTMLInputElement>('.dev-console-filter-search')!;
    input.value = 'needle';
    input.dispatchEvent(new Event('input'));
    const text = contentOf(plugin).textContent;
    expect(text).toContain('unique needle here');
    expect(text).not.toContain('unrelated line');
  });

  it('posts a specs validation report as a block entry', async () => {
    (mockElectronAPI.fs.readDir as any).mockResolvedValue([]);
    (mockElectronAPI.fs.readFile as any).mockResolvedValue(null);
    const btn = plugin.element.querySelector<HTMLButtonElement>('[data-action="run-specs"]')!;
    btn.click();
    await new Promise((r) => setTimeout(r, 20));
    const text = contentOf(plugin).textContent;
    expect(text).toContain('No spec collections');
  });

  it('destroy removes the element and unsubscribes feeds', () => {
    const el = plugin.element;
    plugin.destroy();
    expect(el.isConnected).toBe(false);
    expect(() => reportFailure({ kind: 'plugin.crash', source: 'x', message: 'y' })).not.toThrow();
  });
});
