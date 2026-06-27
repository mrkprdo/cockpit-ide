---
name: Plugin Card UI
parent: plugin-card
---

# Plugin Card UI

Draggable, resizable card widget hosting plugin content.

## DOM Structure

```html
<div class="card" style="left: Xpx; top: Ypx; width: Wpx; height: Hpx;">
  <div class="card-header">
    <div class="card-title-area">
      <div class="card-title-text">Terminal 1</div>
    </div>
    <div class="card-controls">
      <button class="card-btn card-btn-minimize" title="Minimize"><!-- SVG minus --></button>
      <button class="card-btn card-btn-fitview" title="Fit Viewport"><!-- SVG expand --></button>
      <button class="card-btn card-btn-terminate" title="Close"><!-- SVG X --></button>
    </div>
  </div>
  <div class="card-body"><!-- plugin DOM mounted here --></div>
  <div class="card-edge card-edge-e"></div>
  <div class="card-edge card-edge-s"></div>
  <div class="card-edge card-edge-se"></div>
</div>
```

## Interactions

### Drag (Move)
- **trigger:** `mousedown` on `.card-header` (not on `.card-controls` buttons)
- **gesture:** `mousedown` → record offset and start world coords → `mousemove` on document → update `el.style.left/top` = `snappedWorld * scale + pan`
- `snap(v) = round(v / 28) * 28`
- **result:** `onDragEnd(worldX, worldY)` fires with snapped coordinates

### Resize
- **trigger:** `mousedown` on `.card-edge-e`, `.card-edge-s`, or `.card-edge-se`
- **gesture:** record start mouse + dimensions → `mousemove` → compute new W/H = `max(280, round((start + delta) / 28) * 28)`
- east handle changes width only, south changes height only, southeast changes both
- **result:** `onResizeEnd(width, height)` fires

### Minimize Button
- **trigger:** `click` on `.card-btn-minimize`
- Fires `onMinimize()` callback — hides card body

### Fit Viewport Button
- **trigger:** `click` on `.card-btn-fitview`
- Fires `onFitViewport()` callback — canvas pans/zooms to frame the card

### Close Button
- **trigger:** `click` on `.card-btn-terminate`
- Fires `onTerminate()` callback — removes card and destroys plugin

### Header Double-click
- **trigger:** `dblclick` on `.card-header` (not on controls)
- Fires `onFitViewport()` — same as fit viewport button

### Header Context Menu
- **trigger:** `contextmenu` on `.card-header`
- Fires `onHeaderContextMenu(e)` — allows canvas to show card-level context menu

## States

### Default
- Dashed `var(--border)` border, `var(--surface)` background. Title text in bold primary.

### Hover
- Card shadow intensifies, border color shifts to `var(--tertiary)`.

### Arranging
- CSS class `.card-arranging` toggles `transition: left/top/width/height 0.25s ease`.

### Minimized
- Card body hidden; only header visible. (Handled by CanvasArea.)
