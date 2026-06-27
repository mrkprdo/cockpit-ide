---
name: File Explorer Plugin
file: src/renderer/components/FileExplorerPlugin.ts
type: ui
layer: widget
singleton: false
exports: [FileExplorerPlugin]
---

# File Explorer Plugin

Recursive file tree browser that renders the workspace directory structure as an indented, collapsible tree. Each directory can be expanded/collapsed (toggled via click on the arrow icon). Files display with color-coded names by extension (`.ts`/`.js` → accent, `.css` → accent2, `.json` → amber, `.md` → green). Supports inline file/folder creation via an input row (Enter commits, Escape cancels). Right-click context menu on files offers Open, Open in Markdown (if markdown plugins configured), Rename (inline input), Copy, Delete (with ConfirmModal), and Paste. The empty-area context menu offers New File, New Folder, and Paste. Inline rename renames via `electronAPI.fs.rename`. Double-click expands/collapses directories. Watches for external file changes and auto-refreshes the tree (500ms debounce). The `selectFile(filePath)` method expands parent directories and scrolls to the file.

## Dependencies

- **Context Menu** `src/renderer/components/ContextMenu.ts` — file and empty-area context menus
- **Confirm Modal** `src/renderer/components/ConfirmModal.ts` — delete confirmation dialog

## Referenced By

- **Explorer Plugin** `src/renderer/components/ExplorerPlugin.ts` — instantiates one FileExplorerPlugin per explorer card

## IPC Channels

- `fs:readDir` — list directory entries
- `fs:readFile` — read file for markdown opener
- `fs:writeFile` — create new file
- `fs:mkdir` — create new folder
- `fs:delete` — delete file/folder
- `fs:copy` — copy file (paste)
- `fs:rename` — rename file/folder
- `file:changed` — external file change notification for auto-refresh
