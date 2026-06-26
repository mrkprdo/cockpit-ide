---
name: Top Bar Menu
file: src/renderer/components/TopBar.ts
type: ui
layer: widget
singleton: true
exports: [TopBar, TopBarCallbacks]
---

# Top Bar Menu

Custom menu bar with File (Open Workspace, Exit), View (Terminal submenu, Explorer, Git, Markdown, Canvas grid style, Zoom submenu with In/Out/Reset/Lock), Tools (SpecsMap, AI, Theme), and Help (Tutorial, About) dropdowns. Renders with hover-open behavior, keyboard-accessible menu items, dynamic submenu population for terminal/git/specsmap instances, and a theme toggle button (◐). Communicates all actions via typed callbacks.

## Dependencies

- [[theme.spec.md|theme]] `src/renderer/theme.ts` — Reads theme colors for inline SVG styling (not heavily used; theme toggle is delegated via callback)

## Referenced By

- [[app.spec.md|app]] `src/renderer/components/App.ts`

## Interface

### Methods

- **constructor** `(el: HTMLElement, callbacks: TopBarCallbacks)` — Renders the full menu bar with all dropdowns and wires hover/keyboard events
- **setTerminalItems** `(items: TermItem[]): void` — Updates the terminal submenu with current open/minimized terminal instances
- **setGitItems** `(items: TermItem[]): void` — Updates the git submenu with current git plugin instances
- **setSpecsmapItems** `(items: TermItem[]): void` — Updates the specsmap submenu with current specsmap plugin instances
- **setGridStyle** `(style: GridStyle): void` — Updates the grid style checkmark in Canvas submenu
- **setZoomLocked** `(locked: boolean): void` — Updates the lock checkmark in Zoom submenu

## Lifecycle

- **created_by:** App constructor
- **destroyed_by:** Page unload

