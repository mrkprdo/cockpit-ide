import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DevPlugin } from './DevPlugin';
import { CommandPalette } from './CommandPalette';
import { mockElectronAPI } from '../../test/setup';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'width:800px;height:500px';
  document.body.appendChild(el);
  return el;
}

describe('DevPlugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.readDir as any).mockResolvedValue([]);
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('content');
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.writeFile as any).mockResolvedValue(true);
  });

  it('creates split pane with flex layout', () => {
    new DevPlugin(container, '/test/ws');

    // Container should have a child with flex direction row
    const children = container.children;
    expect(children.length).toBe(1);

    const splitEl = children[0] as HTMLElement;
    expect(splitEl.style.display).toBe('flex');
    expect(splitEl.style.flexDirection).toBe('row');
  });

  it('has three children: explorer, resize handle, editor', () => {
    new DevPlugin(container, '/test/ws');

    const splitEl = container.firstElementChild!;
    expect(splitEl.children.length).toBe(3);
  });

  it('has a MonacoEditorPlugin accessible as .editor', () => {
    const dev = new DevPlugin(container, '/test/ws');
    expect(dev.editor).toBeTruthy();
    expect(dev.editor.tabs).toEqual([]);
  });

  it('setContextOpeners delegates to explorer without throwing', () => {
    const dev = new DevPlugin(container, '/test/ws');
    const labels = ['Context 1', 'Context 2'];
    const callback = vi.fn();

    expect(() => dev.setContextOpeners(labels, callback)).not.toThrow();
  });

  it('updateTheme calls editor updateTheme without throwing', () => {
    const dev = new DevPlugin(container, '/test/ws');
    expect(() => dev.updateTheme()).not.toThrow();
  });

  it('getEditorState returns null when no files are open', () => {
    const dev = new DevPlugin(container, '/test/ws');
    const state = dev.getEditorState();
    expect(state).toBeNull();
  });

  it('restoreEditorState handles null state', async () => {
    const dev = new DevPlugin(container, '/test/ws');
    await dev.restoreEditorState(null);
    // Should not throw
  });

  it('restoreEditorState handles state with no open files', async () => {
    const dev = new DevPlugin(container, '/test/ws');
    await dev.restoreEditorState({
      openFiles: [],
      activeFile: '',
      explorerWidth: 260,
      cursors: {},
    });
    // Should not throw
  });

  it('palette is lazily created on first openFileSearch call', () => {
    const dev = new DevPlugin(container, '/test/ws');
    expect(dev.palette).toBeNull();
    dev.openFileSearch();
    expect(dev.palette).toBeTruthy();
  });

  it('openFileSearch opens the palette overlay', () => {
    const dev = new DevPlugin(container, '/test/ws');
    dev.openFileSearch();
    const ov = document.querySelector('.palette-overlay');
    expect(ov).toBeTruthy();
    expect(ov!.classList.contains('open')).toBe(true);
  });

  it('palette is created and opened on openFileSearch', () => {
    const dev = new DevPlugin(container, '/test/ws');
    expect(dev.palette).toBeNull();
    dev.openFileSearch();
    expect(dev.palette).toBeTruthy();
    const ov = document.querySelector('.palette-overlay');
    expect(ov?.classList.contains('open')).toBe(true);
  });

  it('does not open palette when card is minimized (hidden)', () => {
    const dev = new DevPlugin(container, '/test/ws');
    container.style.display = 'none';
    dev.openFileSearch();
    const ov = document.querySelector('.palette-overlay');
    expect(ov?.classList.contains('open')).toBeFalsy();
  });
});
