---
name: Confirm Modal
file: src/renderer/components/ConfirmModal.ts
type: ui
layer: modal
singleton: false
exports: [ConfirmModal]
---

# Confirm Modal

Generic confirmation dialog used for destructive actions (file delete). Renders a message (with HTML sanitization: strips script/img/iframe/embed/object/link/style tags and on* attributes), Cancel and OK/Delete buttons. Pressing Escape triggers Cancel. Returns a Promise<boolean> via open(). Used by FileExplorerPlugin for delete confirmation.

## Referenced By

- [[file-explorer-plugin.spec.md|file-explorer-plugin]] `src/renderer/components/FileExplorerPlugin.ts`

## Interface

### Methods

- **constructor** `(message: string, confirmLabel?: string, destructive?: boolean)` — Builds modal overlay with sanitized message, Cancel and OK buttons
- **open** `(): Promise<boolean>` — Displays modal, focuses Cancel, returns true if OK clicked, false on Cancel/Escape/overlay-click

## Lifecycle

- **created_by:** FileExplorerPlugin.deletePath()
- **destroyed_by:** Promise resolution via done(true/false)

