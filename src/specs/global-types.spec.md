---
name: Global Type Declarations
file: src/global.d.ts
type: model
layer: foundation
singleton: false
exports: [EditorState, WorkspaceState, DirEntry, EditorSelectionState, Window.electronAPI]
---

# Global Type Declarations

Augments the `Window` interface with `electronAPI` — the full IPC bridge contract exposed by the preload script via `contextBridge`. Defines serializable data structures (`EditorState`, `WorkspaceState`, `DirEntry`, `EditorSelectionState`) that travel across the Electron process boundary. No runtime code — pure ambient type declarations and module shims (`.md` import).

## Dependencies

No runtime imports from `src/`.

## Referenced By

- **Main Process** `src/main/main.ts` — imports no types directly but the IPC handlers conform to these interfaces
- **Preload Script** `src/preload/preload.ts` — the `electronAPI` object shape is declared here
- **App Orchestrator** `src/renderer/components/App.ts` — reads/writes `WorkspaceState`, calls `electronAPI` methods
- **Canvas Area** `src/renderer/components/CanvasArea.ts` — uses `SaveState`, `PluginEntry`, `EditorState`
- **Monaco Editor Plugin** `src/renderer/components/MonacoEditorPlugin.ts` — uses `EditorSelectionState`

## IPC Channels

None — the file is type-only.
