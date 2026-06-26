---
name: Welcome Modal
file: src/renderer/components/WelcomeModal.ts
type: ui
layer: modal
singleton: true
exports: [WelcomeModal]
---

# Welcome Modal

Startup workspace selection dialog. Displays 'COCKPIT IDE' branding with a 'Select a workspace' prompt, a recent workspaces list (clickable, with X remove buttons, missing-directory dimming), and Open Workspace / Close buttons. Uses workspace.select() to open the native folder picker. Returns a promise with the selected path or null on close. Escape key dismisses.

## Referenced By

- [[app.spec.md|app]] `src/renderer/components/App.ts`

## IPC Channels

- `workspace:select`
- `workspace:getRecent`
- `workspace:removeRecent`
- `fs:readDir`

## Interface

### Methods

- **constructor** `()` — Builds modal overlay with branding, recent list container, and action buttons
- **open** `(): Promise<string | null>` — Displays modal, loads recent workspaces, returns selected path on dismiss

## Lifecycle

- **created_by:** App constructor
- **destroyed_by:** Page unload (persists across workspace sessions)

