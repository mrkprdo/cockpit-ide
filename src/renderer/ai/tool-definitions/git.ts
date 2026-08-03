// git-domain AI tools: status/diff/log/stage/unstage/commit/push/branches/
// checkout (refactor.md §A.4 tool-definitions split).

import type { ToolDefinition } from '../types';
import {
  GitRepoArgs, GitDiffArgs, GitLogArgs, GitFileArgs, GitCommitArgs, GitCheckoutArgs,
} from './schemas';
import { DIFF_LENGTH } from './schemas';
import { getRepoPath } from './helpers';

export const gitStatusTool: ToolDefinition<typeof GitRepoArgs> = {
  name: 'git_status',
  description: 'Get current git status: branch, staged files, unstaged files.',
  parameters: GitRepoArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const [branch, staged, unstaged] = await Promise.all([
      ctx.electronAPI.git.currentBranch(repo),
      ctx.electronAPI.git.stagedFiles(repo),
      ctx.electronAPI.git.unstagedFiles(repo),
    ]);
    return JSON.stringify({ branch, staged, unstaged }, null, 2);
  },
};

export const gitDiffTool: ToolDefinition<typeof GitDiffArgs> = {
  name: 'git_diff',
  description: 'Get unstaged diff for the repo or a specific file.',
  parameters: GitDiffArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    if (args.file_path) {
      const diff = await ctx.electronAPI.git.unstagedDiff(repo, args.file_path);
      return diff || 'No diff';
    }
    const unstaged = await ctx.electronAPI.git.unstagedFiles(repo);
    if (!unstaged?.length) return 'No unstaged changes';
    const diffs = await Promise.all(
      unstaged.slice(0, 5).map(f =>
        ctx.electronAPI.git.unstagedDiff(repo, f.path).then(d => `--- ${f.path} ---\n${d}`)
      )
    );
    return diffs.filter(Boolean).join('\n\n').slice(0, DIFF_LENGTH) || 'No diff';
  },
};

export const gitLogTool: ToolDefinition<typeof GitLogArgs> = {
  name: 'git_log',
  description: 'Get recent git commit history.',
  parameters: GitLogArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const log = await ctx.electronAPI.git.log(repo, args.max_count ?? 10);
    return log ? JSON.stringify(log, null, 2) : 'No log';
  },
};

export const gitStageTool: ToolDefinition<typeof GitFileArgs> = {
  name: 'git_stage',
  description: 'Stage a file for commit.',
  parameters: GitFileArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const ok = await ctx.electronAPI.git.stage(repo, args.file_path);
    return ok ? `Staged: ${args.file_path}` : `Failed to stage: ${args.file_path}`;
  },
};

export const gitUnstageTool: ToolDefinition<typeof GitFileArgs> = {
  name: 'git_unstage',
  description: 'Unstage a file (remove from staging area).',
  parameters: GitFileArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const ok = await ctx.electronAPI.git.unstage(repo, args.file_path);
    return ok ? `Unstaged: ${args.file_path}` : `Failed to unstage: ${args.file_path}`;
  },
};

export const gitCommitTool: ToolDefinition<typeof GitCommitArgs> = {
  name: 'git_commit',
  description: 'Commit staged changes with a message.',
  parameters: GitCommitArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const ok = await ctx.electronAPI.git.commit(repo, args.message);
    return ok ? `Committed: "${args.message}"` : 'Commit failed';
  },
};

export const gitPushTool: ToolDefinition<typeof GitRepoArgs> = {
  name: 'git_push',
  description: 'Push committed changes to the remote.',
  parameters: GitRepoArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const ok = await ctx.electronAPI.git.push(repo);
    return ok ? 'Pushed successfully' : 'Push failed';
  },
};

export const gitBranchesTool: ToolDefinition<typeof GitRepoArgs> = {
  name: 'git_branches',
  description: 'List all git branches (local and remote).',
  parameters: GitRepoArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const branches = await ctx.electronAPI.git.branches(repo);
    return branches ? JSON.stringify(branches, null, 2) : 'No branches';
  },
};

export const gitCheckoutTool: ToolDefinition<typeof GitCheckoutArgs> = {
  name: 'git_checkout',
  description: 'Switch to a git branch.',
  parameters: GitCheckoutArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const ok = await ctx.electronAPI.git.checkout(repo, args.branch);
    return ok ? `Checked out: ${args.branch}` : `Failed to checkout: ${args.branch}`;
  },
};
