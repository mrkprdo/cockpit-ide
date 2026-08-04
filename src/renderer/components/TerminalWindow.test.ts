import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalWindow } from './TerminalWindow';
import { mockElectronAPI } from '../../test/setup';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'width:600px;height:400px';
  document.body.appendChild(el);
  return el;
}

describe('TerminalWindow', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    vi.clearAllMocks();
  });

  it('appends a child element to the container', () => {
    new TerminalWindow(container, 'test-uuid', '/test/cwd');
    expect(container.children.length).toBe(1);
    expect(container.children[0]).toBeInstanceOf(HTMLDivElement);
  });

  it('uses the provided UUID', () => {
    const term = new TerminalWindow(container, 'my-custom-uuid');
    expect(term.uuid).toBe('my-custom-uuid');
  });

  it('exposes the element publicly', () => {
    const term = new TerminalWindow(container, 'uuid');
    expect(term.element).toBeInstanceOf(HTMLDivElement);
    expect(term.element.parentElement).toBe(container);
  });

  it('destroy removes the element from DOM', () => {
    const term = new TerminalWindow(container, 'uuid');
    expect(container.children.length).toBe(1);
    term.destroy();
    expect(container.children.length).toBe(0);
  });

  it('destroy called twice does not throw', () => {
    const term = new TerminalWindow(container, 'test-uuid');
    term.destroy();
    expect(() => term.destroy()).not.toThrow();
  });

  it('onExit callback is invokable', () => {
    const onExit = vi.fn();
    const term = new TerminalWindow(container, 'test-uuid');
    term.onExit = onExit;
    term.onExit?.();
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('constructor calls terminal:create IPC with uuid on construction', () => {
    (mockElectronAPI.terminal.create as any).mockClear();
    new TerminalWindow(container, 'test-uuid', '/cwd');
    expect(mockElectronAPI.terminal.create).toHaveBeenCalledWith('test-uuid', '/cwd');
  });

  it('constructor calls terminal:create without cwd when not provided', () => {
    (mockElectronAPI.terminal.create as any).mockClear();
    new TerminalWindow(container, 'test-uuid');
    expect(mockElectronAPI.terminal.create).toHaveBeenCalledWith('test-uuid', undefined);
  });

  it('destroy() calls terminal:kill IPC', () => {
    (mockElectronAPI.terminal.kill as any).mockClear();
    const term = new TerminalWindow(container, 'test-uuid');
    term.destroy();
    expect(mockElectronAPI.terminal.kill).toHaveBeenCalledWith('test-uuid');
  });

  it('onExit fires when terminal:exit IPC fires for matching uuid', () => {
    const onExit = vi.fn();
    const term = new TerminalWindow(container, 'test-uuid');
    term.onExit = onExit;
    const exitCallback = (mockElectronAPI.terminal.onExit as any).mock.calls[0][0];
    exitCallback('test-uuid');
    expect(onExit).toHaveBeenCalled();
  });

  it('onExit does NOT fire when terminal:exit fires for different uuid', () => {
    const onExit = vi.fn();
    const term = new TerminalWindow(container, 'test-uuid');
    term.onExit = onExit;
    const exitCallback = (mockElectronAPI.terminal.onExit as any).mock.calls[0][0];
    exitCallback('different-uuid');
    expect(onExit).not.toHaveBeenCalled();
  });
});

describe('TerminalWindow — theme support', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    vi.clearAllMocks();
  });

  it('readTheme returns object with background, foreground, cursor, selectionBackground', () => {
    const theme = TerminalWindow.readTheme();
    expect(theme).toHaveProperty('background');
    expect(theme).toHaveProperty('foreground');
    expect(theme).toHaveProperty('cursor');
    expect(theme).toHaveProperty('selectionBackground');
  });

  it('readTheme reads CSS --bg, --primary, --accent', () => {
    document.documentElement.style.setProperty('--bg', '#ff0000');
    document.documentElement.style.setProperty('--primary', '#00ff00');
    document.documentElement.style.setProperty('--accent', '#0000ff');
    const theme = TerminalWindow.readTheme();
    expect(theme.background).toBe('#ff0000');
    expect(theme.foreground).toBe('#00ff00');
    expect(theme.cursor).toBe('#0000ff');
  });

  it('readTheme builds selectionBackground from accent with 33 alpha suffix', () => {
    document.documentElement.style.setProperty('--accent', '#abcdef');
    const theme = TerminalWindow.readTheme();
    expect(theme.selectionBackground).toBe('#abcdef33');
  });

  it('readTheme falls back to dark defaults when CSS vars are not set', () => {
    document.documentElement.style.removeProperty('--bg');
    document.documentElement.style.removeProperty('--primary');
    document.documentElement.style.removeProperty('--accent');
    const theme = TerminalWindow.readTheme();
    expect(theme.background).toBe('#161C24');
    expect(theme.foreground).toBe('#C8D6E5');
    expect(theme.cursor).toBe('#00E5FF');
  });

  it('updateTheme sets options.theme on xterm instance', () => {
    const term = new TerminalWindow(container, 'test-uuid');
    const xterm = (term as any).xterm;
    expect(xterm).toBeTruthy();
    const expectedTheme = TerminalWindow.readTheme();
    term.updateTheme();
    expect(xterm.options.theme).toEqual(expectedTheme);
  });

  it('updateTheme does not throw when xterm is null', () => {
    const term = new TerminalWindow(container, 'test-uuid');
    (term as any).xterm = null;
    expect(() => term.updateTheme()).not.toThrow();
  });
});
