import type { DiffViewMode, GitApi, GitFileChange } from './types';
import type { GitUiRefs } from './ui-build';
import { focusable } from './ui-build';

export interface GitDiffCallbacks {
  onFileOpen: (absolutePath: string) => void;
  onStateChange: () => void;
}

/** Commit file tree + diff rendering (right column bottom panel). */
export class DiffView {
  fileChanges: GitFileChange[] = [];
  selectedFilePath: string | null = null;
  diffContent = '';
  selectedCommitHash: string | null = null;
  diffViewMode: DiffViewMode = 'unified';

  private api: GitApi;
  private wsPath: string;
  private fileTreeContainer: HTMLDivElement;
  private diffContainer: HTMLDivElement;
  private emptyDiff: HTMLDivElement;
  private callbacks: GitDiffCallbacks;

  constructor(api: GitApi, wsPath: string, refs: GitUiRefs, callbacks: GitDiffCallbacks) {
    this.api = api;
    this.wsPath = wsPath;
    this.fileTreeContainer = refs.fileTreeContainer;
    this.diffContainer = refs.diffContainer;
    this.emptyDiff = refs.emptyDiff;
    this.callbacks = callbacks;
  }

  renderFileTree(): void {
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
      focusable(item);
      this.fileTreeContainer.appendChild(item);
    }
  }

  async selectFile(filePath: string): Promise<void> {
    this.selectedFilePath = filePath;
    this.renderFileTree();
    try { this.callbacks.onFileOpen?.(this.wsPath + '/' + filePath); } catch {}
    if (this.selectedCommitHash) {
      const diff = await this.api.git.diff(this.wsPath, this.selectedCommitHash, filePath) || '';
      this.diffContent = diff;
    }
    this.renderDiff();
  }

  renderDiff(): void {
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

  renderUnified(): void {
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

  renderSideBySide(): void {
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

  appendSideBySideRow(oldText: string, newText: string, oldNum: string, newNum: string, klass: string): void {
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

  setDiffContent(diff: string): void {
    this.diffContent = diff;
  }

  clearSelection(): void {
    this.selectedFilePath = null;
    this.diffContent = '';
    this.renderDiff();
  }

  clearFileTree(): void {
    this.fileTreeContainer.innerHTML = '';
  }
}
