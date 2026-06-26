---
name: File Explorer Plugin UI
parent: file-explorer-plugin
---

# File Explorer Plugin UI

DOM structure, tree navigation, context menu interactions, and states for the recursive file tree browser.

## DOM Structure

```
.card-body (PluginCard body container)
└── .file-tree | overflow-y: auto
    └── .tree-node[] (recursive, one per directory/file)
        ├── .tree-row
        │   ├── .tree-toggle (▶/▼ for directories, empty for files)
        │   ├── .tree-icon (📁 folder / 📄 file emoji or SVG)
        │   └── .tree-name (file/directory name)
        └── .tree-children[] (nested child nodes, hidden when collapsed)
```

## Interactions

### Directory Expand/Collapse

- **trigger:** Click on `.tree-toggle` (▶/▼) or double-click directory name
- `▶` → `fs:readDir` IPC to load children → append child nodes → toggle to `▼`
- `▼` → hide children (CSS `display: none`) → toggle to `▶`
- **result:** Directory contents revealed or hidden

### File Select

- **trigger:** Single click on file row
- Highlight row with `.selected` class
- Store selected path for context menu target
- **result:** File visually selected

### File Open

- **trigger:** Double-click file row, or Enter key on selected file
- Fire `onOpenFile(filePath)` callback → parent opens in editor
- **result:** File opens in MonacoEditorPlugin (standalone or in ExplorerPlugin split)

### Context Menu (Right-Click)

- **trigger:** Right-click on `.tree-row`
- `ContextMenu.show()` with:
  - New File → `fs:writeFile` IPC with empty content → refresh tree
  - New Folder → `fs:mkdir` IPC → refresh tree
  - Rename → inline text input replaces `.tree-name` → `fs:rename` IPC on Enter
  - Delete → `ConfirmModal.show("Delete X?")` → `fs:delete` IPC on confirm
  - Copy → store path in clipboard-like buffer → `fs:copy` on paste
  - Paste → write buffer content to current location
- **result:** File operation executed, tree refreshed

### Auto-Refresh (External Changes)

- **trigger:** `file:changed` IPC listener fires
- Debounce 500ms → `refresh()` re-reads tree root
- Preserve expanded state
- **result:** Tree reflects filesystem changes without manual refresh

### Keyboard Navigation

- **trigger:** Arrow keys on focused tree
- Up/Down: move selection highlight
- Right: expand selected directory
- Left: collapse selected directory (or move to parent)
- Enter: open selected file / toggle directory
- **result:** Full keyboard tree navigation

## States

### Loading

Tree root shows "Loading..." or spinner while `fs:readDir` resolves.

### Empty Directory

Single message node: "(empty directory)" in muted text.

### Expanded

Directory shows children indented below, toggle shows `▼`.

### Collapsed

Directory children hidden, toggle shows `▶`.

### Selected

Row highlighted with `--accent-primary` background, context menu target.

### Renaming

`.tree-name` replaced by `input[type=text]` for inline rename, Escape cancels, Enter commits.

### Error

Red error message if `fs:readDir` fails (permissions, deleted path).

## Accessibility

- **Tab:** Focus tree container
- **Arrow keys:** Navigate tree
- **Enter:** Open/toggle selected node
- **F2:** Rename selected file
- **Delete:** Delete selected file (shows ConfirmModal)
