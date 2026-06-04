interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

interface GitFileChange {
  status: string;
  path: string;
}

interface GitBranch {
  name: string;
  current: boolean;
  isRemote: boolean;
}

interface GitRemote {
  name: string;
  url: string;
}

type DiffViewMode = 'unified' | 'side-by-side';

export type GitState = {
  selectedCommitHash: string | null;
  selectedFilePath: string | null;
  diffViewMode: DiffViewMode;
  leftColWidth: number;
  topPanelHeight: number;
  changesExpanded: { staged: boolean; unstaged: boolean };
} | null;

export class GitPlugin {
  onStateChange: (() => void) | null = null;
  onFileOpen: ((filePath: string) => void) | null = null;

  private splitEl: HTMLDivElement;
  private leftCol: HTMLDivElement;
  private rightCol: HTMLDivElement;
  private isDragging = false;
  private wsPath: string;

  private remotes: GitRemote[] = [];
  private branches: GitBranch[] = [];
  private commits: GitCommit[] = [];
  private selectedCommitHash: string | null = null;
  private changesMode = false;
  private stagedFiles: GitFileChange[] = [];
  private unstagedFiles: GitFileChange[] = [];
  private fileChanges: GitFileChange[] = [];
  private selectedFilePath: string | null = null;
  private diffContent = '';
  private currentBranchName = '';
  private diffViewMode: DiffViewMode = 'unified';
  private changesExpanded: { staged: boolean; unstaged: boolean } = { staged: false, unstaged: false };

  private remoteSelect: HTMLSelectElement | null = null;
  private branchSelect: HTMLSelectElement | null = null;
  private commitsContainer: HTMLDivElement | null = null;
  private fileTreeContainer: HTMLDivElement | null = null;
  private diffContainer: HTMLDivElement | null = null;
  private emptyDiff: HTMLDivElement | null = null;
  private dropdownBtn: HTMLButtonElement | null = null;
  private dropdownMenu: HTMLDivElement | null = null;
  private unifiedItem: HTMLDivElement | null = null;
  private sideBySideItem: HTMLDivElement | null = null;
  private stagedHeader: HTMLDivElement | null = null;
  private unstagedHeader: HTMLDivElement | null = null;
  private stagedFilesEl: HTMLDivElement | null = null;
  private unstagedFilesEl: HTMLDivElement | null = null;
  private stagedArrow: HTMLSpanElement | null = null;
  private unstagedArrow: HTMLSpanElement | null = null;
  private stagedCount: HTMLSpanElement | null = null;
  private unstagedCount: HTMLSpanElement | null = null;
  private commitInfoEl: HTMLDivElement | null = null;
  private unwatchFiles: (() => void) | null = null;
  private vResizeHandle: HTMLDivElement;
  private isVDragging = false;
  private topPanel: HTMLDivElement;
  private bottomPanel: HTMLDivElement;
  private commitInput: HTMLInputElement | null = null;
  private commitBtn: HTMLButtonElement | null = null;
  private pushBtn: HTMLButtonElement | null = null;

  constructor(container: HTMLElement, wsPath: string) {
    this.wsPath = wsPath;

    this.splitEl = document.createElement('div');
    this.splitEl.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:row;background:transparent';

    this.leftCol = document.createElement('div');
    this.leftCol.className = 'git-left';

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'git-resize';

    this.rightCol = document.createElement('div');
    this.rightCol.className = 'git-right';

    let startX = 0;
    let startW = 260;
    resizeHandle.addEventListener('mouseenter', () => {
      if (!this.isDragging) { resizeHandle.style.background = 'var(--accent)'; resizeHandle.style.opacity = '0.5'; }
    });
    resizeHandle.addEventListener('mouseleave', () => {
      if (!this.isDragging) { resizeHandle.style.background = 'var(--border)'; resizeHandle.style.opacity = ''; }
    });
    resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.isDragging = true;
      startX = e.clientX;
      startW = this.leftCol.offsetWidth;
      resizeHandle.style.background = 'var(--accent)';
      resizeHandle.style.opacity = '0.8';
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - startX;
      const newW = Math.max(120, Math.min(600, startW + dx));
      this.leftCol.style.width = newW + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.onStateChange?.();
        resizeHandle.style.background = 'var(--border)';
        resizeHandle.style.opacity = '';
      }
    });

    this.splitEl.appendChild(this.leftCol);
    this.splitEl.appendChild(resizeHandle);
    this.splitEl.appendChild(this.rightCol);
    container.appendChild(this.splitEl);

    this.splitEl.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

    this.buildUI();
    Promise.resolve().then(() => this.refresh());

    // Debounced auto-refresh on file changes
    const api = window.electronAPI?.fs;
    if (api?.onChanged) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      this.unwatchFiles = api.onChanged(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => this.refreshChanges(), 1000);
      });
    }
  }

  destroy(): void {
    this.unwatchFiles?.();
    this.unwatchFiles = null;
  }

  getState(): GitState {
    if (!this.selectedCommitHash && !this.selectedFilePath) return null;
    return {
      selectedCommitHash: this.selectedCommitHash,
      selectedFilePath: this.selectedFilePath,
      diffViewMode: this.diffViewMode,
      leftColWidth: this.leftCol.offsetWidth || 260,
      topPanelHeight: this.topPanel.offsetHeight || 150,
      changesExpanded: { ...this.changesExpanded },
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
    if (state.diffViewMode) this.diffViewMode = state.diffViewMode;
    this.applyLayout(state);
    if (state.changesExpanded) {
      this.changesExpanded = { ...state.changesExpanded };
    }
    if (state.selectedCommitHash && this.commits.some(c => c.hash === state.selectedCommitHash)) {
      await this.selectCommit(state.selectedCommitHash);
      if (state.selectedFilePath) {
        await this.selectFile(state.selectedFilePath);
      }
    }
  }

  private buildUI(): void {
    // ─── Left panel ───

    // Navigation: Branch (primary) then Remote
    const branchLabel = this.labelEl('Branch');
    this.leftCol.appendChild(branchLabel);
    this.branchSelect = document.createElement('select');
    this.branchSelect.className = 'git-select';
    this.branchSelect.addEventListener('change', () => this.onBranchChange());
    this.leftCol.appendChild(this.branchSelect);

    const remoteLabel = this.labelEl('Remote');
    this.leftCol.appendChild(remoteLabel);
    this.remoteSelect = document.createElement('select');
    this.remoteSelect.className = 'git-select';
    this.remoteSelect.addEventListener('change', () => { /* display only */ });
    this.leftCol.appendChild(this.remoteSelect);

    const navSep = document.createElement('div');
    navSep.className = 'git-section-sep';
    this.leftCol.appendChild(navSep);

    // Changes section
    const changesLabel = this.labelEl('Changes');
    this.leftCol.appendChild(changesLabel);

    // Staged header + files (index 0 — tests depend on this order)
    this.stagedHeader = document.createElement('div');
    this.stagedHeader.className = 'git-changes-item';
    this.stagedArrow = document.createElement('span');
    this.stagedArrow.className = 'git-collapse-arrow git-collapse-arrow-closed';
    this.stagedArrow.textContent = '▸';
    this.stagedHeader.appendChild(this.stagedArrow);
    const stagedLabel = document.createElement('span');
    stagedLabel.className = 'git-changes-label';
    stagedLabel.textContent = 'Staged';
    this.stagedCount = document.createElement('span');
    this.stagedCount.className = 'git-changes-count';
    this.stagedHeader.appendChild(stagedLabel);
    this.stagedHeader.appendChild(this.stagedCount);
    this.leftCol.appendChild(this.stagedHeader);

    this.stagedFilesEl = document.createElement('div');
    this.stagedFilesEl.className = 'git-changes-files';
    this.stagedFilesEl.style.display = 'none';
    this.leftCol.appendChild(this.stagedFilesEl);

    this.stagedHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleChanges('staged');
    });

    // Unstaged header + files (index 1)
    this.unstagedHeader = document.createElement('div');
    this.unstagedHeader.className = 'git-changes-item';
    this.unstagedArrow = document.createElement('span');
    this.unstagedArrow.className = 'git-collapse-arrow git-collapse-arrow-closed';
    this.unstagedArrow.textContent = '▸';
    this.unstagedHeader.appendChild(this.unstagedArrow);
    const unstagedLabel = document.createElement('span');
    unstagedLabel.className = 'git-changes-label';
    unstagedLabel.textContent = 'Unstaged';
    this.unstagedCount = document.createElement('span');
    this.unstagedCount.className = 'git-changes-count';
    this.unstagedHeader.appendChild(unstagedLabel);
    this.unstagedHeader.appendChild(this.unstagedCount);
    this.leftCol.appendChild(this.unstagedHeader);

    this.unstagedFilesEl = document.createElement('div');
    this.unstagedFilesEl.className = 'git-changes-files';
    this.leftCol.appendChild(this.unstagedFilesEl);

    this.unstagedHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleChanges('unstaged');
    });

    // Commit bar below staged/unstaged — natural workflow: see changes → write message → commit/push
    const commitBar = document.createElement('div');
    commitBar.className = 'git-commit-bar';
    this.commitInput = document.createElement('input');
    this.commitInput.className = 'git-commit-input';
    this.commitInput.type = 'text';
    this.commitInput.placeholder = 'Commit message…';
    this.commitInput.addEventListener('input', () => {
      if (this.commitBtn) {
        this.commitBtn.disabled = this.stagedFiles.length === 0 || !this.commitInput?.value.trim();
      }
    });
    this.commitInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.commitInput?.value.trim()) {
        e.stopPropagation();
        this.handleCommit();
      }
    });
    commitBar.appendChild(this.commitInput);

    const commitBtnRow = document.createElement('div');
    commitBtnRow.className = 'git-commit-btn-row';
    this.commitBtn = document.createElement('button');
    this.commitBtn.className = 'git-commit-btn';
    this.commitBtn.textContent = 'Commit';
    this.commitBtn.disabled = true;
    this.commitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleCommit();
    });
    this.pushBtn = document.createElement('button');
    this.pushBtn.className = 'git-push-btn';
    this.pushBtn.textContent = 'Push';
    this.pushBtn.disabled = true;
    this.pushBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlePush();
    });
    commitBtnRow.appendChild(this.commitBtn);
    commitBtnRow.appendChild(this.pushBtn);
    commitBar.appendChild(commitBtnRow);
    this.leftCol.appendChild(commitBar);

    // Commits section
    const commitsHeader = this.labelEl('Commits');
    this.leftCol.appendChild(commitsHeader);

    this.commitsContainer = document.createElement('div');
    this.commitsContainer.className = 'git-commits';
    this.leftCol.appendChild(this.commitsContainer);

    // ─── Right panel ───
    this.topPanel = document.createElement('div');
    this.topPanel.className = 'git-top-panel';
    this.rightCol.appendChild(this.topPanel);

    const filesHeader = this.labelEl('Changed Files');
    this.topPanel.appendChild(filesHeader);

    this.commitInfoEl = document.createElement('div');
    this.commitInfoEl.className = 'git-commit-info';
    this.commitInfoEl.style.display = 'none';
    this.topPanel.appendChild(this.commitInfoEl);

    this.fileTreeContainer = document.createElement('div');
    this.fileTreeContainer.className = 'git-filetree';
    this.topPanel.appendChild(this.fileTreeContainer);

    // Horizontal resize handle
    this.vResizeHandle = document.createElement('div');
    this.vResizeHandle.className = 'git-resize git-resize-h';
    this.rightCol.appendChild(this.vResizeHandle);

    this.bottomPanel = document.createElement('div');
    this.bottomPanel.className = 'git-bottom-panel';
    this.rightCol.appendChild(this.bottomPanel);

    // Diff header with view mode dropdown
    const diffHeaderRow = document.createElement('div');
    diffHeaderRow.className = 'git-diff-header';

    const diffLabel = document.createElement('div');
    diffLabel.className = 'git-label git-diff-header-label';
    diffLabel.textContent = 'Diff';
    diffHeaderRow.appendChild(diffLabel);

    const btnWrap = document.createElement('div');
    btnWrap.className = 'git-diff-btn-wrap';

    this.dropdownBtn = document.createElement('button');
    this.dropdownBtn.className = 'git-diff-btn';
    this.dropdownBtn.title = 'Switch diff view mode';
    this.dropdownBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
    this.dropdownBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleDropdown(); });

    this.dropdownMenu = document.createElement('div');
    this.dropdownMenu.className = 'git-diff-dropdown';
    this.dropdownMenu.style.display = 'none';

    this.unifiedItem = document.createElement('div');
    this.unifiedItem.className = 'git-diff-dropdown-item is-active';
    this.unifiedItem.textContent = 'View unified';
    this.unifiedItem.addEventListener('click', () => { this.setDiffViewMode('unified'); this.closeDropdown(); });

    this.sideBySideItem = document.createElement('div');
    this.sideBySideItem.className = 'git-diff-dropdown-item';
    this.sideBySideItem.textContent = 'View side by side';
    this.sideBySideItem.addEventListener('click', () => { this.setDiffViewMode('side-by-side'); this.closeDropdown(); });

    this.dropdownMenu.appendChild(this.unifiedItem);
    this.dropdownMenu.appendChild(this.sideBySideItem);
    btnWrap.appendChild(this.dropdownBtn);
    btnWrap.appendChild(this.dropdownMenu);
    diffHeaderRow.appendChild(btnWrap);
    this.bottomPanel.appendChild(diffHeaderRow);

    this.emptyDiff = document.createElement('div');
    this.emptyDiff.className = 'git-diff-empty';
    this.emptyDiff.textContent = 'Select a file to view diff';
    this.diffContainer = document.createElement('div');
    this.diffContainer.className = 'git-diff';
    this.diffContainer.style.display = 'none';

    this.bottomPanel.appendChild(this.diffContainer);
    this.bottomPanel.appendChild(this.emptyDiff);

    // Vertical divider resize logic
    let startY = 0;
    let startH = 200;
    this.vResizeHandle.addEventListener('mouseenter', () => {
      if (!this.isVDragging) { this.vResizeHandle.style.background = 'var(--accent)'; this.vResizeHandle.style.opacity = '0.5'; }
    });
    this.vResizeHandle.addEventListener('mouseleave', () => {
      if (!this.isVDragging) { this.vResizeHandle.style.background = 'var(--border)'; this.vResizeHandle.style.opacity = ''; }
    });
    this.vResizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.isVDragging = true;
      startY = e.clientY;
      startH = this.topPanel.offsetHeight;
      this.vResizeHandle.style.background = 'var(--accent)';
      this.vResizeHandle.style.opacity = '0.8';
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.isVDragging) return;
      const dy = e.clientY - startY;
      const total = this.rightCol.offsetHeight - this.vResizeHandle.offsetHeight;
      const newH = Math.max(40, Math.min(total - 40, startH + dy));
      this.topPanel.style.flex = 'none';
      this.topPanel.style.height = newH + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (this.isVDragging) {
        this.isVDragging = false;
        this.onStateChange?.();
        this.vResizeHandle.style.background = 'var(--border)';
        this.vResizeHandle.style.opacity = '';
      }
    });
  }

  private setDiffViewMode(mode: DiffViewMode): void {
    this.diffViewMode = mode;
    if (this.unifiedItem) {
      this.unifiedItem.className = 'git-diff-dropdown-item' + (mode === 'unified' ? ' is-active' : '');
    }
    if (this.sideBySideItem) {
      this.sideBySideItem.className = 'git-diff-dropdown-item' + (mode === 'side-by-side' ? ' is-active' : '');
    }
    this.renderDiff();
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

  private labelEl(text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'git-label';
    el.textContent = text;
    return el;
  }

  private async onBranchChange(): Promise<void> {
    if (!this.branchSelect) return;
    const branch = this.branchSelect.value;
    if (!branch || branch === this.currentBranchName) return;
    const ok = await window.electronAPI?.git.checkout(this.wsPath, branch);
    if (ok) {
      this.currentBranchName = branch;
      this.refresh();
    } else {
      this.refresh();
    }
  }

  // ─── Changes (staged / unstaged) ───

  private async loadStagedFiles(): Promise<void> {
    this.stagedFiles = await window.electronAPI?.git.stagedFiles(this.wsPath) || [];
    this.updateChangesCounts();
  }

  private async loadUnstagedFiles(): Promise<void> {
    this.unstagedFiles = await window.electronAPI?.git.unstagedFiles(this.wsPath) || [];
    this.updateChangesCounts();
  }

  private updateChangesCounts(): void {
    if (this.stagedCount) {
      this.stagedCount.textContent = this.stagedFiles.length ? String(this.stagedFiles.length) : 'No staged files';
    }
    if (this.unstagedCount) {
      this.unstagedCount.textContent = this.unstagedFiles.length ? String(this.unstagedFiles.length) : 'No changes';
    }
  }

  private toggleChanges(mode: 'staged' | 'unstaged'): void {
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

  private normalizeStatus(raw: string): string {
    if (raw === '??' || raw === '?') return 'U';
    return raw;
  }

  private renderChangesFiles(mode: 'staged' | 'unstaged', files: GitFileChange[], container: HTMLDivElement): void {
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
      container.appendChild(el);
    }
  }

  private async stageFile(filePath: string): Promise<void> {
    const ok = await window.electronAPI?.git.stage(this.wsPath, filePath);
    if (ok) {
      this.selectedFilePath = null;
      this.diffContent = '';
      this.renderDiff();
      await this.refreshChanges();
    }
  }

  private async unstageFile(filePath: string): Promise<void> {
    const ok = await window.electronAPI?.git.unstage(this.wsPath, filePath);
    if (ok) {
      this.selectedFilePath = null;
      this.diffContent = '';
      this.renderDiff();
      await this.refreshChanges();
    }
  }

  private async handleCommit(): Promise<void> {
    const msg = this.commitInput?.value.trim();
    if (!msg) return;
    const ok = await window.electronAPI?.git.commit(this.wsPath, msg);
    if (ok) {
      if (this.commitInput) this.commitInput.value = '';
      this.selectedFilePath = null;
      this.selectedCommitHash = null;
      this.diffContent = '';
      this.renderDiff();
      await this.refresh();
    }
  }

  private async handlePush(): Promise<void> {
    const ok = await window.electronAPI?.git.push(this.wsPath);
    if (ok) {
      await this.refresh();
    }
  }

  private async updatePushBtn(): Promise<void> {
    const ahead = await window.electronAPI?.git.checkAhead(this.wsPath);
    if (this.pushBtn) {
      this.pushBtn.disabled = !ahead;
    }
  }

  private async selectChangesFile(mode: 'staged' | 'unstaged', filePath: string): Promise<void> {
    this.changesMode = true;
    this.selectedCommitHash = null;
    this.selectedFilePath = filePath;
    this.diffContent = '';

    if (this.commitInfoEl) this.commitInfoEl.style.display = 'none';
    this.fileTreeContainer.innerHTML = '';

    // Update visual selection across both file lists
    this.updateChangesFileSelection();
    this.clearCommitSelection();

    this.onFileOpen?.(this.wsPath + '/' + filePath);
    const fn = mode === 'staged' ? 'stagedDiff' : 'unstagedDiff';
    const diff = await (window.electronAPI?.git as any)[fn](this.wsPath, filePath) || '';
    this.diffContent = diff;
    this.renderDiff();
  }

  private updateChangesFileSelection(): void {
    if (this.stagedFilesEl) {
      const items = this.stagedFilesEl.querySelectorAll('.git-changes-file');
      items.forEach(el => el.classList.toggle('is-selected', (el as HTMLElement).dataset.path === this.selectedFilePath));
    }
    if (this.unstagedFilesEl) {
      const items = this.unstagedFilesEl.querySelectorAll('.git-changes-file');
      items.forEach(el => el.classList.toggle('is-selected', (el as HTMLElement).dataset.path === this.selectedFilePath));
    }
  }

  private clearCommitSelection(): void {
    if (this.commitsContainer) {
      const items = this.commitsContainer.querySelectorAll('.git-commit-item.is-selected');
      items.forEach(el => el.classList.remove('is-selected'));
    }
  }

  // ─── Commits ───

  private async loadRemotes(): Promise<void> {
    const r = await window.electronAPI?.git.remotes(this.wsPath) || [];
    this.remotes = r;
    if (this.remoteSelect) {
      this.remoteSelect.innerHTML = '';
      if (r.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = '(no remotes)';
        this.remoteSelect.appendChild(opt);
      } else {
        for (const rem of r) {
          const opt = document.createElement('option');
          opt.value = rem.name;
          opt.textContent = `${rem.name} — ${rem.url}`;
          this.remoteSelect.appendChild(opt);
        }
      }
    }
  }

  private async loadBranches(): Promise<void> {
    const b = await window.electronAPI?.git.branches(this.wsPath) || [];
    this.branches = b;
    this.currentBranchName = b.find(b => b.current)?.name || '';
    if (this.branchSelect) {
      this.branchSelect.innerHTML = '';
      const local = b.filter(b => !b.isRemote);
      const remote = b.filter(b => b.isRemote);
      if (local.length > 0) {
        const group = document.createElement('optgroup');
        group.label = 'Local';
        for (const br of local) {
          const opt = document.createElement('option');
          opt.value = br.name.replace(/^remotes\/[^/]+\//, '');
          opt.textContent = br.name + (br.current ? ' (current)' : '');
          if (br.current) opt.selected = true;
          group.appendChild(opt);
        }
        this.branchSelect.appendChild(group);
      }
      if (remote.length > 0) {
        const group = document.createElement('optgroup');
        group.label = 'Remote';
        for (const br of remote) {
          const opt = document.createElement('option');
          const shortName = br.name.replace(/^remotes\/[^/]+\//, '');
          opt.value = shortName;
          opt.textContent = br.name;
          group.appendChild(opt);
        }
        this.branchSelect.appendChild(group);
      }
    }
  }

  private async loadCommits(): Promise<void> {
    const c = await window.electronAPI?.git.log(this.wsPath, 50) || [];
    this.commits = c;
    this.renderCommits();
  }

  private renderCommits(): void {
    if (!this.commitsContainer) return;
    this.commitsContainer.innerHTML = '';
    if (this.commits.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'git-empty';
      empty.textContent = 'No commits found';
      this.commitsContainer.appendChild(empty);
      return;
    }
    for (const commit of this.commits) {
      const item = document.createElement('div');
      item.className = 'git-commit-item' + (commit.hash === this.selectedCommitHash ? ' is-selected' : '');
      const hash = document.createElement('div');
      hash.className = 'git-commit-hash';
      hash.textContent = commit.hash.substring(0, 7);
      const msg = document.createElement('div');
      msg.className = 'git-commit-msg';
      msg.textContent = commit.message;
      const meta = document.createElement('div');
      meta.className = 'git-commit-meta';
      const d = commit.date ? new Date(commit.date) : null;
      const dateStr = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
      meta.textContent = `${commit.author} · ${dateStr}`;
      item.appendChild(hash);
      item.appendChild(msg);
      item.appendChild(meta);
      item.addEventListener('click', () => this.selectCommit(commit.hash));
      this.commitsContainer.appendChild(item);
    }
  }

  private async selectCommit(hash: string): Promise<void> {
    this.selectedCommitHash = hash;
    this.changesMode = false;
    this.selectedFilePath = null;
    this.diffContent = '';

    // Clear staged/unstaged selection
    if (this.stagedFilesEl) {
      this.stagedFilesEl.querySelectorAll('.is-selected').forEach(el => el.classList.remove('is-selected'));
    }
    if (this.unstagedFilesEl) {
      this.unstagedFilesEl.querySelectorAll('.is-selected').forEach(el => el.classList.remove('is-selected'));
    }

    this.renderCommits();

    const commit = this.commits.find(c => c.hash === hash);
    if (commit && this.commitInfoEl) {
      const body = await window.electronAPI?.git.commitBody(this.wsPath, hash) || '';
      const [subject, ...rest] = body.split('\n');
      const description = rest.join('\n').trim();

      this.commitInfoEl.innerHTML = '';
      const hashRow = document.createElement('div');
      hashRow.className = 'git-commit-info-hash';
      hashRow.textContent = hash.substring(0, 7);
      this.commitInfoEl.appendChild(hashRow);

      const metaRow = document.createElement('div');
      metaRow.className = 'git-commit-info-meta';
      const d = commit.date ? new Date(commit.date) : null;
      const dateStr = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
      metaRow.textContent = `${commit.author} · ${dateStr}`;
      this.commitInfoEl.appendChild(metaRow);

      const subjRow = document.createElement('div');
      subjRow.className = 'git-commit-info-subject';
      subjRow.textContent = description ? subject : body.trim();
      this.commitInfoEl.appendChild(subjRow);

      if (description) {
        const descRow = document.createElement('div');
        descRow.className = 'git-commit-info-desc';
        descRow.textContent = description;
        this.commitInfoEl.appendChild(descRow);
      }

      this.commitInfoEl.style.display = '';
    }

    const files = await window.electronAPI?.git.showTree(this.wsPath, hash) || [];
    this.fileChanges = files;
    this.fileTreeContainer.innerHTML = '';
    this.renderFileTree();
    if (files.length > 0) {
      await this.selectFile(files[0].path);
    }
  }

  // ─── File tree (commit) ───

  private renderFileTree(): void {
    if (!this.fileTreeContainer) return;
    this.fileTreeContainer.innerHTML = '';
    if (this.fileChanges.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'git-empty';
      empty.textContent = 'No files changed';
      this.fileTreeContainer.appendChild(empty);
      return;
    }
    for (const file of this.fileChanges) {
      const item = document.createElement('div');
      item.className = 'git-file-item' + (file.path === this.selectedFilePath ? ' is-selected' : '');
      const status = document.createElement('span');
      status.className = 'git-file-status git-status-' + file.status.toLowerCase();
      status.textContent = file.status;
      const name = document.createElement('span');
      name.className = 'git-file-name';
      name.textContent = file.path;
      item.appendChild(status);
      item.appendChild(name);
      item.addEventListener('click', () => this.selectFile(file.path));
      this.fileTreeContainer.appendChild(item);
    }
  }

  private async selectFile(filePath: string): Promise<void> {
    this.selectedFilePath = filePath;
    this.renderFileTree();
    try { this.onFileOpen?.(this.wsPath + '/' + filePath); } catch {}
    if (this.selectedCommitHash) {
      const diff = await window.electronAPI?.git.diff(this.wsPath, this.selectedCommitHash, filePath) || '';
      this.diffContent = diff;
    }
    this.renderDiff();
  }

  // ─── Diff rendering ───

  private renderDiff(): void {
    if (!this.diffContainer || !this.emptyDiff) return;
    this.diffContainer.innerHTML = '';
    if (!this.diffContent) {
      this.emptyDiff.style.display = '';
      this.diffContainer.style.display = 'none';
      return;
    }
    this.emptyDiff.style.display = 'none';
    this.diffContainer.style.display = '';

    if (this.diffViewMode === 'side-by-side') {
      this.renderSideBySide();
    } else {
      this.renderUnified();
    }
  }

  private renderUnified(): void {
    if (!this.diffContainer) return;
    const pre = document.createElement('pre');
    pre.className = 'git-diff-pre';
    const lines = this.diffContent.split('\n');
    for (const line of lines) {
      const div = document.createElement('div');
      div.className = 'git-diff-line';
      if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
        div.className += ' diff-meta';
      } else if (line.startsWith('@@')) {
        div.className += ' diff-hunk';
      } else if (line.startsWith('+')) {
        div.className += ' diff-add';
      } else if (line.startsWith('-')) {
        div.className += ' diff-remove';
      }
      div.textContent = line || ' ';
      pre.appendChild(div);
    }
    this.diffContainer.appendChild(pre);
  }

  private renderSideBySide(): void {
    if (!this.diffContainer) return;
    const lines = this.diffContent.split('\n');
    const pairs: { oldLine: string; newLine: string; oldNum: string; newNum: string; klass: string }[] = [];
    let oldLineNum = 0;
    let newLineNum = 0;

    for (const line of lines) {
      if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
        const span = document.createElement('div');
        span.className = 'git-diff-line diff-meta';
        span.textContent = line || ' ';
        this.diffContainer.appendChild(span);
        continue;
      }
      if (line.startsWith('@@')) {
        const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (m) {
          oldLineNum = parseInt(m[1]);
          newLineNum = parseInt(m[2]);
        }
        const span = document.createElement('div');
        span.className = 'git-diff-line diff-hunk';
        span.textContent = line || ' ';
        this.diffContainer.appendChild(span);
        for (const p of pairs) {
          this.appendSideBySideRow(p.oldLine, p.newLine, p.oldNum, p.newNum, p.klass);
        }
        pairs.length = 0;
        continue;
      }
      if (line.startsWith('-')) {
        pairs.push({ oldLine: line.substring(1), newLine: '', oldNum: String(oldLineNum++), newNum: '', klass: 'diff-remove' });
      } else if (line.startsWith('+')) {
        if (pairs.length > 0 && pairs[pairs.length - 1].newLine === '' && pairs[pairs.length - 1].oldLine !== '') {
          pairs[pairs.length - 1].newLine = line.substring(1);
          pairs[pairs.length - 1].newNum = String(newLineNum++);
          pairs[pairs.length - 1].klass = 'diff-replace';
        } else {
          pairs.push({ oldLine: '', newLine: line.substring(1), oldNum: '', newNum: String(newLineNum++), klass: 'diff-add' });
        }
      } else {
        for (const p of pairs) {
          this.appendSideBySideRow(p.oldLine, p.newLine, p.oldNum, p.newNum, p.klass);
        }
        pairs.length = 0;
        const content = line.startsWith(' ') ? line.substring(1) : line;
        this.appendSideBySideRow(content, content, String(oldLineNum++), String(newLineNum++), '');
      }
    }
    for (const p of pairs) {
      this.appendSideBySideRow(p.oldLine, p.newLine, p.oldNum, p.newNum, p.klass);
    }
    pairs.length = 0;
  }

  private appendSideBySideRow(oldText: string, newText: string, oldNum: string, newNum: string, klass: string): void {
    if (!this.diffContainer) return;
    const row = document.createElement('div');
    row.className = 'git-sbs-row' + (klass ? ' ' + klass : '');

    const oldCell = document.createElement('div');
    oldCell.className = 'git-sbs-cell';
    const oldNumSpan = document.createElement('span');
    oldNumSpan.className = 'git-sbs-num';
    oldNumSpan.textContent = oldNum;
    oldCell.appendChild(oldNumSpan);
    const oldContent = document.createElement('span');
    oldContent.className = 'git-sbs-content';
    oldContent.textContent = oldText || '';
    oldCell.appendChild(oldContent);

    const newCell = document.createElement('div');
    newCell.className = 'git-sbs-cell';
    const newNumSpan = document.createElement('span');
    newNumSpan.className = 'git-sbs-num';
    newNumSpan.textContent = newNum;
    newCell.appendChild(newNumSpan);
    const newContent = document.createElement('span');
    newContent.className = 'git-sbs-content';
    newContent.textContent = newText || '';
    newCell.appendChild(newContent);

    row.appendChild(oldCell);
    row.appendChild(newCell);
    this.diffContainer.appendChild(row);
  }

  async refresh(): Promise<void> {
    await Promise.all([
      this.loadRemotes(),
      this.loadBranches(),
      this.loadCommits(),
      this.loadStagedFiles(),
      this.loadUnstagedFiles(),
    ]);
    this.fileChanges = [];
    this.selectedCommitHash = null;
    this.changesMode = false;
    this.selectedFilePath = null;
    this.diffContent = '';
    if (this.commitInfoEl) this.commitInfoEl.style.display = 'none';
    this.fileTreeContainer.innerHTML = '';
    this.renderDiff();
    // Auto-expand changes sections that have files
    if (this.stagedFiles.length && this.stagedFilesEl && this.stagedArrow) {
      this.stagedFilesEl.style.display = '';
      this.stagedArrow.className = 'git-collapse-arrow git-collapse-arrow-open';
      this.stagedArrow.textContent = '▾';
      this.changesExpanded.staged = true;
      this.renderChangesFiles('staged', this.stagedFiles, this.stagedFilesEl);
    }
    if (this.unstagedFiles.length && this.unstagedFilesEl && this.unstagedArrow) {
      this.unstagedFilesEl.style.display = '';
      this.unstagedArrow.className = 'git-collapse-arrow git-collapse-arrow-open';
      this.unstagedArrow.textContent = '▾';
      this.changesExpanded.unstaged = true;
      this.renderChangesFiles('unstaged', this.unstagedFiles, this.unstagedFilesEl);
    }
    await this.updatePushBtn();
  }

  /** Lightweight refresh — only reload staged/unstaged changes, preserve commit state */
  async refreshChanges(): Promise<void> {
    await Promise.all([
      this.loadStagedFiles(),
      this.loadUnstagedFiles(),
    ]);
    // Disable commit button when no staged files
    if (this.commitBtn) {
      this.commitBtn.disabled = this.stagedFiles.length === 0 || !this.commitInput?.value.trim();
    }
    // Re-render expanded sections
    if (this.stagedFilesEl && this.stagedFilesEl.style.display !== 'none') {
      this.renderChangesFiles('staged', this.stagedFiles, this.stagedFilesEl);
    }
    if (this.unstagedFilesEl && this.unstagedFilesEl.style.display !== 'none') {
      this.renderChangesFiles('unstaged', this.unstagedFiles, this.unstagedFilesEl);
    }
  }
}
