---
name: Confirm Modal
file: src/renderer/components/ConfirmModal.ts
type: ui
layer: modal
singleton: false
exports: [ConfirmModal]
---

# Confirm Modal

Generic confirmation dialog used for destructive actions (file delete). Constructed with a message string (sanitized of dangerous HTML tags), a confirm button label (default "Delete"), and a `destructive` flag (default true) that applies a red-tinted CSS class. Returns a Promise<boolean>: `true` if the user clicked OK, `false` if Cancel or overlay click or Escape. The Cancel button receives auto-focus on open. Each instance creates fresh DOM elements and removes them on completion.

## Dependencies

No imports from `src/`.

## Referenced By

- **File Explorer Plugin** `src/renderer/components/FileExplorerPlugin.ts` — `new ConfirmModal(...)` before `fs:delete`

## IPC Channels

None — pure DOM dialog.
