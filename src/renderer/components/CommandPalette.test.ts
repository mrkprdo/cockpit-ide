import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandPalette } from './CommandPalette';

const mockReadDir = vi.fn();
let store: Record<string, string> = {};

describe('CommandPalette', () => {
  beforeEach(() => {
    store = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
        removeItem: vi.fn((key: string) => { delete store[key]; }),
        clear: vi.fn(() => { store = {}; }),
        get length() { return Object.keys(store).length; },
        key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
      },
      configurable: true,
      writable: true,
    });

    mockReadDir.mockReset();
    mockReadDir.mockResolvedValue([]);
    (window as any).electronAPI = {
      ...(window as any).electronAPI,
      fs: { ...(window as any).electronAPI?.fs, readDir: mockReadDir },
    };
    window.localStorage.clear();
  });

  afterEach(() => {
    document.querySelectorAll('.palette-overlay').forEach(el => el.remove());
  });

  function createPalette(wsPath = '/test/ws'): CommandPalette {
    const onSelect = vi.fn();
    const palette = new CommandPalette(wsPath, onSelect);
    return palette;
  }

  it('creates overlay and palette DOM elements', () => {
    createPalette();
    expect(document.querySelector('.palette-overlay')).toBeTruthy();
    expect(document.querySelector('.palette')).toBeTruthy();
    expect(document.querySelector('.palette-input')).toBeTruthy();
    expect(document.querySelector('.palette-results')).toBeTruthy();
    expect(document.querySelector('.palette-progress')).toBeTruthy();
  });

  it('overlay has dialog ARIA role and label', () => {
    createPalette();
    const overlay = document.querySelector('.palette-overlay') as HTMLElement;
    expect(overlay.getAttribute('role')).toBe('dialog');
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    expect(overlay.getAttribute('aria-label')).toBe('File search');
  });

  it('input has aria-label, autocomplete=off, spellcheck=false', () => {
    createPalette();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    expect(input.getAttribute('aria-label')).toBeTruthy();
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
  });

  it('open() adds open class and focuses input', async () => {
    const palette = createPalette();
    palette.open();
    expect(document.querySelector('.palette-overlay')?.classList.contains('open')).toBe(true);
    await new Promise(r => setTimeout(r, 60));
    expect(document.activeElement).toBe(document.querySelector('.palette-input'));
  });

  it('open() clears input and resets state', () => {
    const palette = createPalette();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'some search';
    palette.open();
    expect(input.value).toBe('');
    // Shows "No recent files" empty message (1 child)
    const results = document.querySelector('.palette-results')!;
    expect(results.children.length).toBe(1);
    expect(results.children[0].classList.contains('palette-empty')).toBe(true);
  });

  it('close() removes open class', () => {
    const palette = createPalette();
    palette.open();
    palette.close();
    expect(document.querySelector('.palette-overlay')?.classList.contains('open')).toBe(false);
  });

  it('Escape key closes palette', () => {
    const palette = createPalette();
    palette.open();
    document.querySelector('.palette-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.palette-overlay')?.classList.contains('open')).toBe(false);
  });

  it('overlay background click closes palette', () => {
    const palette = createPalette();
    palette.open();
    const overlay = document.querySelector('.palette-overlay') as HTMLElement;
    overlay.click();
    expect(overlay.classList.contains('open')).toBe(false);
  });

  it('overlay click on palette element does not close', () => {
    const palette = createPalette();
    palette.open();
    const paletteEl = document.querySelector('.palette') as HTMLElement;
    paletteEl.click();
    expect(document.querySelector('.palette-overlay')?.classList.contains('open')).toBe(true);
  });

  it('shows recent files section when input is empty', () => {
    window.localStorage.setItem('cockpit-recent-files', JSON.stringify(['/test/ws/file1.ts', '/test/ws/file2.ts']));
    const palette = createPalette();
    palette.open();
    const header = document.querySelector('.palette-section-header');
    expect(header).toBeTruthy();
    expect(header?.textContent).toBe('RECENT FILES');
    const items = document.querySelectorAll('.palette-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('file1.ts');
  });

  it('shows empty message when no recent files and input is empty', () => {
    const palette = createPalette();
    palette.open();
    const emptyMsg = document.querySelector('.palette-empty');
    expect(emptyMsg?.textContent).toContain('No recent files');
  });

  it('loads recent files from localStorage on construction', () => {
    window.localStorage.setItem('cockpit-recent-files', JSON.stringify(['/test/a.ts', '/test/b.ts']));
    const palette = createPalette();
    palette.open();
    const items = document.querySelectorAll('.palette-item');
    expect(items.length).toBe(2);
  });

  it('selectFile adds to recent and calls onSelect', () => {
    const onSelect = vi.fn();
    const palette = new CommandPalette('/test/ws', onSelect);
    (palette as any).selectFile('/test/ws/selected.ts');
    expect(onSelect).toHaveBeenCalledWith('/test/ws/selected.ts');
    const recent = JSON.parse(window.localStorage.getItem('cockpit-recent-files') || '[]');
    expect(recent).toContain('/test/ws/selected.ts');
  });

  it('recent files are capped at 10', () => {
    const onSelect = vi.fn();
    const palette = new CommandPalette('/test/ws', onSelect);
    for (let i = 0; i < 12; i++) {
      (palette as any).selectFile(`/test/ws/file${i}.ts`);
    }
    const recent = JSON.parse(window.localStorage.getItem('cockpit-recent-files') || '[]');
    expect(recent.length).toBe(10);
    expect(recent[0]).toBe('/test/ws/file11.ts');
  });

  it('recent files are deduplicated (most recent moves to front)', () => {
    const onSelect = vi.fn();
    const palette = new CommandPalette('/test/ws', onSelect);
    (palette as any).selectFile('/test/ws/a.ts');
    (palette as any).selectFile('/test/ws/b.ts');
    (palette as any).selectFile('/test/ws/a.ts');
    const recent = JSON.parse(window.localStorage.getItem('cockpit-recent-files') || '[]');
    expect(recent[0]).toBe('/test/ws/a.ts');
    expect(recent[1]).toBe('/test/ws/b.ts');
    expect(recent.length).toBe(2);
  });

  it('performSearch loads files via readDir and filters results', async () => {
    mockReadDir
      .mockResolvedValueOnce([
        { name: 'src', isDirectory: true },
        { name: 'README.md', isDirectory: false },
      ])
      .mockResolvedValueOnce([
        { name: 'index.ts', isDirectory: false },
        { name: 'utils.ts', isDirectory: false },
      ]);

    const palette = createPalette();
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'index';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    const items = document.querySelectorAll('.palette-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('index.ts');
  });

  it('filters results by path substring', async () => {
    mockReadDir.mockResolvedValueOnce([
      { name: 'src', isDirectory: true },
    ]).mockResolvedValueOnce([
      { name: 'app.ts', isDirectory: false },
      { name: 'styles.css', isDirectory: false },
    ]);

    const palette = createPalette('/test/ws');
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'src/app';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    const items = document.querySelectorAll('.palette-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('app.ts');
  });

  it('skips .git, node_modules, .cockpit directories', async () => {
    const walkFn = vi.fn();
    mockReadDir.mockImplementation((dir: string) => {
      walkFn(dir);
      if (dir === '/test/ws') {
        return Promise.resolve([
          { name: '.git', isDirectory: true },
          { name: 'node_modules', isDirectory: true },
          { name: '.cockpit', isDirectory: true },
          { name: 'src', isDirectory: true },
        ]);
      }
      if (dir === '/test/ws/src') {
        return Promise.resolve([
          { name: 'main.ts', isDirectory: false },
        ]);
      }
      return Promise.resolve([]);
    });

    const palette = createPalette();
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'main';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    expect(walkFn).toHaveBeenCalledWith('/test/ws');
    expect(walkFn).toHaveBeenCalledWith('/test/ws/src');
    expect(walkFn).not.toHaveBeenCalledWith('/test/ws/.git');
    expect(walkFn).not.toHaveBeenCalledWith('/test/ws/node_modules');
    expect(walkFn).not.toHaveBeenCalledWith('/test/ws/.cockpit');
  });

  it('shows loading progress during file indexing', async () => {
    mockReadDir.mockImplementation(() => new Promise(r => setTimeout(() => r([]), 50)));
    const palette = createPalette();
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'test';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 160));
    const progress = document.querySelector('.palette-progress') as HTMLElement;
    expect(progress.style.display).not.toBe('none');
    await new Promise(r => setTimeout(r, 100));
  });

  it('shows empty results message when no matches found', async () => {
    mockReadDir.mockResolvedValueOnce([
      { name: 'main.ts', isDirectory: false },
    ]);
    const palette = createPalette();
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'nonexistent';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    const empty = document.querySelector('.palette-empty');
    expect(empty?.textContent).toContain('No matching files');
  });

  it('Enter key confirms selection from search results', async () => {
    mockReadDir.mockResolvedValueOnce([
      { name: 'main.ts', isDirectory: false },
    ]);
    const onSelect = vi.fn();
    const palette = new CommandPalette('/test/ws', onSelect);
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'main';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onSelect).toHaveBeenCalledWith('/test/ws/main.ts');
  });

  it('Enter on empty input with recent files selects first recent', () => {
    window.localStorage.setItem('cockpit-recent-files', JSON.stringify(['/test/ws/recent.ts']));
    const onSelect = vi.fn();
    const palette = new CommandPalette('/test/ws', onSelect);
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onSelect).toHaveBeenCalledWith('/test/ws/recent.ts');
  });

  it('click on result item selects file', async () => {
    mockReadDir.mockResolvedValueOnce([
      { name: 'clickme.ts', isDirectory: false },
    ]);
    const onSelect = vi.fn();
    const palette = new CommandPalette('/test/ws', onSelect);
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'clickme';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    const item = document.querySelector('.palette-item') as HTMLElement;
    item.dispatchEvent(new MouseEvent('mousedown'));
    expect(onSelect).toHaveBeenCalledWith('/test/ws/clickme.ts');
  });

  it('ArrowDown moves selection forward', async () => {
    mockReadDir.mockResolvedValueOnce([
      { name: 'a.ts', isDirectory: false },
      { name: 'b.ts', isDirectory: false },
    ]);
    const palette = createPalette();
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = '.ts';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    const items = document.querySelectorAll('.palette-item');
    expect(items[0].classList.contains('is-selected')).toBe(true);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(items[1].classList.contains('is-selected')).toBe(true);
    expect(items[0].classList.contains('is-selected')).toBe(false);
  });

  it('ArrowUp moves selection backward', async () => {
    mockReadDir.mockResolvedValueOnce([
      { name: 'a.ts', isDirectory: false },
      { name: 'b.ts', isDirectory: false },
    ]);
    const palette = createPalette();
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = '.ts';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    const inputEl = document.querySelector('.palette-input') as HTMLInputElement;
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    const items = document.querySelectorAll('.palette-item');
    expect(items[1].classList.contains('is-selected')).toBe(true);
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(items[0].classList.contains('is-selected')).toBe(true);
  });

  it('mouseenter on item updates selection', async () => {
    mockReadDir.mockResolvedValueOnce([
      { name: 'a.ts', isDirectory: false },
      { name: 'b.ts', isDirectory: false },
    ]);
    const palette = createPalette();
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = '.ts';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    const items = document.querySelectorAll('.palette-item');
    items[1].dispatchEvent(new MouseEvent('mouseenter'));
    expect(items[1].classList.contains('is-selected')).toBe(true);
    expect(items[0].classList.contains('is-selected')).toBe(false);
  });

  it('destroy() removes overlay from DOM', () => {
    const palette = createPalette();
    expect(document.querySelector('.palette-overlay')).toBeTruthy();
    palette.destroy();
    expect(document.querySelector('.palette-overlay')).toBeNull();
  });

  it('ArrowDown at end of list does not go out of bounds', async () => {
    mockReadDir.mockResolvedValueOnce([
      { name: 'a.ts', isDirectory: false },
    ]);
    const palette = createPalette();
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = '.ts';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    const inputEl = document.querySelector('.palette-input') as HTMLInputElement;
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    const items = document.querySelectorAll('.palette-item');
    expect(items[0].classList.contains('is-selected')).toBe(true);
  });

  it('ArrowUp at start stays at first item', async () => {
    mockReadDir.mockResolvedValueOnce([
      { name: 'a.ts', isDirectory: false },
    ]);
    const palette = createPalette();
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = '.ts';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    const inputEl = document.querySelector('.palette-input') as HTMLInputElement;
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    const items = document.querySelectorAll('.palette-item');
    expect(items[0].classList.contains('is-selected')).toBe(true);
  });

  it('clears input on open() resets loaded files', () => {
    const palette = createPalette();
    palette.open();
    palette.close();
    palette.open();
    expect((document.querySelector('.palette-input') as HTMLInputElement).value).toBe('');
  });

  it('performs case-insensitive search', async () => {
    mockReadDir.mockResolvedValueOnce([
      { name: 'MainComponent.ts', isDirectory: false },
      { name: 'utils.ts', isDirectory: false },
    ]);
    const palette = createPalette();
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'maincomponent';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    const items = document.querySelectorAll('.palette-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('MainComponent.ts');
  });

  it('caches file index after first search', async () => {
    const readDir = mockReadDir.mockResolvedValue([
      { name: 'file.ts', isDirectory: false },
    ]);
    const palette = createPalette();
    palette.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'file';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    expect(readDir).toHaveBeenCalledTimes(1);
    input.value = 'xyz';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 200));
    expect(readDir).toHaveBeenCalledTimes(1);
  });

  it('handles localStorage parse error gracefully', () => {
    window.localStorage.setItem('cockpit-recent-files', '{invalid json}');
    const palette = createPalette();
    palette.open();
    const empty = document.querySelector('.palette-empty');
    expect(empty?.textContent).toContain('No recent files');
  });

  it('handles non-array recent files gracefully', () => {
    window.localStorage.setItem('cockpit-recent-files', '"string"');
    const palette = createPalette();
    palette.open();
    const empty = document.querySelector('.palette-empty');
    expect(empty?.textContent).toContain('No recent files');
  });

  it('loadRecent handles missing localStorage gracefully', () => {
    window.localStorage.removeItem('cockpit-recent-files');
    const palette = createPalette();
    palette.open();
    const empty = document.querySelector('.palette-empty');
    expect(empty?.textContent).toContain('No recent files');
  });

  it('saveRecent handles localStorage error gracefully', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });
    const palette = createPalette();
    (palette as any).saveRecent();
    setItem.mockRestore();
  });
});
