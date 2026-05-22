import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalPlugin } from './TerminalPlugin';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'width:600px;height:400px';
  document.body.appendChild(el);
  return el;
}

describe('TerminalPlugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    vi.clearAllMocks();
  });

  it('appends a child element to the container', () => {
    new TerminalPlugin(container, 'test-uuid', '/test/cwd');
    expect(container.children.length).toBe(1);
    expect(container.children[0]).toBeInstanceOf(HTMLDivElement);
  });

  it('uses the provided UUID', () => {
    const term = new TerminalPlugin(container, 'my-custom-uuid');
    expect(term.uuid).toBe('my-custom-uuid');
  });

  it('exposes the element publicly', () => {
    const term = new TerminalPlugin(container, 'uuid');
    expect(term.element).toBeInstanceOf(HTMLDivElement);
    expect(term.element.parentElement).toBe(container);
  });

  it('destroy removes the element from DOM', () => {
    const term = new TerminalPlugin(container, 'uuid');
    expect(container.children.length).toBe(1);
    term.destroy();
    expect(container.children.length).toBe(0);
  });

  it('destroy called twice does not throw', () => {
    const term = new TerminalPlugin(container, 'test-uuid');
    term.destroy();
    expect(() => term.destroy()).not.toThrow();
  });

  it('onExit callback is invokable', () => {
    const onExit = vi.fn();
    const term = new TerminalPlugin(container, 'test-uuid');
    term.onExit = onExit;
    term.onExit?.();
    expect(onExit).toHaveBeenCalledOnce();
  });
});
