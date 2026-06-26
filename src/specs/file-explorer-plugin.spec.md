---
name: File Explorer Plugin
file: src/renderer/components/FileExplorerPlugin.ts
type: ui
layer: widget
singleton: false
exports: [FileExplorerPlugin]
---

# File Explorer Plugin

Recursive file tree browser displayed in the left split pane of ExplorerPlugin. Renders a nested directory tree with color-coded file names by extension, expandable/collapsible directories, inline file/folder creation via input field, inline rename, delete with ConfirmModal, copy-paste across directories, and context menus on files and empty areas. Watches for external file changes to auto-refresh the tree. Supports selecting a file and revealing it in the tree via selectFile().

## Dependencies

- [[context-menu.spec.md|context-menu]] `src/renderer/components/ContextMenu.ts` — Opens right-click context menus on files (open/rename/delete/copy path/open in markdown) and empty area (new file/folder/paste)
- [[confirm-modal.spec.md|confirm-modal]] `src/renderer/components/ConfirmModal.ts` — Prompts confirmation before deleting files or directories

## Referenced By

- [[explorer-plugin.spec.md|explorer-plugin]] `src/renderer/components/ExplorerPlugin.ts`

## IPC Channels

- `fs:readDir`
- `fs:readFile`
- `fs:writeFile`
- `fs:mkdir`
- `fs:delete`
- `fs:copy`
- `fs:rename`
- `file:changed`

## Interface

### Methods

- **constructor** `(container: HTMLElement, rootPath: string, onFileOpen: (path: string) => void)` — Builds tree header and scrollable container, loads root directory, watches file changes
- **selectFile** `(filePath: string): Promise<void>` — Expands parent directories and highlights the given file
- **refresh** `(): Promise<void>` — Clears and reloads the entire file tree from disk
- **setMarkdownOpeners** `(labels: string[], callback: (filePath: string, label: string) => void): void` — Registers right-click 'Open in Markdown' menu items

### Properties

- **selectedPath**: string | null — Currently selected/highlighted file path

## Lifecycle

- **created_by:** ExplorerPlugin constructor
- **destroyed_by:** Card removal (via CanvasArea)

