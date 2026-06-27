---
name: Theme Modal
file: src/renderer/components/ThemeModal.ts
type: ui
layer: modal
singleton: true
exports: [ThemeModal]
---

# Theme Modal

Theme selection dialog. Renders two radio groups: THEMES (Default, Monokai, Idol) and LIGHT/DARK (Dark, Light). Reads current `theme.base` and `theme.mode` to pre-select the active radio. "Apply" button calls `theme.setTheme(base, mode)` then closes. "Cancel" closes without applying. Overlay click and Escape dismiss. Accepts an `onClose` callback for canvas lock/unlock coordination.

## Dependencies

- **Theme System** `src/renderer/theme.ts` — reads current base/mode, applies new theme on apply

## Referenced By

- **App Orchestrator** `src/renderer/components/App.ts` — instantiates and calls `modal.open(onClose)` from Tools > Theme

## IPC Channels

None — theme operations are renderer-local.
