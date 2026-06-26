---
name: Monaco Editor Plugin
file: src/renderer/components/MonacoEditorPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [MonacoEditorPlugin]
---

# Monaco Editor Plugin

Multi-tab code editor plugin wrapping Monaco Editor 0.53 (AMD-loaded). Manages a tab bar with file tabs (title, dirty indicator, close button) and a Monaco editor instance that switches model on tab selection. Supports: opening files via `fs:readFile`, saving via `fs:writeFile` (Ctrl+S), language detection from file extension, syntax highlighting for 30+ languages, undo/redo, clipboard operations, and external file change detection via `file:changed` listener (auto-reload prompt). Reports cursor position to IDE server via `ide:editorState` IPC.

## Dependencies

- **context-menu** `./ContextMenu` — right-click context menu on editor tabs (close, close others, copy path)
- **theme** `../theme` — reads `theme.isDark` to toggle Monaco between `vs-dark` and `vs` themes

## Referenced By

- **canvas-area** `src/renderer/components/CanvasArea.ts` — creates editor cards
- **explorer-plugin** `src/renderer/components/ExplorerPlugin.ts` — uses as right split pane in explorer mode

## IPC Channels

- `fs:readFile` — loads file content into editor tab
- `fs:writeFile` — saves current editor content to disk
- `file:changed` — listener for external file modifications (prompts reload)
- `ide:editorState` — send, reports cursor line/column to IDE server
- `clipboard:writeText` — copies file path from tab context menu

## Interface

### Classes

- **MonacoEditorPlugin**
  - **constructor** `(container: HTMLElement, cardTitle: string): MonacoEditorPlugin` — creates tab bar + editor
  - **openFile** `(filePath: string): Promise<void>` — opens file in new or existing tab
  - **save** `(): Promise<void>` — saves current tab's file
  - **closeTab** `(filePath: string): void` — closes tab, prompts save if dirty
  - **getActiveFilePath** `(): string | null` — returns active tab file path
  - **getOpenFiles** `(): string[]` — returns all open file paths
  - **focus** `(): void` — focuses editor
  - **undo** `() / redo() / cut() / copy() / paste()` — edit operations
  - **destroy** `(): void` — disposes editor, cleans up
  - **onFocus** — callback `() => void`
  - **onClose** — callback `() => void`

## State

Serialized as `MonacoEditorState`: `{ tabs: { filePath: string; language: string }[]; activeTab: string }`. Restored on workspace load to reopen previously open files.

## Lifecycle

- **created_by:** `CanvasArea` or `ExplorerPlugin` when opening editor
- **destroyed_by:** card close → dispose editor → close all tabs

## External Dependencies

- `monaco-editor` (AMD-loaded)

## Test

`src/renderer/components/MonacoEditorPlugin.test.ts`
