import type { GitApi, GitBranch, GitCommit, GitFileChange, GitRemote } from './types';
import type { GitUiRefs } from './ui-build';
import { focusable } from './ui-build';

export interface GitHistoryCallbacks {
  onStateChange: () => void;
  onClearChangesSelection: () => void;
  onCommitFiles: (files: GitFileChange[]) => void;
}

/** Branches / remotes / commit list + commit detail panel (right column top). */
export class HistoryPanel {
  remotes: GitRemote[] = [];
  branches: GitBranch[] = [];
  commits: GitCommit[] = [];
  selectedCommitHash: string | null = null;
  currentBranchName = '';

  private api: GitApi;
  private wsPath: string;
  private remoteSelect: HTMLSelectElement;
  private branchSelect: HTMLSelectElement;
  private commitsContainer: HTMLDivElement;
  private commitInfoEl: HTMLDivElement;
  private callbacks: GitHistoryCallbacks;

  constructor(api: GitApi, wsPath: string, refs: GitUiRefs, callbacks: GitHistoryCallbacks) {
    this.api = api;
    this.wsPath = wsPath;
    this.remoteSelect = refs.remoteSelect;
    this.branchSelect = refs.branchSelect;
    this.commitsContainer = refs.commitsContainer;
    this.commitInfoEl = refs.commitInfoEl;
    this.callbacks = callbacks;
  }

  async loadRemotes(): Promise<void> {
    const r = await this.api.git.remotes(this.wsPath) || [];
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

  async loadBranches(): Promise<void> {
    const b = await this.api.git.branches(this.wsPath) || [];
    this.branches = b;
    this.currentBranchName = b.find(br => br.current)?.name || '';
    if (this.branchSelect) {
      this.branchSelect.innerHTML = '';
      const local = b.filter(br => !br.isRemote);
      const remote = b.filter(br => br.isRemote);
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

  async loadCommits(): Promise<void> {
    const c = await this.api.git.log(this.wsPath, 50) || [];
    this.commits = c;
    this.renderCommits();
  }

  renderCommits(): void {
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
      focusable(item);
      this.commitsContainer.appendChild(item);
    }
  }

  async selectCommit(hash: string): Promise<void> {
    this.selectedCommitHash = hash;
    this.callbacks.onClearChangesSelection?.();
    this.renderCommits();

    const commit = this.commits.find(c => c.hash === hash);
    if (commit && this.commitInfoEl) {
      const body = await this.api.git.commitBody(this.wsPath, hash) || '';
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

    const files = await this.api.git.showTree(this.wsPath, hash) || [];
    this.callbacks.onCommitFiles?.(files);
  }

  clearSelection(): void {
    this.selectedCommitHash = null;
    if (this.commitInfoEl) this.commitInfoEl.style.display = 'none';
    if (this.commitsContainer) {
      this.commitsContainer.querySelectorAll('.git-commit-item.is-selected').forEach(el => el.classList.remove('is-selected'));
    }
  }

  async refreshBranchesRemotes(): Promise<void> {
    await Promise.all([this.loadRemotes(), this.loadBranches()]);
  }
}
