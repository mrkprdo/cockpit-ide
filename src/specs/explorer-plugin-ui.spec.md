---
name: Explorer Plugin UI
parent: explorer-plugin
---

# Explorer Plugin UI

Split-pane layout with file explorer on left and code editor on right.

## DOM Structure

```html
<div class="explorer-split" style="width:100%;height:100%;display:flex;flex-direction:row">
  <div class="explorer-col" style="width:260px;height:100%;overflow:hidden;flex-shrink:0">
    <!-- FileExplorerPlugin DOM -->
  </div>
  <div class="explorer-resize" style="width:2px;height:100%;cursor:col-resize;background:var(--border)"></div>
  <div class="editor-col" style="flex:1;height:100%;overflow:hidden;min-width:200px">
    <!-- MonacoEditorPlugin DOM -->
  </div>
</div>
```

## Interactions

### Resize Split
- **trigger:** `mousedown` on resize handle (2px wide)
- **gesture:** `mousedown` → record startX and startW → `mousemove` on document → `newW = max(120, min(600, startW + dx))` → set `explorerCol.style.width`
- **result:** `onStateChange()` fires, new width persists in save state

### File Open
- FileExplorerPlugin fires `onFileOpen(filePath)` → `editor.openFile(filePath)`
- If editor was hidden (no tabs), editor column becomes visible
