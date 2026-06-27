---
name: Context Menu UI
parent: context-menu
---

# Context Menu UI

Floating right-click overlay with item list.

## DOM Structure

```html
<div class="ctx-menu" style="left: Xpx; top: Ypx;">
  <div class="ctx-item">Label</div>
  <div class="ctx-sep"></div>
  <div class="ctx-item ctx-disabled">Disabled</div>
</div>
```

## Interactions

### Item Click
- **trigger:** `click` on `.ctx-item` (not `.ctx-disabled`)
- Fire `item.action()`, call `remove()` to destroy menu.

### Outside Click
- **trigger:** `click` on `document`
- Call `remove()` to destroy menu. Registered on next tick after construction.

## States

### Open
- Menu appended to `document.body`, positioned at (x, y).

### Closed
- Menu removed from DOM. `onClose` callback fired.
