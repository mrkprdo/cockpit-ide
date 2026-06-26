---
name: Git Plugin UI
file: src/renderer/components/GitPlugin.ts
type: ui
layer: plugin
singleton: false
exports: []
---

# Git Plugin UI

UI sub-spec for the Git version control panel: split-pane layout, branch/remote selects, staged/unstaged file lists, commit input, commits history, file tree diff, and unified/side-by-side diff viewer.

## DOM Structure

```json
{
  "root": ".git-split (flex row)",
  "structure": {
    "left_panel": {
      "width": "default 260px, resizable via drag handle",
      "sections": [
        {
          "label": "Branch",
          "element": "select.git-select"
        },
        {
          "label": "Remote",
          "element": "select.git-select"
        },
        {
          "section_separator": true
        },
        {
          "label": "Changes",
          "children": [
            {
              "label": "Staged",
              "collapsible": true,
              "arrow": ".git-collapse-arrow",
              "count": ".git-changes-count",
              "files": ".git-changes-files"
            },
            {
              "label": "Unstaged",
              "collapsible": true,
              "arrow": ".git-collapse-arrow",
              "count": ".git-changes-count",
              "files": ".git-changes-files"
            }
          ]
        },
        {
          "label": "Commit bar",
          "elements": [
            ".git-commit-input",
            ".git-commit-btn",
            ".git-push-btn"
          ]
        },
        {
          "section_separator": true
        },
        {
          "label": "Commits",
          "element": ".git-commits (scrollable list)"
        }
      ]
    },
    "right_panel": {
      "split": "vertical (top/bottom) with draggable horizontal handle",
      "top": ".git-file-tree (file changes list for selected commit)",
      "bottom": ".git-diff-container (diff content viewer)"
    }
  }
}
```

## Interactions

### change on branch select

Calls gitCheckout to switch branch, then refreshes all data

### click on staged/unstaged header

Toggles collapsible section; rotates arrow icon (▸ → ▾)

### click on staged/unstaged file

Calls git:stagedDiff or git:unstagedDiff and displays diff in right panel

### click on commit in list

Fetches commit details (git:showTree) and shows file tree in top-right panel

### click on file in commit tree

Fetches file diff for that commit via git:diff and displays in bottom-right panel

### click on commit button

Stages all unstaged changes, creates commit via git:commit with input message

### click on push button

Pushes committed changes via git:push

### mouse drag on .git-resize (horizontal)

Resizes left/right column split

### mouse drag on vertical resize handle

Resizes top/bottom panel split in right column

### click on diff view mode dropdown

Switches between 'unified' and 'side-by-side' diff display

### keydown Enter on commit input

If message not empty and staged files exist, triggers commit

## States

### loading

First load: fetching branches, remotes, commits, and changes

### commit-selected

A commit is selected; top-right shows file tree, bottom-right shows diff or placeholder

### change-selected

A staged/unstaged file is selected; bottom-right shows its diff

### no-commits

Empty repository or no commits yet

### no-selection

Right panel shows 'Select a commit or file to view diff' placeholder

### changes-expanded

Staged or unstaged section is expanded showing file list

### changes-collapsed

Staged or unstaged section collapsed (arrow pointing right)

