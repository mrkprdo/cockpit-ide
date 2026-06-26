---
name: Markdown Plugin UI
file: src/renderer/components/MarkdownPlugin.ts
type: ui
layer: widget
singleton: false
exports: []
---

# Markdown Plugin UI

UI sub-spec for the tabbed Markdown preview viewer: tab bar with drag-and-drop reorder, rendered preview area with scrollable content, and context menu interactions.

## DOM Structure

```json
{
  "root": ".editor-wrap (flex column)",
  "structure": {
    "tab_bar": ".editor-tab-bar containing .editor-tab-scroll with .editor-tab elements",
    "tab": {
      "structure": ".editor-tab (draggable) containing .editor-tab-name + .editor-tab-close (✕)",
      "states": ".is-active (current tab), .is-dragging, .is-dragover (drop target highlight)"
    },
    "preview": ".md-preview (flex:1, overflow:auto) containing .md-content with rendered HTML"
  }
}
```

## Interactions

### click on .editor-tab

Switches to that tab (saves current scroll, loads new content, restores scroll)

### click on .editor-tab-close

Closes the tab; if last tab, shows 'No file loaded' placeholder

### middle-click on .editor-tab

Closes the tab (mouse button 1)

### dragstart/dragover/drop on .editor-tab

Reorders tabs via drag-and-drop (splice array, re-render)

### right-click on .editor-tab

Opens ContextMenu: Close, Close Others, Close All, Copy File Path

### click on rendered link in preview

Opens external URL via electronAPI.shell.openExternal() or navigates internally (handled by custom renderer)

## States

### empty

No tabs open; shows 'No file loaded' in preview and 'No file loaded' in tab bar

### tab-open

At least one tab open; preview shows rendered Markdown

### rendering

Markdown is being parsed and rendered (synchronous but may show partial content)

### error

Render error caught; shows 'Render error' in preview

### file-deleted

External file was deleted; shows 'File deleted' in preview

