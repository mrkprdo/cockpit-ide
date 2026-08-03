import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DevConsolePlugin } from './DevConsolePlugin';
import { reportFailure } from '../../health/monitor';
import { getDefaultBus } from '../../agents/bus';
import type { AgentMessage } from '../../agents/types';
import { mockElectronAPI } from '../../../test/setup';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('DevConsolePlugin', () => {
  let container: HTMLElement;
  let plugin: DevConsolePlugin;

  beforeEach(() => {
    container = makeContainer();
    plugin = new DevConsolePlugin(container, '/test/ws');
  });

  afterEach(() => {
    plugin.destroy();
    container.remove();
  });

  it('renders the card root with a tab bar of 5 tabs', () => {
    const el = plugin.element;
    expect(el.className).toContain('dev-console');
    const tabs = el.querySelectorAll('.dev-console-tab');
    expect(tabs).toHaveLength(5);
    const labels = Array.from(tabs).map((t) => t.textContent);
    expect(labels).toEqual(['Logs', 'IPC', 'Health', 'Agents', 'Specs']);
  });

  it('defaults to the Logs tab', () => {
    const content = plugin.element.querySelector('.dev-console-content') as HTMLElement;
    expect(content.textContent).toContain('No log entries.');
  });

  it('switches tabs on click', () => {
    const healthTab = plugin.element.querySelector('[data-tab="health"]') as HTMLElement;
    healthTab.click();
    const content = plugin.element.querySelector('.dev-console-content') as HTMLElement;
    expect(content.textContent).toContain('No failure signals.');
    expect(healthTab.classList.contains('is-active')).toBe(true);
  });

  it('shows failure signals in the Health tab', () => {
    reportFailure({ kind: 'llm.stream-error', source: 'ai-drawer/llm-loop.ts', message: 'stream broke' });
    const healthTab = plugin.element.querySelector('[data-tab="health"]') as HTMLElement;
    healthTab.click();
    const content = plugin.element.querySelector('.dev-console-content') as HTMLElement;
    expect(content.textContent).toContain('llm.stream-error');
    expect(content.textContent).toContain('stream broke');
  });

  it('shows agent bus messages in the Agents tab', () => {
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
    const agentsTab = plugin.element.querySelector('[data-tab="agents"]') as HTMLElement;
    agentsTab.click();
    const content = plugin.element.querySelector('.dev-console-content') as HTMLElement;
    expect(content.textContent).toContain('heartbeat');
  });

  it('exposes a Run validation button on the Specs tab', () => {
    const specsTab = plugin.element.querySelector('[data-tab="specs"]') as HTMLElement;
    specsTab.click();
    const content = plugin.element.querySelector('.dev-console-content') as HTMLElement;
    expect(content.textContent).toContain('Run validation');
  });

  it('captures console.log into the Logs tab', () => {
    console.log('a captured line');
    const content = plugin.element.querySelector('.dev-console-content') as HTMLElement;
    expect(content.textContent).toContain('a captured line');
  });

  it('destroy removes the element and unsubscribes feeds', () => {
    const el = plugin.element;
    plugin.destroy();
    expect(el.isConnected).toBe(false);
    // reportFailure after destroy must not throw
    expect(() => reportFailure({ kind: 'plugin.crash', source: 'x', message: 'y' })).not.toThrow();
  });
});
