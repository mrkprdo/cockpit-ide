---
name: Terminal Plugin UI
parent: terminal-plugin
---

# Terminal Plugin UI

PTY terminal using xterm.js embedded in a card body.

## DOM Structure

```html
<!-- Inside card-body -->
<div class="terminal-plugin-container" style="width:100%;height:100%;overflow:hidden">
  <!-- xterm.js creates its own terminal DOM inside here -->
</div>
```

## Interactions

### Type Input
- **trigger:** Any keypress when terminal is focused
- xterm's `onData` fires → `electronAPI.terminal.write(uuid, data)` → PTY stdin receives data

### Copy Selection
- **trigger:** `Ctrl+Shift+C` (handled by `attachCustomKeyEventHandler`)
- Read `term.getSelection()`, if non-empty write to clipboard via `electronAPI.clipboard.writeText()`

### Paste
- **trigger:** `Ctrl+Shift+V`
- Read clipboard via `electronAPI.clipboard.readText()`, write to PTY via `electronAPI.terminal.write(uuid, text)`

### Resize
- **trigger:** `ResizeObserver` on container div
- Call `fitAddon.fit()` to adapt cols/rows to new container dimensions
- xterm's `onResize` fires → `electronAPI.terminal.resize(uuid, cols, rows)` → PTY resized

### Container Resize (Card Resize)
- Card resize → container dimensions change → ResizeObserver fires → fitAddon.fit()

## States

### Active
- Terminal cursor blinks, PTY process running.

### Exited
- PTY process exited → `onExit` callback fires → CanvasArea may close the card.
