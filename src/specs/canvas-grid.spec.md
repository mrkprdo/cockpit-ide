---
name: Canvas Grid
file: src/renderer/components/canvas-grid.ts
type: ui
layer: widget
singleton: false
exports: [GridStyle, generateGridPattern, applyGridToElement]
---

# Canvas Grid

Generates a dot-grid background pattern for the infinite canvas using an offscreen `<canvas>` element. The pattern data URI is applied as `background-image` on a target element. Supports custom dot color, dot size (default 1px), spacing (default 28px), and background color so the grid can adapt to dark and light themes.

## Dependencies

None — pure canvas drawing utility.

## Referenced By

- **canvas-area** `src/renderer/components/CanvasArea.ts` — applies grid pattern to canvas background

## IPC Channels

None.

## Interface

### Types

- **GridStyle** — `{ dotColor: string; bgColor: string; dotSize: number; spacing: number }`

### Functions

- **generateGridPattern** `(style: GridStyle): string` — returns a `data:` URI for the grid background image
- **applyGridToElement** `(element: HTMLElement, style: GridStyle): void` — sets `background-image` on element

## Test

Tested indirectly via `src/renderer/components/CanvasArea.test.ts`.
