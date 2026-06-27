---
name: Canvas Status Bar
file: src/renderer/components/canvas-statusbar.ts
type: ui
layer: widget
singleton: true
exports: [StatusBar]
---

# Canvas Status Bar

Bottom status bar widget. Displays current zoom percentage (click to toggle lock), a lock/unlock padlock icon, workspace name centered, and a "view all" button that triggers `fitAll` (auto-pan/zoom to show all cards). Shows a refresh icon when zoom is not 100% and unlocks; clicking it resets zoom to 1x. Built dynamically on first `init()` call by injecting children into `#statusbar`. Updates are triggered by `CanvasArea` on zoom/lock/workspace changes.

## Dependencies

No imports from `src/`.

## Referenced By

- **Canvas Area** `src/renderer/components/CanvasArea.ts` — creates and calls `statusBar.update()` on state changes

## IPC Channels

None.
