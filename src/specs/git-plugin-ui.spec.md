---
name: Git Plugin UI
parent: git-plugin
---

# Git Plugin UI

DOM structure, branch management, staging, commit, and diff interactions for the Git management plugin.

## DOM Structure

```
.card-body (PluginCard body container)
└── .git-layout | display: flex; flex-direction: column
    ├── .git-toolbar | flex row
    │   ├── .git-branch-selector (dropdown: current branch + branch list)
    │   ├── button.refresh (refresh git state)
    │   ├── button.stage-all (stage all changes)
    │   └── button.unstage-all (unstage all changes)
    ├── .git-panels | display: flex; flex: 1
    │   ├── .git-changes-panel | flex: 1
    │   │   ├── .git-section-staged
    │   │   │   ├── .git-section-header "Staged Changes"
    │   │   │   └── .git-file-item[] (staged file rows)
    │   │   └── .git-section-unstaged
    │   │       ├── .git-section-header "Changes"
    │   │       └── .git-file-item[] (unstaged file rows)
    │   └── .git-diff-panel | flex: 1
    │       └── .git-diff-content (Monaco diff editor or pre block)
    └── .git-commit-area
        ├── textarea.git-commit-message (commit message input)
        └── button.commit (commit button, shows staged count)
```

## Interactions

### Branch Switch

- **trigger:** Select branch from `.git-branch-selector` dropdown
- On change → `git:checkout` IPC with branch name
- Refresh all panels after checkout
- **result:** Working directory updates to selected branch, all panels refresh

### Refresh

- **trigger:** Click `.refresh` button or `file:changed` listener
- `git:stagedFiles` + `git:unstagedFiles` + `git:currentBranch` IPC calls
- Update file lists and branch display
- **result:** Git state synchronized with repository

### Stage File

- **trigger:** Click `+` icon or right-click → Stage on unstaged file row
- `git:stage` IPC with file path
- File moves from "Changes" to "Staged Changes" list
- Refresh diff panel to show updated status
- **result:** File staged for commit

### Unstage File

- **trigger:** Click `-` icon or right-click → Unstage on staged file row
- `git:unstage` IPC with file path
- File moves from "Staged Changes" back to "Changes" list
- **result:** File unstaged

### View Diff

- **trigger:** Click on a file row in staged or unstaged section
- For staged: `git:stagedDiff` IPC with file path
- For unstaged: `git:unstagedDiff` IPC with file path
- Render diff in `.git-diff-panel` using Monaco diff editor or syntax-highlighted `<pre>` block
- **result:** File diff displayed in right panel with +/− line highlighting

### Commit

- **trigger:** Click `.commit` button
- Commit message from `textarea.git-commit-message`
- `git:commit` IPC with message
- Clear commit message textarea
- Refresh all panels
- **result:** Staged changes committed, working tree updated

### Push

- **trigger:** Click Push button in toolbar
- `git:push` IPC
- Check ahead status via `git:checkAhead`
- Show success/error notification
- **result:** Commits pushed to remote

### Commit History

- **trigger:** Click History tab or button
- `git:log` IPC (last 50 commits)
- Render commit list with hash, author, date, message
- Click commit → `git:showTree` for file tree, `git:diff` for file changes
- **result:** Full commit browsing with drill-down to file-level diffs

## States

### Loading

Spinner shown while git operations (checkout, commit, push) are in progress.

### Clean (No Changes)

Both staged and unstaged sections show "Nothing to commit, working tree clean" message.

### Uncommitted Changes

Unstaged section populated with changed files, commit button enabled but shows "(0 staged)".

### Staged Changes

Staged section populated, commit button enabled showing staged file count, "Commit N files" label.

### In Operation

Branch switch / commit / push in progress — toolbar buttons disabled, spinner visible, status text "Switching branch...".

### Error

Error message displayed if git operation fails (merge conflict, network error, no remote).

### Empty Repository

"No commits yet" message in history panel, commit area prompts for initial commit.

## Accessibility

- **Tab order:** Branch selector → staged/unstaged file lists → diff → commit message → commit button
- **Keyboard:** Enter on file row views diff, Space stages/unstages
