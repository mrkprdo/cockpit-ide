---
name: Canvas Area UI
parent: canvas-area
---

# Canvas Area UI

The infinite canvas with zoom/pan, plugin card management, and two corner interaction zones.

## DOM Structure

```html
<div id="canvas">
  <!-- Grid background via CSS -->
  <div class="origin-dot"></div>
  <div class="viewport" style="transform: scale(...) translate(...)">
    <!-- PluginCard divs positioned here -->
  </div>
  <button class="pli-zone">  <!-- lower-left plugin list -->
    <span class="pli-icon">◣</span>
    <div class="plugin-list-panel"></div>
  </button>
  <button class="prr-zone">  <!-- lower-right arrange panel -->
    <span class="prr-icon">◢</span>
    <div class="arr-panel"></div>
  </button>
</div>
```

## Interactions

### Canvas Pan
- **trigger:** `mousedown` on empty canvas area, `mousemove`, `mouseup`
- **gesture:** Left-click drag on canvas (or Ctrl+drag over a card)
- Set `isPanning = true`, record start position and pan. On mousemove: `panX = startPanX + (clientX - startX)`, `panY = startPanY + (clientY - startY)`. Clamp to ±WORLD_BOUNDS * scale. Schedule transform via `requestAnimationFrame`.
- **result:** Viewport transform updated, grid background repositioned

### Canvas Zoom
- **trigger:** `wheel` event on canvas container
- Compute delta from `e.deltaY`. Multiply scale by `1.1` (zoom in) or `1/1.1` (zoom out). Clamp to `[0.1, 5.0]`. Zoom centers on mouse position by adjusting panX/panY: `panX = e.clientX - (e.clientX - panX) * newScale / scale`. Schedule transform.
- **result:** All cards scale via CSS transform, grid pattern resizes

### Plugin List Hover
- **trigger:** `mouseenter` on `.pli-zone` (or focus/keyboard)
- Build sorted list of all cards. Render `.pli-item` per card with name and "(minimized)" suffix. Show panel.
- **result:** Plugin list panel displayed above the zone button

### Plugin List Item Click
- **trigger:** `click` on `.pli-item`
- If card is open: `focusCard(title)` + `panToCard(cs)`. If minimized: `reopenCard(cs)`.
- **result:** Card focused or restored

### Plugin List Context Menu
- **trigger:** `contextmenu` on `.pli-item`
- Show ContextMenu with "Show" and "Terminate/Close" actions.

### Arrange Panel Hover
- **trigger:** `mouseenter` on `.prr-zone`
- Render arrange items: Auto Arrange, Tile Plugins, Snap Origin. Show W×H input row for tile dimensions.
- **result:** Arrange panel displayed

### Arrange Action Click
- **trigger:** `click` on `.arr-item`
- Execute action: `autoArrange()`, `tilePlugins()`, `snapOrigin()`.

## States

### Panning active
- `isPanning = true`, cursor changes to grabbing, transform updates on mousemove.

### Zoom level
- Scale value `0.1`–`5.0`. Displayed in status bar as percentage.

### Locked
- `_locked = true`: wheel zoom and pan disabled. Lock icon shown in status bar.
