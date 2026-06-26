---
name: File Explorer Plugin
file: src/renderer/components/FileExplorerPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [FileExplorerPlugin]
---

# File Explorer Plugin

Recursive file tree browser plugin rendering a directory as expandable/collapsible tree nodes. Supports: click to select files, double-click to open in editor (fires `onOpenFile` callback), context menu for file operations (new file, new folder, rename, delete with ConfirmModal, copy, paste), keyboard navigation (arrows, Enter), and auto-refresh on external file changes via `file:changed` listener with debounce. Uses DirEntry type for node data.

## Dependencies

- **context-menu** `./ContextMenu` — right-click context menu for file/folder operations
- **confirm-modal** `./ConfirmModal` — confirmation dialog before delete operations

## Referenced By

- **canvas-area** `src/renderer/components/CanvasArea.ts` — creates file explorer cards
- **explorer-plugin** `src/renderer/components/ExplorerPlugin.ts` — uses as left split pane in explorer mode

## IPC Channels

- `fs:readDir` — reads directory contents for tree expansion
- `fs:mkdir` — creates new folder
- `fs:writeFile` — creates new empty file
- `fs:delete` — deletes file/folder
- `fs:rename` — renames file/folder
- `fs:copy` — copies file for paste operation
- `file:changed` — listener for auto-refresh on external changes

## Interface

### Classes

- **FileExplorerPlugin**
  - **constructor** `(container: HTMLElement, rootPath: string): FileExplorerPlugin` — builds tree from root path
  - **refresh** `(): Promise<void>` — re-reads directory and updates tree
  - **setRootPath** `(path: string): Promise<void>` — changes root directory
  - **expandToPath** `(filePath: string): Promise<void>` — expands tree nodes to reveal file
  - **destroy** `(): void` — cleans up listeners
  - **onOpenFile** — callback `(filePath: string) => void` — fired on double-click/Enter
  - **onFocus** — callback `() => void`

## State

Expanded directory paths set, selected file path, tree DOM state.

## Lifecycle

- **created_by:** `CanvasArea.createFileExplorer()` or `ExplorerPlugin`
- **destroyed_by:** card close → remove listeners

## External Dependencies

None.

## Test

`src/renderer/components/FileExplorerPlugin.test.ts`
