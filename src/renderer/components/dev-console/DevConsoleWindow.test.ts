import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DevConsoleWindow } from './DevConsoleWindow';
import { reportFailure } from '../../health/monitor';
import { getDefaultBus } from '../../agents/bus';
import type { AgentMessage } from '../../agents/types';
import { mockElectronAPI } from '../../../test/setup';

// installIpcTrace subscribes to window.electronAPI.__trace.subscribe exactly once
// (module-level, idempotent) — capture that callback so tests can inject trace
// entries into the shared unified stream.
const traceCbs: Array<(e: unknown) => void> = [];
const logPushCbs: Array<(sig: unknown) => void> = [];

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function contentOf(dev: DevConsoleWindow): HTMLElement {
  return dev.element.querySelector('.dev-console-content') as HTMLElement;
}

describe('DevConsoleWindow', () => {
  let container: HTMLElement;
  let dev: DevConsoleWindow;

  beforeEach(() => {
    container = makeContainer();
    (window as any).electronAPI.__trace.subscribe = vi.fn((cb: (e: unknown) => void) => {
      traceCbs.push(cb);
      return vi.fn();
    });
    (window as any).electronAPI.log.onPush = vi.fn((cb: (sig: unknown) => void) => {
      logPushCbs.push(cb);
      return vi.fn();
    });
    dev = new DevConsoleWindow(container, '/test/ws');
  });

  afterEach(() => {
    dev.destroy();
    container.remove();
  });

  it('renders the card root with a unified stream and a filter bar (no tabs)', () => {
    const el = dev.element;
    expect(el.className).toContain('dev-console');
    expect(el.querySelector('.dev-console-tab')).toBeNull();
    expect(el.querySelector('.dev-console-filter-search')).not.toBeNull();
    expect(el.querySelector('.dev-console-filter-toggle')).not.toBeNull();
    expect(el.querySelector('.dev-console-content')).not.toBeNull();
  });

  it('shows an empty state when nothing has been logged', () => {
    expect(contentOf(dev).textContent).toContain('No entries');
  });

  it('captures console.log into the unified stream', () => {
    console.log('a captured line');
    expect(contentOf(dev).textContent).toContain('a captured line');
    expect(contentOf(dev).textContent).toContain('console');
  });

  it('shows failure signals in the stream', () => {
    reportFailure({ kind: 'llm.stream-error', source: 'ai-drawer/llm-loop.ts', message: 'stream broke' });
    const text = contentOf(dev).textContent;
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
    expect(contentOf(dev).textContent).toContain('heartbeat');
    expect(contentOf(dev).textContent).toContain('agent');
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
    const text = contentOf(dev).textContent;
    expect(text).toContain('fs:readDir');
    expect(text).toContain('2.0 KB');
    expect(text).toContain('ok');
  });

  it('hides a category when its checkbox is unchecked', () => {
    console.log('kept line');
    const cb = traceCbs[0];
    cb?.({ channel: 'git:status', type: 'send', at: Date.now(), payloadSize: 10 });
    expect(contentOf(dev).textContent).toContain('git:status');

    const ipcBox = dev.element.querySelector<HTMLInputElement>('[data-cat="ipc"]')!;
    ipcBox.checked = false;
    ipcBox.dispatchEvent(new Event('change'));
    expect(contentOf(dev).textContent).not.toContain('git:status');
    expect(contentOf(dev).textContent).toContain('kept line');
  });

  it('shows main-process logs pushed over log:push', () => {
    const cb = logPushCbs[0];
    cb?.({ source: 'main', level: 'warn', message: 'workspace selected /ws', at: Date.now() });
    const text = contentOf(dev).textContent;
    expect(text).toContain('workspace selected /ws');
    expect(text).toContain('main');
  });

  it('filters console entries by minimum level', () => {
    console.log('a log line');
    console.error('an error line');
    const select = dev.element.querySelector<HTMLSelectElement>('.dev-console-filter-level')!;
    select.value = 'error';
    select.dispatchEvent(new Event('change'));
    const text = contentOf(dev).textContent;
    expect(text).toContain('an error line');
    expect(text).not.toContain('a log line');
  });

  it('filters by search text', () => {
    console.log('unique needle here');
    console.log('unrelated line');
    const input = dev.element.querySelector<HTMLInputElement>('.dev-console-filter-search')!;
    input.value = 'needle';
    input.dispatchEvent(new Event('input'));
    const text = contentOf(dev).textContent;
    expect(text).toContain('unique needle here');
    expect(text).not.toContain('unrelated line');
  });

  it('posts a specs validation report as a block entry', async () => {
    (mockElectronAPI.fs.readDir as any).mockResolvedValue([]);
    (mockElectronAPI.fs.readFile as any).mockResolvedValue(null);
    const btn = dev.element.querySelector<HTMLButtonElement>('[data-action="run-specs"]')!;
    btn.click();
    await new Promise((r) => setTimeout(r, 20));
    const text = contentOf(dev).textContent;
    expect(text).toContain('No spec collections');
  });

  it('destroy removes the element and unsubscribes feeds', () => {
    const el = dev.element;
    dev.destroy();
    expect(el.isConnected).toBe(false);
    expect(() => reportFailure({ kind: 'window.crash', source: 'x', message: 'y' })).not.toThrow();
  });
});
