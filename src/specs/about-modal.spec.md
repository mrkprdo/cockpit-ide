---
name: About Modal
file: src/renderer/components/AboutModal.ts
type: ui
layer: modal
singleton: true
exports: [AboutModal]
---

# About Modal

Version and credits dialog. Displays "COCKPIT IDE" branding, tagline, and a specs table with VERSION (app version), ELECTRON, NODE (first segment of each), and a clickable STYLE link that opens `usedesign.md` URL in the default browser. Footer has a "Close" button. Overlay click and Escape dismiss. Accepts an `onClose` callback (used by App to re-enable canvas panning that was locked while modal was open).

## Dependencies

No imports from `src/`.

## Referenced By

- **App Orchestrator** `src/renderer/components/App.ts` — instantiates and calls `modal.open(onClose)` from Help > About

## IPC Channels

- `shell:openExternal` — open the design reference URL in system browser
