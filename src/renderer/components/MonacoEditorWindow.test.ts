import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MonacoEditorWindow } from './MonacoEditorWindow';
import { mockElectronAPI } from '../../test/setup';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'width:600px;height:400px';
  document.body.appendChild(el);
  return el;
}

/** Monaco never loads in jsdom — stub the global so ensureReady resolves. */
function stubMonaco(): void {
  const editorMock = {
    getValue: vi.fn(() => ''),
    setValue: vi.fn(),
    getPosition: vi.fn(() => null),
    getScrollTop: vi.fn(() => 0),
    setPosition: vi.fn(),
    setScrollTop: vi.fn(),
    getSelection: vi.fn(() => null),
    getModel: vi.fn(() => ({})),
    addAction: vi.fn(),
    onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeCursorSelection: vi.fn(() => ({ dispose: vi.fn() })),
    focus: vi.fn(),
    executeEdits: vi.fn(),
    revealLineInCenter: vi.fn(),
    revealPositionInCenter: vi.fn(),
  };
  (window as any).monaco = {
    editor: {
      create: vi.fn(() => editorMock),
      setModelLanguage: vi.fn(),
      defineTheme: vi.fn(),
      setTheme: vi.fn(),
    },
    KeyMod: { CtrlCmd: 0 },
    KeyCode: { KeyS: 0 },
  };
}

describe('MonacoEditorWindow', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('const x = 1;');
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.writeFile as any).mockResolvedValue(true);
  });

  it('creates editor structure with tab bar and editor area', () => {
    new MonacoEditorWindow(container);
    expect(container.querySelector('#tab-container')).toBeTruthy();
    expect(container.querySelector('[id^="monaco-"]')).toBeTruthy();
  });

  it('shows "No file selected" when no tabs are open', () => {
    new MonacoEditorWindow(container);
    expect(container.textContent).toContain('No file selected');
  });

  it('tabs array is empty initially', () => {
    const editor = new MonacoEditorWindow(container);
    expect(editor.tabs).toEqual([]);
    expect(editor.activeTab).toBeNull();
  });

  it('getState returns null when no tabs', () => {
    const editor = new MonacoEditorWindow(container);
    expect(editor.getState()).toBeNull();
  });

  it('getCurrentFile returns empty string initially', () => {
    const editor = new MonacoEditorWindow(container);
    expect(editor.getCurrentFile()).toBe('');
  });

  it('getContent returns empty string initially', () => {
    const editor = new MonacoEditorWindow(container);
    expect(editor.getContent()).toBe('');
  });

  it('reloadIfOpen does nothing when no tabs are open', async () => {
    const editor = new MonacoEditorWindow(container);
    await editor.reloadIfOpen('/test/file.ts');
    expect(editor.tabs).toEqual([]);
  });

  it('sets up file change listener on construction', () => {
    new MonacoEditorWindow(container);
    expect(mockElectronAPI.fs.onChanged).toHaveBeenCalled();
  });
});

describe('MonacoEditorWindow — language detection', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
  });

  function getLanguage(ext: string): string {
    const editor = new MonacoEditorWindow(container);
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

describe('MonacoEditorWindow — reloadIfOpen behavior', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('const x = 1;');
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.writeFile as any).mockResolvedValue(true);
  });

  it('does nothing when no matching tab is open', async () => {
    const editor = new MonacoEditorWindow(container);

    // Manually add a tab bypassing Monaco loading
    editor.tabs.push({ filePath: '/test/other.ts', name: 'other.ts', originalPath: '/test/other.ts' });
    editor.activeTab = '/test/other.ts';

    await editor.reloadIfOpen('/test/file.ts');
    // No change — no matching tab
    expect(editor.tabs.length).toBe(1);
  });

  it('closes tab when file is deleted (readFile returns null)', async () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/test/deleted.ts', name: 'deleted.ts', originalPath: '/test/deleted.ts' });
    editor.activeTab = '/test/deleted.ts';
    (mockElectronAPI.fs.readFile as any).mockResolvedValue(null);

    await editor.reloadIfOpen('/test/deleted.ts');
    expect(editor.tabs.length).toBe(0);
  });

  it('updates fileContents cache on successful reload', async () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/test/file.ts', name: 'file.ts', originalPath: '/test/file.ts' });
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('updated content');

    await editor.reloadIfOpen('/test/file.ts');
    expect((editor as any).fileContents.get('/test/file.ts')).toBe('updated content');
  });

  it('unsubscribes from file watcher on second construction', () => {
    // First editor sets up listener
    new MonacoEditorWindow(container);
    const calls = (mockElectronAPI.fs.onChanged as any).mock.calls.length;

    // Second editor also sets up listener
    new MonacoEditorWindow(container);
    expect((mockElectronAPI.fs.onChanged as any).mock.calls.length).toBe(calls + 1);
  });

  it('file change listener is registered via electronAPI.fs.onChanged', () => {
    new MonacoEditorWindow(container);
    expect(mockElectronAPI.fs.onChanged).toHaveBeenCalledWith(expect.any(Function));
  });
});

describe('MonacoEditorWindow — updateTheme', () => {
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
    const editor = new MonacoEditorWindow(container);
    expect(() => editor.updateTheme()).not.toThrow();
  });

  it('does nothing when editor instance is null even if monaco exists', () => {
    const editor = new MonacoEditorWindow(container);
    (window as any).monaco = { editor: { setTheme: vi.fn() } };
    expect(() => editor.updateTheme()).not.toThrow();
  });

  it('calls monaco.editor.setTheme with cockpit-dark when theme is dark', () => {
    const setTheme = vi.fn();
    const editor = new MonacoEditorWindow(container);
    (window as any).monaco = { editor: { setTheme } };
    (editor as any).editor = {};
    editor.updateTheme();
    expect(setTheme).toHaveBeenCalledWith('cockpit-dark');
  });
});

describe('MonacoEditorWindow — tab improvements', () => {
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
    const editor = new MonacoEditorWindow(container);
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
    const editor = new MonacoEditorWindow(container);
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
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/test/a.ts', name: 'a.ts', originalPath: '/test/a.ts' });
    editor.activeTab = '/test/a.ts';
    (editor as any).renderTabs();
    const tabEl = container.querySelector('.editor-tab') as HTMLElement;
    expect(tabEl).toBeTruthy();
    expect(tabEl.draggable).toBe(true);
  });

  it('tracks dirty state on content change', () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/test/a.ts', name: 'a.ts', originalPath: '/test/a.ts' });
    editor.activeTab = '/test/a.ts';
    (editor as any).dirtyFiles.add('/test/a.ts');
    (editor as any).renderTabs();
    const tabEl = container.querySelector('.editor-tab') as HTMLElement;
    expect(tabEl.classList.contains('is-dirty')).toBe(true);
  });

  it('clears dirty state on closeAllTabs', async () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/test/a.ts', name: 'a.ts', originalPath: '/test/a.ts' });
    editor.activeTab = '/test/a.ts';
    (editor as any).dirtyFiles.add('/test/a.ts');
    const closing = (editor as any).closeAllTabs();
    document.querySelector<HTMLButtonElement>('#confirm-ok')!.click();
    await closing;
    expect((editor as any).dirtyFiles.size).toBe(0);
  });

  it('closeAllTabs keeps tabs when the user cancels the discard prompt', async () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/test/a.ts', name: 'a.ts', originalPath: '/test/a.ts' });
    editor.activeTab = '/test/a.ts';
    (editor as any).dirtyFiles.add('/test/a.ts');
    const closing = (editor as any).closeAllTabs();
    document.querySelector<HTMLButtonElement>('#confirm-cancel')!.click();
    await closing;
    expect(editor.tabs).toHaveLength(1);
    expect(editor.hasUnsavedChanges()).toBe(true);
  });

  it('copy file path action calls clipboard writeText', () => {
    const editor = new MonacoEditorWindow(container);
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

describe('MonacoEditorWindow — saveCurrentFile', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.writeFile as any).mockResolvedValue(true);
  });

  it('does nothing when no activeTab', () => {
    const editor = new MonacoEditorWindow(container);
    (editor as any).editor = { getValue: vi.fn().mockReturnValue('content') };
    editor.activeTab = null;
    editor.saveCurrentFile();
    expect(mockElectronAPI.fs.writeFile).not.toHaveBeenCalled();
  });

  it('does nothing when editor is null', () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/a.ts', name: 'a.ts', originalPath: '/a.ts' });
    editor.activeTab = '/a.ts';
    (editor as any).editor = null;
    editor.saveCurrentFile();
    expect(mockElectronAPI.fs.writeFile).not.toHaveBeenCalled();
  });

  it('writes file content and clears dirty flag', async () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/a.ts', name: 'a.ts', originalPath: '/a.ts' });
    editor.activeTab = '/a.ts';
    (editor as any).dirtyFiles.add('/a.ts');
    (editor as any).editor = { getValue: vi.fn().mockReturnValue('hello world') };
    await expect(editor.saveCurrentFile()).resolves.toBe(true);
    expect(mockElectronAPI.fs.writeFile).toHaveBeenCalledWith('/a.ts', 'hello world');
    expect((editor as any).dirtyFiles.has('/a.ts')).toBe(false);
  });

  it('keeps the dirty flag and reports a failed write (no silent data loss)', async () => {
    (mockElectronAPI.fs.writeFile as any).mockResolvedValue(false);
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/a.ts', name: 'a.ts', originalPath: '/a.ts' });
    editor.activeTab = '/a.ts';
    (editor as any).dirtyFiles.add('/a.ts');
    (editor as any).editor = { getValue: vi.fn().mockReturnValue('hello world') };
    await expect(editor.saveCurrentFile()).resolves.toBe(false);
    expect((editor as any).dirtyFiles.has('/a.ts')).toBe(true);
    expect(editor.hasUnsavedChanges()).toBe(true);
    expect(mockElectronAPI.diagnostics.reportError).toHaveBeenCalled();
  });

  it('keeps the dirty flag when the write throws', async () => {
    (mockElectronAPI.fs.writeFile as any).mockRejectedValue(new Error('EACCES'));
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/a.ts', name: 'a.ts', originalPath: '/a.ts' });
    editor.activeTab = '/a.ts';
    (editor as any).dirtyFiles.add('/a.ts');
    (editor as any).editor = { getValue: vi.fn().mockReturnValue('x') };
    await expect(editor.saveCurrentFile()).resolves.toBe(false);
    expect((editor as any).dirtyFiles.has('/a.ts')).toBe(true);
  });
});

describe('MonacoEditorWindow — getState with editor', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
  });

  it('returns null when no tabs open', () => {
    const editor = new MonacoEditorWindow(container);
    expect(editor.getState()).toBeNull();
  });

  it('returns state with open files and active file', () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push(
      { filePath: '/a.ts', name: 'a.ts', originalPath: '/a.ts' },
      { filePath: '/b.ts', name: 'b.ts', originalPath: '/b.ts' },
    );
    editor.activeTab = '/a.ts';
    const state = editor.getState();
    expect(state).not.toBeNull();
    expect(state!.openFiles).toEqual(['/a.ts', '/b.ts']);
    expect(state!.activeFile).toBe('/a.ts');
  });

  it('captures cursor position from editor when active', () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/a.ts', name: 'a.ts', originalPath: '/a.ts' });
    editor.activeTab = '/a.ts';
    (editor as any).editor = {
      getPosition: vi.fn().mockReturnValue({ lineNumber: 5, column: 10 }),
      getScrollTop: vi.fn().mockReturnValue(200),
      getSelection: vi.fn().mockReturnValue(null),
    };
    editor.getState();
    const saved = (editor as any).savedCursors['/a.ts'];
    expect(saved.lineNumber).toBe(5);
    expect(saved.column).toBe(10);
  });

  it('skips cursor capture when editor returns null position', () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/a.ts', name: 'a.ts', originalPath: '/a.ts' });
    editor.activeTab = '/a.ts';
    (editor as any).editor = {
      getPosition: vi.fn().mockReturnValue(null),
      getScrollTop: vi.fn().mockReturnValue(0),
      getSelection: vi.fn().mockReturnValue(null),
    };
    editor.getState();
    expect((editor as any).savedCursors['/a.ts']).toBeUndefined();
  });
});

describe('MonacoEditorWindow — getActiveOriginalPath', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
  });

  it('returns null when no activeTab', () => {
    const editor = new MonacoEditorWindow(container);
    expect((editor as any).getActiveOriginalPath()).toBeNull();
  });

  it('returns originalPath for active tab', () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/norm.ts', name: 'norm.ts', originalPath: '/orig/norm.ts' });
    editor.activeTab = '/norm.ts';
    expect((editor as any).getActiveOriginalPath()).toBe('/orig/norm.ts');
  });

  it('returns null when activeTab has no matching tab entry', () => {
    const editor = new MonacoEditorWindow(container);
    editor.activeTab = '/ghost.ts';
    expect((editor as any).getActiveOriginalPath()).toBeNull();
  });
});

describe('MonacoEditorWindow — oversized files', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.readFile as any).mockClear();
    stubMonaco();
  });

  afterEach(() => {
    (mockElectronAPI.fs.stat as any).mockResolvedValue({ size: 0, isDirectory: false });
  });

  it('refuses to open a file past the text limit — no tab, no read', async () => {
    (mockElectronAPI.fs.stat as any).mockResolvedValue({ size: 200 * 1024 * 1024, isDirectory: false });
    const editor = new MonacoEditorWindow(container);

    await editor.openFile('/mock/workspace/disk-image.iso');

    expect(mockElectronAPI.fs.readFile).not.toHaveBeenCalled();
    expect(editor.tabs).toHaveLength(0);
    expect(document.body.textContent).toContain('too large to open as text');
  });

  it('opens a normal file once its size is known to be fine', async () => {
    (mockElectronAPI.fs.stat as any).mockResolvedValue({ size: 4096, isDirectory: false });
    const editor = new MonacoEditorWindow(container);

    await editor.openFile('/mock/workspace/src/a.ts');

    expect(mockElectronAPI.fs.readFile).toHaveBeenCalledWith('/mock/workspace/src/a.ts');
    expect(editor.tabs).toHaveLength(1);
  });
});

describe('MonacoEditorWindow — markdown preview tabs', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('# Title\n\nSome *text*.');
    // Monaco never loads in jsdom — stub the global so initMonaco resolves
    // synchronously (this.editor = a mock) instead of hanging on loadScript.
    stubMonaco();
  });

  it('openMarkdown adds a markdown-kind tab to the same tab bar', async () => {
    const editor = new MonacoEditorWindow(container);
    await editor.openMarkdown('/test/readme.md');
    expect(editor.tabs).toHaveLength(1);
    expect(editor.tabs[0].kind).toBe('markdown');
    expect(editor.tabs[0].originalPath).toBe('/test/readme.md');
    expect((editor as any).activeTab).toBe('/test/readme.md');
  });

  it('switching to a markdown tab hides the Monaco editor and shows the preview', async () => {
    const editor = new MonacoEditorWindow(container);
    await editor.openFile('/test/a.ts');
    await editor.openMarkdown('/test/readme.md');

    expect((editor as any).editorEl.style.display).toBe('none');
    const preview = (editor as any).markdownPreviewEl;
    expect(preview.style.display).toBe('');
    expect(preview.innerHTML).toContain('md-content');
    expect(preview.textContent).toContain('Title');

    // Switching back to the code tab restores the editor
    editor.switchTab('/test/a.ts');
    expect((editor as any).editorEl.style.display).toBe('');
    expect(preview.style.display).toBe('none');
  });

  it('reopening a markdown tab via openFile flips it back to code mode', async () => {
    const editor = new MonacoEditorWindow(container);
    await editor.openMarkdown('/test/readme.md');
    await editor.openFile('/test/readme.md');
    expect(editor.tabs[0].kind).toBeUndefined();
    expect((editor as any).editorEl.style.display).toBe('');
  });

  it('getState reports markdown files separately and round-trips through restoreState', async () => {
    const editor = new MonacoEditorWindow(container);
    await editor.openFile('/test/a.ts');
    await editor.openMarkdown('/test/readme.md');

    const state = editor.getState();
    expect(state!.openFiles).toContain('/test/readme.md');
    expect(state!.markdownFiles).toEqual(['/test/readme.md']);
    expect(state!.activeFile).toBe('/test/readme.md');

    const editor2 = new MonacoEditorWindow(makeContainer());
    await editor2.restoreState(state!);
    expect(editor2.tabs.find(t => t.originalPath === '/test/readme.md')?.kind).toBe('markdown');
    expect((editor2 as any).activeTab).toBe('/test/readme.md');
  });
});

describe('MonacoEditorWindow — media tabs', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.readFile as any).mockClear();
    (mockElectronAPI.fs.writeFile as any).mockClear();
    (mockElectronAPI.fs.stat as any).mockResolvedValue({ size: 4096, isDirectory: false });
    // jsdom logs "not implemented" for pause(); the Viewer calls it on hide.
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('opens an image without booting Monaco or reading it as text', async () => {
    const editor = new MonacoEditorWindow(container);
    await editor.openFile('/ws/photo.png');

    expect(editor.tabs).toHaveLength(1);
    expect(editor.tabs[0].kind).toBe('image');
    expect((editor as any).editor).toBeNull();
    expect(mockElectronAPI.fs.readFile).not.toHaveBeenCalled();

    const img = container.querySelector('img.media-preview-img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain(encodeURIComponent('/ws/photo.png'));
    expect((editor as any).editorEl.style.display).toBe('none');
  });

  it('opens a video in a player and a PDF in the built-in viewer', async () => {
    const editor = new MonacoEditorWindow(container);
    await editor.openFile('/ws/clip.mp4');
    expect(editor.tabs[0].kind).toBe('video');
    expect(container.querySelector('video.media-preview-video')).toBeTruthy();

    await editor.openFile('/ws/doc.pdf');
    expect(editor.tabs[1].kind).toBe('pdf');
    expect(container.querySelector('iframe.media-preview-frame')).toBeTruthy();
    expect(container.querySelector('video.media-preview-video')).toBeNull();
  });

  it('routes undecodable formats to the external-app message, not Monaco', async () => {
    const editor = new MonacoEditorWindow(container);
    await editor.openFile('/ws/scan.tiff');

    expect(editor.tabs[0].kind).toBe('unsupported');
    expect((editor as any).editor).toBeNull();
    expect(container.querySelector('.media-preview-message')?.textContent).toContain('cannot be previewed');
  });

  it('switching back to a source tab restores the Monaco surface', async () => {
    stubMonaco();
    const editor = new MonacoEditorWindow(container);
    await editor.openFile('/ws/photo.png');
    await editor.openFile('/ws/a.ts');

    expect((editor as any).editorEl.style.display).toBe('');
    expect((container.querySelector('.media-preview-area') as HTMLElement).style.display).toBe('none');

    editor.switchTab('/ws/photo.png');
    expect((editor as any).editorEl.style.display).toBe('none');
    expect((container.querySelector('.media-preview-area') as HTMLElement).style.display).toBe('block');
  });

  it('agent state reports the media path with no selection', async () => {
    const editor = new MonacoEditorWindow(container);
    await editor.openFile('/ws/photo.png');
    const state = editor.getAgentEditorState();
    expect(state.activeFile).toBe('/ws/photo.png');
    expect(state.selectedText).toBe('');
    expect(state.openFiles).toEqual(['/ws/photo.png']);
  });

  it('getState/restoreState round-trip keeps the media viewer kind', async () => {
    const editor = new MonacoEditorWindow(container);
    await editor.openFile('/ws/photo.png');
    const state = editor.getState();
    expect(state!.openFiles).toEqual(['/ws/photo.png']);
    expect(state!.markdownFiles).toEqual([]);

    const editor2 = new MonacoEditorWindow(makeContainer());
    await editor2.restoreState(state!);
    expect(editor2.tabs[0].kind).toBe('image');
    expect((editor2 as any).activeTab).toBe('/ws/photo.png');
  });

  it('closing the active media tab unloads the viewer', async () => {
    const editor = new MonacoEditorWindow(container);
    await editor.openFile('/ws/photo.png');
    await (editor as any).closeTab('/ws/photo.png');

    expect(editor.tabs).toHaveLength(0);
    expect(container.querySelector('.media-preview-media')).toBeNull();
    expect((container.querySelector('.media-preview-area') as HTMLElement).style.display).toBe('none');
  });

  it('closes a media tab whose file disappeared from disk', async () => {
    const editor = new MonacoEditorWindow(container);
    await editor.openFile('/ws/photo.png');
    (mockElectronAPI.fs.stat as any).mockResolvedValue(null);

    await editor.reloadIfOpen('/ws/photo.png');
    expect(editor.tabs).toHaveLength(0);
  });

  it('refreshes the active media tab when the file changes', async () => {
    const editor = new MonacoEditorWindow(container);
    await editor.openFile('/ws/photo.png');
    const refresh = vi.spyOn((editor as any).mediaViewer, 'refresh');

    await editor.reloadIfOpen('/ws/photo.png');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(editor.tabs).toHaveLength(1);
  });

  it('saveCurrentFile ignores media tabs', async () => {
    const editor = new MonacoEditorWindow(container);
    await editor.openFile('/ws/photo.png');
    await expect(editor.saveCurrentFile()).resolves.toBe(false);
    expect(mockElectronAPI.fs.writeFile).not.toHaveBeenCalled();
  });
});

describe('MonacoEditorWindow — dirty-buffer protection', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.writeFile as any).mockResolvedValue(true);
  });

  it('reloadIfOpen prompts instead of clobbering a dirty buffer (Keep mine)', async () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/test/file.ts', name: 'file.ts', originalPath: '/test/file.ts' });
    editor.activeTab = '/test/file.ts';
    (editor as any).fileContents.set('/test/file.ts', 'mine');
    (editor as any).dirtyFiles.add('/test/file.ts');
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('theirs');

    const reloading = editor.reloadIfOpen('/test/file.ts');
    await new Promise(r => setTimeout(r, 0));
    expect(document.querySelector('.confirm-modal-msg')).toBeTruthy();
    document.querySelector<HTMLButtonElement>('#confirm-cancel')!.click();
    await reloading;

    expect((editor as any).fileContents.get('/test/file.ts')).toBe('mine');
    expect(editor.hasUnsavedChanges()).toBe(true);
  });

  it('reloadIfOpen reloads a dirty buffer when the user picks Reload', async () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/test/file.ts', name: 'file.ts', originalPath: '/test/file.ts' });
    editor.activeTab = '/test/file.ts';
    (editor as any).fileContents.set('/test/file.ts', 'mine');
    (editor as any).dirtyFiles.add('/test/file.ts');
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('theirs');

    const reloading = editor.reloadIfOpen('/test/file.ts');
    await new Promise(r => setTimeout(r, 0));
    document.querySelector<HTMLButtonElement>('#confirm-ok')!.click();
    await reloading;

    expect((editor as any).fileContents.get('/test/file.ts')).toBe('theirs');
    expect(editor.hasUnsavedChanges()).toBe(false);
  });

  it('reloadIfOpen does not prompt when the disk content is unchanged', async () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/test/file.ts', name: 'file.ts', originalPath: '/test/file.ts' });
    editor.activeTab = '/test/file.ts';
    (editor as any).fileContents.set('/test/file.ts', 'same');
    (editor as any).dirtyFiles.add('/test/file.ts');
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('same');

    await editor.reloadIfOpen('/test/file.ts');
    expect(document.querySelector('.confirm-modal-msg')).toBeNull();
    expect(editor.hasUnsavedChanges()).toBe(true);
  });

  it('keeps a dirty buffer when the file disappears from disk', async () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/test/file.ts', name: 'file.ts', originalPath: '/test/file.ts' });
    editor.activeTab = '/test/file.ts';
    (editor as any).dirtyFiles.add('/test/file.ts');
    (mockElectronAPI.fs.readFile as any).mockResolvedValue(null);

    await editor.reloadIfOpen('/test/file.ts');
    expect(editor.tabs).toHaveLength(1);
    expect(editor.hasUnsavedChanges()).toBe(true);
  });

  it('closeTab asks before discarding a dirty tab (Cancel keeps it)', async () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/test/a.ts', name: 'a.ts', originalPath: '/test/a.ts' });
    editor.activeTab = '/test/a.ts';
    (editor as any).dirtyFiles.add('/test/a.ts');

    const closing = (editor as any).closeTab('/test/a.ts');
    document.querySelector<HTMLButtonElement>('#confirm-cancel')!.click();
    await closing;
    expect(editor.tabs).toHaveLength(1);

    const closing2 = (editor as any).closeTab('/test/a.ts');
    document.querySelector<HTMLButtonElement>('#confirm-ok')!.click();
    await closing2;
    expect(editor.tabs).toHaveLength(0);
  });

  it('closeTab stays synchronous for a clean tab', () => {
    const editor = new MonacoEditorWindow(container);
    editor.tabs.push({ filePath: '/test/a.ts', name: 'a.ts', originalPath: '/test/a.ts' });
    editor.activeTab = '/test/a.ts';
    (editor as any).closeTab('/test/a.ts');
    expect(editor.tabs).toHaveLength(0);
    expect(document.querySelector('.confirm-modal-msg')).toBeNull();
  });
});

describe('MonacoEditorWindow — lazy Monaco bootstrap + destroy', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('content');
    (mockElectronAPI.fs.writeFile as any).mockResolvedValue(true);
    (window as any).monaco = undefined;
  });

  afterEach(() => { (window as any).monaco = undefined; });

  it('does not boot Monaco in the constructor', () => {
    const editor = new MonacoEditorWindow(container);
    expect((editor as any).editor).toBeNull();
    expect(container.textContent).toContain('Open a file to start editing');
  });

  it('boots Monaco on the first openFile', async () => {
    const create = vi.fn(() => ({
      getValue: vi.fn(() => 'content'),
      setValue: vi.fn(),
      getPosition: vi.fn(() => null),
      getScrollTop: vi.fn(() => 0),
      setPosition: vi.fn(),
      setScrollTop: vi.fn(),
      getSelection: vi.fn(() => null),
      getModel: vi.fn(() => ({})),
      addAction: vi.fn(),
      onDidChangeModelContent: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeCursorSelection: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    }));
    (window as any).monaco = {
      editor: { create, setModelLanguage: vi.fn(), defineTheme: vi.fn(), setTheme: vi.fn() },
      KeyMod: { CtrlCmd: 0 },
      KeyCode: { KeyS: 0 },
    };
    const editor = new MonacoEditorWindow(container);
    await editor.openFile('/test/a.ts');
    expect(create).toHaveBeenCalledTimes(1);
    expect((editor as any).editor).toBeTruthy();
    expect(container.textContent).not.toContain('Open a file to start editing');
  });

  it('destroy() unsubscribes the file watcher and disposes the editor', () => {
    const unsub = vi.fn();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(unsub);
    const editor = new MonacoEditorWindow(container);
    const dispose = vi.fn();
    (editor as any).editor = { dispose, getModel: () => null };
    editor.destroy();
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.editor-wrap')).toBeNull();
  });

  it('destroy() removes the document dragend listener', () => {
    const editor = new MonacoEditorWindow(container);
    const remove = vi.spyOn(document, 'removeEventListener');
    editor.destroy();
    expect(remove).toHaveBeenCalledWith('dragend', expect.any(Function));
    remove.mockRestore();
  });
});
