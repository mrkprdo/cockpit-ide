import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { SearchOverlay } from './SearchOverlay';
import { mockElectronAPI } from '../../test/setup';

const fileList = [
  { name: 'src', isDirectory: true },
  { name: 'test.txt', isDirectory: false },
  { name: 'test.ts', isDirectory: false },
  { name: 'logo.png', isDirectory: false },
];

const wsPath = '/test/ws';

describe('SearchOverlay', () => {
  let onSelect: Mock<(filePath: string, lineNumber: number) => void>;

  beforeEach(() => {
    document.body.innerHTML = '';
    onSelect = vi.fn<(filePath: string, lineNumber: number) => void>();
    // Return fileList for root, empty for any subdirectory (avoid infinite recursion)
    (mockElectronAPI.fs.readDir as any).mockImplementation(async (dir: string) => {
      if (dir === wsPath) return fileList;
      return [];
    });
    (mockElectronAPI.fs.readFile as any).mockImplementation(async (fp: string) => {
      if (fp.endsWith('.txt')) return 'hello world\nline two\nhello again';
      if (fp.endsWith('.ts')) return 'const x = 1;\n// hello\nconsole.log("hi");';
      return '';
    });
  });

  it('creates overlay in DOM on construction', () => {
    const s = new SearchOverlay(wsPath, onSelect);
    expect(document.querySelector('.search-overlay')).toBeTruthy();
    s.destroy();
  });

  it('open() adds .open class and focuses input', async () => {
    const s = new SearchOverlay(wsPath, onSelect);
    s.open();
    const ov = document.querySelector('.search-overlay')!;
    expect(ov.classList.contains('open')).toBe(true);
    await new Promise(r => setTimeout(r, 60));
    expect(document.activeElement).toBe(s['input']);
    s.destroy();
  });

  it('close() removes .open class', () => {
    const s = new SearchOverlay(wsPath, onSelect);
    s.open();
    s.close();
    const ov = document.querySelector('.search-overlay')!;
    expect(ov.classList.contains('open')).toBe(false);
    s.destroy();
  });

  it('has three toggle buttons in toolbar', () => {
    const s = new SearchOverlay(wsPath, onSelect);
    const buttons = document.querySelectorAll('.search-toggle-btn');
    expect(buttons.length).toBe(3);
    expect(buttons[0].getAttribute('data-mode')).toBe('matchCase');
    expect(buttons[1].getAttribute('data-mode')).toBe('exactMatch');
    expect(buttons[2].getAttribute('data-mode')).toBe('regex');
    s.destroy();
  });

  it('toggle buttons add/remove .is-active on click', () => {
    const s = new SearchOverlay(wsPath, onSelect);
    const btn = document.querySelector('.search-toggle-btn') as HTMLButtonElement;
    btn.click();
    expect(btn.classList.contains('is-active')).toBe(true);
    btn.click();
    expect(btn.classList.contains('is-active')).toBe(false);
    s.destroy();
  });

  it('performs search on input after debounce', async () => {
    const s = new SearchOverlay(wsPath, onSelect);
    s.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 400));
    const results = document.querySelectorAll('.search-result');
    expect(results.length).toBeGreaterThan(0);
    s.destroy();
  });

  it('renders result with file name, line number, and line content', async () => {
    const s = new SearchOverlay(wsPath, onSelect);
    s.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 400));
    const first = document.querySelector('.search-result') as HTMLElement;
    expect(first.querySelector('.search-result-name')).toBeTruthy();
    expect(first.querySelector('.search-result-lineno')).toBeTruthy();
    expect(first.querySelector('.search-result-line')).toBeTruthy();
    s.destroy();
  });

  it('selecting a result fires onSelectMatch with filePath and lineNumber', async () => {
    const s = new SearchOverlay(wsPath, onSelect);
    s.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 400));
    const first = document.querySelector('.search-result') as HTMLElement;
    first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onSelect).toHaveBeenCalled();
    const [fp, ln] = onSelect.mock.calls[0];
    expect(fp).toBeTruthy();
    expect(fp).toContain(wsPath);
    expect(typeof ln).toBe('number');
    s.destroy();
  });

  it('skips binary extensions', async () => {
    (mockElectronAPI.fs.readDir as any).mockImplementation(async (dir: string) => {
      if (dir === wsPath) return [{ name: 'logo.png', isDirectory: false }];
      return [];
    });
    const s = new SearchOverlay(wsPath, onSelect);
    s.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'test';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 400));
    const results = document.querySelectorAll('.search-result');
    expect(results.length).toBe(0);
    s.destroy();
  });

  it('enter key selects current result', async () => {
    const s = new SearchOverlay(wsPath, onSelect);
    s.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 400));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onSelect).toHaveBeenCalled();
    s.destroy();
  });

  it('escape key closes overlay', () => {
    const s = new SearchOverlay(wsPath, onSelect);
    s.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const ov = document.querySelector('.search-overlay')!;
    expect(ov.classList.contains('open')).toBe(false);
    s.destroy();
  });

  it('highlights search term in line content', async () => {
    const s = new SearchOverlay(wsPath, onSelect);
    s.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 400));
    const lineEl = document.querySelector('.search-result-line')!;
    expect(lineEl.innerHTML).toContain('<mark>');
    s.destroy();
  });

  it('shows no results message when nothing matches', async () => {
    const s = new SearchOverlay(wsPath, onSelect);
    s.open();
    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'zzzznonexistent';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 400));
    const empty = document.querySelector('.palette-empty');
    expect(empty).toBeTruthy();
    expect(empty!.textContent).toBe('No matching results');
    s.destroy();
  });

  it('destroy() removes overlay from DOM', () => {
    const s = new SearchOverlay(wsPath, onSelect);
    s.destroy();
    expect(document.querySelector('.search-overlay')).toBeNull();
  });

  it('toggles affect search results (matchCase)', async () => {
    const s = new SearchOverlay(wsPath, onSelect);
    s.open();
    (mockElectronAPI.fs.readFile as any).mockImplementation(async (fp: string) => {
      if (fp.endsWith('.txt') || fp.endsWith('.ts')) return 'Hello World\nhello world\nHELLO WORLD';
      return '';
    });
    (mockElectronAPI.fs.readDir as any).mockImplementation(async (dir: string) => {
      if (dir === wsPath) return [{ name: 'test.txt', isDirectory: false }];
      return [];
    });

    const input = document.querySelector('.palette-input') as HTMLInputElement;
    input.value = 'Hello';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 400));
    expect(document.querySelectorAll('.search-result').length).toBe(3);

    // Enable match case — should only match exact "Hello"
    const matchCaseBtn = document.querySelector('[data-mode="matchCase"]') as HTMLButtonElement;
    matchCaseBtn.click();
    await new Promise(r => setTimeout(r, 400));
    expect(document.querySelectorAll('.search-result').length).toBe(1);
    s.destroy();
  });
});
