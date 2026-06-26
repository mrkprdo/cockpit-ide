---
name: Explorer Plugin
file: src/renderer/components/ExplorerPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [ExplorerPlugin]
---

# Explorer Plugin

Split-pane plugin combining a FileExplorerPlugin (left panel) and a MonacoEditorPlugin (right panel) in a resizable horizontal layout. The file explorer opens files in the adjacent editor on double-click. Provides a `CommandPalette` (Ctrl+P) for fuzzy file finding — opened lazily on first use. Serves as the primary code browsing interface, replacing standalone editor and explorer cards with an integrated IDE-like experience.

## Dependencies

- **file-explorer-plugin** `./FileExplorerPlugin` — left pane file browser
- **monaco-editor-plugin** `./MonacoEditorPlugin` — right pane code editor
- **command-palette** `./CommandPalette` — Ctrl+P fuzzy file finder (lazily instantiated)

## Referenced By

- **canvas-area** `src/renderer/components/CanvasArea.ts` — creates explorer cards

## IPC Channels

None directly — delegates all IPC to child components.

## Interface

### Classes

- **ExplorerPlugin**
  - **constructor** `(container: HTMLElement, workspacePath: string): ExplorerPlugin` — creates split pane layout
  - **openFile** `(filePath: string): Promise<void>` — opens file in right editor, expands tree to file
  - **openCommandPalette** `(): void` — shows fuzzy file finder overlay
  - **focus** `(): void` — focuses the editor
  - **destroy** `(): void` — tears down both panes
  - **onFocus** — callback `() => void`
  - **onClose** — callback `() => void`

## State

Serialized as `ExplorerState`: `{ explorerState: any; editorState: MonacoEditorState; splitPosition: number }`. The editor state is delegated to MonacoEditorPlugin; the file explorer state is a nested serializable blob.

## Lifecycle

- **created_by:** `CanvasArea.createExplorer()` on Explorer menu/toolbar action
- **destroyed_by:** card close → destroy both child components

## Test

`src/renderer/components/ExplorerPlugin.test.ts`
