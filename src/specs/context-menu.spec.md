---
name: Context Menu
file: src/renderer/components/ContextMenu.ts
type: ui
layer: widget
singleton: false
exports: [ContextMenu, ContextMenuItem]
---

# Context Menu

Floating right-click context menu singleton. Renders a positioned menu at cursor coordinates with items (label + action callback) and optional separators and disabled state. Closes on any click outside the menu. Supports chaining via menu array with separator: true support. Only one context menu can be open at a time — previous menu is closed on new creation.

## Referenced By

- [[file-explorer-plugin.spec.md|file-explorer-plugin]] `src/renderer/components/FileExplorerPlugin.ts`
- [[monaco-editor-plugin.spec.md|monaco-editor-plugin]] `src/renderer/components/MonacoEditorPlugin.ts`
- [[markdown-plugin.spec.md|markdown-plugin]] `src/renderer/components/MarkdownPlugin.ts`
- [[canvas-area.spec.md|canvas-area]] `src/renderer/components/CanvasArea.ts`

## Interface

### Methods

- **constructor** `(items: ContextMenuItem[], x: number, y: number)` — Creates positioned menu with items, closes any existing context menu
- **remove** `(): void` — Removes the menu DOM element and triggers onClose

### Properties

- **onClose**: (() => void) | null — Callback invoked when menu is closed

## Lifecycle

- **created_by:** Right-click event handler in FileExplorerPlugin, MonacoEditorPlugin, MarkdownPlugin, or CanvasArea
- **destroyed_by:** Click outside menu, or explicit remove() call

