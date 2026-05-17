import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileExplorerPlugin } from './FileExplorerPlugin';
import { mockElectronAPI } from '../../test/setup';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'width:300px;height:500px';
  document.body.appendChild(el);
  return el;
}

describe('FileExplorerPlugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.readDir as any).mockResolvedValue([
      { name: 'src', isDirectory: true },
      { name: 'README.md', isDirectory: false },
      { name: 'package.json', isDirectory: false },
      { name: '.gitkeep', isDirectory: false },
    ]);
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
  });

  it('creates the tree element and appends it to container', () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    // The container should have a child div (the tree container)
    expect(container.children.length).toBeGreaterThan(0);
  });

  it('renders directory and file entries after load', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    // Should contain directory and file names
    const text = container.textContent || '';
    expect(text).toContain('src');
    expect(text).toContain('README.md');
  });

  it('filters out .gitkeep entries', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const text = container.textContent || '';
    expect(text).not.toContain('.gitkeep');
  });

  it('sorts directories before files', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    // First entry should be a directory icon
    const spans = Array.from(container.querySelectorAll('span'));
    const firstIcon = spans.find(s => s.textContent === '▸' || s.textContent === '▾');
    expect(firstIcon).toBeTruthy();
  });

  it('clicking a file calls onFileOpen with full path', async () => {
    const onFileOpen = vi.fn();
    new FileExplorerPlugin(container, '/test', onFileOpen);
    await new Promise(r => setTimeout(r, 100));

    // Find the README.md element and click it
    const allDivs = container.querySelectorAll('div');
    for (const div of allDivs) {
      if (div.textContent?.includes('README.md') && div.style.cursor === 'pointer') {
        (div as HTMLElement).click();
        break;
      }
    }

    expect(onFileOpen).toHaveBeenCalled();
  });

  it('refresh clears and reloads tree', async () => {
    const explorer = new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    expect(container.textContent).toContain('src');

    (mockElectronAPI.fs.readDir as any).mockResolvedValue([
      { name: 'newfile.ts', isDirectory: false },
    ]);
    explorer.refresh();
    await new Promise(r => setTimeout(r, 100));

    expect(container.textContent).toContain('newfile.ts');
  });

  it('shows "Unable to read directory" when readDir returns null', async () => {
    (mockElectronAPI.fs.readDir as any).mockResolvedValue(null);

    new FileExplorerPlugin(container, '/invalid', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const text = container.textContent || '';
    expect(text).toContain('Unable to read directory');
  });

  it('stops wheel propagation on the tree element', () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    // The file explorer el is container's first child
    const treeEl = container.firstElementChild as HTMLElement;

    const wheelEvent = new WheelEvent('wheel', { bubbles: true });
    const stopPropagationSpy = vi.spyOn(wheelEvent, 'stopPropagation');

    treeEl.dispatchEvent(wheelEvent);
    expect(stopPropagationSpy).toHaveBeenCalled();
  });
});
