---
name: Monaco Editor Plugin
file: src/renderer/components/MonacoEditorPlugin.ts
type: ui
layer: widget
singleton: false
exports: [MonacoEditorPlugin]
---

# Monaco Editor Plugin

Multi-tab code editor based on Monaco Editor (AMD-loaded). Manages a list of open file tabs with drag-and-drop reordering, close buttons, middle-click close, right-click context menu (Close/Close Others/Close All/Copy Path), dirty indicators, and language detection by extension (30+ languages mapped). Persists cursor positions and scroll positions per tab. Saves file contents on tab switch and auto-saves on external file changes. Exposes editor state (tabs, active file, cursors) for session persistence and AI agent access.

## Dependencies

- [[context-menu.spec.md|context-menu]] `src/renderer/components/ContextMenu.ts` — Opens right-click context menu on tabs with close/reorder/copy-path actions
- [[theme.spec.md|theme]] `src/renderer/theme.ts` — Reads theme colors (unused directly in this file but imported for potential editor theme integration)

## Referenced By

- [[explorer-plugin.spec.md|explorer-plugin]] `src/renderer/components/ExplorerPlugin.ts`
- [[canvas-area.spec.md|canvas-area]] `src/renderer/components/CanvasArea.ts`

## IPC Channels

- `ide:editorState`

## Interface

### Methods

- **constructor** `(container: HTMLElement)` — Builds tab bar, editor area, inits Monaco with AMD loader, wires file change listener
- **openFile** `(filePath: string): Promise<void>` — Opens file in a new tab or switches to existing tab; reads content from disk
- **switchTab** `(filePath: string): void` — Saves current cursor/scroll, loads new tab content, restores cursor
- **closeActiveTab** `(): void` — Closes the currently active tab
- **getContent** `(): string` — Returns current editor content
- **insertText** `(text: string): void` — Replaces current selection with text
- **getSelectionText** `(): string` — Returns selected text
- **setContent** `(content: string): void` — Replaces editor content (for AI agent)
- **goToLine** `(line: number, col?: number): void` — Moves cursor to line/col
- **getState** `(): { openFiles: string[]; activeFile: string; cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }> } | null` — Serializable editor state for persistence
- **restoreState** `(state: ...): Promise<void>` — Restores open tabs and cursor positions from saved state
- **reloadIfOpen** `(filePath: string): Promise<void>` — Reloads file content from disk if tab is open (triggered by external file changes)

### Properties

- **tabs**: Tab[] — Array of open file tabs with filePath, name, and originalPath
- **activeTab**: string | null — Lowercased file path of the active tab
- **onStateChange**: (() => void) | null — Callback when tabs or active file change

## Lifecycle

- **created_by:** ExplorerPlugin constructor
- **destroyed_by:** Card removal via CanvasArea

## External Dependencies

- `monaco-editor (AMD-loaded from vs/)`

