---
name: Explorer Plugin
file: src/renderer/components/ExplorerPlugin.ts
type: ui
layer: widget
singleton: false
exports: [ExplorerPlugin]
---

# Explorer Plugin

Split-pane container combining a FileExplorerPlugin (file tree, left column) and MonacoEditorPlugin (code editor, right column). The splitter handle is draggable (2px wide, accent-colored on hover). The editor column hides when no tabs are open. Provides convenience methods (openFile, insertText, getSelectionText, setEditorContent, goToLine, getAgentEditorState) that delegate to the editor, and revealFile/revealFile that delegating to the file tree. Creates a CommandPalette on demand for Ctrl+P file search.

## Dependencies

- [[file-explorer-plugin.spec.md|file-explorer-plugin]] `src/renderer/components/FileExplorerPlugin.ts` — Creates the file tree explorer in the left split pane
- [[monaco-editor-plugin.spec.md|monaco-editor-plugin]] `src/renderer/components/MonacoEditorPlugin.ts` — Creates the Monaco editor in the right split pane
- [[command-palette.spec.md|command-palette]] `src/renderer/components/CommandPalette.ts` — Lazily creates a CommandPalette for Ctrl+P file search

## Referenced By

- [[canvas-area.spec.md|canvas-area]] `src/renderer/components/CanvasArea.ts`

## Interface

### Methods

- **constructor** `(container: HTMLElement, wsPath: string)` — Builds flex-row split layout with FileExplorerPlugin, MonacoEditorPlugin, and draggable resize handle
- **openFile** `(filePath: string): void` — Opens file in editor and reveals in tree
- **revealFile** `(filePath: string): void` — Selects and scrolls to file in the file tree
- **closeActiveTab** `(): void` — Closes the currently active editor tab
- **openFileSearch** `(): void` — Opens the Ctrl+P command palette
- **insertText** `(text: string): void` — Inserts text at cursor in the active editor
- **getSelectionText** `(): string` — Returns selected text in the active editor
- **setEditorContent** `(content: string): void` — Replaces editor content
- **goToLine** `(line: number, col?: number): void` — Moves cursor to line/column in editor
- **getAgentEditorState** `(): EditorSelectionState | null` — Returns editor state for AI agent consumption
- **getEditorState** `(): EditorState | null` — Returns serializable editor tabs, active file, cursors, and explorer width
- **restoreEditorState** `(state: EditorState | null): Promise<void>` — Restores open tabs, active file, and splitter width from saved state
- **updateTheme** `(): void` — Triggers editor theme update

### Properties

- **editor**: MonacoEditorPlugin — The code editor instance in the right pane
- **palette**: CommandPalette | null — Lazy-created file search palette
- **onStateChange**: (() => void) | null — Callback when split width or editor state changes

## Lifecycle

- **created_by:** CanvasArea.addExplorer()
- **destroyed_by:** CanvasArea.terminateCard()

