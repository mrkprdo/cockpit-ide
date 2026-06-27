---
name: Top Bar UI
parent: top-bar
---

# Top Bar UI

Custom menu bar with dropdown menus.

## DOM Structure

```html
<div class="menu-bar" role="menubar">
  <div class="menu-item" role="menuitem" tabindex="0" aria-haspopup="true">
    File
    <div class="menu-dropdown" role="menu">
      <div class="menu-dropdown-item" role="menuitem" tabindex="-1">Open Workspace</div>
      <div class="menu-dropdown-separator" role="separator"></div>
      <div class="menu-dropdown-item" role="menuitem" tabindex="-1">Exit</div>
    </div>
  </div>
  <!-- View, Tools, Help menus -->
  <div class="menu-spacer"></div>
  <button class="tb-btn tb-btn--wide" id="theme-toggle" title="Toggle theme">◐</button>
</div>
```

## Interactions

### Menu Hover Open
- **trigger:** `mouseenter` on `.menu-item`
- Close all other open menus. Add `.open` class to show dropdown.

### Menu Hover Close
- **trigger:** `mouseleave` on `.menu-item`
- Schedule close after 300ms delay (cancel if re-entered).

### Dropdown Hover
- **trigger:** `mouseenter` on `.menu-dropdown`
- Cancel close timer. Keep menu open.

### Dropdown Leave
- **trigger:** `mouseleave` on `.menu-dropdown`
- Schedule close after 300ms.

### Dropdown Item Click
- **trigger:** `click` on `.menu-dropdown-item`
- Fire associated callback, close all menus.

### Nested Submenu Hover
- **trigger:** `mouseenter` on `.menu-item-nested`
- Show nested `.menu-dropdown-nested` to the right.

### Keyboard Navigation
- **trigger:** Arrow keys, Enter, Escape on focused `.menu-item`
- ArrowRight/Left switches top-level menu. ArrowUp/Down navigates items. Enter activates. Escape closes.

### Theme Toggle Button
- **trigger:** `click` on `#theme-toggle`
- Fires `onThemeToggle()` callback.

## States

### Open Menu
- `.menu-item.open` — shows the dropdown, adds accent bottom border.

### Active Grid Style
- Checkmark (✓) next to the selected grid style in Canvas submenu.

### Zoom Locked
- Checkmark next to "Lock" in Zoom submenu when locked.

### Empty Instance Lists
- Terminal/Git/SpecsMap submenus with no instances show "(none)" disabled item.
