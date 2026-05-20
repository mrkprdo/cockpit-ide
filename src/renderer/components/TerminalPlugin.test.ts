import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalPlugin } from './TerminalPlugin';
import { mockElectronAPI } from '../../test/setup';

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

    (mockElectronAPI.terminal.onData as any).mockReturnValue(vi.fn());
    (mockElectronAPI.terminal.onExit as any).mockReturnValue(vi.fn());
  });

  it('appends a child element to the container', () => {
    new TerminalPlugin(container, 'test-uuid', '/test/cwd');
    expect(container.children.length).toBeGreaterThan(0);
  });

  it('uses the provided UUID', () => {
    const term = new TerminalPlugin(container, 'my-custom-uuid');
    expect(term.uuid).toBe('my-custom-uuid');
  });

  it('calls terminal.create with uuid and cwd', async () => {
    new TerminalPlugin(container, 'test-uuid', '/home/user');
    await new Promise(r => setTimeout(r, 50));
    expect(mockElectronAPI.terminal.create).toHaveBeenCalledWith('test-uuid', '/home/user');
  });

  it('calls terminal.create without cwd when not provided', async () => {
    new TerminalPlugin(container, 'test-uuid');
    await new Promise(r => setTimeout(r, 50));
    expect(mockElectronAPI.terminal.create).toHaveBeenCalledWith('test-uuid', undefined);
  });

  it('registers onData listener', async () => {
    new TerminalPlugin(container, 'test-uuid');
    await new Promise(r => setTimeout(r, 50));
    expect(mockElectronAPI.terminal.onData).toHaveBeenCalled();
  });

  it('registers onExit listener', async () => {
    new TerminalPlugin(container, 'test-uuid');
    await new Promise(r => setTimeout(r, 50));
    expect(mockElectronAPI.terminal.onExit).toHaveBeenCalled();
  });

  it('destroy kills the terminal PTY and cleans up', async () => {
    const unsubMock = vi.fn();
    (mockElectronAPI.terminal.onData as any).mockReturnValue(unsubMock);
    (mockElectronAPI.terminal.onExit as any).mockReturnValue(vi.fn());

    const term = new TerminalPlugin(container, 'test-uuid');
    await new Promise(r => setTimeout(r, 50));
    term.destroy();

    expect(unsubMock).toHaveBeenCalled();
    expect(mockElectronAPI.terminal.kill).toHaveBeenCalledWith('test-uuid');
  });

  it('onExit callback is invoked when process exits', async () => {
    let exitCallback: ((uuid: string) => void) | null = null;
    (mockElectronAPI.terminal.onExit as any).mockImplementation((cb: any) => {
      exitCallback = cb;
      return vi.fn();
    });

    const onExit = vi.fn();
    const term = new TerminalPlugin(container, 'test-uuid');
    term.onExit = onExit;

    await new Promise(r => setTimeout(r, 50));

    if (exitCallback) exitCallback('test-uuid');
    expect(onExit).toHaveBeenCalledOnce();
  });

  describe('setScale', () => {
    function dimContainer(): void {
      Object.defineProperty(container, 'clientWidth', { value: 600, configurable: true });
      Object.defineProperty(container, 'clientHeight', { value: 400, configurable: true });
    }

    beforeEach(() => { dimContainer(); });

    it('resets to 100% dimensions and no transform at scale 1', () => {
      const term = new TerminalPlugin(container, 'scale-test-1');
      term.setScale(1);
      expect(term['el'].style.width).toBe('100%');
      expect(term['el'].style.height).toBe('100%');
      expect(term['el'].style.transform).toBe('');
    });

    it('applies inverse transform and adjusts dimensions at scale 0.5', () => {
      const term = new TerminalPlugin(container, 'scale-test-05');
      term.setScale(0.5);
      expect(term['el'].style.width).toBe(`${600 * 0.5}px`);
      expect(term['el'].style.height).toBe(`${400 * 0.5}px`);
      expect(term['el'].style.transform).toBe('scale(2)');
      expect(term['el'].style.transformOrigin).toBe('0 0');
    });

    it('applies inverse transform and adjusts dimensions at scale 2', () => {
      const term = new TerminalPlugin(container, 'scale-test-2');
      term.setScale(2);
      expect(term['el'].style.width).toBe(`${600 * 2}px`);
      expect(term['el'].style.height).toBe(`${400 * 2}px`);
      expect(term['el'].style.transform).toBe('scale(0.5)');
      expect(term['el'].style.transformOrigin).toBe('0 0');
    });

    it('is a no-op when parent element is missing', () => {
      const orphan = document.createElement('div');
      const term = new TerminalPlugin(orphan, 'orphan-uuid');
      expect(() => term.setScale(0.5)).not.toThrow();
    });

    it('restores to 1:1 after being at another scale', () => {
      const term = new TerminalPlugin(container, 'scale-restore');
      term.setScale(0.5);
      term.setScale(1);
      expect(term['el'].style.width).toBe('100%');
      expect(term['el'].style.height).toBe('100%');
      expect(term['el'].style.transform).toBe('');
    });
  });
});
