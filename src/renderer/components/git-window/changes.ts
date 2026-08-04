import type { GitApi, GitFileChange } from './types';
import type { GitUiRefs } from './ui-build';
import { focusable } from './ui-build';

export interface GitChangesCallbacks {
  onStateChange: () => void;
  onCommitStateChange: () => void;
  onFileOpen: (absolutePath: string) => void;
  onSelectFilePath: (path: string | null, diff?: string) => void;
  onRefreshChanges: () => Promise<void>;
}

/** Staged / unstaged change lists, stage/unstage actions and expand/collapse state. */
export class ChangesPanel {
  stagedFiles: GitFileChange[] = [];
  unstagedFiles: GitFileChange[] = [];
  changesExpanded: { staged: boolean; unstaged: boolean } = { staged: false, unstaged: false };
  selectedFilePath: string | null = null;

  private api: GitApi;
  private wsPath: string;
  private stagedHeader: HTMLDivElement;
  private unstagedHeader: HTMLDivElement;
  private stagedFilesEl: HTMLDivElement;
  private unstagedFilesEl: HTMLDivElement;
  private stagedArrow: HTMLSpanElement;
  private unstagedArrow: HTMLSpanElement;
  private stagedCount: HTMLSpanElement;
  private unstagedCount: HTMLSpanElement;
  private stageAllBtn: HTMLButtonElement;
  private unstageAllBtn: HTMLButtonElement;
  private callbacks: GitChangesCallbacks;

  constructor(api: GitApi, wsPath: string, refs: GitUiRefs, callbacks: GitChangesCallbacks) {
    this.api = api;
    this.wsPath = wsPath;
    this.stagedHeader = refs.stagedHeader;
    this.unstagedHeader = refs.unstagedHeader;
    this.stagedFilesEl = refs.stagedFilesEl;
    this.unstagedFilesEl = refs.unstagedFilesEl;
    this.stagedArrow = refs.stagedArrow;
    this.unstagedArrow = refs.unstagedArrow;
    this.stagedCount = refs.stagedCount;
    this.unstagedCount = refs.unstagedCount;
    this.stageAllBtn = refs.stageAllBtn;
    this.unstageAllBtn = refs.unstageAllBtn;
    this.callbacks = callbacks;
  }

  async loadStagedFiles(): Promise<void> {
    this.stagedFiles = await this.api.git.stagedFiles(this.wsPath) || [];
    this.updateChangesCounts();
  }

  async loadUnstagedFiles(): Promise<void> {
    this.unstagedFiles = await this.api.git.unstagedFiles(this.wsPath) || [];
    this.updateChangesCounts();
  }

  updateChangesCounts(): void {
    if (this.stagedCount) {
      this.stagedCount.textContent = this.stagedFiles.length ? String(this.stagedFiles.length) : 'No staged files';
    }
    if (this.unstagedCount) {
      this.unstagedCount.textContent = this.unstagedFiles.length ? String(this.unstagedFiles.length) : 'No changes';
    }
    if (this.unstageAllBtn) this.unstageAllBtn.style.display = this.stagedFiles.length ? '' : 'none';
    if (this.stageAllBtn) this.stageAllBtn.style.display = this.unstagedFiles.length ? '' : 'none';
  }

  toggleChanges(mode: 'staged' | 'unstaged'): void {
    const filesEl = mode === 'staged' ? this.stagedFilesEl : this.unstagedFilesEl;
    const arrow = mode === 'staged' ? this.stagedArrow : this.unstagedArrow;
    const files = mode === 'staged' ? this.stagedFiles : this.unstagedFiles;

    if (!filesEl || !arrow) return;

    const isVisible = filesEl.style.display !== 'none' && filesEl.innerHTML !== '';
    if (isVisible) {
      filesEl.style.display = 'none';
      filesEl.innerHTML = '';
      arrow.className = 'git-collapse-arrow git-collapse-arrow-closed';
      arrow.textContent = '▸';
      this.changesExpanded[mode] = false;
    } else {
      filesEl.style.display = '';
      arrow.className = 'git-collapse-arrow git-collapse-arrow-open';
      arrow.textContent = '▾';
      this.changesExpanded[mode] = true;
      this.renderChangesFiles(mode, files, filesEl);
    }
  }

  normalizeStatus(raw: string): string {
    if (raw === '??' || raw === '?') return 'U';
    return raw;
  }

  renderChangesFiles(mode: 'staged' | 'unstaged', files: GitFileChange[], container: HTMLDivElement): void {
    container.innerHTML = '';
    if (files.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'git-changes-empty';
      empty.textContent = mode === 'staged' ? 'No staged files' : 'No changes';
      container.appendChild(empty);
      return;
    }
    for (const file of files) {
      const displayStatus = this.normalizeStatus(file.status);
      const el = document.createElement('div');
      el.className = 'git-changes-file' + (file.path === this.selectedFilePath ? ' is-selected' : '');
      el.dataset.path = file.path;
      const status = document.createElement('span');
      status.className = 'git-file-status git-status-' + displayStatus.toLowerCase();
      status.textContent = displayStatus;
      const name = document.createElement('span');
      name.className = 'git-file-name';
      name.textContent = file.path;
      el.appendChild(status);
      el.appendChild(name);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectChangesFile(mode, file.path);
      });
      const actionBtn = document.createElement('button');
      actionBtn.className = 'git-changes-action';
      if (mode === 'unstaged') {
        actionBtn.textContent = '+';
        actionBtn.title = 'Stage file';
        actionBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.stageFile(file.path);
        });
      } else {
        actionBtn.textContent = '-';
        actionBtn.title = 'Unstage file';
        actionBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.unstageFile(file.path);
        });
      }
      el.appendChild(actionBtn);
      focusable(el);
      container.appendChild(el);
    }
  }

  async stageFile(filePath: string): Promise<void> {
    const ok = await this.api.git.stage(this.wsPath, filePath);
    if (ok) {
      this.selectedFilePath = null;
      this.callbacks.onSelectFilePath?.(null);
      await this.callbacks.onRefreshChanges?.();
    }
  }

  async unstageFile(filePath: string): Promise<void> {
    const ok = await this.api.git.unstage(this.wsPath, filePath);
    if (ok) {
      this.selectedFilePath = null;
      this.callbacks.onSelectFilePath?.(null);
      await this.callbacks.onRefreshChanges?.();
    }
  }

  async stageAll(): Promise<void> {
    // ponytail: loops per-file git add; single `git add -A` IPC if lists ever get huge
    for (const f of this.unstagedFiles) {
      await this.api.git.stage(this.wsPath, f.path);
    }
    this.selectedFilePath = null;
    this.callbacks.onSelectFilePath?.(null);
    await this.callbacks.onRefreshChanges?.();
  }

  async unstageAll(): Promise<void> {
    for (const f of this.stagedFiles) {
      await this.api.git.unstage(this.wsPath, f.path);
    }
    this.selectedFilePath = null;
    this.callbacks.onSelectFilePath?.(null);
    await this.callbacks.onRefreshChanges?.();
  }

  async selectChangesFile(mode: 'staged' | 'unstaged', filePath: string): Promise<void> {
    this.selectedFilePath = filePath;
    this.callbacks.onCommitStateChange?.();
    this.callbacks.onFileOpen?.(this.wsPath + '/' + filePath);
    const diff = mode === 'staged'
      ? await this.api.git.stagedDiff(this.wsPath, filePath) || ''
      : await this.api.git.unstagedDiff(this.wsPath, filePath) || '';
    this.callbacks.onSelectFilePath?.(filePath, diff);
    this.updateFileSelection();
  }

  updateFileSelection(): void {
    if (this.stagedFilesEl) {
      const items = this.stagedFilesEl.querySelectorAll('.git-changes-file');
      items.forEach(el => el.classList.toggle('is-selected', (el as HTMLElement).dataset.path === this.selectedFilePath));
    }
    if (this.unstagedFilesEl) {
      const items = this.unstagedFilesEl.querySelectorAll('.git-changes-file');
      items.forEach(el => el.classList.toggle('is-selected', (el as HTMLElement).dataset.path === this.selectedFilePath));
    }
  }

  clearSelection(): void {
    if (this.stagedFilesEl) {
      this.stagedFilesEl.querySelectorAll('.is-selected').forEach(el => el.classList.remove('is-selected'));
    }
    if (this.unstagedFilesEl) {
      this.unstagedFilesEl.querySelectorAll('.is-selected').forEach(el => el.classList.remove('is-selected'));
    }
  }

  /** Full-refresh auto-expand: opens sections that have files, re-renders emptied ones. */
  refreshAutoExpanded(): void {
    if (this.stagedFiles.length && this.stagedFilesEl && this.stagedArrow) {
      this.stagedFilesEl.style.display = '';
      this.stagedArrow.className = 'git-collapse-arrow git-collapse-arrow-open';
      this.stagedArrow.textContent = '▾';
      this.changesExpanded.staged = true;
      this.renderChangesFiles('staged', this.stagedFiles, this.stagedFilesEl);
    } else if (this.stagedFilesEl && this.stagedFilesEl.style.display !== 'none' && this.stagedFilesEl.innerHTML !== '') {
      // List emptied (e.g. after commit) — re-render so stale rows disappear
      this.renderChangesFiles('staged', this.stagedFiles, this.stagedFilesEl);
    }
    if (this.unstagedFiles.length && this.unstagedFilesEl && this.unstagedArrow) {
      this.unstagedFilesEl.style.display = '';
      this.unstagedArrow.className = 'git-collapse-arrow git-collapse-arrow-open';
      this.unstagedArrow.textContent = '▾';
      this.changesExpanded.unstaged = true;
      this.renderChangesFiles('unstaged', this.unstagedFiles, this.unstagedFilesEl);
    } else if (this.unstagedFilesEl && this.unstagedFilesEl.style.display !== 'none' && this.unstagedFilesEl.innerHTML !== '') {
      this.renderChangesFiles('unstaged', this.unstagedFiles, this.unstagedFilesEl);
    }
  }

  /** Lightweight refresh — re-render only sections that are currently expanded. */
  rerenderExpanded(): void {
    if (this.stagedFilesEl && this.stagedFilesEl.style.display !== 'none') {
      this.renderChangesFiles('staged', this.stagedFiles, this.stagedFilesEl);
    }
    if (this.unstagedFilesEl && this.unstagedFilesEl.style.display !== 'none') {
      this.renderChangesFiles('unstaged', this.unstagedFiles, this.unstagedFilesEl);
    }
  }
}
