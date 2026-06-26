---
name: Welcome Modal
file: src/renderer/components/WelcomeModal.ts
type: ui
layer: modal
singleton: true
exports: [WelcomeModal]
---

# Welcome Modal

Startup workspace picker dialog shown on first launch or when no workspace is active. Displays a "Select Folder" button that opens the native directory picker via `workspace:select` IPC, a list of recent workspaces loaded via `workspace:getRecent` IPC with click-to-reopen, and a "Remove" button on each recent entry. Manages open/close animation state. Fires `onSelect(path)` callback when a workspace is chosen.

## Dependencies

None — uses only IPC bridge for workspace operations.

## Referenced By

- **app** `src/renderer/components/App.ts` — opens on startup or via File menu

## IPC Channels

- `workspace:select` — opens native directory picker dialog
- `workspace:getRecent` — loads recent workspace list
- `fs:readDir` — validates workspace path exists
- `workspace:removeRecent` — removes entry from recent list

## Interface

### Classes

- **WelcomeModal**
  - **constructor** `(): WelcomeModal` — creates modal DOM with overlay, content, buttons
  - **open** `(): void` — displays modal with animation
  - **close** `(): void` — hides modal
  - **onSelect** — callback `(workspacePath: string) => void` — fires when workspace is chosen

## State

Modal open/closed state, recent workspace list.

## Lifecycle

- **created_by:** `App` constructor (singleton)
- **destroyed_by:** App destruction (rarely destroyed)

## Test

`src/renderer/components/WelcomeModal.test.ts`
