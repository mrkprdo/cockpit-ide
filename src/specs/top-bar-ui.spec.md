---
name: Top Bar Menu UI
file: src/renderer/components/TopBar.ts
type: ui
layer: widget
singleton: true
exports: []
---

# Top Bar Menu UI

UI sub-spec detailing the DOM structure, menu hierarchy, dropdown behavior, and interaction model of the custom menu bar.

## DOM Structure

```json
{
  "root": ".menu-bar",
  "structure": {
    "menus": [
      {
        "label": "File",
        "items": [
          "Open Workspace (Ctrl+O)",
          "separator",
          "Exit"
        ]
      },
      {
        "label": "View",
        "submenus": {
          "Terminal": [
            "New (Ctrl+J)",
            "separator",
            "{dynamic terminal instances}"
          ],
          "Explorer": "single item",
          "Git": "single item",
          "Markdown": "single item"
        },
        "nested": {
          "Canvas": [
            "Dot (checkable)",
            "Grid (checkable)",
            "None (checkable)"
          ],
          "Zoom": [
            "Zoom In (Ctrl+=)",
            "Zoom Out (Ctrl+-)",
            "Reset View",
            "separator",
            "Lock (checkable)"
          ]
        }
      },
      {
        "label": "Tools",
        "items": [
          "SpecsMap",
          "separator",
          "AI",
          "separator",
          "Theme"
        ]
      },
      {
        "label": "Help",
        "items": [
          "Tutorial",
          "separator",
          "About Cockpit IDE"
        ]
      }
    ],
    "controls": [
      {
        "selector": "#theme-toggle",
        "type": "button",
        "label": "Toggle theme (◐)"
      }
    ]
  },
  "dynamic_submenus": {
    "terminal-submenu": "Populated by setTerminalItems() with instance title + open/minimized status",
    "git-submenu": "Populated by setGitItems() with instance title + open/minimized status",
    "specsmap-submenu": "Populated by setSpecsmapItems() with instance title + open/minimized status"
  }
}
```

## Interactions

### hover on .menu-item

Opens the dropdown menu; closes all others via closeAllMenus() with 300ms delay on leave

### click on .menu-dropdown-item

Executes associated callback (e.g., onNewTerminal, onAbout) and closes all menus

### click on .term-instance / .git-instance / .specsmap-instance

Focuses or reopens the corresponding plugin instance by UUID

### click on [data-grid] items

Calls onGridChange() with the selected style (dots/grid/none) and updates checkmark

### click on .menu-item-nested

Reveals nested dropdown on hover (no click toggle, pure CSS :hover)

### click on #menu-zoom-lock

Toggles zoom lock state, calls onZoomLock()

### click on #theme-toggle

Calls onThemeToggle() callback

## States

### closed

All dropdowns hidden, no menu item has .open class

### menu-open

One .menu-item has .open class, its .menu-dropdown is visible

### nested-open

A .menu-item-nested is hovered, its .menu-dropdown-nested is visible

