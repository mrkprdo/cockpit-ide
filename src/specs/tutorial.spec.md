---
name: Tutorial
file: src/renderer/components/Tutorial.ts
type: ui
layer: overlay
singleton: true
exports: [Tutorial]
---

# Tutorial

Interactive guided tour overlay with 16 steps. Each step has a title, description (plain text), optional `target` CSS selector for a highlight ring, optional `renderExtra` for custom HTML (links, checkbox), and `onEnter`/`onLeave` lifecycle hooks (e.g., opening the AI drawer for demonstration). The overlay is a flex container covering the viewport (`tutorial-overlay`). A tooltip bubble positions itself near the highlighted target (auto-detects space above/below/left/right). Navigation includes Back/Next buttons, dot indicators, and keyboard shortcuts (Escape to close, ArrowRight/Enter for next, ArrowLeft for previous). The final step offers a "Do not show this again" checkbox that controls `showOnLaunch`. Opened via Help > Tutorial or on first workspace load (if `prefs.showTutorial !== false`).

## Dependencies

No imports from `src/`.

## Referenced By

- **App Orchestrator** `src/renderer/components/App.ts` — creates instance, calls `start()` on first launch or Help > Tutorial

## IPC Channels

- `shell:openExternal` — open GitHub links in the tutorial footer step
