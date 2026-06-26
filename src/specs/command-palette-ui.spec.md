---
name: Command Palette UI
file: src/renderer/components/CommandPalette.ts
type: ui
layer: overlay
singleton: false
exports: []
---

# Command Palette UI

UI sub-spec for the Ctrl+P file search overlay: search input, results list with keyboard navigation, recent files display, and progress indicator.

## DOM Structure

```json
{
  "root": ".palette-overlay (fixed fullscreen, flex centered)",
  "structure": {
    "palette": ".palette (centered box)",
    "children": [
      ".palette-input: search text input with placeholder 'Search files by name...'",
      ".palette-progress: progress bar (visible during file tree walk)",
      ".palette-results: scrollable list of .palette-item elements"
    ],
    "result_item": ".palette-item containing .palette-item-name (file name) + .palette-item-dir (relative path)"
  }
}
```

## Interactions

### input in .palette-input

Debounced 150ms search: filters workspace files by name/path substring, shows up to 50 results

### ArrowDown on input

Moves selection highlight down in results list

### ArrowUp on input

Moves selection highlight up in results list

### Enter on input

Confirms current selection: opens file via onSelectFile callback

### Escape on input

Closes palette

### click on .palette-item

Selects and opens the file

### mouseenter on .palette-item

Updates selection highlight to hovered item

### click on .palette-overlay (background)

Closes palette (if click target is the overlay itself)

## States

### empty-input

No search text; shows recent files list with section header 'RECENT FILES'

### loading

Progress bar visible while loading all workspace files via recursive readDir

### results

Search results visible with selection highlight

### no-results

Shows 'No matching files' placeholder

### no-recents

No recent files and empty input; shows 'No recent files. Start typing to search.'

