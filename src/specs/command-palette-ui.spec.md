---
name: Command Palette UI
parent: command-palette
---

# Command Palette UI

Fuzzy file search overlay with input and results list.

## DOM Structure

```html
<div class="palette-overlay" role="dialog" aria-modal="true">
  <div class="palette">
    <input class="palette-input" placeholder="Search files by name...">
    <div class="palette-progress" style="display:none">
      <div class="palette-progress-bar"></div>
    </div>
    <div class="palette-results">
      <div class="palette-item is-selected">
        <span class="palette-item-name">file.ts</span>
        <span class="palette-item-dir">src/renderer</span>
      </div>
    </div>
  </div>
</div>
```

## Interactions

### Type in Input
- **trigger:** `input` on `.palette-input`
- Debounce 150ms, then perform search: filter `allFiles` by substring match on name or path. Show top 50 results.

### Arrow Key Navigation
- **trigger:** `ArrowDown` / `ArrowUp` on input
- Move `selectedIndex` up/down, clamp to results bounds. Update `.is-selected` class.

### Enter Selection
- **trigger:** `Enter` on input
- `confirmSelection()`: if query empty and recent files exist, select from recent. Otherwise select from results. Fire `onSelectFile(filePath)`.

### Escape
- **trigger:** `Escape` on input
- Close palette.

### Mouse Hover
- **trigger:** `mouseenter` on `.palette-item`
- Update `selectedIndex` to hovered item, toggle `.is-selected`.

### Mouse Click
- **trigger:** `mousedown` on `.palette-item`
- Select file directly.

## States

### Open
- `.open` class on overlay, input focused.

### Closed
- `.open` class removed, input blurred.

### Loading
- Progress bar visible while walking directory tree. Shows "Searching files..." text.

### Empty Results
- No matches: "No matching files". No query + no recent: "No recent files. Start typing to search."

### Recent Files
- Empty query: shows "RECENT FILES" header with up to 10 recent files from localStorage.
