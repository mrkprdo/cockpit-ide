import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from './App';
import { mockElectronAPI } from '../../test/setup';

function makeAppDOM(): void {
  const canvas = document.createElement('div');
  canvas.id = 'canvas';
  canvas.style.cssText = 'width:1920px;height:1080px;position:relative';
  document.body.appendChild(canvas);

  const menuBar = document.createElement('div');
  menuBar.id = 'menu-bar';
  document.body.appendChild(menuBar);

  const statusbar = document.createElement('div');
  statusbar.id = 'statusbar';
  document.body.appendChild(statusbar);

  const tbMin = document.createElement('button');
  tbMin.id = 'tb-min';
  document.body.appendChild(tbMin);

  const tbMax = document.createElement('button');
  tbMax.id = 'tb-max';
  document.body.appendChild(tbMax);

  const tbClose = document.createElement('button');
  tbClose.id = 'tb-close';
  document.body.appendChild(tbClose);
}

describe('App', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    makeAppDOM();

    (mockElectronAPI.workspace.getRecent as any).mockResolvedValue(['/test/ws']);
    (mockElectronAPI.workspace.load as any).mockResolvedValue(null);
    (mockElectronAPI.workspace.save as any).mockResolvedValue(undefined);
    (mockElectronAPI.prefs.load as any).mockResolvedValue({ gridStyle: 'dots', isDark: true, showTutorial: false });
    (mockElectronAPI.fs.watch as any).mockResolvedValue(true);
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.readDir as any).mockResolvedValue([]);
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('content');
    (mockElectronAPI.fs.writeFile as any).mockResolvedValue(true);

    vi.stubGlobal('close', vi.fn());
  });

  it('sets document title to Cockpit IDE', () => {
    new App();
    expect(document.title).toBe('Cockpit IDE');
  });

  it('creates a CanvasArea without throwing errors', () => {
    expect(() => new App()).not.toThrow();
  });

  it('creates a TopBar with menu items', () => {
    new App();
    const menuBar = document.getElementById('menu-bar') as HTMLElement;
    expect(menuBar.querySelector('.menu-item')).toBeTruthy();
  });

  it('binds window control buttons', () => {
    new App();

    const btnMin = document.getElementById('tb-min') as HTMLButtonElement;
    btnMin.click();
    expect(mockElectronAPI.window.minimize).toHaveBeenCalled();

    const btnMax = document.getElementById('tb-max') as HTMLButtonElement;
    btnMax.click();
    expect(mockElectronAPI.window.maximize).toHaveBeenCalled();

    const btnClose = document.getElementById('tb-close') as HTMLButtonElement;
    btnClose.click();
    expect(mockElectronAPI.window.close).toHaveBeenCalled();
  });

  it('prevents Ctrl+W default behavior', () => {
    new App();

    const event = new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    document.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('prevents Meta+W default behavior', () => {
    new App();

    const event = new KeyboardEvent('keydown', { key: 'w', metaKey: true, bubbles: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    document.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('does not prevent non-Ctrl+W keydown', () => {
    new App();

    const event = new KeyboardEvent('keydown', { key: 'w', bubbles: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    document.dispatchEvent(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('Ctrl+Shift+N calls window.newWindow', () => {
    new App();
    (mockElectronAPI.window.newWindow as any).mockClear();

    const event = new KeyboardEvent('keydown', {
      key: 'n',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);

    expect(mockElectronAPI.window.newWindow).toHaveBeenCalled();
  });

  it('Cmd+Shift+N calls window.newWindow', () => {
    new App();
    (mockElectronAPI.window.newWindow as any).mockClear();

    const event = new KeyboardEvent('keydown', {
      key: 'n',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);

    expect(mockElectronAPI.window.newWindow).toHaveBeenCalled();
  });

  it('Ctrl+N without Shift does not call newWindow', () => {
    new App();
    (mockElectronAPI.window.newWindow as any).mockClear();

    const event = new KeyboardEvent('keydown', {
      key: 'n',
      ctrlKey: true,
      shiftKey: false,
      bubbles: true,
    });
    document.dispatchEvent(event);

    expect(mockElectronAPI.window.newWindow).not.toHaveBeenCalled();
  });

  it('calls workspace.getPath during startup and skips modal when path is set', async () => {
    (mockElectronAPI.workspace.getPath as any).mockResolvedValue('/cli/path');
    (mockElectronAPI.workspace.load as any).mockClear();
    new App();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockElectronAPI.workspace.getPath).toHaveBeenCalled();
    expect(mockElectronAPI.workspace.load).toHaveBeenCalledWith('/cli/path');
  });
});
