---
name: Theme Modal
file: src/renderer/components/ThemeModal.ts
type: ui
layer: modal
singleton: true
exports: [ThemeModal]
---

# Theme Modal

Theme selection dialog opened from Tools > Theme. Presents radio buttons for base palette (Default, Monokai, Idol) and mode (Dark, Light) with Cancel/Apply buttons. On Apply, calls theme.setTheme() with the selected values and triggers canvas refresh/theme update. Reads current theme state from the singleton for default selection. Escape key or clicking overlay dismisses without applying.

## Dependencies

- [[theme.spec.md|theme]] `src/renderer/theme.ts` — Reads theme.base and theme.mode for default radio selection; calls theme.setTheme() on apply

## Referenced By

- [[app.spec.md|app]] `src/renderer/components/App.ts`

## Interface

### Methods

- **constructor** `()` — Builds modal overlay with theme/mode radio groups and Cancel/Apply buttons
- **open** `(onClose?: () => void): void` — Displays modal with current theme pre-selected and optional on-close callback

## Lifecycle

- **created_by:** App constructor
- **destroyed_by:** Page unload

