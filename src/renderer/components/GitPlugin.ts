import type { DiffViewMode, GitApi, GitFileChange, GitState } from './git-plugin/types';
import { buildUi } from './git-plugin/ui-build';
import { HistoryPanel } from './git-plugin/history';
import { ChangesPanel } from './git-plugin/changes';
import { DiffView } from './git-plugin/diff-view';
import { bindGuarded } from '../health/monitor';

export type { GitState } from './git-plugin/types';

export class GitPlugin {
  onStateChange: (() => void) | null = null;
  onFileOpen: ((filePath: string) => void) | null = null;

  private splitEl: HTMLDivElement;
  private leftCol: HTMLDivElement;
  private topPanel: HTMLDivElement;
  private wsPath: string;

  private history: HistoryPanel;
  private changes: ChangesPanel;
  private diffView: DiffView;

  private branchSelect: HTMLSelectElement;
  private commitInput: HTMLInputElement;
  private commitBtn: HTMLButtonElement;
  private pushBtn: HTMLButtonElement;
  private statusMsgEl: HTMLDivElement;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;
  private dropdownBtn: HTMLButtonElement;
  private dropdownMenu: HTMLDivElement;
  private unifiedItem: HTMLDivElement;
  private sideBySideItem: HTMLDivElement;
  private unwatchFiles: (() => void) | null = null;
  private unbinders: (() => void)[] = [];

  constructor(container: HTMLElement, wsPath: string) {
    this.wsPath = wsPath;

    this.splitEl = document.createElement('div');
    this.splitEl.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:row;background:transparent';

    const api: GitApi = window.electronAPI;

    const refs = buildUi(this.splitEl, {
      onBranchChange: () => this.onBranchChange(),
      toggleChanges: (mode) => this.changes.toggleChanges(mode),
      stageAll: () => this.changes.stageAll(),
      unstageAll: () => this.changes.unstageAll(),
      handleCommit: () => this.handleCommit(),
      handlePush: () => this.handlePush(),
      setDiffViewMode: (mode) => this.setDiffViewMode(mode),
      toggleDropdown: () => this.toggleDropdown(),
      closeDropdown: () => this.closeDropdown(),
      onStateChange: () => this.onStateChange?.(),
      onCommitInput: () => this.updateCommitBtn(),
    });

    this.leftCol = refs.leftCol;
    this.topPanel = refs.topPanel;
    this.branchSelect = refs.branchSelect;
    this.commitInput = refs.commitInput;
    this.commitBtn = refs.commitBtn;
    this.pushBtn = refs.pushBtn;
    this.statusMsgEl = refs.statusMsgEl;
    this.dropdownBtn = refs.dropdownBtn;
    this.dropdownMenu = refs.dropdownMenu;
    this.unifiedItem = refs.unifiedItem;
    this.sideBySideItem = refs.sideBySideItem;

    this.diffView = new DiffView(api, wsPath, refs, {
      onFileOpen: (absolutePath) => this.onFileOpen?.(absolutePath),
      onStateChange: () => this.onStateChange?.(),
    });

    this.changes = new ChangesPanel(api, wsPath, refs, {
      onStateChange: () => this.onStateChange?.(),
      onCommitStateChange: () => this.clearCommitContext(),
      onFileOpen: (absolutePath) => this.onFileOpen?.(absolutePath),
      onSelectFilePath: (path, diff) => {
        if (diff !== undefined) {
          this.diffView.selectedFilePath = path;
          this.diffView.setDiffContent(diff);
          this.diffView.renderDiff();
        } else {
          this.diffView.clearSelection();
        }
      },
      onRefreshChanges: () => this.refreshChanges(),
    });

    this.history = new HistoryPanel(api, wsPath, refs, {
      onStateChange: () => this.onStateChange?.(),
      onClearChangesSelection: () => this.clearChangesSelection(),
      onCommitFiles: (files) => this.onCommitFiles(files),
    });

    container.appendChild(this.splitEl);

    this.unbinders.push(bindGuarded(this.splitEl, 'wheel', (e) => e.stopPropagation(), 'git-plugin/GitPlugin.ts', { passive: true }));

    Promise.resolve().then(() => this.refresh());

    // Debounced auto-refresh on file changes
    const fsApi = window.electronAPI?.fs;
    if (fsApi?.onChanged) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      this.unwatchFiles = fsApi.onChanged(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => this.refreshChanges(), 1000);
      });
    }
  }

  destroy(): void {
    this.unwatchFiles?.();
    this.unwatchFiles = null;
    for (const unbind of this.unbinders) {
      try { unbind(); } catch { /* best effort */ }
    }
    this.unbinders = [];
  }

  getState(): GitState {
    if (!this.history.selectedCommitHash && !this.diffView.selectedFilePath) return null;
    return {
      selectedCommitHash: this.history.selectedCommitHash,
      selectedFilePath: this.diffView.selectedFilePath,
      diffViewMode: this.diffView.diffViewMode,
      leftColWidth: this.leftCol.offsetWidth || 260,
      topPanelHeight: this.topPanel.offsetHeight || 150,
      changesExpanded: { ...this.changes.changesExpanded },
    };
  }

  /** Apply saved splitter sizes immediately (sync, no delay) */
  applyLayout(state: GitState): void {
    if (!state) return;
    if (state.leftColWidth > 0) {
      this.leftCol.style.width = state.leftColWidth + 'px';
    }
    if (state.topPanelHeight > 0) {
      this.topPanel.style.flex = 'none';
      this.topPanel.style.height = state.topPanelHeight + 'px';
    }
  }

  async restoreState(state: GitState): Promise<void> {
    if (!state) return;
    if (state.diffViewMode) this.diffView.diffViewMode = state.diffViewMode;
    this.applyLayout(state);
    if (state.changesExpanded) {
      this.changes.changesExpanded = { ...state.changesExpanded };
    }
    if (state.selectedCommitHash && this.history.commits.some(c => c.hash === state.selectedCommitHash)) {
      await this.history.selectCommit(state.selectedCommitHash);
      if (state.selectedFilePath) {
        await this.diffView.selectFile(state.selectedFilePath);
      }
    }
  }

  private setDiffViewMode(mode: DiffViewMode): void {
    this.diffView.diffViewMode = mode;
    if (this.unifiedItem) {
      this.unifiedItem.className = 'git-diff-dropdown-item' + (mode === 'unified' ? ' is-active' : '');
    }
    if (this.sideBySideItem) {
      this.sideBySideItem.className = 'git-diff-dropdown-item' + (mode === 'side-by-side' ? ' is-active' : '');
    }
    this.diffView.renderDiff();
  }

  private toggleDropdown(): void {
    if (!this.dropdownMenu) return;
    const shown = this.dropdownMenu.style.display !== 'none';
    if (shown) { this.closeDropdown(); return; }
    this.dropdownMenu.style.display = '';
    setTimeout(() => {
      const handler = (e: MouseEvent) => {
        const target = e.target as Node;
        if (this.dropdownBtn && !this.dropdownBtn.contains(target) && this.dropdownMenu && !this.dropdownMenu.contains(target)) {
          this.closeDropdown();
          document.removeEventListener('mousedown', handler);
        }
      };
      document.addEventListener('mousedown', handler);
    }, 0);
  }

  private closeDropdown(): void {
    if (this.dropdownMenu) this.dropdownMenu.style.display = 'none';
  }

  /** Normalize git op result: main returns { ok, error }, older bool also accepted */
  private opResult(r: unknown): { ok: boolean; error: string } {
    if (typeof r === 'object' && r !== null) {
      const o = r as { ok?: boolean; error?: string };
      return { ok: !!o.ok, error: o.error || '' };
    }
    return { ok: !!r, error: '' };
  }

  private showStatus(msg: string, isError: boolean): void {
    if (!this.statusMsgEl) return;
    if (this.statusTimer) { clearTimeout(this.statusTimer); this.statusTimer = null; }
    this.statusMsgEl.textContent = msg;
    this.statusMsgEl.title = msg;
    this.statusMsgEl.classList.toggle('is-error', isError);
    this.statusMsgEl.style.display = msg ? '' : 'none';
    if (msg && !isError) {
      this.statusTimer = setTimeout(() => {
        if (this.statusMsgEl) this.statusMsgEl.style.display = 'none';
      }, 4000);
    }
  }

  private async onBranchChange(): Promise<void> {
    if (!this.branchSelect) return;
    const branch = this.branchSelect.value;
    if (!branch || branch === this.history.currentBranchName) return;
    const res = this.opResult(await window.electronAPI?.git.checkout(this.wsPath, branch));
    if (res.ok) {
      this.history.currentBranchName = branch;
      this.showStatus(`Switched to ${branch}`, false);
    } else {
      this.showStatus(res.error || 'Checkout failed', true);
    }
    this.refresh();
  }

  private updateCommitBtn(): void {
    if (this.commitBtn) {
      this.commitBtn.disabled = this.changes.stagedFiles.length === 0 || !this.commitInput?.value.trim();
    }
  }

  private async handleCommit(): Promise<void> {
    const msg = this.commitInput?.value.trim();
    if (!msg) return;
    const res = this.opResult(await window.electronAPI?.git.commit(this.wsPath, msg));
    if (res.ok) {
      if (this.commitInput) this.commitInput.value = '';
      this.diffView.selectedFilePath = null;
      this.diffView.selectedCommitHash = null;
      this.diffView.diffContent = '';
      this.diffView.renderDiff();
      this.history.selectedCommitHash = null;
      this.showStatus('Committed', false);
      await this.refresh();
    } else {
      this.showStatus(res.error || 'Commit failed', true);
    }
  }

  private async handlePush(): Promise<void> {
    if (!this.pushBtn || this.pushBtn.disabled) return;
    this.pushBtn.disabled = true;
    this.pushBtn.textContent = 'Pushing…';
    const res = this.opResult(await window.electronAPI?.git.push(this.wsPath));
    if (res.ok) {
      this.pushBtn.textContent = 'Push';
      this.showStatus('Pushed', false);
      await this.refresh();
    } else {
      this.showStatus(res.error || 'Push failed', true);
      await this.updatePushBtn();
    }
  }

  private async updatePushBtn(): Promise<void> {
    const ahead = await window.electronAPI?.git.checkAhead(this.wsPath);
    const n = typeof ahead === 'number' ? ahead : (ahead ? 1 : 0);
    if (this.pushBtn) {
      this.pushBtn.disabled = n === 0;
      this.pushBtn.textContent = n > 0 ? `Push ↑${n}` : 'Push';
      this.pushBtn.title = n > 0 ? `${n} unpushed commit${n === 1 ? '' : 's'}` : 'Nothing to push';
    }
  }

  /** Selecting a changes file clears all commit-mode state (selection, info, tree). */
  private clearCommitContext(): void {
    this.history.clearSelection();
    this.diffView.selectedCommitHash = null;
    this.diffView.selectedFilePath = null;
    this.diffView.diffContent = '';
    this.diffView.fileChanges = [];
    this.diffView.clearFileTree();
  }

  /** Selecting a commit clears the staged/unstaged file selection. */
  private clearChangesSelection(): void {
    this.changes.clearSelection();
    this.changes.selectedFilePath = null;
    this.diffView.selectedFilePath = null;
    this.diffView.diffContent = '';
  }

  private onCommitFiles(files: GitFileChange[]): void {
    this.diffView.selectedCommitHash = this.history.selectedCommitHash;
    this.diffView.fileChanges = files;
    this.diffView.renderFileTree();
    if (files.length > 0) {
      this.diffView.selectFile(files[0].path);
    }
  }

  async refresh(): Promise<void> {
    this.diffView.fileChanges = [];
    this.diffView.selectedCommitHash = null;
    this.diffView.selectedFilePath = null;
    this.diffView.diffContent = '';
    this.changes.selectedFilePath = null;
    this.history.clearSelection();
    await Promise.all([
      this.history.loadRemotes(),
      this.history.loadBranches(),
      this.history.loadCommits(),
      this.changes.loadStagedFiles(),
      this.changes.loadUnstagedFiles(),
    ]);
    this.diffView.clearFileTree();
    this.diffView.renderDiff();
    // Auto-expand changes sections that have files
    this.changes.refreshAutoExpanded();
    await this.updatePushBtn();
  }

  /** Lightweight refresh — only reload staged/unstaged changes, preserve commit state */
  async refreshChanges(): Promise<void> {
    await Promise.all([
      this.changes.loadStagedFiles(),
      this.changes.loadUnstagedFiles(),
    ]);
    // Disable commit button when no staged files
    this.updateCommitBtn();
    // Re-render expanded sections
    this.changes.rerenderExpanded();
  }
}
