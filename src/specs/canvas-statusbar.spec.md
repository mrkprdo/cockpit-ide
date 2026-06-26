---
name: Canvas Status Bar
file: src/renderer/components/canvas-statusbar.ts
type: ui
layer: widget
singleton: false
exports: [StatusBar]
---

# Canvas Status Bar

Floating status bar displayed at the bottom of the canvas area. Shows current zoom level (percentage), canvas dimensions, and a "Reset Zoom" button. Updates reactively when `StatusBar.update()` is called with new scale and dimension values. Creates its DOM element tree programmatically via `document.createElement`.

## Dependencies

None — standalone UI widget.

## Referenced By

- **canvas-area** `src/renderer/components/CanvasArea.ts` — creates and updates status bar on zoom/canvas changes

## IPC Channels

None.

## Interface

### Classes

- **StatusBar**
  - **constructor** `(): StatusBar` — creates DOM elements (span for zoom, span for dimensions, reset button with inline SVG)
  - **update** `(scale: number, worldWidth: number, worldHeight: number): void` — updates displayed zoom percentage and dimensions
  - **onReset** — callback `() => void` — fired when reset button clicked
  - **el** `HTMLDivElement` — root DOM element

## Lifecycle

- **created_by:** `CanvasArea` constructor
- **destroyed_by:** `CanvasArea` destruction (parent element removed)

## Test

Tested via `src/renderer/components/CanvasArea.test.ts`.
