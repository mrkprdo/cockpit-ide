---
name: File Explorer Plugin UI
file: src/renderer/components/FileExplorerPlugin.ts
type: ui
layer: widget
singleton: false
exports: []
---

# File Explorer Plugin UI

UI sub-spec for the recursive file tree browser: DOM structure, tree rendering, inline editing, context menus, and drag-drop interactions.

## DOM Structure

```json
{
  "root": ".file-explorer (flex column)",
  "structure": {
    "header": "Root directory name uppercase, accent color, border-bottom",
    "tree": ".tree (flex:1, overflow:auto) containing recursive .dir-entry and .file-entry elements",
    "entry": {
      "structure": "display:flex, padding-left indented by depth*16px",
      "file_colors": {
        ".ts/.tsx/.js/.jsx/.mjs/.cjs": "var(--accent)",
        ".css/.scss/.sass/.less": "var(--accent2)",
        ".json/.yaml/.yml/.toml/.env": "var(--amber)",
        ".md/.txt/.rst/.mdx": "var(--green)",
        "other": "var(--secondary)"
      }
    }
  }
}
```

## Interactions

### click on .dir-entry

Toggles expansion of directory children; adds/removes from this.expanded Set

### click on .file-entry

Calls onFileOpen(path); highlights file with .is-file-selected class

### right-click on file

Opens ContextMenu with: Open, Rename, Delete, Copy Path, and optional Markdown openers

### right-click on empty area

Opens ContextMenu with: New File, New Folder, Paste (if copiedPath is set)

### Enter on inline rename input

Commits rename via fs.rename, reloads tree

### Enter on inline create input

Creates file/folder via fs.writeFile/fs.mkdir, reloads tree

### Escape on inline input

Cancels inline edit, removes input row, restores original element display

## States

### loading

Tree shows 'Loading...' placeholder while fs.readDir resolves

### empty-workspace

Shows 'No workspace' when rootPath is empty

### error

Shows 'Unable to read directory' when fs.readDir returns null

### renaming

Original element hidden, inline input shown for rename

### creating

Inline input shown at insertion point for new file/folder

