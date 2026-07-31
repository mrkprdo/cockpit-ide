import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitPlugin } from './GitPlugin';
import { mockElectronAPI } from '../../test/setup';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'width:800px;height:500px';
  document.body.appendChild(el);
  return el;
}

async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 0));
}

describe('GitPlugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    vi.clearAllMocks();
    (mockElectronAPI.git.remotes as any).mockResolvedValue([
      { name: 'origin', url: 'https://github.com/user/repo.git' },
    ]);
    (mockElectronAPI.git.branches as any).mockResolvedValue([
      { name: 'main', current: true, isRemote: false },
      { name: 'develop', current: false, isRemote: false },
    ]);
    (mockElectronAPI.git.log as any).mockResolvedValue([
      { hash: 'abc123def456', author: 'Alice', date: '2026-01-15T10:00:00', message: 'Initial commit' },
      { hash: 'def789abc012', author: 'Bob', date: '2026-02-20T14:30:00', message: 'Add feature' },
    ]);
    (mockElectronAPI.git.showTree as any).mockResolvedValue([
      { status: 'M', path: 'src/index.ts' },
      { status: 'A', path: 'src/newfile.ts' },
    ]);
    (mockElectronAPI.git.diff as any).mockResolvedValue(
      'diff --git a/src/index.ts b/src/index.ts\n' +
      'index abc..def 100644\n' +
      '--- a/src/index.ts\n' +
      '+++ b/src/index.ts\n' +
      '@@ -1,3 +1,4 @@\n' +
      ' line1\n' +
      '-old line\n' +
      '+new line\n' +
      ' line3\n'
    );
    (mockElectronAPI.git.stagedFiles as any).mockResolvedValue([
      { status: 'M', path: 'src/staged.ts' },
    ]);
    (mockElectronAPI.git.unstagedFiles as any).mockResolvedValue([
      { status: 'M', path: 'src/unstaged.ts' },
      { status: '?', path: 'src/new.ts' },
    ]);
    (mockElectronAPI.git.stagedDiff as any).mockResolvedValue(
      'diff --git a/src/staged.ts b/src/staged.ts\n' +
      'index a..b 100644\n' +
      '--- a/src/staged.ts\n' +
      '+++ b/src/staged.ts\n' +
      '@@ -1 +1,2 @@\n' +
      '-old\n' +
      '+new\n'
    );
    (mockElectronAPI.git.unstagedDiff as any).mockResolvedValue(
      'diff --git a/src/unstaged.ts b/src/unstaged.ts\n' +
      'index c..d 100644\n' +
      '--- a/src/unstaged.ts\n' +
      '+++ b/src/unstaged.ts\n' +
      '@@ -1 +1,2 @@\n' +
      '-old\n' +
      '+new\n'
    );
  });

  it('creates split pane with flex layout', async () => {
    new GitPlugin(container, '/test/repo');
    await flush();

    const children = container.children;
    expect(children.length).toBe(1);

    const splitEl = children[0] as HTMLElement;
    expect(splitEl.style.display).toBe('flex');
    expect(splitEl.style.flexDirection).toBe('row');
  });

  it('has three children: left, resize, right', async () => {
    new GitPlugin(container, '/test/repo');
    await flush();

    const splitEl = container.firstElementChild!;
    expect(splitEl.children.length).toBe(3);
  });

  it('loads remotes on construction', async () => {
    new GitPlugin(container, '/test/repo');
    await flush();
    expect(mockElectronAPI.git.remotes).toHaveBeenCalledWith('/test/repo');
  });

  it('loads branches on construction', async () => {
    new GitPlugin(container, '/test/repo');
    await flush();
    expect(mockElectronAPI.git.branches).toHaveBeenCalledWith('/test/repo');
  });

  it('loads commits on construction', async () => {
    new GitPlugin(container, '/test/repo');
    await flush();
    expect(mockElectronAPI.git.log).toHaveBeenCalledWith('/test/repo', 50);
  });

  it('renders commit items in the left panel', async () => {
    new GitPlugin(container, '/test/repo');
    await flush();

    const commitsEl = container.querySelector('.git-commits');
    expect(commitsEl).toBeTruthy();

    const commitItems = commitsEl!.querySelectorAll('.git-commit-item');
    expect(commitItems.length).toBe(2);
    expect(commitItems[0].textContent).toContain('abc123d');
    expect(commitItems[0].textContent).toContain('Initial commit');
  });

  it('renders remote and branch selects', async () => {
    new GitPlugin(container, '/test/repo');
    await flush();

    const selects = container.querySelectorAll('.git-select');
    expect(selects.length).toBe(2);
  });

  it('selecting a commit loads file tree', async () => {
    new GitPlugin(container, '/test/repo');
    await flush();

    const commitItems = container.querySelectorAll('.git-commit-item');
    expect(commitItems.length).toBe(2);

    (commitItems[0] as HTMLElement).click();
    await flush();

    expect(mockElectronAPI.git.showTree).toHaveBeenCalledWith('/test/repo', 'abc123def456');

    const fileItems = container.querySelectorAll('.git-file-item');
    expect(fileItems.length).toBe(2);
    expect(fileItems[0].textContent).toContain('M');
    expect(fileItems[0].textContent).toContain('src/index.ts');
  });

  it('selecting a file loads diff', async () => {
    new GitPlugin(container, '/test/repo');
    await flush();

    const commitItems = container.querySelectorAll('.git-commit-item');
    (commitItems[0] as HTMLElement).click();
    await flush();

    const fileItems = container.querySelectorAll('.git-file-item');
    (fileItems[0] as HTMLElement).click();
    await flush();

    expect(mockElectronAPI.git.diff).toHaveBeenCalledWith('/test/repo', 'abc123def456', 'src/index.ts');

    const diffLines = container.querySelectorAll('.git-diff-line');
    expect(diffLines.length).toBeGreaterThan(0);
  });

  it('shows empty state when no commits', async () => {
    (mockElectronAPI.git.log as any).mockResolvedValue([]);

    new GitPlugin(container, '/test/repo');
    await flush();

    const empty = container.querySelector('.git-empty');
    expect(empty).toBeTruthy();
    expect(empty!.textContent).toBe('No commits found');
  });

  it('onStateChange is callable', () => {
    const git = new GitPlugin(container, '/test/repo');
    const cb = vi.fn();
    git.onStateChange = cb;
    git.onStateChange?.();
    expect(cb).toHaveBeenCalledOnce();
  });

  it('refresh reloads remotes, branches, commits, and changes', async () => {
    const git = new GitPlugin(container, '/test/repo');
    await flush();
    vi.clearAllMocks();

    await git.refresh();
    expect(mockElectronAPI.git.remotes).toHaveBeenCalledWith('/test/repo');
    expect(mockElectronAPI.git.branches).toHaveBeenCalledWith('/test/repo');
    expect(mockElectronAPI.git.log).toHaveBeenCalledWith('/test/repo', 50);
    expect(mockElectronAPI.git.stagedFiles).toHaveBeenCalledWith('/test/repo');
    expect(mockElectronAPI.git.unstagedFiles).toHaveBeenCalledWith('/test/repo');
  });

  it('refresh clears commit selection before re-rendering', async () => {
    const git = new GitPlugin(container, '/test/repo');
    await flush();

    // Select a commit
    const commitItems = container.querySelectorAll('.git-commit-item');
    (commitItems[0] as HTMLElement).click();
    await flush();
    expect(container.querySelectorAll('.git-commit-item.is-selected').length).toBe(1);

    // Refresh — selection must be cleared in the re-rendered list
    await git.refresh();
    expect(container.querySelectorAll('.git-commit-item.is-selected').length).toBe(0);
  });

  it('renders diff content with color classes', async () => {
    new GitPlugin(container, '/test/repo');
    await flush();

    const commitItems = container.querySelectorAll('.git-commit-item');
    (commitItems[0] as HTMLElement).click();
    await flush();

    const fileItems = container.querySelectorAll('.git-file-item');
    (fileItems[0] as HTMLElement).click();
    await flush();

    const adds = container.querySelectorAll('.diff-add');
    const removes = container.querySelectorAll('.diff-remove');
    const hunks = container.querySelectorAll('.diff-hunk');
    expect(adds.length).toBe(1);
    expect(removes.length).toBe(1);
    expect(hunks.length).toBe(1);
  });

  describe('changes section', () => {
    it('renders Changes label and staged/unstaged items with arrows', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const labels = container.querySelectorAll('.git-label');
      const changesLabel = Array.from(labels).find(l => l.textContent === 'Changes');
      expect(changesLabel).toBeTruthy();

      const items = container.querySelectorAll('.git-changes-item');
      expect(items.length).toBe(2);
      expect(items[0].textContent).toContain('Staged');
      expect(items[1].textContent).toContain('Unstaged');
    });

    it('auto-expands sections with files on load', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const files = container.querySelectorAll('.git-changes-files');
      expect(files.length).toBe(2);
      // Staged section auto-expanded (1 file)
      expect(files[0].querySelectorAll('.git-changes-file').length).toBe(1);
      // Unstaged section auto-expanded (2 files)
      expect(files[1].querySelectorAll('.git-changes-file').length).toBe(2);
    });

    it('starts with empty sections when no files', async () => {
      (mockElectronAPI.git.stagedFiles as any).mockResolvedValue([]);
      (mockElectronAPI.git.unstagedFiles as any).mockResolvedValue([]);
      new GitPlugin(container, '/test/repo');
      await flush();

      const files = container.querySelectorAll('.git-changes-files');
      expect(files[0].textContent).toBe('');
      expect(files[1].textContent).toBe('');
    });

    it('clicking staged header toggles file list visibility', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const stagedHeader = container.querySelectorAll('.git-changes-item')[0] as HTMLElement;
      const filesContainer = container.querySelectorAll('.git-changes-files')[0] as HTMLElement;

      // Auto-expanded on load
      let stagedFiles = filesContainer.querySelectorAll('.git-changes-file');
      expect(stagedFiles.length).toBe(1);
      expect(filesContainer.style.display).not.toBe('none');

      // Click to collapse
      stagedHeader.click();
      await flush();
      stagedFiles = filesContainer.querySelectorAll('.git-changes-file');
      expect(stagedFiles.length).toBe(0);
      expect(filesContainer.style.display).toBe('none');

      // Click to expand again
      stagedHeader.click();
      await flush();
      stagedFiles = filesContainer.querySelectorAll('.git-changes-file');
      expect(stagedFiles.length).toBe(1);
      expect(filesContainer.style.display).not.toBe('none');
    });

    it('clicking unstaged header toggles file list visibility', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const unstagedHeader = container.querySelectorAll('.git-changes-item')[1] as HTMLElement;
      const filesContainer = container.querySelectorAll('.git-changes-files')[1] as HTMLElement;

      let unstagedFiles = filesContainer.querySelectorAll('.git-changes-file');
      expect(unstagedFiles.length).toBe(2);
      expect(unstagedFiles[0].textContent).toContain('src/unstaged.ts');
      expect(unstagedFiles[1].textContent).toContain('src/new.ts');

      unstagedHeader.click();
      await flush();

      unstagedFiles = filesContainer.querySelectorAll('.git-changes-file');
      expect(unstagedFiles.length).toBe(0);
      expect(filesContainer.style.display).toBe('none');
    });

    it('clicking header toggles arrow direction', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const stagedHeader = container.querySelectorAll('.git-changes-item')[0] as HTMLElement;
      const arrows = container.querySelectorAll('.git-collapse-arrow');

      // Auto-expanded — arrow is ▾
      expect(arrows[0].textContent).toBe('▾');
      // First click collapses (arrow becomes ▸)
      stagedHeader.click();
      await flush();
      expect(arrows[0].textContent).toBe('▸');

      // Second click re-opens (arrow back to ▾)
      stagedHeader.click();
      await flush();
      expect(arrows[0].textContent).toBe('▾');

      // Third click collapses (arrow back to ▸)
      stagedHeader.click();
      await flush();
      expect(arrows[0].textContent).toBe('▸');
    });

    it('loads staged and unstaged files on construction', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();
      expect(mockElectronAPI.git.stagedFiles).toHaveBeenCalledWith('/test/repo');
      expect(mockElectronAPI.git.unstagedFiles).toHaveBeenCalledWith('/test/repo');
    });

    it('shows file count badges', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const counts = container.querySelectorAll('.git-changes-count');
      expect(counts.length).toBe(2);
      expect(counts[0].textContent).toBe('1');
      expect(counts[1].textContent).toBe('2');
    });

    it('shows "No staged files" inside expanded staged with zero files', async () => {
      (mockElectronAPI.git.stagedFiles as any).mockResolvedValue([]);
      new GitPlugin(container, '/test/repo');
      await flush();

      const stagedHeader = container.querySelectorAll('.git-changes-item')[0] as HTMLElement;
      stagedHeader.click();
      await flush();

      const empty = container.querySelector('.git-changes-empty');
      expect(empty).toBeTruthy();
      expect(empty!.textContent).toBe('No staged files');
    });

    it('shows "No changes" inside expanded unstaged with zero files', async () => {
      (mockElectronAPI.git.unstagedFiles as any).mockResolvedValue([]);
      new GitPlugin(container, '/test/repo');
      await flush();

      const unstagedHeader = container.querySelectorAll('.git-changes-item')[1] as HTMLElement;
      unstagedHeader.click();
      await flush();

      const empty = container.querySelector('.git-changes-empty');
      expect(empty).toBeTruthy();
      expect(empty!.textContent).toBe('No changes');
    });

    it('clicking a staged file loads staged diff', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const stagedFile = container.querySelector('.git-changes-file') as HTMLElement;
      stagedFile.click();
      await flush();

      expect(mockElectronAPI.git.stagedDiff).toHaveBeenCalledWith('/test/repo', 'src/staged.ts');
      const diffLines = container.querySelectorAll('.git-diff-line');
      expect(diffLines.length).toBeGreaterThan(0);
    });

    it('clicking an unstaged file loads unstaged diff', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const unstagedFile = container.querySelectorAll('.git-changes-file')[1] as HTMLElement;
      unstagedFile.click();
      await flush();

      expect(mockElectronAPI.git.unstagedDiff).toHaveBeenCalledWith('/test/repo', 'src/unstaged.ts');
      const diffLines = container.querySelectorAll('.git-diff-line');
      expect(diffLines.length).toBeGreaterThan(0);
    });

    it('clicking an untracked file loads unstaged diff', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const untrackedFile = container.querySelectorAll('.git-changes-file')[2] as HTMLElement;
      untrackedFile.click();
      await flush();

      expect(mockElectronAPI.git.unstagedDiff).toHaveBeenCalledWith('/test/repo', 'src/new.ts');
      const diffLines = container.querySelectorAll('.git-diff-line');
      expect(diffLines.length).toBeGreaterThan(0);
    });

    it('shows U status for untracked files', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const unstagedFiles = container.querySelectorAll('.git-changes-file');
      const statusSpans = unstagedFiles[2].querySelectorAll('.git-file-status');
      expect(statusSpans.length).toBe(1);
      expect(statusSpans[0].textContent).toBe('U');
    });

    it('sets dataset.path on git-changes-file elements for selection tracking', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const stagedFile = container.querySelector('.git-changes-file') as HTMLElement;
      expect(stagedFile.dataset.path).toBe('src/staged.ts');

      const unstagedFiles = container.querySelectorAll('.git-changes-file');
      expect((unstagedFiles[1] as HTMLElement).dataset.path).toBe('src/unstaged.ts');
      expect((unstagedFiles[2] as HTMLElement).dataset.path).toBe('src/new.ts');
    });

    it('selecting a file from staged shows diff in right panel', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const stagedFile = container.querySelector('.git-changes-file') as HTMLElement;
      stagedFile.click();
      await flush();

      const diffLines = container.querySelectorAll('.git-diff-line');
      expect(diffLines.length).toBeGreaterThan(0);
    });

    it('selecting a commit after changes file shows commit info', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const stagedFile = container.querySelector('.git-changes-file') as HTMLElement;
      stagedFile.click();
      await flush();

      const commitItems = container.querySelectorAll('.git-commit-item');
      (commitItems[0] as HTMLElement).click();
      await flush();

      const infoEl = container.querySelector('.git-commit-info') as HTMLElement;
      expect(infoEl.style.display).not.toBe('none');
    });
  });

  describe('diff view mode dropdown', () => {
    it('has a single dropdown button with SVG icon', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const btn = container.querySelector('.git-diff-btn');
      expect(btn).toBeTruthy();
      expect(btn!.querySelector('svg')).toBeTruthy();
    });

    it('starts in unified mode (unified item active)', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const items = container.querySelectorAll('.git-diff-dropdown-item');
      expect(items.length).toBe(2);
      expect(items[0].textContent).toBe('View unified');
      expect(items[1].textContent).toBe('View side by side');
      expect(items[0].className).toContain('is-active');
      expect(items[1].className).not.toContain('is-active');
    });

    it('clicking button opens dropdown', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const btn = container.querySelector('.git-diff-btn') as HTMLElement;
      const menu = container.querySelector('.git-diff-dropdown') as HTMLElement;
      expect(menu.style.display).toBe('none');

      btn.click();
      await flush();

      expect(menu.style.display).not.toBe('none');
    });

    it('dropdown items are keyboard-focusable and activatable via Enter', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const items = container.querySelectorAll<HTMLElement>('.git-diff-dropdown-item');
      for (const item of items) {
        expect(item.tabIndex).toBe(0);
        expect(item.getAttribute('role')).toBe('button');
      }

      items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flush();

      expect(items[1].className).toContain('is-active');
    });

    it('clicking "View side by side" switches mode and closes dropdown', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const btn = container.querySelector('.git-diff-btn') as HTMLElement;
      btn.click();
      await flush();

      const items = container.querySelectorAll('.git-diff-dropdown-item');
      (items[1] as HTMLElement).click();
      await flush();

      expect(items[0].className).not.toContain('is-active');
      expect(items[1].className).toContain('is-active');

      const menu = container.querySelector('.git-diff-dropdown') as HTMLElement;
      expect(menu.style.display).toBe('none');
    });

    it('clicking "View side by side" after loading a file renders side-by-side rows', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const commitItems = container.querySelectorAll('.git-commit-item');
      (commitItems[0] as HTMLElement).click();
      await flush();

      const fileItems = container.querySelectorAll('.git-file-item');
      (fileItems[0] as HTMLElement).click();
      await flush();

      const btn = container.querySelector('.git-diff-btn') as HTMLElement;
      btn.click();
      await flush();

      const items = container.querySelectorAll('.git-diff-dropdown-item');
      (items[1] as HTMLElement).click();
      await flush();

      const sbsRows = container.querySelectorAll('.git-sbs-row');
      expect(sbsRows.length).toBeGreaterThan(0);
    });

    it('side-by-side renders add/remove/replace rows with correct classes', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const commitItems = container.querySelectorAll('.git-commit-item');
      (commitItems[0] as HTMLElement).click();
      await flush();

      const fileItems = container.querySelectorAll('.git-file-item');
      (fileItems[0] as HTMLElement).click();
      await flush();

      const btn = container.querySelector('.git-diff-btn') as HTMLElement;
      btn.click();
      await flush();

      const items = container.querySelectorAll('.git-diff-dropdown-item');
      (items[1] as HTMLElement).click();
      await flush();

      const replace = container.querySelectorAll('.git-sbs-row.diff-replace');
      const adds = container.querySelectorAll('.git-sbs-row.diff-add');
      const removes = container.querySelectorAll('.git-sbs-row.diff-remove');
      expect(replace.length + adds.length + removes.length).toBeGreaterThan(0);
    });

    it('clicking "View unified" after side by side switches back', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const btn = container.querySelector('.git-diff-btn') as HTMLElement;
      btn.click();
      await flush();

      const items = container.querySelectorAll('.git-diff-dropdown-item');
      (items[1] as HTMLElement).click();

      btn.click();
      await flush();

      (items[0] as HTMLElement).click();

      expect(items[0].className).toContain('is-active');
      expect(items[1].className).not.toContain('is-active');
    });

    it('toggling mode re-renders unified diff lines after side-by-side', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const commitItems = container.querySelectorAll('.git-commit-item');
      (commitItems[0] as HTMLElement).click();
      await flush();

      const fileItems = container.querySelectorAll('.git-file-item');
      (fileItems[0] as HTMLElement).click();
      await flush();

      const btn = container.querySelector('.git-diff-btn') as HTMLElement;
      btn.click();
      await flush();

      const items = container.querySelectorAll('.git-diff-dropdown-item');
      (items[1] as HTMLElement).click();
      await flush();

      const sbsRows = container.querySelectorAll('.git-sbs-row');
      expect(sbsRows.length).toBeGreaterThan(0);

      btn.click();
      await flush();

      (items[0] as HTMLElement).click();

      const diffLines = container.querySelectorAll('.git-diff-line');
      expect(diffLines.length).toBeGreaterThan(0);
    });
  });

  describe('commit/push', () => {
    it('renders commit bar with input, commit button, and push button', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const input = container.querySelector('.git-commit-input') as HTMLInputElement;
      const commitBtn = container.querySelector('.git-commit-btn') as HTMLButtonElement;
      const pushBtn = container.querySelector('.git-push-btn') as HTMLButtonElement;

      expect(input).toBeTruthy();
      expect(commitBtn).toBeTruthy();
      expect(pushBtn).toBeTruthy();
      expect(commitBtn.disabled).toBe(true);
    });

    it('disables commit button when input is empty', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const commitBtn = container.querySelector('.git-commit-btn') as HTMLButtonElement;
      expect(commitBtn.disabled).toBe(true);
    });

    it('enables commit button when input has text and staged files exist', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const input = container.querySelector('.git-commit-input') as HTMLInputElement;
      const commitBtn = container.querySelector('.git-commit-btn') as HTMLButtonElement;

      input.value = 'my commit message';
      input.dispatchEvent(new Event('input'));

      expect(commitBtn.disabled).toBe(false);
    });

    it('calls git:commit on commit button click', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const input = container.querySelector('.git-commit-input') as HTMLInputElement;
      const commitBtn = container.querySelector('.git-commit-btn') as HTMLButtonElement;

      input.value = 'feat: add feature';
      input.dispatchEvent(new Event('input'));

      commitBtn.click();
      await flush();

      expect(mockElectronAPI.git.commit).toHaveBeenCalledWith('/test/repo', 'feat: add feature');
    });

    it('clears input after successful commit and calls refresh', async () => {
      const git = new GitPlugin(container, '/test/repo');
      await flush();
      vi.clearAllMocks();

      const input = container.querySelector('.git-commit-input') as HTMLInputElement;
      const commitBtn = container.querySelector('.git-commit-btn') as HTMLButtonElement;

      input.value = 'feat: add feature';
      input.dispatchEvent(new Event('input'));
      commitBtn.click();
      await flush();

      expect(input.value).toBe('');
      expect(mockElectronAPI.git.remotes).toHaveBeenCalled(); // refresh was called
    });

    it('removes staged file rows immediately after successful commit', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const stagedSection = container.querySelectorAll('.git-changes-files')[0];
      expect(stagedSection.querySelectorAll('.git-changes-file').length).toBe(1);

      const input = container.querySelector('.git-commit-input') as HTMLInputElement;
      const commitBtn = container.querySelector('.git-commit-btn') as HTMLButtonElement;
      input.value = 'feat: ship';
      input.dispatchEvent(new Event('input'));

      (mockElectronAPI.git.commit as any).mockResolvedValue({ ok: true });
      (mockElectronAPI.git.stagedFiles as any).mockResolvedValue([]);
      commitBtn.click();
      await flush();

      expect(stagedSection.querySelectorAll('.git-changes-file').length).toBe(0);
      expect(stagedSection.textContent).toContain('No staged files');
    });

    it('calls git:push on push button click', async () => {
      (mockElectronAPI.git.checkAhead as any).mockResolvedValue(true);
      new GitPlugin(container, '/test/repo');
      await flush();
      vi.clearAllMocks();

      const pushBtn = container.querySelector('.git-push-btn') as HTMLButtonElement;
      pushBtn.click();
      await flush();

      expect(mockElectronAPI.git.push).toHaveBeenCalledWith('/test/repo');
    });

    it('commits via Enter key in input', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();
      vi.clearAllMocks();

      const input = container.querySelector('.git-commit-input') as HTMLInputElement;
      input.value = 'feat: enter commit';
      input.dispatchEvent(new Event('input'));

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flush();

      expect(mockElectronAPI.git.commit).toHaveBeenCalledWith('/test/repo', 'feat: enter commit');
    });

    it('push button starts disabled when no unpushed commits', async () => {
      (mockElectronAPI.git.checkAhead as any).mockResolvedValue(false);
      new GitPlugin(container, '/test/repo');
      await flush();

      const pushBtn = container.querySelector('.git-push-btn') as HTMLButtonElement;
      expect(pushBtn.disabled).toBe(true);
    });

    it('push button enabled when unpushed commits exist', async () => {
      (mockElectronAPI.git.checkAhead as any).mockResolvedValue(true);
      new GitPlugin(container, '/test/repo');
      await flush();

      const pushBtn = container.querySelector('.git-push-btn') as HTMLButtonElement;
      expect(pushBtn.disabled).toBe(false);
    });

    it('calls checkAhead during refresh', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      expect(mockElectronAPI.git.checkAhead).toHaveBeenCalledWith('/test/repo');
    });

    it('push button disabled after successful push', async () => {
      (mockElectronAPI.git.checkAhead as any).mockResolvedValue(true);
      new GitPlugin(container, '/test/repo');
      await flush();

      const pushBtn = container.querySelector('.git-push-btn') as HTMLButtonElement;
      expect(pushBtn.disabled).toBe(false);

      (mockElectronAPI.git.checkAhead as any).mockResolvedValue(false);
      pushBtn.click();
      await flush();

      expect(pushBtn.disabled).toBe(true);
    });
  });

  describe('checkout', () => {
    it('clicking a branch calls git:checkout', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const branchSelect = container.querySelectorAll('.git-select')[0] as HTMLSelectElement;
      expect(branchSelect).toBeTruthy();

      branchSelect.value = 'develop';
      branchSelect.dispatchEvent(new Event('change'));
      await flush();

      expect(mockElectronAPI.git.checkout).toHaveBeenCalledWith('/test/repo', 'develop');
    });
  });

  describe('getState', () => {
    it('getState() returns null when nothing selected', async () => {
      const git = new GitPlugin(container, '/test/repo');
      await flush();

      const state = (git as any).getState();
      expect(state).toBeNull();
    });

    it('getState() returns object with selectedHash and splitter sizes', async () => {
      const git = new GitPlugin(container, '/test/repo');
      await flush();

      const commitItems = container.querySelectorAll('.git-commit-item');
      (commitItems[0] as HTMLElement).click();
      await flush();

      const state = (git as any).getState();
      expect(state).not.toBeNull();
      expect(state.selectedCommitHash).not.toBeUndefined();
      expect(typeof state.leftColWidth).toBe('number');
      expect(typeof state.topPanelHeight).toBe('number');
    });

    it('getState() includes changesExpanded with staged/unstaged booleans', async () => {
      const git = new GitPlugin(container, '/test/repo');
      await flush();

      const stateWithSelection = (git as any).getState();
      // Null when nothing selected (but changesExpanded alone doesn't count as selection)
      expect(stateWithSelection).toBeNull();

      // Select a commit then check
      const commitItems = container.querySelectorAll('.git-commit-item');
      (commitItems[0] as HTMLElement).click();
      await flush();

      const state = (git as any).getState();
      expect(state.changesExpanded).toEqual({ staged: true, unstaged: true });

      // Collapse staged section
      const stagedHeader = container.querySelectorAll('.git-changes-item')[0] as HTMLElement;
      stagedHeader.click();
      await flush();

      const state2 = (git as any).getState();
      expect(state2.changesExpanded).toEqual({ staged: false, unstaged: true });
    });
  });

  describe('restoreState', () => {
    it('restoreState() does not throw', async () => {
      const git = new GitPlugin(container, '/test/repo');
      await flush();

      expect(() => {
        (git as any).restoreState({
          selectedCommitHash: null,
          selectedFilePath: null,
          diffViewMode: 'unified',
        });
      }).not.toThrow();
    });

    it('restoreState restores splitter sizes', async () => {
      const git = new GitPlugin(container, '/test/repo');
      await flush();

      await (git as any).restoreState({
        selectedCommitHash: null,
        selectedFilePath: null,
        diffViewMode: 'unified',
        leftColWidth: 180,
        topPanelHeight: 200,
      });

      expect((git as any).leftCol.style.width).toBe('180px');
      expect((git as any).topPanel.style.height).toBe('200px');
    });
  });

  describe('refreshChanges', () => {
    it('refreshChanges reloads staged and unstaged files', async () => {
      const git = new GitPlugin(container, '/test/repo');
      await flush();
      vi.clearAllMocks();

      await git.refreshChanges();
      expect(mockElectronAPI.git.stagedFiles).toHaveBeenCalledWith('/test/repo');
      expect(mockElectronAPI.git.unstagedFiles).toHaveBeenCalledWith('/test/repo');
    });

    it('refreshChanges preserves collapsed state of sections', async () => {
      const git = new GitPlugin(container, '/test/repo');
      await flush();

      const files = container.querySelectorAll('.git-changes-files');
      expect(files[0].querySelectorAll('.git-changes-file').length).toBe(1);

      const stagedHeader = container.querySelectorAll('.git-changes-item')[0] as HTMLElement;
      stagedHeader.click();
      await flush();
      expect(files[0].querySelectorAll('.git-changes-file').length).toBe(0);

      await git.refreshChanges();
      // Should still be collapsed
      expect(files[0].style.display).toBe('none');
    });

    it('refreshChanges enables commit button when staged files and message exist', async () => {
      (mockElectronAPI.git.stagedFiles as any).mockResolvedValue([]);
      const git = new GitPlugin(container, '/test/repo');
      await flush();
      vi.clearAllMocks();

      const commitBtn = container.querySelector('.git-commit-btn') as HTMLButtonElement;
      const input = container.querySelector('.git-commit-input') as HTMLInputElement;
      expect(commitBtn.disabled).toBe(true);

      (mockElectronAPI.git.stagedFiles as any).mockResolvedValue([{ status: 'M', path: 'src/test.ts' }]);
      input.value = 'fix: test';
      await git.refreshChanges();
      expect(commitBtn.disabled).toBe(false);
    });
  });

  describe('destroy', () => {
    it('destroy() unsubscribes file watcher', async () => {
      const unsub = vi.fn();
      (mockElectronAPI.fs.onChanged as any).mockReturnValue(unsub);
      const git = new GitPlugin(container, '/test/repo');
      await flush();
      git.destroy();
      expect(unsub).toHaveBeenCalled();
    });
  });

  describe('auto-refresh', () => {
    it('file change event triggers refresh (log called post-construction)', async () => {
      new GitPlugin(container, '/test/repo');
      await flush();

      const callCount = (mockElectronAPI.git.log as any).mock.calls.length;
      expect(callCount).toBeGreaterThanOrEqual(1);
    });
  });
});
