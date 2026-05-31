import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileExplorerPlugin } from './FileExplorerPlugin';
import { mockElectronAPI } from '../../test/setup';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'width:300px;height:500px';
  document.body.appendChild(el);
  return el;
}

function setupReadDir(files: Record<string, { name: string; isDirectory: boolean }[]>) {
  (mockElectronAPI.fs.readDir as any).mockImplementation(async (dirPath: string) => {
    const normalized = dirPath.replace(/\\/g, '/');
    return files[normalized] ?? null;
  });
}

describe('FileExplorerPlugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    setupReadDir({
      '/test': [
        { name: 'src', isDirectory: true },
        { name: 'README.md', isDirectory: false },
        { name: 'package.json', isDirectory: false },
        { name: '.gitkeep', isDirectory: false },
      ],
    });
  });

  it('creates the tree element and appends it to container', () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    expect(container.children.length).toBeGreaterThan(0);
  });

  it('renders directory and file entries after load', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

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

  it('filters out .git directory', async () => {
    setupReadDir({
      '/test': [
        { name: '.git', isDirectory: true },
        { name: 'src', isDirectory: true },
        { name: 'README.md', isDirectory: false },
      ],
    });
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const text = container.textContent || '';
    expect(text).not.toContain('.git');
    expect(text).toContain('src');
    expect(text).toContain('README.md');
  });

  it('sorts directories before files', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const spans = Array.from(container.querySelectorAll('span'));
    const firstIcon = spans.find(s => s.textContent === '▸' || s.textContent === '▾');
    expect(firstIcon).toBeTruthy();
  });

  it('clicking a file calls onFileOpen with full path', async () => {
    const onFileOpen = vi.fn();
    new FileExplorerPlugin(container, '/test', onFileOpen);
    await new Promise(r => setTimeout(r, 100));

    const allDivs = container.querySelectorAll('div');
    for (const div of allDivs) {
      if (div.textContent?.includes('README.md') && div.style.cursor === 'pointer') {
        (div as HTMLElement).click();
        break;
      }
    }

    expect(onFileOpen).toHaveBeenCalled();
  });

  it('shows "Unable to read directory" when readDir returns null', async () => {
    setupReadDir({});
    new FileExplorerPlugin(container, '/invalid', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const text = container.textContent || '';
    expect(text).toContain('Unable to read directory');
  });

  it('renders malicious filenames as text, not HTML — prevents stored XSS', async () => {
    setupReadDir({
      '/test': [
        { name: '<img src=x onerror=alert(1)>', isDirectory: false },
        { name: '<script>steal()</script>', isDirectory: false },
        { name: 'normal.txt', isDirectory: false },
      ],
    });

    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const html = container.innerHTML || '';
    // Filenames are set via textContent, so HTML is auto-escaped
    // No raw HTML elements from filenames
    expect(html).not.toContain('<img');        // no raw <img element
    expect(html).not.toContain('<script');     // no raw <script element
    // The malicious names should appear as text content, not active elements
    expect(container.textContent).toContain('onerror=alert(1)');
    expect(container.textContent).toContain('steal()');
    expect(container.textContent).toContain('normal.txt');
  });

  it('stops wheel propagation on the tree element', () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    // treeEl is the scrollable div (second child of the outer el)
    const outerEl = container.firstElementChild as HTMLElement;
    const treeEl = outerEl.querySelector('div:last-child') as HTMLElement;

    const wheelEvent = new WheelEvent('wheel', { bubbles: true });
    const stopPropagationSpy = vi.spyOn(wheelEvent, 'stopPropagation');

    treeEl.dispatchEvent(wheelEvent);
    expect(stopPropagationSpy).toHaveBeenCalled();
  });
});

describe('FileExplorerPlugin directory expand/collapse', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    setupReadDir({
      '/test': [
        { name: 'src', isDirectory: true },
        { name: 'README.md', isDirectory: false },
      ],
      '/test/src': [
        { name: 'index.ts', isDirectory: false },
        { name: 'utils.ts', isDirectory: false },
      ],
    });
  });

  function findDirRow(label: string): HTMLElement | null {
    const divs = container.querySelectorAll('div');
    for (const div of divs) {
      if (div.textContent?.includes(label) && div.style.cursor === 'pointer') {
        // Must have a ▸ or ▾ icon (directory indicator)
        const spans = div.querySelectorAll('span');
        for (const span of spans) {
          if (span.textContent === '▸' || span.textContent === '▾') {
            return div as HTMLElement;
          }
        }
      }
    }
    return null;
  }

  it('clicking a collapsed directory expands it and loads children', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const dirRow = findDirRow('src');
    expect(dirRow).toBeTruthy();
    expect(dirRow!.textContent).toContain('▸');

    dirRow!.click();
    await new Promise(r => setTimeout(r, 100));

    // Icon should change to ▾
    expect(dirRow!.textContent).toContain('▾');

    // Children should appear
    expect(container.textContent).toContain('index.ts');
    expect(container.textContent).toContain('utils.ts');
  });

  it('clicking an expanded directory collapses it and hides children', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const dirRow = findDirRow('src')!;
    dirRow.click();
    await new Promise(r => setTimeout(r, 100));
    expect(dirRow.textContent).toContain('▾');
    expect(container.textContent).toContain('index.ts');

    // Collapse
    dirRow.click();
    await new Promise(r => setTimeout(r, 50));

    expect(dirRow.textContent).toContain('▸');
    // Children still in DOM but hidden via display:none on the child container
    const containers = Array.from(container.querySelectorAll('div'))
      .filter(d => d.children.length > 0 && (d as HTMLElement).style.display === 'none');
    expect(containers.length).toBeGreaterThanOrEqual(1);
  });

  it('expand-collapse-expand cycle works correctly', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const dirRow = findDirRow('src')!;

    // Expand
    dirRow.click();
    await new Promise(r => setTimeout(r, 100));
    expect(container.textContent).toContain('index.ts');

    // Collapse
    dirRow.click();
    await new Promise(r => setTimeout(r, 50));

    // Expand again
    dirRow.click();
    await new Promise(r => setTimeout(r, 100));
    expect(container.textContent).toContain('index.ts');
    expect(container.textContent).toContain('utils.ts');
  });

  it('after reload(), expanded directories stay expanded', async () => {
    const explorer = new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    // Expand src directory
    const dirRow = findDirRow('src')!;
    dirRow.click();
    await new Promise(r => setTimeout(r, 100));
    expect(container.textContent).toContain('index.ts');

    // Simulate reload (preserves expanded state)
    (explorer as any).reload();
    await new Promise(r => setTimeout(r, 100));

    // After reload, src should still show as expanded with children
    const newDirRow = findDirRow('src');
    expect(newDirRow).toBeTruthy();
    expect(newDirRow!.textContent).toContain('▾');
    expect(container.textContent).toContain('index.ts');
  });

  it('after refresh(), expanding a directory still works (regression: parentEl closure)', async () => {
    const explorer = new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    // Expand first, then collapse
    const dirRow = findDirRow('src')!;
    dirRow.click();
    await new Promise(r => setTimeout(r, 100));
    dirRow.click();
    await new Promise(r => setTimeout(r, 50));

    // Now refresh (clears expanded set, rebuilds tree entirely)
    explorer.refresh();
    await new Promise(r => setTimeout(r, 100));

    // After refresh, try expanding — this must work (previously broken by parentEl closure bug)
    const newDirRow = findDirRow('src')!;
    expect(newDirRow).toBeTruthy();
    newDirRow.click();
    await new Promise(r => setTimeout(r, 100));

    expect(newDirRow.textContent).toContain('▾');
    expect(container.textContent).toContain('index.ts');
  });

  it('refresh clears all expanded state', async () => {
    const explorer = new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const dirRow = findDirRow('src')!;
    dirRow.click();
    await new Promise(r => setTimeout(r, 100));
    expect(dirRow.textContent).toContain('▾');

    explorer.refresh();
    await new Promise(r => setTimeout(r, 100));

    const newDirRow = findDirRow('src')!;
    expect(newDirRow.textContent).toContain('▸');
    expect(container.textContent).not.toContain('index.ts');
  });

  it('handles empty directory on expand', async () => {
    setupReadDir({
      '/test': [
        { name: 'empty', isDirectory: true },
        { name: 'README.md', isDirectory: false },
      ],
      '/test/empty': [],
    });

    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const dirRow = findDirRow('empty')!;
    dirRow.click();
    await new Promise(r => setTimeout(r, 100));

    // Should still show as expanded (▾) even though empty
    expect(dirRow.textContent).toContain('▾');
  });

  it('handles nested directory expansion', async () => {
    setupReadDir({
      '/test': [
        { name: 'src', isDirectory: true },
      ],
      '/test/src': [
        { name: 'components', isDirectory: true },
      ],
      '/test/src/components': [
        { name: 'App.ts', isDirectory: false },
      ],
    });

    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    // Expand first level
    const srcRow = findDirRow('src')!;
    srcRow.click();
    await new Promise(r => setTimeout(r, 100));
    expect(container.textContent).toContain('components');

    // Expand second level
    const compRow = findDirRow('components')!;
    compRow.click();
    await new Promise(r => setTimeout(r, 100));
    expect(container.textContent).toContain('App.ts');
  });
});

describe('FileExplorerPlugin inline input positioning', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.writeFile as any).mockResolvedValue(true);
    (mockElectronAPI.fs.mkdir as any).mockResolvedValue(true);
    (mockElectronAPI.fs.readDir as any).mockImplementation(async (dirPath: string) => {
      const normalized = dirPath.replace(/\\/g, '/');
      if (normalized === '/test') {
        return [
          { name: 'src', isDirectory: true },
          { name: 'README.md', isDirectory: false },
        ];
      }
      return [];
    });
  });

  it('inserts new folder input row after the directory element, not at tree bottom', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    // Find src directory
    const allDivs = Array.from(container.querySelectorAll('div'));
    const srcEl = allDivs.find(d =>
      d.textContent?.includes('src') && d.style.cursor === 'pointer',
    );
    expect(srcEl).toBeTruthy();

    // Right-click on src directory
    (srcEl as HTMLElement)?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true }),
    );
    await new Promise(r => setTimeout(r, 10));

    // Click "New Folder"
    const newFolderItem = Array.from(document.querySelectorAll('.ctx-item'))
      .find(m => m.textContent === 'New Folder');
    (newFolderItem as HTMLElement)?.click();
    await new Promise(r => setTimeout(r, 10));

    // Input row should be positioned between src and README.md
    const input = container.querySelector('input');
    expect(input).toBeTruthy();
    const inputRow = input!.parentElement!;
    expect(inputRow.previousElementSibling?.textContent).toContain('src');
    expect(inputRow.nextElementSibling?.textContent).toContain('README.md');
    // Padding should match child depth (src is depth 0, input is depth 1: 12+16=28)
    expect(inputRow.style.paddingLeft).toBe('28px');
  });

  it('inserts new file input row after the directory element, not at tree bottom', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    // Find src directory
    const allDivs = Array.from(container.querySelectorAll('div'));
    const srcEl = allDivs.find(d =>
      d.textContent?.includes('src') && d.style.cursor === 'pointer',
    );
    expect(srcEl).toBeTruthy();

    // Right-click on src directory
    (srcEl as HTMLElement)?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true }),
    );
    await new Promise(r => setTimeout(r, 10));

    // Click "New File"
    const newFileItem = Array.from(document.querySelectorAll('.ctx-item'))
      .find(m => m.textContent === 'New File');
    (newFileItem as HTMLElement)?.click();
    await new Promise(r => setTimeout(r, 10));

    // Input row should be positioned between src and README.md
    const input = container.querySelector('input');
    expect(input).toBeTruthy();
    const inputRow = input!.parentElement!;
    expect(inputRow.previousElementSibling?.textContent).toContain('src');
    expect(inputRow.nextElementSibling?.textContent).toContain('README.md');
    // Padding should match child depth (src is depth 0, input is depth 1: 12+16=28)
    expect(inputRow.style.paddingLeft).toBe('28px');
  });

  it('empty-area context menu includes Paste (disabled when nothing copied)', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    // Right-click on empty area
    const treeEl = container.querySelector('div') as HTMLElement;
    treeEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));

    const pasteItem = Array.from(document.querySelectorAll('.ctx-item'))
      .find(m => m.textContent === 'Paste') as HTMLElement | undefined;
    expect(pasteItem).toBeTruthy();
    expect(pasteItem!.classList.contains('ctx-disabled')).toBe(true);
  });

  it('empty-area context menu Paste is enabled after a file is copied', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    // Copy a file via its context menu
    const allDivs = Array.from(container.querySelectorAll('div'));
    const fileEl = allDivs.find(d =>
      d.textContent?.includes('README.md') && d.style.cursor === 'pointer',
    );
    (fileEl as HTMLElement)?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true }),
    );
    await new Promise(r => setTimeout(r, 10));
    const copyItem = Array.from(document.querySelectorAll('.ctx-item'))
      .find(m => m.textContent === 'Copy');
    (copyItem as HTMLElement)?.click();
    await new Promise(r => setTimeout(r, 10));

    // Now right-click empty area - Paste should be enabled
    const treeEl = container.querySelector('div') as HTMLElement;
    treeEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));

    const pasteItem = Array.from(document.querySelectorAll('.ctx-item'))
      .find(m => m.textContent === 'Paste') as HTMLElement | undefined;
    expect(pasteItem).toBeTruthy();
    expect(pasteItem!.classList.contains('ctx-disabled')).toBe(false);
  });

  it('input row at root level still appends at tree end', async () => {
    (mockElectronAPI.fs.readDir as any).mockResolvedValue([
      { name: 'src', isDirectory: true },
      { name: 'README.md', isDirectory: false },
    ]);
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    // Right-click on empty area (tree element itself)
    const treeEl = container.querySelector('div') as HTMLElement;
    treeEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

    await new Promise(r => setTimeout(r, 10));

    // Click "New Folder" — this is the root-level action
    const newFolderItem = Array.from(document.querySelectorAll('.ctx-item'))
      .find(m => m.textContent === 'New Folder');
    (newFolderItem as HTMLElement)?.click();
    await new Promise(r => setTimeout(r, 10));

    // Root-level input should be appended at the end (after README.md)
    const input = container.querySelector('input');
    expect(input).toBeTruthy();
    const inputRow = input!.parentElement!;
    expect(inputRow.previousElementSibling?.textContent).toContain('README.md');
    expect(inputRow.nextElementSibling).toBeNull();
    // Root-level padding stays 12px (depth 0)
    expect(inputRow.style.paddingLeft).toBe('12px');
  });
});

describe('FileExplorerPlugin rename', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
    (mockElectronAPI.fs.rename as any).mockResolvedValue(true);
    setupReadDir({
      '/test': [
        { name: 'src', isDirectory: true },
        { name: 'README.md', isDirectory: false },
      ],
      '/test/src': [
        { name: 'index.ts', isDirectory: false },
      ],
    });
  });

  async function findFileRow(label: string): Promise<HTMLElement | null> {
    await new Promise(r => setTimeout(r, 50));
    const divs = container.querySelectorAll('div');
    for (const div of divs) {
      if (div.textContent?.includes(label) && div.style.cursor === 'pointer') {
        return div as HTMLElement;
      }
    }
    return null;
  }

  function clickRenameInMenu(): void {
    const renameItem = Array.from(document.querySelectorAll('.ctx-item'))
      .find(m => m.textContent === 'Rename');
    (renameItem as HTMLElement)?.click();
  }

  it('shows rename input on file when Rename is clicked', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const fileRow = await findFileRow('README.md');
    expect(fileRow).toBeTruthy();

    fileRow!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    clickRenameInMenu();
    await new Promise(r => setTimeout(r, 10));

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('README.md');
  });

  it('shows rename input on directory when Rename is clicked', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    // Find src directory
    const divs = container.querySelectorAll('div');
    const dirRow = Array.from(divs).find(d =>
      d.textContent?.includes('src') && d.style.cursor === 'pointer',
    );
    expect(dirRow).toBeTruthy();

    dirRow!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    clickRenameInMenu();
    await new Promise(r => setTimeout(r, 10));

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('src');
  });

  it('hides the original item while rename input is shown', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const fileRow = await findFileRow('README.md');
    expect(fileRow).toBeTruthy();
    const originalDisplay = fileRow!.style.display;

    fileRow!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    clickRenameInMenu();
    await new Promise(r => setTimeout(r, 10));

    expect(fileRow!.style.display).toBe('none');

    // Cancel with Escape
    const input = container.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await new Promise(r => setTimeout(r, 10));

    expect(fileRow!.style.display).toBe(originalDisplay);
    expect(container.querySelector('input')).toBeNull();
  });

  it('calls fs:rename on Enter with new name', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const fileRow = await findFileRow('README.md');
    fileRow!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    clickRenameInMenu();
    await new Promise(r => setTimeout(r, 10));

    const input = container.querySelector('input') as HTMLInputElement;
    input.value = 'NEW_NAME.md';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise(r => setTimeout(r, 100));

    expect(mockElectronAPI.fs.rename).toHaveBeenCalledWith('/test/README.md', '/test/NEW_NAME.md');
  });

  it('does not call fs:rename when name is unchanged', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const initialCalls = (mockElectronAPI.fs.rename as any).mock.calls.length;

    const fileRow = await findFileRow('README.md');
    fileRow!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    clickRenameInMenu();
    await new Promise(r => setTimeout(r, 10));

    // Press Enter without changing the value
    const input = container.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise(r => setTimeout(r, 100));

    expect((mockElectronAPI.fs.rename as any).mock.calls.length).toBe(initialCalls);
    // Original item should be visible again
    const fileRow2 = await findFileRow('README.md');
    expect(fileRow2).toBeTruthy();
  });

  it('reloads tree after successful rename', async () => {
    (mockElectronAPI.fs.readDir as any).mockClear();
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    // readDir was called during construction (initial load)
    const beforeRename = (mockElectronAPI.fs.readDir as any).mock.calls.length;
    expect(beforeRename).toBeGreaterThan(0);

    const fileRow = await findFileRow('README.md');
    fileRow!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    clickRenameInMenu();
    await new Promise(r => setTimeout(r, 10));

    const input = container.querySelector('input') as HTMLInputElement;
    input.value = 'README2.md';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await new Promise(r => setTimeout(r, 100));

    // readDir should have been called at least once more (tree reloaded)
    expect((mockElectronAPI.fs.readDir as any).mock.calls.length).toBeGreaterThan(beforeRename);
    expect(mockElectronAPI.fs.rename).toHaveBeenCalledWith('/test/README.md', '/test/README2.md');
  });

  it('shows Rename in directory context menu', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const divs = container.querySelectorAll('div');
    const dirRow = Array.from(divs).find(d =>
      d.textContent?.includes('src') && d.style.cursor === 'pointer',
    );
    dirRow!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));

    const renameItem = Array.from(document.querySelectorAll('.ctx-item'))
      .find(m => m.textContent === 'Rename');
    expect(renameItem).toBeTruthy();
  });

  it('shows Rename in file context menu', async () => {
    new FileExplorerPlugin(container, '/test', vi.fn());
    await new Promise(r => setTimeout(r, 100));

    const fileRow = await findFileRow('README.md');
    fileRow!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));

    const renameItem = Array.from(document.querySelectorAll('.ctx-item'))
      .find(m => m.textContent === 'Rename');
    expect(renameItem).toBeTruthy();
  });
});
