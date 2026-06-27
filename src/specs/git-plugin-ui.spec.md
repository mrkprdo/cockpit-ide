---
name: Git Plugin UI
parent: git-plugin
---

# Git Plugin UI

Git card with split-pane layout: left column (branch, changes, commit) and right column (diff viewer).

## DOM Structure

```html
<div class="git-split" style="display:flex;flex-direction:row">
  <div class="git-left" style="width:260px">
    <!-- Branch select -->
    <label>BRANCH</label><select class="git-select"></select>
    <!-- Remote select -->
    <label>REMOTE</label><select class="git-select"></select>
    <div class="git-section-sep"></div>
    <!-- Staged header -->
    <div class="git-changes-item">
      <span class="git-collapse-arrow git-collapse-arrow-closed">▸</span>
      <span class="git-changes-label">Staged</span>
      <span class="git-changes-count">0</span>
    </div>
    <div class="git-changes-files" style="display:none"><!-- staged file rows --></div>
    <!-- Unstaged header -->
    <div class="git-changes-item">
      <span class="git-collapse-arrow git-collapse-arrow-closed">▸</span>
      <span class="git-changes-label">Unstaged</span>
      <span class="git-changes-count">0</span>
    </div>
    <div class="git-changes-files"><!-- unstaged file rows --></div>
    <!-- Commit bar -->
    <div class="git-commit-bar">
      <input class="git-commit-input" placeholder="Commit message…">
      <div class="git-commit-btn-row">
        <button class="git-commit-btn" disabled>Commit</button>
        <button class="git-push-btn" disabled>Push</button>
      </div>
    </div>
    <label>COMMITS</label>
    <div class="git-commits"><!-- commit list --></div>
  </div>
  <div class="git-resize" style="cursor:col-resize"></div>
  <div class="git-right">
    <div class="git-top-panel"><!-- commit info + file tree --></div>
    <div class="git-vresize" style="cursor:row-resize"></div>
    <div class="git-bottom-panel"><!-- diff content --></div>
  </div>
</div>
```

## Interactions

### Branch Change
- **trigger:** `change` on branch `<select>`
- Call `git:checkout` → refresh everything

### Staged/Unstaged Expand
- **trigger:** `click` on `.git-changes-item`
- Toggle `changesExpanded.staged` or `changesExpanded.unstaged`. Show/hide `.git-changes-files`. Rotate arrow icon.

### Stage/Unstage File
- **trigger:** `click` on a staged or unstaged file row
- Call `git:stage` or `git:unstage` → refresh file lists

### Commit
- **trigger:** `click` `.git-commit-btn` or `Enter` in commit input
- Call `git:commit` → refresh

### Push
- **trigger:** `click` `.git-push-btn`
- Call `git:push` → refresh

### Select Commit
- **trigger:** `click` on a commit in the commits list
- Load commit details and file tree in top panel, diff in bottom panel.

### Select File in Commit
- **trigger:** `click` on a file in commit file tree
- Load diff for that file in bottom panel.

## States

### Collapsed/Expanded
- Staged/unstaged sections: arrow ▸ (closed) or ▾ (open), file list hidden/shown.

### Empty States
- No remotes → "No remotes" in select
- No commits → "No commits" in commits list
- No diff selected → Empty diff message in bottom panel.
