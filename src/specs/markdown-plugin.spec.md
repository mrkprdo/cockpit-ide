---
name: Markdown Plugin
file: src/renderer/components/MarkdownPlugin.ts
type: ui
layer: widget
singleton: false
exports: [MarkdownPlugin, MarkdownState]
---

# Markdown Plugin

Tabbed Markdown preview viewer. Loads .md files via electronAPI.fs.readFile, renders them to styled HTML using the 'marked' library with a custom Renderer that escapes raw HTML and prevents javascript: links. Supports multiple tabs with drag-and-drop reorder, close buttons, middle-click close, right-click context menu (Close/Close Others/Close All/Copy Path), external file change auto-reload preserving scroll position, and serializable state (open files, active file, per-tab scroll positions) for session persistence.

## Dependencies

- [[context-menu.spec.md|context-menu]] `src/renderer/components/ContextMenu.ts` — Opens right-click context menu on tabs with close/reorder/copy-path actions

## Referenced By

- [[canvas-area.spec.md|canvas-area]] `src/renderer/components/CanvasArea.ts`

## IPC Channels

- `fs:readFile`
- `file:changed`

## Interface

### Methods

- **constructor** `(container: HTMLElement)` — Builds tab bar, preview area, wires file change listener
- **loadFile** `(filePath: string): Promise<void>` — Loads a .md file, creates a tab, switches to it, renders preview
- **getState** `(): MarkdownState` — Returns serializable state: open files, active file, per-tab scroll positions
- **restoreState** `(state: MarkdownState): Promise<void>` — Restores tabs and scroll positions from saved state, includes legacy single-file format support
- **destroy** `(): void` — Cleans up file change listener

### Properties

- **title**: string — Card title (set by CanvasArea)
- **onDestroy**: (() => void) | null — Cleanup callback

## Lifecycle

- **created_by:** CanvasArea.addMarkdown()
- **destroyed_by:** CanvasArea.terminateCard()

## External Dependencies

- `marked`

