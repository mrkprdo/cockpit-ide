---
name: Command Palette
file: src/renderer/components/CommandPalette.ts
type: ui
layer: overlay
singleton: false
exports: [CommandPalette]
---

# Command Palette

Fuzzy file search overlay (opened via Ctrl+P). Walks the entire workspace directory tree (excluding `.git`, `node_modules`, `.cockpit`) on first search, caching results. Filters files by name or path substring matching. Renders a scrollable result list with file name (primary) and relative directory (secondary). Supports keyboard navigation: ArrowUp/ArrowDown to move selection, Enter to open, Escape to close. Mouse hover moves the selection. Recent files (up to 10) are shown when the input is empty, persisted to `localStorage`. Selecting a file fires the `onSelectFile` callback to open it in the editor. Shows a progress bar while walking the directory tree.

## Dependencies

No imports from `src/`.

## Referenced By

- **Explorer Plugin** `src/renderer/components/ExplorerPlugin.ts` — creates a CommandPalette instance and wires it to file-open

## IPC Channels

- `fs:readDir` — walk the workspace directory tree
