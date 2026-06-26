---
name: Command Palette UI
parent: command-palette
---

# Command Palette UI

DOM structure, fuzzy search, keyboard navigation, and file selection interactions for the Ctrl+P CommandPalette.

## DOM Structure

```
.command-palette-overlay | position: fixed; inset: 0; z-index: 2000
└── .command-palette | centered top: 20%, max-width: 600px
    ├── input.command-palette-input (search field, auto-focused)
    └── .command-palette-results | max-height: 400px; overflow-y: auto
        └── .palette-item[] (one per matching file)
            ├── .palette-icon (file type icon)
            ├── .palette-name (file basename)
            └── .palette-path (relative directory path, muted)
```

## Interactions

### Search / Filter

- **trigger:** Typing in `.command-palette-input`
- Debounce 150ms → fuzzy-match input against indexed file paths
- Files scored by match quality: exact basename match > path contains > fuzzy match
- Results limited to 50 items for performance
- **result:** Filtered results list updated, top item highlighted

### Keyboard Navigation

- **trigger:** ArrowUp / ArrowDown keys
- Move `.highlighted` class through `.palette-item` list
- Scroll results container to keep highlighted item visible
- **result:** Selection indicator moves through list

### Select File (Enter)

- **trigger:** Enter key on highlighted `.palette-item`
- Fire `onSelect(filePath)` callback
- Close palette overlay
- **result:** File opens in editor, palette dismissed

### Select File (Click)

- **trigger:** Click on `.palette-item`
- Same as Enter → `onSelect(filePath)` → close
- **result:** File opens, palette dismissed

### Close (Escape)

- **trigger:** Escape key
- Fire `onClose()` callback
- Remove overlay from DOM
- **result:** Palette dismissed without selection

### Close (Overlay Click)

- **trigger:** Click on `.command-palette-overlay` background
- Same as Escape → dismiss
- **result:** Palette dismissed

## States

### Closed

Overlay hidden (not in DOM or `display: none`).

### Open (Empty Query)

All indexed files displayed (first 50 alphabetically), input focused, blinking cursor.

### Open (With Results)

Filtered results list, first item highlighted by default, search query visible in input.

### No Results

"0 files found" message displayed in results area, input still focused for revising query.

### Loading (Initial Index)

If first open for a workspace: "Scanning files..." shown while `fs:readDir` scans recursively.

## Accessibility

- **Ctrl+P:** Toggle palette open/close
- **Arrow keys:** Navigate results
- **Enter:** Select highlighted file
- **Escape:** Close palette
- **Tab:** No action (input captures all typing)
