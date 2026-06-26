---
name: Context Menu
file: src/renderer/components/ContextMenu.ts
type: ui
layer: overlay
singleton: true
exports: [ContextMenuItem, ContextMenu]
---

# Context Menu

Right-click floating context menu that renders a list of items (label + action callback). Positions itself at the click coordinates, constrained to viewport bounds. Auto-dismisses on click-outside, Escape key, or item selection. Supports separators between item groups. Only one instance visible at a time — opening a new menu destroys any existing one.

## Dependencies

None — standalone overlay widget.

## Referenced By

- **monaco-editor-plugin** `src/renderer/components/MonacoEditorPlugin.ts` — tab context menu (close, close others, copy path)
- **file-explorer-plugin** `src/renderer/components/FileExplorerPlugin.ts` — file/folder context menu (new, rename, delete, copy)
- **markdown-plugin** `src/renderer/components/MarkdownPlugin.ts` — tab context menu (close, copy path)
- **canvas-area** `src/renderer/components/CanvasArea.ts` — canvas right-click context menu

## IPC Channels

None.

## Interface

### Types

- **ContextMenuItem** — `{ label: string; action: () => void; separator?: boolean }`

### Classes

- **ContextMenu**
  - **static show** `(items: ContextMenuItem[], x: number, y: number): ContextMenu` — renders menu at position, returns instance
  - **static hide** `(): void` — dismisses current menu
  - **close** `(): void` — instance dismiss

## State

Menu item list, position, visibility.

## Lifecycle

- **created_by:** static `ContextMenu.show()` call
- **destroyed_by:** click-outside / Escape / item selection

## Test

`src/renderer/components/ContextMenu.test.ts`
