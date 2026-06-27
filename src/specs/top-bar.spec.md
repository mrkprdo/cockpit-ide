---
name: Top Bar
file: src/renderer/components/TopBar.ts
type: ui
layer: widget
singleton: true
exports: [TopBar, TopBarCallbacks, GridStyle]
---

# Top Bar

Custom menu bar rendered in the title bar drag region. Renders four top-level menus: File (Open Workspace, Exit), View (Terminal submenu with instance list, Explorer, Git, Markdown, Canvas grid style submenu, Zoom submenu), Tools (SpecsMap, AI, Theme), and Help (Tutorial, About). Menus open on hover with 300ms close delay. Each submenu item wires to typed callbacks (`TopBarCallbacks`). Terminal, Git, and SpecsMap submenus are dynamically patched (`patchSubmenu`) to list open instances with focus/reopen actions. Grid style radio items show a checkmark. Zoom lock checkbox toggles lock icon. A theme-toggle button (◐) sits on the right. Supports keyboard navigation: Arrow keys cycle items, Enter activates, Escape closes.

## Dependencies

- **Theme System** `src/renderer/theme.ts` — for theme toggle button rendering (imports `theme`)

## Referenced By

- **App Orchestrator** `src/renderer/components/App.ts` — creates TopBar with all callbacks wired to CanvasArea actions

## IPC Channels

None — all user actions delegate through callbacks to App.
