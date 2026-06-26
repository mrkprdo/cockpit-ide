---
name: Markdown Plugin
file: src/renderer/components/MarkdownPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [MarkdownState, MarkdownPlugin]
---

# Markdown Plugin

Multi-tab Markdown preview viewer plugin. Renders `.md` files as HTML using the `marked` library with syntax-highlighted code blocks. Manages a tab bar for multiple open markdown files, each tab rendering into a scrollable content area. Supports: opening files via `fs:readFile`, tab switching, tab close with context menu, auto-reload on external file changes via `file:changed` listener, and copy file path from tab context menu.

## Dependencies

- **context-menu** `./ContextMenu` — right-click context menu on markdown tabs (close, close others, copy path)

## Referenced By

- **canvas-area** `src/renderer/components/CanvasArea.ts` — creates markdown viewer cards

## IPC Channels

- `fs:readFile` — loads markdown file content for rendering
- `file:changed` — listener for auto-reload on external changes
- `clipboard:writeText` — copies file path from tab context menu

## Interface

### Types

- **MarkdownState** — `{ tabs: { filePath: string; title: string }[]; activeTab: string }`

### Classes

- **MarkdownPlugin**
  - **constructor** `(container: HTMLElement): MarkdownPlugin` — creates tab bar + content area
  - **openFile** `(filePath: string): Promise<void>` — loads and renders markdown file
  - **closeTab** `(filePath: string): void` — closes tab
  - **getActiveFilePath** `(): string | null`
  - **destroy** `(): void` — cleans up listeners
  - **onFocus** — callback `() => void`
  - **onClose** — callback `() => void`

## State

Serialized as `MarkdownState` with open tabs and active tab index. Restored on workspace load.

## Lifecycle

- **created_by:** `CanvasArea.createMarkdownViewer()` when opening markdown files
- **destroyed_by:** card close → remove listeners

## External Dependencies

- `marked`

## Test

`src/renderer/components/MarkdownPlugin.test.ts`
