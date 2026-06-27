---
name: Monaco Editor Plugin UI
parent: monaco-editor-plugin
---

# Monaco Editor Plugin UI

Multi-tab code editor with Monaco embedded.

## DOM Structure

```html
<div class="editor-wrap">
  <div class="editor-tab-bar">
    <div class="editor-tab-scroll" id="tab-container">
      <div class="editor-tab is-active is-dirty" draggable="true" title="src/file.ts">
        <span class="editor-tab-name">file.ts</span>
        <span class="editor-tab-close">✕</span>
      </div>
      <!-- more tabs -->
    </div>
  </div>
  <div class="editor-area" id="monaco-{uuid}"><!-- Monaco mounts here --></div>
</div>
```

## Interactions

### Tab Click
- **trigger:** `click` on `.editor-tab`
- Save current editor content + cursor position → `switchTab(filePath)` → set value, restore cursor/scroll → `sendEditorState()`

### Tab Close Button
- **trigger:** `click` on `.editor-tab-close`
- `closeTab(filePath)` → remove from `tabs` array, delete file content. If active tab closed, switch to neighbor.

### Middle-click Close
- **trigger:** `mousedown` button 1 (middle) on `.editor-tab`
- Calls `closeTab(filePath)`

### Tab Context Menu
- **trigger:** `contextmenu` on `.editor-tab`
- Show ContextMenu: Close, Close Others, Close All, separator, Copy File Path

### Tab Drag Reorder
- **trigger:** `dragstart`/`dragover`/`drop` on `.editor-tab`
- `dragstart` sets dataTransfer to filePath. `drop` reorders `tabs` array and calls `renderTabs()`.

### Text Editing
- **trigger:** Any keyboard input in Monaco editor
- Content and cursor tracked per tab. Dirty state tracked via `onDidChangeModelContent` listener.

### Editor Context Menu
- **trigger:** `contextmenu` in editor area
- Monaco's built-in context menu appears.

## States

### Tab States
- **Active** (`.is-active`): highlighted tab with accent bottom border
- **Dirty** (`.is-dirty`): shows a dot or modified indicator
- **Dragging** (`.is-dragging`): reduced opacity during drag
- **Dragover** (`.is-dragover`): insertion indicator border

### Empty State
- No tabs open → tab bar shows "No file selected", editor area shows empty content
