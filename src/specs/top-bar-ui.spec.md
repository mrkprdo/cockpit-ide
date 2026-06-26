---
name: Top Bar UI
parent: top-bar
---

# Top Bar UI

DOM structure, menu dropdown interactions, and states for the custom menu bar.

## DOM Structure

```
#menu-bar (mount point from index.html)
└── .top-bar | display: flex; height: 32px
    └── .menu-item[] (one per top-level menu: File, Edit, View, Tools, Help)
        ├── .menu-label (menu name text)
        └── .menu-dropdown | position: absolute; display: none
            └── .menu-action[] (one per menu action)
                ├── .menu-action-label (action text)
                ├── .menu-action-shortcut (keyboard shortcut hint, muted)
                └── .menu-separator (divider between action groups)
```

## Interactions

### Menu Open

- **trigger:** Click on `.menu-label`
- Set `.menu-dropdown` to `display: block` with slide-down animation
- Highlight `.menu-label` with accent color
- Close any other open dropdown (only one menu open at a time)
- **result:** Dropdown menu visible below label

### Menu Close

- **trigger:** Click outside menu, press Escape, or click same label again
- Hide dropdown with slide-up animation
- Remove label highlight
- **result:** Menu closed

### Hover Menu Switch

- **trigger:** Mouse enter on different `.menu-label` while another menu is open
- Close previous dropdown, open new dropdown without requiring click
- **result:** Seamless menu switching on hover

### Action Selection

- **trigger:** Click on `.menu-action` item
- Fire corresponding callback (e.g., `onNewWindow`, `onOpenExplorer`, `onAbout`)
- Close all dropdowns
- **result:** Action executed, menus dismissed

### Keyboard Shortcut Display

- **trigger:** Menu open (visual only)
- Each `.menu-action` shows shortcut in muted text (e.g., `Ctrl+N`, `Ctrl+P`, `Ctrl+S`)
- Shortcuts are display-only hints; actual bindings handled by App keyboard listener
- **result:** User sees available shortcuts

### Theme Toggle

- **trigger:** Click "Theme" action in View menu
- Call `theme.toggle()` from theme singleton
- **result:** Dark/light mode toggled, menu closes

## States

### Default (All Closed)

All dropdowns hidden, labels at default color, menu bar at rest.

### Menu Open

One dropdown visible with slide-down animation, label highlighted, rest of UI dimmed or unresponsive to menu clicks.

### Hover Transition

Fast dropdown swap (no animation) when moving between menu labels.

### Disabled Action

Menu action item greyed out, not clickable (e.g., Undo when nothing to undo).

## Accessibility

- **Alt / F10:** Focus first menu
- **Left/Right arrows:** Navigate between menus
- **Down arrow:** Open focused menu
- **Up/Down arrows:** Navigate within open menu
- **Enter:** Select action
- **Escape:** Close menu
