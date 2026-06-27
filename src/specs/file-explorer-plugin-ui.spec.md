---
name: File Explorer Plugin UI
parent: file-explorer-plugin
---

# File Explorer Plugin UI

Recursive file tree browser with inline CRUD operations.

## DOM Structure

```html
<div class="file-explorer">
  <div class="file-explorer-header">WORKSPACE_NAME</div>
  <div class="file-explorer-tree">
    <div class="file-tree-item" style="padding-left: 12px" data-path="/full/path">
      <span class="file-tree-arrow">▸</span>
      <span class="file-tree-name" style="color: var(--accent)">file.ts</span>
    </div>
    <div class="file-tree-item" style="padding-left: 28px"><!-- nested --></div>
  </div>
</div>
```

## Interactions

### Expand/Collapse Directory
- **trigger:** `click` on `.file-tree-arrow` (▸/▾)
- Toggle `expanded` Set for the directory path. Reload tree with children shown/hidden.

### Open File
- **trigger:** `click` on a file (non-directory) `.file-tree-item`
- Call `onFileOpen(fullPath)`. Highlight file as selected.

### File Right-click Context Menu
- **trigger:** `contextmenu` on a file item
- Show ContextMenu: Open, Open in Markdown (if markdown plugins exist), Rename, Copy, Delete, Paste

### Directory Right-click Context Menu
- **trigger:** `contextmenu` on a directory item
- Show ContextMenu: New File, New Folder, Rename, Copy, Delete, Paste

### Empty Area Context Menu
- **trigger:** `contextmenu` on tree root or empty space
- Show ContextMenu: New File, New Folder, Paste

### Inline Create
- **trigger:** New File/Folder from context menu
- Insert an `<input>` row at the target position. Enter commits (creates file/folder via IPC). Escape cancels. Blur also commits.

### Inline Rename
- **trigger:** Rename from context menu
- Hide the original item, insert `<input>` pre-filled with current name. Enter commits rename via `fs:rename`. Escape cancels and restores original.

### Delete
- **trigger:** Delete from context menu
- Show `ConfirmModal` with item name. If confirmed, call `fs:delete`.

### Copy/Paste
- **trigger:** Copy on file → Paste on target directory
- `copiedPath` stored. Paste calls `fs:copy` with numbered suffix (_copy_1, etc.).

## States

### Selected File
- `.is-file-selected` class: highlighted background on the active file row.

### Expanded Directory
- Arrow rotated to ▾, child items visible.

### Collapsed Directory
- Arrow shows ▸, child items hidden.

### Loading
- Initial: shows "Loading..." in tree.

### Empty/Error
- No workspace: "No workspace". Read error: "Unable to read directory".
