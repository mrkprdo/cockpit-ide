---
name: Explorer Plugin UI
parent: explorer-plugin
---

# Explorer Plugin UI

DOM structure, split pane resize, and file open interactions for the integrated ExplorerPlugin.

## DOM Structure

```
.card-body (PluginCard body container)
└── .explorer-layout | display: flex; flex-direction: row
    ├── .explorer-left | initial width: 250px, min 150px
    │   └── [FileExplorerPlugin tree mounted here]
    ├── .explorer-resizer | width: 4px, cursor: col-resize
    └── .explorer-right | flex: 1
        └── [MonacoEditorPlugin tabs + editor mounted here]
```

## Interactions

### Split Pane Resize

- **trigger:** `mousedown` on `.explorer-resizer`
- `mousemove` → adjust `.explorer-left` width based on horizontal delta
- Clamp between `minWidth` (150px) and `maxWidth` (50% of total)
- Show semi-transparent drag guideline
- `mouseup` → finalize width, fire `onResize(splitPosition)` callback
- **result:** File explorer and editor panes resized

### File Open (Explorer → Editor)

- **trigger:** Double-click file in left FileExplorerPlugin
- `explorer.openFile(filePath)` → delegates to `MonacoEditorPlugin.openFile(filePath)`
- **result:** File opens in right editor pane

### Command Palette (Ctrl+P)

- **trigger:** Ctrl+P keypress when ExplorerPlugin card is focused
- Lazily instantiate `CommandPalette` if not yet created
- `commandPalette.open()` with workspace root
- `commandPalette.onSelect(path)` → `openFile(path)`
- **result:** Fuzzy file search overlay opens, selected file opens in editor

### Tab Sync

- **trigger:** Tab added/removed in editor (via MonacoEditorPlugin events)
- Not used explicitly — state is serialized through `getState()` which delegates to both children
- **result:** Full split-pane state (explorer expanded paths + editor open tabs) persisted together

## States

### Default

File explorer at default 250px width on left, empty editor on right.

### File Open

File explorer tree expanded to show opened file, editor showing file content with syntax highlighting.

### Resizing

Drag guideline visible, mouse captured, left pane width updating in real-time.

### Command Palette Open

Semi-transparent overlay with search input and file results list, keyboard navigation active.

### Minimized Left Pane

Left pane at 150px minimum, still functional for quick file browsing.

## Accessibility

- **Ctrl+P:** Open command palette
- **Ctrl+`:** Toggle focus between explorer and editor
- **Drag handle:** Minimum 4px clickable zone for resize
