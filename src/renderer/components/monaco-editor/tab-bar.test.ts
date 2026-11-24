import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorTabBar } from './tab-bar';
import type { EditorTab } from './ide-state';

function makeContainer(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function makeHost() {
  return {
    activate: vi.fn(),
    close: vi.fn(),
    closeOthers: vi.fn(),
    closeAll: vi.fn(),
    reorder: vi.fn(),
  };
}

function tab(name: string, kind?: EditorTab['kind']): EditorTab {
  return { filePath: `/ws/${name}`, name, originalPath: `/ws/${name}`, kind };
}

describe('EditorTabBar', () => {
  let container: HTMLDivElement;
  let host: ReturnType<typeof makeHost>;
  let bar: EditorTabBar;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    host = makeHost();
    bar = new EditorTabBar(container, host);
  });

  it('shows the empty label when there are no tabs', () => {
    bar.render([], null, new Set());
    expect(container.textContent).toBe('No file selected');
    expect(container.querySelectorAll('.editor-tab')).toHaveLength(0);
  });

  it('renders active, dirty and media-kind state with the right glyph', () => {
    bar.render(
      [tab('a.ts'), tab('pic.png', 'image'), tab('doc.pdf', 'pdf')],
      '/ws/pic.png',
      new Set(['/ws/a.ts']),
    );

    const tabs = container.querySelectorAll<HTMLElement>('.editor-tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0].classList.contains('is-dirty')).toBe(true);
    expect(tabs[1].classList.contains('is-active')).toBe(true);
    expect(tabs[1].classList.contains('is-media')).toBe(true);
    expect(tabs[1].classList.contains('is-image')).toBe(true);
    expect(tabs[1].querySelector('.editor-tab-name')?.textContent).toBe('▧ pic.png');
    expect(tabs[2].querySelector('.editor-tab-name')?.textContent).toBe('▤ doc.pdf');
  });

  it('activates a tab on click and closes it from the close button', () => {
    bar.render([tab('a.ts')], '/ws/a.ts', new Set());
    const tabEl = container.querySelector<HTMLElement>('.editor-tab')!;

    tabEl.click();
    expect(host.activate).toHaveBeenCalledWith('/ws/a.ts');

    (tabEl.querySelector('.editor-tab-close') as HTMLElement).click();
    expect(host.close).toHaveBeenCalledWith('/ws/a.ts');
    expect(host.activate).toHaveBeenCalledTimes(1); // close click must not re-activate
  });

  it('closes on middle-click', () => {
    bar.render([tab('a.ts')], '/ws/a.ts', new Set());
    const tabEl = container.querySelector<HTMLElement>('.editor-tab')!;
    tabEl.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true }));
    expect(host.close).toHaveBeenCalledWith('/ws/a.ts');
  });

  it('offers close / close others / close all / copy path in the context menu', () => {
    bar.render([tab('a.ts'), tab('b.ts')], '/ws/a.ts', new Set());
    const tabEl = container.querySelector<HTMLElement>('.editor-tab')!;
    tabEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));

    const labels = [...document.querySelectorAll('.ctx-item')].map(el => el.textContent);
    expect(labels).toEqual(['Close', 'Close Others', 'Close All', 'Copy File Path']);
  });
});
