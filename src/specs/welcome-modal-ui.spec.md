---
name: Welcome Modal UI
file: src/renderer/components/WelcomeModal.ts
type: ui
layer: modal
singleton: true
exports: []
---

# Welcome Modal UI

UI sub-spec for the startup workspace selection dialog: branding, recent workspace list with remove buttons, and action buttons.

## DOM Structure

```json
{
  "root": ".modal-overlay (flex, centered)",
  "structure": {
    "modal": ".welcome-modal",
    "children": [
      ".welcome-head: .welcome-name ('COCKPIT IDE') + .welcome-sub ('Select a workspace')",
      ".welcome-sep (separator)",
      ".welcome-recent: title + list of .welcome-recent-item (path + X remove button)",
      ".welcome-sep (conditional separator, hidden when no recents)",
      ".welcome-actions: #welcome-close (Close button) + #welcome-open (Open Workspace button)"
    ]
  }
}
```

## Interactions

### click on .welcome-recent-item

Selects the workspace path and closes modal, returning the path

### click on .welcome-recent-item-remove

Calls workspace.removeRecent(path), removes item from list, hides recent section if empty

### click on #welcome-open

Opens native folder picker via workspace.select(); closes modal with selected path

### click on #welcome-close

Closes modal with null (user cancelled)

### Escape key

Closes modal with null

## States

### with-recents

Recent workspace list visible with clickable items and X remove buttons

### no-recents

Recent section hidden, only Open Workspace and Close buttons visible

### missing-path

Recent item with missing directory shows dimmed text (opacity 0.4)

