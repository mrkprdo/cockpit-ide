import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MonacoEditorPlugin } from './MonacoEditorPlugin';
import { mockElectronAPI } from '../../test/setup';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'width:600px;height:400px';
  document.body.appendChild(el);
  return el;
}

describe('MonacoEditorPlugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('const x = 1;');
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.writeFile as any).mockResolvedValue(true);
  });

  it('creates editor structure with tab bar and editor area', () => {
    new MonacoEditorPlugin(container);
    expect(container.querySelector('#tab-container')).toBeTruthy();
    expect(container.querySelector('[id^="monaco-"]')).toBeTruthy();
  });

  it('shows "No file selected" when no tabs are open', () => {
    new MonacoEditorPlugin(container);
    expect(container.textContent).toContain('No file selected');
  });

  it('tabs array is empty initially', () => {
    const editor = new MonacoEditorPlugin(container);
    expect(editor.tabs).toEqual([]);
    expect(editor.activeTab).toBeNull();
  });

  it('getState returns null when no tabs', () => {
    const editor = new MonacoEditorPlugin(container);
    expect(editor.getState()).toBeNull();
  });

  it('getCurrentFile returns empty string initially', () => {
    const editor = new MonacoEditorPlugin(container);
    expect(editor.getCurrentFile()).toBe('');
  });

  it('getContent returns empty string initially', () => {
    const editor = new MonacoEditorPlugin(container);
    expect(editor.getContent()).toBe('');
  });

  it('reloadIfOpen does nothing when no tabs are open', async () => {
    const editor = new MonacoEditorPlugin(container);
    await editor.reloadIfOpen('/test/file.ts');
    // Should not throw
    expect(editor.tabs).toEqual([]);
  });

  it('sets up file change listener on construction', () => {
    new MonacoEditorPlugin(container);
    expect(mockElectronAPI.fs.onChanged).toHaveBeenCalled();
  });
});
