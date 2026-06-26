---
name: Monaco Editor Plugin UI
parent: monaco-editor-plugin
---

# Monaco Editor Plugin UI

DOM structure, tab management, editor interactions, and states for the multi-tab Monaco code editor embedded in a PluginCard.

## DOM Structure

```
.card-body (PluginCard body container)
├── .editor-tab-bar | flex row, scrollable
│   ├── .editor-tab[.active] (one per open file)
│   │   ├── .tab-title (file basename)
│   │   ├── .tab-dirty-indicator (• dot when unsaved)
│   │   └── .tab-close (× button)
│   └── .tab-scroll-arrows (when tabs overflow)
└── .editor-container | flex: 1
    └── [Monaco Editor mounted via editor.create()]
```

## Interactions

### Tab Open (File Open)

- **trigger:** Call `openFile(filePath)` from ExplorerPlugin or FileExplorerPlugin
- If file already open in a tab → switch to existing tab
- Otherwise → `fs:readFile` IPC, create new Monaco model with language from extension, add tab to bar, switch to new tab
- **result:** File content displayed with syntax highlighting, tab added to bar

### Tab Switch

- **trigger:** Click on tab in `.editor-tab-bar`
- Previous tab: save cursor position in model state
- New tab: `editor.setModel(newModel)`, restore cursor position
- Update `.active` class on tabs
- **result:** Different file content editable, active tab highlighted

### Tab Close

- **trigger:** Click × button on tab, or right-click → Close
- If file is dirty (unsaved): show unsaved changes prompt
- Dispose Monaco model, remove tab element
- If closed tab was active: switch to adjacent tab
- **result:** Tab removed, file unloaded from editor

### Tab Context Menu

- **trigger:** Right-click on editor tab
- `ContextMenu.show()` with items: Close, Close Others, Close All, Copy Path
- Close Others: closes all tabs except clicked one
- Copy Path: `clipboard:writeText` with full file path
- **result:** Tab management actions executed

### Save (Ctrl+S)

- **trigger:** Ctrl+S keypress or File → Save menu
- `editor.getValue()` → `fs:writeFile` IPC with file path and content
- Remove dirty indicator from tab
- **result:** File saved to disk, dirty marker cleared

### External File Change

- **trigger:** `file:changed` listener fires for open file
- If file has unsaved changes → prompt: "File changed externally. Reload?"
- If no unsaved changes → auto-reload file content
- **result:** Editor content synced with disk, or user prompted

### Language Detection

- **trigger:** File opened (any method)
- Map file extension to Monaco language ID (`.ts` → `typescript`, `.js` → `javascript`, `.json` → `json`, etc.)
- Set model language for syntax highlighting
- **result:** Correct token colors, autocomplete, and diagnostics

### Cursor Position Reporting

- **trigger:** `editor.onDidChangeCursorPosition` event
- Debounced 300ms → `ide:editorState` IPC with `{ filePath, language, cursorLine, cursorColumn }`
- **result:** IDE server broadcasts cursor position to external editors

## States

### No Tabs

Empty editor container with "Open a file to begin" placeholder.

### Tab Active (Editing)

Single visible tab, Monaco editor focused, cursor visible, syntax highlighting active.

### Multiple Tabs

Tab bar scrollable, one `.active` tab, others inactive (slightly dimmed title).

### Dirty (Unsaved)

Active tab shows `•` dot indicator, title slightly highlighted. On close attempt: unsaved changes prompt.

### Loading

Tab shows spinner or "Loading..." while `fs:readFile` IPC is pending.

### Save In Progress

Tab shows saving indicator, editor temporarily read-only, dirty marker pulsing.

### External Change Detected

Tab title flashes, info bar shows "File changed externally" with Reload button.

## Accessibility

- **Ctrl+Tab:** Cycle forward through tabs
- **Ctrl+Shift+Tab:** Cycle backward through tabs
- **Ctrl+W:** Close active tab
- **Ctrl+S:** Save active file
