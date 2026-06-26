---
name: Git Plugin
file: src/renderer/components/GitPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [GitState, GitPlugin]
---

# Git Plugin

Full-featured Git management plugin providing branch switching, commit history browsing, staging/unstaging files, diff viewing (staged and unstaged), commit message composition, and push to remote. UI has three panels: branch selector with branch list, changes list (staged/unstaged files with diffs), and commit history log. Auto-refreshes on file changes and debounces git operations to avoid overwhelming the git process.

## Dependencies

None — uses only IPC bridge for git operations.

## Referenced By

- **canvas-area** `src/renderer/components/CanvasArea.ts` — creates git cards

## IPC Channels

- `git:remotes` — lists remote repositories
- `git:branches` — lists local and remote branches
- `git:checkout` — switches to branch
- `git:log` — retrieves commit history (last 50)
- `git:showTree` — shows file tree at a specific commit
- `git:diff` — shows diff for commit + file
- `git:currentBranch` — gets current branch name
- `git:stagedFiles` — lists staged changed files
- `git:unstagedFiles` — lists unstaged changed files
- `git:stagedDiff` — shows diff for staged file
- `git:unstagedDiff` — shows diff for unstaged file
- `git:commitBody` — retrieves full commit message body
- `git:stage` — stages a file
- `git:unstage` — unstages a file
- `git:commit` — commits staged changes with message
- `git:push` — pushes to remote
- `git:checkAhead` — checks if local is ahead of remote
- `file:changed` — listener for auto-refresh on file changes

## Interface

### Types

- **GitState** — `{ currentBranch: string; stagedFiles: string[]; unstagedFiles: string[]; commitMessage: string }`

### Classes

- **GitPlugin**
  - **constructor** `(container: HTMLElement): GitPlugin` — builds branch selector, changes panel, log panel
  - **refresh** `(): Promise<void>` — reloads git state from repository
  - **stageFile** `(filePath: string): Promise<void>` — stage a file
  - **unstageFile** `(filePath: string): Promise<void>` — unstage a file
  - **commit** `(message: string): Promise<void>` — commit staged changes
  - **push** `(): Promise<void>` — push current branch
  - **switchBranch** `(branch: string): Promise<void>` — checkout branch
  - **showDiff** `(filePath: string, staged: boolean): Promise<void>` — show file diff
  - **destroy** `(): void` — cleans up listeners
  - **onFocus** — callback `() => void`
  - **onClose** — callback `() => void`

## State

Serialized as `GitState` with current branch, staged/unstaged file lists, and commit message draft. Restored on workspace load.

## Lifecycle

- **created_by:** `CanvasArea.createGit()` on Git menu/toolbar action
- **destroyed_by:** card close → remove listeners

## External Dependencies

None beyond simple-git (wrapped in main process IPC).

## Test

`src/renderer/components/GitPlugin.test.ts`
