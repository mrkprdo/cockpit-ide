---
name: Explorer Plugin
file: src/renderer/components/ExplorerPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [ExplorerPlugin]
---

# Explorer Plugin

Split-pane layout combining a `FileExplorerPlugin` (left column, default 260px) and a `MonacoEditorPlugin` (right column, fills remaining space). A draggable resize handle (2px wide) between the panes adjusts the split ratio (clamped 120–600px). The file explorer's `onFileOpen` callback opens files in the editor. The editor pane is hidden (`display:none`) when no tabs are open. Exposes convenience methods: `revealFile(filePath)` — selects and scrolls the tree to a path; `openFileSearch()` — opens CommandPalette; `insertText(text)` / `getSelectionText()` / `setEditorContent(content)` / `goToLine(line, col)` — agent integration delegates to the editor. Serializes editor state (open files, active file, cursors, explorer width) via `getEditorState()` and restores it via `restoreEditorState()`.

## Dependencies

- **File Explorer Plugin** `src/renderer/components/FileExplorerPlugin.ts` — recursive file tree browser
- **Monaco Editor Plugin** `src/renderer/components/MonacoEditorPlugin.ts` — code editor with multi-tab support
- **Command Palette** `src/renderer/components/CommandPalette.ts` — fuzzy file search overlay

## Referenced By

- **Canvas Area** `src/renderer/components/CanvasArea.ts` — instantiates ExplorerPlugin per explorer card

## IPC Channels

- `fs:readDir` — file tree navigation
- `fs:readFile` — file content loading for editor
- `fs:writeFile` — file save
- `fs:mkdir` — new folder creation
- `fs:delete` — file/folder deletion
- `fs:copy` — file copy
- `fs:rename` — file rename
- `file:changed` — external file change notifications for editor reload
