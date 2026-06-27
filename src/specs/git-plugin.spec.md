---
name: Git Plugin
file: src/renderer/components/GitPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [GitPlugin, GitState]
---

# Git Plugin

Git UI card with a split-pane layout: left column (branch/remote selectors, staged/unstaged file lists, commit input bar, commit history) and right column (diff viewer). The left column has a draggable resize handle (clamped 120–600px). The right column is split vertically (top: selected commit info and file tree; bottom: diff content) with a draggable horizontal resize handle. Staged and unstaged file sections are collapsible (click to expand/collapse with arrow indicator). Each change file can be clicked to view its diff. The commit bar includes a message input and Commit/Push buttons; Commit is disabled when no files are staged or message is empty. Branch and remote selectors populate from `git:*` IPC. Auto-refreshes file changes on `file:changed` events (1s debounce). Serializes/restores UI state: selected commit, selected file, diff view mode (unified/side-by-side), splitter sizes, and collapsed sections.

## Dependencies

No imports from `src/`.

## Referenced By

- **Canvas Area** `src/renderer/components/CanvasArea.ts` — instantiates GitPlugin per git card

## IPC Channels

- `git:remotes` — list remotes for the workspace repo
- `git:branches` — list branches
- `git:checkout` — switch branch
- `git:log` — commit history
- `git:showTree` — file tree for a commit
- `git:diff` — diff for a commit/file
- `git:currentBranch` — current branch name
- `git:stagedFiles` — list staged changes
- `git:unstagedFiles` — list unstaged changes
- `git:stagedDiff` — diff for a staged file
- `git:unstagedDiff` — diff for an unstaged file
- `git:commitBody` — full commit message body
- `git:stage` — stage a file
- `git:unstage` — unstage a file
- `git:commit` — commit staged changes
- `git:push` — push commits
- `git:checkAhead` — check if local is ahead of remote
- `file:changed` — auto-refresh changes on external file modifications
