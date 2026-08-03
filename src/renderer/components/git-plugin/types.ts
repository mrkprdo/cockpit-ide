export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface GitFileChange {
  status: string;
  path: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  isRemote: boolean;
}

export interface GitRemote {
  name: string;
  url: string;
}

export type DiffViewMode = 'unified' | 'side-by-side';

export type GitState = {
  selectedCommitHash: string | null;
  selectedFilePath: string | null;
  diffViewMode: DiffViewMode;
  leftColWidth: number;
  topPanelHeight: number;
  changesExpanded: { staged: boolean; unstaged: boolean };
} | null;

export type GitApi = Window['electronAPI'];
