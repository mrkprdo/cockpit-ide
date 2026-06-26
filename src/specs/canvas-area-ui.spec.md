---
name: Canvas Area UI
parent: canvas-area
---

# Canvas Area UI

DOM structure, interactions, and visual states for the infinite zoomable/pannable canvas engine that hosts draggable PluginCard instances.

## DOM Structure

```
#canvas (HTMLElement, passed from index.html)
├── .canvas-area | transform: translate(panX, panY) scale(scale)
│   ├── [dot-grid background via canvas-grid CSS]
│   ├── .plugin-card[] (one per loaded plugin, appended by PluginCard)
│   ├── .arrange-overlay (temporary layout grid during auto-arrange)
│   └── .origin-dot (center reference marker at 0,0)
└── .canvas-statusbar (floating bottom bar with zoom%, dimensions, reset button)
```

## Interactions

### Canvas Pan (Middle Mouse Drag)

- **trigger:** `mousedown` (button=1) on `.canvas-area`
- **gesture:** `mousemove` → recalculate `panX += dx / scale`, `panY += dy / scale`
- Set `cursor: grabbing` during drag, `cursor: grab` on idle
- **result:** canvas translates smoothly via CSS transform, world coordinates shift

### Canvas Zoom (Scroll Wheel)

- **trigger:** `wheel` event on `.canvas-area`
- Determine zoom direction from `event.deltaY`
- Compute zoom anchor from mouse position: zoom toward/away from cursor
- Clamp `scale` between 0.25 (25%) and 4.0 (400%)
- Apply cubic-bezier easing on zoom transitions
- Snap to 0.25 increments when close
- Update StatusBar with `statusBar.update(scale, worldWidth, worldHeight)`
- **result:** Cards appear larger/smaller, grid adjusts, status bar reflects new zoom

### Card Drag

- **trigger:** `mousedown` on `.card-header` (delegated to PluginCard)
- Canvas tracks card being dragged, constrains to parent bounds
- **result:** Card position updated in world coordinates, snapped to 28px grid on release

### Card Creation (Right-Click Context Menu)

- **trigger:** `contextmenu` on `.canvas-area` (empty space)
- Compute world coordinates: `worldX = (clientX - panX) / scale`, `worldY = (clientY - panY) / scale`
- `ContextMenu.show([... plugin types], clientX, clientY)` — list of available plugins
- On menu item click → `addPlugin(type, { x: worldX, y: worldY })` → creates PluginCard at click position
- **result:** New card appears at cursor position with default dimensions

### Card Arrangement

- **trigger:** Toolbar button or Arrange menu action
- Overlay `.arrange-overlay` shows grid layout preview
- Snaps all cards to 28px grid in columns, max 3 per row
- **result:** Cards neatly arranged, positions serialized to SaveState

### Card Focus

- **trigger:** `mousedown` on any card surface
- Increment global `zIndexCounter`, set card `zIndex` to new max
- Apply `.focused` class to card (highlight border)
- Remove `.focused` from previously focused card
- **result:** Clicked card comes to front

### Pinch Zoom (Touch)

- **trigger:** Two-finger pinch gesture on touch devices
- Compute scale delta from touch point distance ratio
- Same zoom mechanics as scroll wheel

## States

### Default (Idle)

Canvas at initial 1x zoom, centered origin, grid visible, no cards (or restored cards).

### Panning

Cursor grabbed, canvas translating, grid moves with content.

### Zooming

Scale animating with cubic-bezier ease, grid dot spacing adjusts, status bar updates in real-time.

### Arranging

Arrange overlay visible, cards snapping to grid positions, layout recalculation in progress.

### Card Dragging

Active card follows cursor in world coordinates, snap grid guidance lines visible, other cards static.

### Context Menu Open

Right-click menu floating at click position, canvas interactions suppressed until menu dismissed.

### Empty (No Workspace)

No cards, origin dot centered, status bar shows zero dimensions, grid visible as default background.

## Accessibility

- **Keyboard Pan:** Arrow keys translate canvas by 28px increments
- **Keyboard Zoom:** Ctrl+Plus / Ctrl+Minus zoom in/out
- **Escape:** Dismisses context menu, cancels current drag
