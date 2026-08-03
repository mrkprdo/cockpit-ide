import type { DiffViewMode } from './types';

export interface GitUiRefs {
  leftCol: HTMLDivElement;
  rightCol: HTMLDivElement;
  topPanel: HTMLDivElement;
  bottomPanel: HTMLDivElement;
  vResizeHandle: HTMLDivElement;
  remoteSelect: HTMLSelectElement;
  branchSelect: HTMLSelectElement;
  commitsContainer: HTMLDivElement;
  fileTreeContainer: HTMLDivElement;
  diffContainer: HTMLDivElement;
  emptyDiff: HTMLDivElement;
  dropdownBtn: HTMLButtonElement;
  dropdownMenu: HTMLDivElement;
  unifiedItem: HTMLDivElement;
  sideBySideItem: HTMLDivElement;
  stagedHeader: HTMLDivElement;
  unstagedHeader: HTMLDivElement;
  stagedFilesEl: HTMLDivElement;
  unstagedFilesEl: HTMLDivElement;
  stagedArrow: HTMLSpanElement;
  unstagedArrow: HTMLSpanElement;
  stagedCount: HTMLSpanElement;
  unstagedCount: HTMLSpanElement;
  commitInfoEl: HTMLDivElement;
  commitInput: HTMLInputElement;
  commitBtn: HTMLButtonElement;
  pushBtn: HTMLButtonElement;
  statusMsgEl: HTMLDivElement;
  stageAllBtn: HTMLButtonElement;
  unstageAllBtn: HTMLButtonElement;
}

export interface GitUiCallbacks {
  onBranchChange: () => void;
  toggleChanges: (mode: 'staged' | 'unstaged') => void;
  stageAll: () => void | Promise<void>;
  unstageAll: () => void | Promise<void>;
  handleCommit: () => void | Promise<void>;
  handlePush: () => void | Promise<void>;
  setDiffViewMode: (mode: DiffViewMode) => void;
  toggleDropdown: () => void;
  closeDropdown: () => void;
  onStateChange: () => void;
  onCommitInput: () => void;
}

export function labelEl(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'git-label';
  el.textContent = text;
  return el;
}

/** Make a clickable row reachable, activatable, and identifiable by keyboard/AT */
export function focusable(el: HTMLElement): void {
  el.tabIndex = 0;
  if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      el.click();
    }
  });
}

/**
 * Builds the entire GitPlugin DOM: split panes, drag/resize handles, navigation
 * selects, changes lists, commit bar, commits list, diff header/dropdown and
 * empty-diff placeholder. All interactive events call back into the facade via
 * `callbacks`.
 */
export function buildUi(container: HTMLDivElement, callbacks: GitUiCallbacks): GitUiRefs {
  // ─── Split panes ───
  const leftCol = document.createElement('div');
  leftCol.className = 'git-left';

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'git-resize';

  const rightCol = document.createElement('div');
  rightCol.className = 'git-right';

  // Horizontal (left column) resize logic
  let isDragging = false;
  let startX = 0;
  let startW = 260;
  resizeHandle.addEventListener('mouseenter', () => {
    if (!isDragging) { resizeHandle.style.background = 'var(--accent)'; resizeHandle.style.opacity = '0.5'; }
  });
  resizeHandle.addEventListener('mouseleave', () => {
    if (!isDragging) { resizeHandle.style.background = 'var(--border)'; resizeHandle.style.opacity = ''; }
  });
  resizeHandle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startW = leftCol.offsetWidth;
    resizeHandle.style.background = 'var(--accent)';
    resizeHandle.style.opacity = '0.8';
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const newW = Math.max(120, Math.min(600, startW + dx));
    leftCol.style.width = newW + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      callbacks.onStateChange();
      resizeHandle.style.background = 'var(--border)';
      resizeHandle.style.opacity = '';
    }
  });

  container.appendChild(leftCol);
  container.appendChild(resizeHandle);
  container.appendChild(rightCol);

  // ─── Left panel ───

  // Navigation: Branch (primary) then Remote
  const branchLabel = labelEl('Branch');
  leftCol.appendChild(branchLabel);
  const branchSelect = document.createElement('select');
  branchSelect.className = 'git-select';
  branchSelect.addEventListener('change', () => callbacks.onBranchChange());
  leftCol.appendChild(branchSelect);

  const remoteLabel = labelEl('Remote');
  leftCol.appendChild(remoteLabel);
  const remoteSelect = document.createElement('select');
  remoteSelect.className = 'git-select';
  remoteSelect.addEventListener('change', () => { /* display only */ });
  leftCol.appendChild(remoteSelect);

  const navSep = document.createElement('div');
  navSep.className = 'git-section-sep';
  leftCol.appendChild(navSep);

  // Changes section
  const changesLabel = labelEl('Changes');
  leftCol.appendChild(changesLabel);

  // Staged header + files (index 0 — tests depend on this order)
  const stagedHeader = document.createElement('div');
  stagedHeader.className = 'git-changes-item';
  const stagedArrow = document.createElement('span');
  stagedArrow.className = 'git-collapse-arrow git-collapse-arrow-closed';
  stagedArrow.textContent = '▸';
  stagedHeader.appendChild(stagedArrow);
  const stagedLabel = document.createElement('span');
  stagedLabel.className = 'git-changes-label';
  stagedLabel.textContent = 'Staged';
  const stagedCount = document.createElement('span');
  stagedCount.className = 'git-changes-count';
  stagedHeader.appendChild(stagedLabel);
  stagedHeader.appendChild(stagedCount);
  const unstageAllBtn = document.createElement('button');
  unstageAllBtn.className = 'git-changes-action git-changes-all';
  unstageAllBtn.textContent = '− all';
  unstageAllBtn.title = 'Unstage all files';
  unstageAllBtn.style.display = 'none';
  unstageAllBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await callbacks.unstageAll();
  });
  stagedHeader.appendChild(unstageAllBtn);
  focusable(stagedHeader);
  leftCol.appendChild(stagedHeader);

  const stagedFilesEl = document.createElement('div');
  stagedFilesEl.className = 'git-changes-files';
  stagedFilesEl.style.display = 'none';
  leftCol.appendChild(stagedFilesEl);

  stagedHeader.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.toggleChanges('staged');
  });

  // Unstaged header + files (index 1)
  const unstagedHeader = document.createElement('div');
  unstagedHeader.className = 'git-changes-item';
  const unstagedArrow = document.createElement('span');
  unstagedArrow.className = 'git-collapse-arrow git-collapse-arrow-closed';
  unstagedArrow.textContent = '▸';
  unstagedHeader.appendChild(unstagedArrow);
  const unstagedLabel = document.createElement('span');
  unstagedLabel.className = 'git-changes-label';
  unstagedLabel.textContent = 'Unstaged';
  const unstagedCount = document.createElement('span');
  unstagedCount.className = 'git-changes-count';
  unstagedHeader.appendChild(unstagedLabel);
  unstagedHeader.appendChild(unstagedCount);
  const stageAllBtn = document.createElement('button');
  stageAllBtn.className = 'git-changes-action git-changes-all';
  stageAllBtn.textContent = '+ all';
  stageAllBtn.title = 'Stage all files';
  stageAllBtn.style.display = 'none';
  stageAllBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await callbacks.stageAll();
  });
  unstagedHeader.appendChild(stageAllBtn);
  focusable(unstagedHeader);
  leftCol.appendChild(unstagedHeader);

  const unstagedFilesEl = document.createElement('div');
  unstagedFilesEl.className = 'git-changes-files';
  leftCol.appendChild(unstagedFilesEl);

  unstagedHeader.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.toggleChanges('unstaged');
  });

  // Commit bar below staged/unstaged — natural workflow: see changes → write message → commit/push
  const commitBar = document.createElement('div');
  commitBar.className = 'git-commit-bar';
  const commitInput = document.createElement('input');
  commitInput.className = 'git-commit-input';
  commitInput.type = 'text';
  commitInput.placeholder = 'Commit message…';
  commitInput.addEventListener('input', () => {
    callbacks.onCommitInput();
  });
  commitInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && commitInput.value.trim()) {
      e.stopPropagation();
      callbacks.handleCommit();
    }
  });
  commitBar.appendChild(commitInput);

  const commitBtnRow = document.createElement('div');
  commitBtnRow.className = 'git-commit-btn-row';
  const commitBtn = document.createElement('button');
  commitBtn.className = 'git-commit-btn';
  commitBtn.textContent = 'Commit';
  commitBtn.disabled = true;
  commitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.handleCommit();
  });
  const pushBtn = document.createElement('button');
  pushBtn.className = 'git-push-btn';
  pushBtn.textContent = 'Push';
  pushBtn.disabled = true;
  pushBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.handlePush();
  });
  commitBtnRow.appendChild(commitBtn);
  commitBtnRow.appendChild(pushBtn);
  commitBar.appendChild(commitBtnRow);
  const statusMsgEl = document.createElement('div');
  statusMsgEl.className = 'git-op-status';
  statusMsgEl.style.display = 'none';
  commitBar.appendChild(statusMsgEl);
  leftCol.appendChild(commitBar);

  // Commits section
  const commitsHeader = labelEl('Commits');
  leftCol.appendChild(commitsHeader);

  const commitsContainer = document.createElement('div');
  commitsContainer.className = 'git-commits';
  leftCol.appendChild(commitsContainer);

  // ─── Right panel ───
  const topPanel = document.createElement('div');
  topPanel.className = 'git-top-panel';
  rightCol.appendChild(topPanel);

  const filesHeader = labelEl('Changed Files');
  topPanel.appendChild(filesHeader);

  const commitInfoEl = document.createElement('div');
  commitInfoEl.className = 'git-commit-info';
  commitInfoEl.style.display = 'none';
  topPanel.appendChild(commitInfoEl);

  const fileTreeContainer = document.createElement('div');
  fileTreeContainer.className = 'git-filetree';
  topPanel.appendChild(fileTreeContainer);

  // Horizontal resize handle
  const vResizeHandle = document.createElement('div');
  vResizeHandle.className = 'git-resize git-resize-h';
  rightCol.appendChild(vResizeHandle);

  const bottomPanel = document.createElement('div');
  bottomPanel.className = 'git-bottom-panel';
  rightCol.appendChild(bottomPanel);

  // Diff header with view mode dropdown
  const diffHeaderRow = document.createElement('div');
  diffHeaderRow.className = 'git-diff-header';

  const diffLabel = document.createElement('div');
  diffLabel.className = 'git-label git-diff-header-label';
  diffLabel.textContent = 'Diff';
  diffHeaderRow.appendChild(diffLabel);

  const btnWrap = document.createElement('div');
  btnWrap.className = 'git-diff-btn-wrap';

  const dropdownBtn = document.createElement('button');
  dropdownBtn.className = 'git-diff-btn';
  dropdownBtn.title = 'Switch diff view mode';
  dropdownBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
  dropdownBtn.addEventListener('click', (e) => { e.stopPropagation(); callbacks.toggleDropdown(); });

  const dropdownMenu = document.createElement('div');
  dropdownMenu.className = 'git-diff-dropdown';
  dropdownMenu.style.display = 'none';

  const unifiedItem = document.createElement('div');
  unifiedItem.className = 'git-diff-dropdown-item is-active';
  unifiedItem.textContent = 'View unified';
  unifiedItem.addEventListener('click', () => { callbacks.setDiffViewMode('unified'); callbacks.closeDropdown(); });
  focusable(unifiedItem);

  const sideBySideItem = document.createElement('div');
  sideBySideItem.className = 'git-diff-dropdown-item';
  sideBySideItem.textContent = 'View side by side';
  sideBySideItem.addEventListener('click', () => { callbacks.setDiffViewMode('side-by-side'); callbacks.closeDropdown(); });
  focusable(sideBySideItem);

  dropdownMenu.appendChild(unifiedItem);
  dropdownMenu.appendChild(sideBySideItem);
  btnWrap.appendChild(dropdownBtn);
  btnWrap.appendChild(dropdownMenu);
  diffHeaderRow.appendChild(btnWrap);
  bottomPanel.appendChild(diffHeaderRow);

  const emptyDiff = document.createElement('div');
  emptyDiff.className = 'git-diff-empty';
  emptyDiff.textContent = 'Select a file to view diff';
  const diffContainer = document.createElement('div');
  diffContainer.className = 'git-diff';
  diffContainer.style.display = 'none';

  bottomPanel.appendChild(diffContainer);
  bottomPanel.appendChild(emptyDiff);

  // Vertical divider resize logic
  let isVDragging = false;
  let startY = 0;
  let startH = 200;
  vResizeHandle.addEventListener('mouseenter', () => {
    if (!isVDragging) { vResizeHandle.style.background = 'var(--accent)'; vResizeHandle.style.opacity = '0.5'; }
  });
  vResizeHandle.addEventListener('mouseleave', () => {
    if (!isVDragging) { vResizeHandle.style.background = 'var(--border)'; vResizeHandle.style.opacity = ''; }
  });
  vResizeHandle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    isVDragging = true;
    startY = e.clientY;
    startH = topPanel.offsetHeight;
    vResizeHandle.style.background = 'var(--accent)';
    vResizeHandle.style.opacity = '0.8';
  });
  document.addEventListener('mousemove', (e) => {
    if (!isVDragging) return;
    const dy = e.clientY - startY;
    const total = rightCol.offsetHeight - vResizeHandle.offsetHeight;
    const newH = Math.max(40, Math.min(total - 40, startH + dy));
    topPanel.style.flex = 'none';
    topPanel.style.height = newH + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (isVDragging) {
      isVDragging = false;
      callbacks.onStateChange();
      vResizeHandle.style.background = 'var(--border)';
      vResizeHandle.style.opacity = '';
    }
  });

  return {
    leftCol,
    rightCol,
    topPanel,
    bottomPanel,
    vResizeHandle,
    remoteSelect,
    branchSelect,
    commitsContainer,
    fileTreeContainer,
    diffContainer,
    emptyDiff,
    dropdownBtn,
    dropdownMenu,
    unifiedItem,
    sideBySideItem,
    stagedHeader,
    unstagedHeader,
    stagedFilesEl,
    unstagedFilesEl,
    stagedArrow,
    unstagedArrow,
    stagedCount,
    unstagedCount,
    commitInfoEl,
    commitInput,
    commitBtn,
    pushBtn,
    statusMsgEl,
    stageAllBtn,
    unstageAllBtn,
  };
}
