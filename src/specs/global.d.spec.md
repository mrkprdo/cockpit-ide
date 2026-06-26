---
name: Global Type Declarations
file: src/global.d.ts
type: model
layer: foundation
singleton: true
exports: []
---

# Global Type Declarations

Ambient type declarations that define the shape of `window.electronAPI` for the renderer process, plus shared types for editor state (`EditorState`, `EditorSelectionState`), workspace state (`WorkspaceState`), directory entries (`DirEntry`), and card serialization. These types form the contract between main and renderer processes across the IPC boundary.

## Dependencies

None — pure type declarations with no runtime imports.

## Referenced By

- **preload** `src/preload/preload.ts`
- **main-process** `src/main/main.ts`
- **ide-server** `src/main/ide-server.ts`
- **app** `src/renderer/components/App.ts`
- **canvas-area** `src/renderer/components/CanvasArea.ts`
- **monaco-editor-plugin** `src/renderer/components/MonacoEditorPlugin.ts`
- **explorer-plugin** `src/renderer/components/ExplorerPlugin.ts`
- **terminal-plugin** `src/renderer/components/TerminalPlugin.ts`
- **git-plugin** `src/renderer/components/GitPlugin.ts`
- **specsmap-plugin** `src/renderer/components/SpecsMapPlugin.ts`
- **ai-drawer** `src/renderer/components/AiDrawer.ts`

## IPC Channels

None — declares the type signatures for IPC channels but does not invoke them.

## Interface

### Types

- **EditorState** — `{ id: string; type: string; x: number; y: number; width: number; height: number; scale: number; state: any; zIndex: number }`
- **WorkspaceState** — `{ path: string; recentPaths: string[] }`
- **DirEntry** — `{ name: string; path: string; isDirectory: boolean; size: number; modified: number }`
- **EditorSelectionState** — `{ filePath: string; language: string; cursorLine: number; cursorColumn: number }`

### Global Augmentations

- **Window.electronAPI** — Typed IPC bridge with invoke/send/on/removeListener/sendSync methods

## Test

`src/global.d.ts` (tested indirectly through all IPC-using component tests)
