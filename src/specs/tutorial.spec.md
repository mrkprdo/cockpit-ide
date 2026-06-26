---
name: Tutorial Overlay
file: src/renderer/components/Tutorial.ts
type: ui
layer: overlay
singleton: true
exports: [Tutorial]
---

# Tutorial Overlay

Step-by-step interactive tutorial overlay displayed on first launch (or via Help > Tutorial). Shows 15 steps covering: canvas pan/zoom, menu bar, terminal, explorer, file search, markdown viewer, SpecsMap, theme, plugin cards, plugin list, arrange panel, keyboard shortcuts, and links to GitHub repo. Each step renders a tooltip positioned relative to a target element (with ring highlight), or centered for general steps. Supports keyboard navigation (Arrow Left/Right/Escape/Enter), prev/next/done buttons, and a 'Do not show again' checkbox on the final step.

## Referenced By

- [[app.spec.md|app]] `src/renderer/components/App.ts`

## Interface

### Methods

- **constructor** `()` — Builds overlay, tooltip, and ring highlight elements; wires keyboard listener
- **start** `(onClose?: () => void): void` — Shows tutorial at step 0 with optional close callback
- **getShowOnLaunch** `(): boolean` — Returns whether 'Do not show again' was checked

## Lifecycle

- **created_by:** App constructor
- **destroyed_by:** Page unload

