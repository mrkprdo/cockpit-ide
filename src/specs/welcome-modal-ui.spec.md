---
name: Welcome Modal UI
parent: welcome-modal
---

# Welcome Modal UI

DOM structure, workspace selection interactions, and states for the startup WelcomeModal.

## DOM Structure

```
.modal-overlay | position: fixed; inset: 0; z-index: 1000
└── .welcome-modal | centered, max-width: 500px
    ├── .welcome-header
    │   ├── .welcome-logo (SVG circles icon)
    │   └── .welcome-title "Cockpit IDE"
    ├── .welcome-body
    │   ├── button.open-folder "Select Workspace Folder"
    │   └── .recent-workspaces (conditional)
    │       ├── .recent-header "Recent Workspaces"
    │       └── .recent-list
    │           └── .recent-item[] (one per recent workspace)
    │               ├── .recent-path (directory path)
    │               └── button.recent-remove (× remove button)
    └── .welcome-footer
        └── .welcome-version "v0.0.1"
```

## Interactions

### Open Workspace (Native Picker)

- **trigger:** Click "Select Workspace Folder" button
- `workspace:select` IPC → native OS directory picker dialog
- On selection → `onSelect(path)` callback → App sets workspace and closes WelcomeModal
- **result:** Workspace loaded, canvas populated with saved state (if any)

### Open Recent Workspace

- **trigger:** Click on `.recent-item` row
- `onSelect(path)` callback with the workspace path
- **result:** Workspace opens directly without native dialog

### Remove Recent Entry

- **trigger:** Click × button on `.recent-item`
- `workspace:removeRecent` IPC with path
- Remove entry from DOM list
- **result:** Entry removed from recent workspaces

### Dismiss (Escape / Overlay Click)

- **trigger:** Click on `.modal-overlay` background or press Escape
- If no workspace selected → app continues with last workspace (if available)
- **result:** Modal closes

## States

### Open

Modal overlay visible with fade-in animation, input focused on "Select Folder" button.

### Loading Recent

Recent list shows spinner while `workspace:getRecent` IPC resolves.

### Recent List Populated

Recent workspaces displayed as clickable rows with remove buttons.

### No Recent Workspaces

Recent section hidden entirely, only "Select Folder" button visible.

### Closing

Fade-out animation (200ms), modal removed or hidden via `display: none`.

## Accessibility

- **Escape:** Closes modal
- **Tab order:** Select Folder → Recent items → Remove buttons
- **Enter:** Activates focused button/recent item
