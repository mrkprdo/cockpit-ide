---
name: Context Menu
file: src/renderer/components/ContextMenu.ts
type: ui
layer: overlay
singleton: false
exports: [ContextMenu, ContextMenuItem]
---

# Context Menu

Floating right-click context menu overlay. Constructed with an array of `ContextMenuItem` (label, action, disabled, separator) and screen coordinates. Creates a `<div class="ctx-menu">` positioned absolutely at (x, y). Appends to `document.body`. Each item is a `<div class="ctx-item">` with optional `ctx-disabled` styling. Disabled items do not fire on click. A global `click` listener on `document` (registered on next tick) closes the menu on outside click. A static `openMenus` array tracks all instances; new menus close existing ones. Fires `onClose` callback on removal.

## Dependencies

No imports from `src/`.

## Referenced By

- **Canvas Area** `src/renderer/components/CanvasArea.ts` — right-click on plugin list items
- **Monaco Editor Plugin** `src/renderer/components/MonacoEditorPlugin.ts` — right-click on editor tabs
- **Markdown Plugin** `src/renderer/components/MarkdownPlugin.ts` — right-click on markdown tabs
- **File Explorer Plugin** `src/renderer/components/FileExplorerPlugin.ts` — right-click on files/tree and empty area

## IPC Channels

None — pure DOM overlay.
