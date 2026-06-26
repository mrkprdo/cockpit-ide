---
name: Git Plugin
file: src/renderer/components/GitPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [GitPlugin, GitState]
---

# Git Plugin

Git version control UI plugin. Displays branch selector with remote dropdown, staged/unstaged file lists with collapsible sections, commit message input with Commit/Push buttons, commits history list with file tree on select, unified or side-by-side diff view, and split-pane layout with draggable left column and top/bottom panel resize. Auto-refreshes changes on file system changes. Supports session state restore (selected commit, file, diff mode, panel sizes, collapsible expansion).

## Referenced By

- [[canvas-area.spec.md|canvas-area]] `src/renderer/components/CanvasArea.ts`

## IPC Channels

- `git:remotes`
- `git:branches`
- `git:checkout`
- `git:log`
- `git:showTree`
- `git:diff`
- `git:currentBranch`
- `git:stagedFiles`
- `git:unstagedFiles`
- `git:stagedDiff`
- `git:unstagedDiff`
- `git:commitBody`
- `git:stage`
- `git:unstage`
- `git:commit`
- `git:push`
- `git:checkAhead`

## Interface

### Methods

- **constructor** `(container: HTMLElement, wsPath: string)` — Builds left/right split UI with branch select, changes, commits, diff view
- **refresh** `(): Promise<void>` — Fetches remotes, branches, commits, staged/unstaged files from main process
- **getState** `(): GitState` — Returns serializable state (selected commit, file, diff mode, panel sizes)
- **restoreState** `(state: GitState): Promise<void>` — Restores layout, selected commit, file, and diff mode from saved state
- **applyLayout** `(state: GitState): void` — Sync applies splitter sizes without delay
- **destroy** `(): void` — Cleans up file change watcher

### Properties

- **onStateChange**: (() => void) | null — Callback fired when internal state changes
- **onFileOpen**: ((filePath: string) => void) | null — Callback to open a file in the editor from diff view

## Lifecycle

- **created_by:** CanvasArea.addGit()
- **destroyed_by:** CanvasArea.terminateCard()

