---
name: Global Type Declarations
file: src/global.d.ts
type: model
layer: foundation
singleton: false
exports: [EditorState, WorkspaceState, DirEntry, EditorSelectionState, Window.electronAPI]
---

# Global Type Declarations

Ambient type declarations for the Cockpit IDE renderer context. Defines EditorState (open files, cursors, explorer width), WorkspaceState (plugins array, z-order, zoom, pan, lock), DirEntry, EditorSelectionState, and the full Window.electronAPI interface covering terminal, workspace, git, filesystem, clipboard, shell, prefs, and IDE method signatures.

## Referenced By

- [[preload.spec.md|preload]] `src/preload/preload.ts`
- [[main-process.spec.md|main-process]] `src/main/main.ts`
- [[canvas-area.spec.md|canvas-area]] `src/renderer/components/CanvasArea.ts`
- [[app.spec.md|app]] `src/renderer/components/App.ts`

## Interface

## Lifecycle

- **created_by:** TypeScript compiler (ambient declaration)
- **destroyed_by:** N/A

