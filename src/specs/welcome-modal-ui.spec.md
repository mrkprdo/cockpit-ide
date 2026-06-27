---
name: Welcome Modal UI
parent: welcome-modal
---

# Welcome Modal UI

Startup workspace picker overlay.

## DOM Structure

```html
<div class="modal-overlay" style="display:flex">
  <div class="welcome-modal" role="dialog" aria-labelledby="welcome-title">
    <div class="welcome-head">
      <div class="welcome-name" id="welcome-title">COCKPIT IDE</div>
      <div class="welcome-sub">Select a workspace</div>
    </div>
    <div class="welcome-sep"></div>
    <div class="welcome-recent" id="welcome-recent">
      <div class="welcome-recent-title">Recent</div>
      <div class="welcome-recent-item">
        <span class="welcome-recent-item-path">/path/to/workspace</span>
        <button class="welcome-recent-item-remove">×</button>
      </div>
    </div>
    <div class="welcome-sep" id="welcome-recent-sep"></div>
    <div class="welcome-actions">
      <button class="welcome-btn-secondary" id="welcome-close">Close</button>
      <button class="welcome-btn" id="welcome-open">Open Workspace</button>
    </div>
  </div>
</div>
```

## Interactions

### Open Workspace Button
- **trigger:** `click` on `#welcome-open`
- Call `workspace:select` (native directory picker). If path selected, close modal with path.

### Close Button
- **trigger:** `click` on `#welcome-close`
- Close modal with `null` (window will close).

### Recent Item Click
- **trigger:** `click` on `.welcome-recent-item-path`
- If path exists (verified via `fs:readDir`), close modal with that path.

### Recent Item Remove
- **trigger:** `click` on `.welcome-recent-item-remove`
- Call `workspace:removeRecent(path)`, remove item from DOM. Hide recent section if empty.

### Escape
- **trigger:** `Escape` key
- Close modal with `null`.

## States

### Open
- Overlay visible (`display:flex`). Returns a Promise that resolves when a path is chosen.

### Closed
- Overlay hidden. Promise resolved.

### Missing Path
- Recent path that no longer exists: gets `.welcome-recent-item-missing` class (dimmed), not clickable.
