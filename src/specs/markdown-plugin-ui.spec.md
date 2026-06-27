---
name: Markdown Plugin UI
parent: markdown-plugin
---

# Markdown Plugin UI

Tabbed Markdown preview viewer.

## DOM Structure

```html
<div class="editor-wrap">
  <div class="editor-tab-bar">
    <div class="editor-tab-scroll">
      <div class="editor-tab is-active" draggable="true" title="file.md">
        <span class="editor-tab-name">file.md</span>
        <span class="editor-tab-close">✕</span>
      </div>
    </div>
  </div>
  <div class="md-preview">
    <div class="md-content"><!-- rendered markdown HTML --></div>
  </div>
</div>
```

## Interactions

### Tab Click
- **trigger:** `click` on `.editor-tab`
- Save current scroll position → `switchTab(filePath)` → load content, render markdown, restore scroll

### Tab Close
- **trigger:** `click` on `.editor-tab-close` or middle-click on tab
- `closeTab(filePath)` → remove from tabs. If last tab closed, show "No file loaded".

### Tab Context Menu
- **trigger:** `contextmenu` on `.editor-tab`
- ContextMenu: Close, Close Others, Close All, Copy File Path

### Tab Drag Reorder
- **trigger:** `dragstart`/`drop` on `.editor-tab`
- Same drag-and-drop reorder as Monaco editor tabs.

### Scroll
- **trigger:** `scroll` on `.md-preview`
- Scroll position saved per tab in `scrollTops` map.

## States

### Active Tab
- `.is-active` class on the selected tab.

### Empty State
- No tabs: shows `<div class="md-status">No file loaded</div>`

### Loading
- While reading file content: brief flash of previous content then replaced.

### Error
- Render error: shows `<div class="md-status is-error">Render error</div>`
- File deleted externally: shows `<div class="md-status">File deleted</div>`
