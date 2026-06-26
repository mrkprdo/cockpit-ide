---
name: Plugin Card UI
parent: plugin-card
---

# Plugin Card UI

DOM structure, drag/resize interactions, and visual states for the draggable card widget.

## DOM Structure

```
.plugin-card | position: absolute; transform: translate(worldX, worldY) scale(canvasScale)
├── .card-header
│   ├── .card-title (text, set by setTitle)
│   └── .card-controls
│       ├── button.minimize (toggles minimize)
│       ├── button.maximize (toggles full-size)
│       └── button.close (fires onClose, destroys card)
├── .card-body (plugin content mount point)
└── .card-resize-handles
    ├── .resize-top
    ├── .resize-bottom
    ├── .resize-left
    ├── .resize-right
    ├── .resize-top-left
    ├── .resize-top-right
    ├── .resize-bottom-left
    └── .resize-bottom-right
```

## Interactions

### Card Drag

- **trigger:** `mousedown` on `.card-header`
- Prevent text selection during drag
- `mousemove` → `onDrag(dx, dy)` → Card updates `el.style.left/top` based on accumulated delta
- Constrain to parent container bounds (min 0, max = parentWidth - cardWidth)
- `mouseup` → `onDragEnd(worldX, worldY)` → snap to 28px grid, fire callback
- **result:** Card moved to new world position, snapped to grid

### Card Resize

- **trigger:** `mousedown` on any `.card-resize-*` handle
- Determine resize direction from handle class (n, s, e, w, ne, nw, se, sw)
- Each direction modifies width/height and optionally x/y offset
- Enforce minimum size (200px × 100px by default)
- `mousemove` → `onResize(width, height)` → card dimensions update in real-time
- `mouseup` → `onResizeEnd(width, height)` → snap to 28px grid, fire callback
- **result:** Card resized, minimum bounds enforced

### Card Focus

- **trigger:** `mousedown` anywhere on card
- `onFocus()` callback → parent (CanvasArea) brings card to front
- Card receives `.focused` CSS class (accent border glow)
- **result:** Card visually brought forward, z-index elevated

### Minimize

- **trigger:** Click `.minimize` button
- Toggle `.minimized` class → card body collapses to header-only (height: header)
- Click again → restores full height
- **result:** Card toggles between compact header and full content

### Maximize

- **trigger:** Click `.maximize` button
- Card expands to fill parent container (full available space)
- Click again → restores previous size
- **result:** Card fills canvas viewport or returns to prior dimensions

### Close

- **trigger:** Click `.close` button
- `onClose()` callback → CanvasArea removes card and destroys plugin
- **result:** Card removed from DOM, plugin destroyed

### Keyboard

- **trigger:** Card is focused + keypress
- `Escape`: blurs card, deselects
- Tab: cycles focus between cards

## States

### Normal

Card at specified position/size, header + body visible, no interaction.

### Focused

Accent border (2px dashed `--accent-primary`), z-index elevated above other cards.

### Dragging

Opacity slightly reduced (0.95), `cursor: move` on header, card follows cursor, snap grid visible.

### Resizing

`cursor` changes to direction-appropriate resize arrow, minimum size lines shown when approaching limits.

### Minimized

Card body `display: none` or height collapsed to 0, only header visible, title remains.

### Maximized

Card fills parent container (100% width/height), resize handles hidden, minimize/restore button shows restore icon.

### Closing

Brief fade-out animation (opacity 1→0 over 150ms), then DOM removal.
