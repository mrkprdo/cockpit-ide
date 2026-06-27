---
name: Theme Modal UI
parent: theme-modal
---

# Theme Modal UI

Theme selection dialog with radio groups.

## DOM Structure

```html
<div class="modal-overlay" style="display:flex">
  <div class="modal" role="dialog" aria-label="Theme">
    <div class="modal-header">THEME</div>
    <div class="modal-body">
      <div class="modal-section">
        <div class="modal-label">THEMES</div>
        <label class="modal-radio">
          <input type="radio" name="theme-base" value="default" checked> Default
        </label>
        <label class="modal-radio">
          <input type="radio" name="theme-base" value="monokai"> Monokai
        </label>
        <label class="modal-radio">
          <input type="radio" name="theme-base" value="idol"> Idol
        </label>
      </div>
      <div class="modal-section">
        <div class="modal-label">LIGHT / DARK</div>
        <label class="modal-radio">
          <input type="radio" name="theme-mode" value="dark" checked> Dark
        </label>
        <label class="modal-radio">
          <input type="radio" name="theme-mode" value="light"> Light
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn-ghost" id="theme-cancel">Cancel</button>
        <button class="btn-primary" id="theme-apply">Apply</button>
      </div>
    </div>
  </div>
</div>
```

## Interactions

### Apply Button
- **trigger:** `click` on `#theme-apply`
- Read selected radio values for `theme-base` and `theme-mode`. Call `theme.setTheme(base, mode)`. Close modal.

### Cancel Button
- **trigger:** `click` on `#theme-cancel`
- Close modal without applying.

### Overlay Click
- **trigger:** `click` on `.modal-overlay` background
- Close modal without applying.

### Escape
- **trigger:** `Escape` key
- Close modal without applying.

## States

### Open
- Overlay visible. Radio buttons reflect current `theme.base` and `theme.mode`.

### Closed
- Overlay hidden. `onClose` callback fired (used to unlock canvas).
