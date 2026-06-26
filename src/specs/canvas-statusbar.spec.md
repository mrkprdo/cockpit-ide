---
name: Canvas Status Bar
file: src/renderer/components/canvas-statusbar.ts
type: ui
layer: widget
singleton: true
exports: [StatusBar]
---

# Canvas Status Bar

Bottom status bar displaying zoom percentage with lock/unlock lock icon (clickable to toggle), workspace name, and a 'view all' button. Shows a reset-zoom icon when zoom is not 100% and unlocked. Updates via the update() method called by CanvasArea on zoom, lock, or workspace name changes.

## Referenced By

- [[canvas-area.spec.md|canvas-area]] `src/renderer/components/CanvasArea.ts`

## Interface

### Methods

- **init** `(): void` — Creates status bar DOM elements (zoom, locked, workspace, view all) inside #statusbar
- **update** `(locked: boolean, scale: number, workspaceName: string, onLockToggle: () => void, fitAll: () => void, resetZoom?: () => void): void` — Updates zoom percentage, lock icon SVG, workspace name text, visibility of reset-zoom icon

## Lifecycle

- **created_by:** CanvasArea constructor calls init()
- **destroyed_by:** Page unload

