---
name: Markdown Plugin
file: src/renderer/components/MarkdownPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [MarkdownPlugin, MarkdownState]
---

# Markdown Plugin

Tabbed Markdown preview viewer. Each tab corresponds to one `.md` file. Uses the `marked` library with a custom `Renderer` that escapes raw HTML in code blocks and prevents `javascript:` URLs in links. The preview pane scrolls independently; scroll position is saved per tab and restored on switch. Tabs support click to switch, middle-click to close, drag-and-drop reorder, and right-click context menu (Close, Close Others, Close All, Copy File Path). Tab bar matches the style of MonacoEditorPlugin's tab bar (`editor-tab-bar`, `editor-tab-scroll`). Externally changed files auto-reload (via `file:changed` IPC), preserving scroll position. Serializes/restores open tabs, active tab, and per-tab scroll positions. Supports legacy single-file save state format for backward compatibility.

## Dependencies

- **Context Menu** `src/renderer/components/ContextMenu.ts` — right-click tab context menu

## Referenced By

- **Canvas Area** `src/renderer/components/CanvasArea.ts` — instantiates MarkdownPlugin per markdown card

## IPC Channels

- `fs:readFile` — load markdown content
- `file:changed` — external file change notification for auto-reload
- `clipboard:writeText` — "Copy File Path" context menu action
