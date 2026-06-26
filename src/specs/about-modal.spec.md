---
name: About Modal
file: src/renderer/components/AboutModal.ts
type: ui
layer: modal
singleton: true
exports: [AboutModal]
---

# About Modal

Version/credits dialog opened from Help > About. Displays 'COCKPIT IDE' heading with tagline, version specs (VERSION, ELECTRON, NODE, STYLE with a link to UseDesign.md), and a Close button. The STYLE value is a clickable link that opens an external URL in the system browser. Escape key or clicking overlay dismisses.

## Referenced By

- [[app.spec.md|app]] `src/renderer/components/App.ts`

## Interface

### Methods

- **constructor** `()` — Builds modal overlay with version spec rows and close button
- **open** `(onClose?: () => void): void` — Displays modal, sets optional on-close callback with canvas lock release

## Lifecycle

- **created_by:** App constructor
- **destroyed_by:** Page unload

