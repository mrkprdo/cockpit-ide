---
name: Monaco Editor Plugin
file: src/renderer/components/MonacoEditorPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [MonacoEditorPlugin]
---

# Monaco Editor Plugin

Multi-tab code editor wrapping Monaco Editor (AMD-loaded). Bootstraps Monaco globals exactly once across all instances via a shared `monacoReady` promise. Renders a tab bar with draggable/reorderable tabs, each showing file name and dirty indicator (`.is-dirty`). Tabs support click to switch, middle-click to close, drag-and-drop reorder, and right-click context menu (Close, Close Others, Close All, Copy File Path). Language detection is based on file extension (30+ languages mapped). Opens files via `electronAPI.fs.readFile`, tracks file contents in a `Map`, and reloads on external file change notifications (`file:changed`). Saves cursor position and scroll top per tab. Exposes agent integration methods: `insertText(text)`, `getSelectionText()`, `setContent(content)`, `goToLine(line, col)`, `getContent()`. Updates editor theme via `updateTheme()` by re-applying Monaco theme rules. Sends editor selection state to the IDE server (`ide:editorState` IPC) with 200ms debounce.

## Dependencies

- **Context Menu** `src/renderer/components/ContextMenu.ts` — right-click tab context menu
- **Theme System** `src/renderer/theme.ts` — read theme colors to sync Monaco theme

## Referenced By

- **Explorer Plugin** `src/renderer/components/ExplorerPlugin.ts` — creates and manages one MonacoEditorPlugin per explorer card

## IPC Channels

- `fs:readFile` — load file content into editor
- `fs:writeFile` — save file content
- `file:changed` — external file change notification for reload
- `ide:editorState` — send cursor/selection state to IDE server for broadcasting to external tools
- `clipboard:writeText` — "Copy File Path" context menu action
