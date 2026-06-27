---
name: Canvas Grid
file: src/renderer/components/canvas-grid.ts
type: utility
layer: foundation
singleton: false
exports: [GridStyle, generateGridPattern, applyGridToElement]
---

# Canvas Grid

Pure utility module for the canvas background pattern. `generateGridPattern(style, patternSize)` creates a `<canvas>`-based data URL: dots (small circle at origin) or grid (L-shaped corner lines). `applyGridToElement(el, style, dataURL, patternSize, scale, panX, panY)` sets the CSS `background-image`, `background-repeat`, `background-size`, and `background-position` to render the repeating pattern at the current zoom/pan position. Supports three styles: `'none'`, `'dots'`, `'grid'`. Color is resolved at generation time from the `--tertiary` CSS variable.

## Dependencies

No imports from `src/`.

## Referenced By

- **Canvas Area** `src/renderer/components/CanvasArea.ts` — imports `GridStyle`, `generateGridPattern`, `applyGridToElement`

## IPC Channels

None.
