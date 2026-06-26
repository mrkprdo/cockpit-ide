---
name: Canvas Grid Pattern
file: src/renderer/components/canvas-grid.ts
type: utility
layer: utility
singleton: false
exports: [GridStyle, generateGridPattern, applyGridToElement]
---

# Canvas Grid Pattern

Utility module for generating and applying canvas background patterns. Generates a dot grid (filled circles at origin with 65% alpha) or line grid (right/bottom strokes at 30% alpha) as a canvas-rendered data URL. applyGridToElement() sets the pattern as a CSS background-image with size and position aligned to canvas zoom/pan transforms. Pattern color is read from the --tertiary CSS variable for theme consistency.

## Referenced By

- [[canvas-area.spec.md|canvas-area]] `src/renderer/components/CanvasArea.ts`

## Interface

### Methods

- **generateGridPattern** `(style: GridStyle, patternSize: number): string` — Returns a data URL for the grid pattern image (dots or grid lines)
- **applyGridToElement** `(el: HTMLElement, style: GridStyle, dataURL: string, patternSize: number, scale: number, panX: number, panY: number): void` — Applies the pattern as CSS background with proper scaling and positioning

## Lifecycle

- **created_by:** Imported by CanvasArea and called on init and on style/zoom/pan changes
- **destroyed_by:** N/A (stateless utilities)

