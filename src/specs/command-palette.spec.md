---
name: Command Palette
file: src/renderer/components/CommandPalette.ts
type: ui
layer: overlay
singleton: false
exports: [CommandPalette]
---

# Command Palette

Ctrl+P fuzzy file finder overlay that scans the workspace directory for files (via `fs:readDir` recursively), filters results by fuzzy-matching the input against file paths, and displays matches in a scrollable dropdown. Supports: keyboard navigation (up/down arrows, Enter to select, Escape to close), click-to-select, and opens selected file via `onSelect(path)` callback. Debounces input for efficient re-filtering on large workspaces.

## Dependencies

None — standalone overlay with IPC for file scanning.

## Referenced By

- **explorer-plugin** `src/renderer/components/ExplorerPlugin.ts` — opened via Ctrl+P within explorer
- **app** `src/renderer/components/App.ts` — Ctrl+Shift+P hotkey (may delegate)

## IPC Channels

- `fs:readDir` — recursively scans workspace for file listing

## Interface

### Classes

- **CommandPalette**
  - **constructor** `(workspacePath: string): CommandPalette` — scans directory, builds file index
  - **open** `(): void` — shows overlay with search input focused
  - **close** `(): void` — hides overlay
  - **onSelect** — callback `(filePath: string) => void` — fires when file is selected
  - **onClose** — callback `() => void`

## State

Search query, filtered results list, selected index, overlay visibility.

## Lifecycle

- **created_by:** `ExplorerPlugin` (lazily on first Ctrl+P)
- **destroyed_by:** parent destruction or close

## Test

`src/renderer/components/CommandPalette.test.ts`
