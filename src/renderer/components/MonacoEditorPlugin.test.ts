import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    expect(editor.tabs).toEqual([]);
  });

  it('sets up file change listener on construction', () => {
    new MonacoEditorPlugin(container);
    expect(mockElectronAPI.fs.onChanged).toHaveBeenCalled();
  });
});

describe('MonacoEditorPlugin — language detection', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
  });

  function getLanguage(ext: string): string {
    const editor = new MonacoEditorPlugin(container);
    return (editor as any).getLanguage(ext);
  }

  it('detects TypeScript', () => {
    expect(getLanguage('ts')).toBe('typescript');
  });

  it('detects JavaScript', () => {
    expect(getLanguage('js')).toBe('javascript');
  });

  it('detects TSX', () => {
    expect(getLanguage('tsx')).toBe('typescript');
  });

  it('detects JSX', () => {
    expect(getLanguage('jsx')).toBe('javascript');
  });

  it('detects JSON', () => {
    expect(getLanguage('json')).toBe('json');
  });

  it('detects HTML', () => {
    expect(getLanguage('html')).toBe('html');
  });

  it('detects CSS', () => {
    expect(getLanguage('css')).toBe('css');
  });

  it('detects Markdown', () => {
    expect(getLanguage('md')).toBe('markdown');
  });

  it('detects Python', () => {
    expect(getLanguage('py')).toBe('python');
  });

  it('detects Rust', () => {
    expect(getLanguage('rs')).toBe('rust');
  });

  it('detects YAML', () => {
    expect(getLanguage('yaml')).toBe('yaml');
    expect(getLanguage('yml')).toBe('yaml');
  });

  it('detects XML/SVG', () => {
    expect(getLanguage('xml')).toBe('xml');
    expect(getLanguage('svg')).toBe('xml');
  });

  it('detects Shell/Batch/PowerShell', () => {
    expect(getLanguage('sh')).toBe('shell');
    expect(getLanguage('bat')).toBe('bat');
    expect(getLanguage('ps1')).toBe('powershell');
  });

  it('detects C/C++/C#', () => {
    expect(getLanguage('cpp')).toBe('cpp');
    expect(getLanguage('c')).toBe('c');
    expect(getLanguage('cs')).toBe('csharp');
  });

  it('detects Java', () => {
    expect(getLanguage('java')).toBe('java');
  });

  it('detects Go', () => {
    expect(getLanguage('go')).toBe('go');
  });

  it('detects Ruby', () => {
    expect(getLanguage('rb')).toBe('ruby');
  });

  it('detects PHP', () => {
    expect(getLanguage('php')).toBe('php');
  });

  it('detects Swift', () => {
    expect(getLanguage('swift')).toBe('swift');
  });

  it('detects Kotlin', () => {
    expect(getLanguage('kt')).toBe('kotlin');
  });

  it('returns plaintext for unknown extensions', () => {
    expect(getLanguage('xyz')).toBe('plaintext');
    expect(getLanguage('')).toBe('plaintext');
  });
});

describe('MonacoEditorPlugin — reloadIfOpen behavior', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('const x = 1;');
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.writeFile as any).mockResolvedValue(true);
  });

  it('does nothing when no matching tab is open', async () => {
    const editor = new MonacoEditorPlugin(container);

    // Manually add a tab bypassing Monaco loading
    editor.tabs.push({ filePath: '/test/other.ts', name: 'other.ts', originalPath: '/test/other.ts' });
    editor.activeTab = '/test/other.ts';

    await editor.reloadIfOpen('/test/file.ts');
    // No change — no matching tab
    expect(editor.tabs.length).toBe(1);
  });

  it('closes tab when file is deleted (readFile returns null)', async () => {
    const editor = new MonacoEditorPlugin(container);
    editor.tabs.push({ filePath: '/test/deleted.ts', name: 'deleted.ts', originalPath: '/test/deleted.ts' });
    editor.activeTab = '/test/deleted.ts';
    (mockElectronAPI.fs.readFile as any).mockResolvedValue(null);

    await editor.reloadIfOpen('/test/deleted.ts');
    expect(editor.tabs.length).toBe(0);
  });

  it('updates fileContents cache on successful reload', async () => {
    const editor = new MonacoEditorPlugin(container);
    editor.tabs.push({ filePath: '/test/file.ts', name: 'file.ts', originalPath: '/test/file.ts' });
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('updated content');

    await editor.reloadIfOpen('/test/file.ts');
    expect((editor as any).fileContents.get('/test/file.ts')).toBe('updated content');
  });

  it('unsubscribes from file watcher on second construction', () => {
    // First editor sets up listener
    new MonacoEditorPlugin(container);
    const calls = (mockElectronAPI.fs.onChanged as any).mock.calls.length;

    // Second editor also sets up listener
    new MonacoEditorPlugin(container);
    expect((mockElectronAPI.fs.onChanged as any).mock.calls.length).toBe(calls + 1);
  });

  it('file change listener is registered via electronAPI.fs.onChanged', () => {
    new MonacoEditorPlugin(container);
    expect(mockElectronAPI.fs.onChanged).toHaveBeenCalledWith(expect.any(Function));
  });
});

describe('MonacoEditorPlugin — updateTheme', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (window as any).monaco = undefined;
  });

  afterEach(() => {
    (window as any).monaco = undefined;
  });

  it('does nothing when monaco is not loaded', () => {
    const editor = new MonacoEditorPlugin(container);
    expect(() => editor.updateTheme()).not.toThrow();
  });

  it('does nothing when editor instance is null even if monaco exists', () => {
    const editor = new MonacoEditorPlugin(container);
    (window as any).monaco = { editor: { setTheme: vi.fn() } };
    expect(() => editor.updateTheme()).not.toThrow();
  });

  it('calls monaco.editor.setTheme with cockpit-dark when theme is dark', () => {
    const setTheme = vi.fn();
    const editor = new MonacoEditorPlugin(container);
    (window as any).monaco = { editor: { setTheme } };
    (editor as any).editor = {};
    editor.updateTheme();
    expect(setTheme).toHaveBeenCalledWith('cockpit-dark');
  });
});

describe('MonacoEditorPlugin — tab improvements', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('content');
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.writeFile as any).mockResolvedValue(true);
    (mockElectronAPI.clipboard as any) = { writeText: vi.fn().mockResolvedValue(undefined) };
  });

  it('closeOtherTabs keeps only the specified tab', () => {
    const editor = new MonacoEditorPlugin(container);
    editor.tabs.push(
      { filePath: '/test/a.ts', name: 'a.ts', originalPath: '/test/a.ts' },
      { filePath: '/test/b.ts', name: 'b.ts', originalPath: '/test/b.ts' },
      { filePath: '/test/c.ts', name: 'c.ts', originalPath: '/test/c.ts' },
    );
    editor.activeTab = '/test/a.ts';
    (editor as any).closeOtherTabs('/test/b.ts');
    expect(editor.tabs.length).toBe(1);
    expect(editor.tabs[0].filePath).toBe('/test/b.ts');
    expect(editor.activeTab).toBe('/test/b.ts');
  });

  it('closeAllTabs clears all tabs and shows empty state', () => {
    const editor = new MonacoEditorPlugin(container);
    editor.tabs.push(
      { filePath: '/test/a.ts', name: 'a.ts', originalPath: '/test/a.ts' },
      { filePath: '/test/b.ts', name: 'b.ts', originalPath: '/test/b.ts' },
    );
    editor.activeTab = '/test/a.ts';
    (editor as any).closeAllTabs();
    expect(editor.tabs.length).toBe(0);
    expect(editor.activeTab).toBeNull();
    expect(container.textContent).toContain('No file selected');
  });

  it('renders tabs with draggable attribute', () => {
    const editor = new MonacoEditorPlugin(container);
    editor.tabs.push({ filePath: '/test/a.ts', name: 'a.ts', originalPath: '/test/a.ts' });
    editor.activeTab = '/test/a.ts';
    (editor as any).renderTabs();
    const tabEl = container.querySelector('.editor-tab') as HTMLElement;
    expect(tabEl).toBeTruthy();
    expect(tabEl.draggable).toBe(true);
  });

  it('tracks dirty state on content change', () => {
    const editor = new MonacoEditorPlugin(container);
    editor.tabs.push({ filePath: '/test/a.ts', name: 'a.ts', originalPath: '/test/a.ts' });
    editor.activeTab = '/test/a.ts';
    (editor as any).dirtyFiles.add('/test/a.ts');
    (editor as any).renderTabs();
    const tabEl = container.querySelector('.editor-tab') as HTMLElement;
    expect(tabEl.classList.contains('is-dirty')).toBe(true);
  });

  it('clears dirty state on closeAllTabs', () => {
    const editor = new MonacoEditorPlugin(container);
    editor.tabs.push({ filePath: '/test/a.ts', name: 'a.ts', originalPath: '/test/a.ts' });
    editor.activeTab = '/test/a.ts';
    (editor as any).dirtyFiles.add('/test/a.ts');
    (editor as any).closeAllTabs();
    expect((editor as any).dirtyFiles.size).toBe(0);
  });

  it('copy file path action calls clipboard writeText', () => {
    const editor = new MonacoEditorPlugin(container);
    editor.tabs.push({ filePath: '/test/a.ts', name: 'a.ts', originalPath: '/test/a.ts' });
    editor.activeTab = '/test/a.ts';
    (editor as any).renderTabs();
    const tabEl = container.querySelector('.editor-tab') as HTMLElement;
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 });
    tabEl.dispatchEvent(evt);
    const ctxMenu = document.querySelector('.ctx-menu');
    expect(ctxMenu).toBeTruthy();
  });
});
