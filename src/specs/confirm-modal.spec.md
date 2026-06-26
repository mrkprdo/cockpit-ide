---
name: Confirm Modal
file: src/renderer/components/ConfirmModal.ts
type: ui
layer: modal
singleton: true
exports: [ConfirmModal]
---

# Confirm Modal

Generic confirmation dialog with message text, OK and Cancel buttons. Returns a Promise that resolves to `true` (accepted) or `false` (cancelled/dismissed). Dismissed by clicking Cancel, the overlay background, or pressing Escape. Used by FileExplorerPlugin for delete confirmations and other destructive-action safeguards.

## Dependencies

None — standalone confirmation dialog.

## Referenced By

- **file-explorer-plugin** `src/renderer/components/FileExplorerPlugin.ts` — confirms file/folder deletion

## IPC Channels

None.

## Interface

### Classes

- **ConfirmModal**
  - **constructor** `(): ConfirmModal` — creates modal DOM with message, OK/Cancel buttons
  - **show** `(message: string): Promise<boolean>` — displays confirmation and returns user choice
  - **close** `(): void` — programmatic dismiss

## State

Active promise resolution callbacks, current message text.

## Lifecycle

- **created_by:** `FileExplorerPlugin` (lazily, on first use) or other components
- **destroyed_by:** parent destruction

## Test

`src/renderer/components/ConfirmModal.test.ts`
