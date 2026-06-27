---
name: Preload Script
file: src/preload/preload.ts
type: process
layer: foundation
singleton: true
exports: []
---

# Preload Script

Electron preload script that establishes the `window.electronAPI` bridge via `contextBridge.exposeInMainWorld`. Maps every renderer-to-main communication path — terminal PTY, file system CRUD, workspace persistence, window controls, clipboard, git operations, shell, preferences, IDE server — through `ipcRenderer.invoke` (async), `ipcRenderer.send` (fire-and-forget), `ipcRenderer.on` (event listener), and `ipcRenderer.sendSync` (blocking). Each listener returns a cleanup function. Runs with `contextIsolation: true` and `sandbox: true`.

## Dependencies

No imports from `src/`.

## Referenced By

- **App Orchestrator** `src/renderer/components/App.ts` — all `window.electronAPI` calls pass through this bridge
- **Canvas Area** `src/renderer/components/CanvasArea.ts` — uses `electronAPI.workspace`, `electronAPI.fs`, `electronAPI.prefs`
- **Terminal Plugin** `src/renderer/components/TerminalPlugin.ts` — uses `electronAPI.terminal.*` and `electronAPI.clipboard`
- **Monaco Editor Plugin** `src/renderer/components/MonacoEditorPlugin.ts` — uses `electronAPI.fs.*` and `electronAPI.ide.*`
- **File Explorer Plugin** `src/renderer/components/FileExplorerPlugin.ts` — uses `electronAPI.fs.*`
- **Git Plugin** `src/renderer/components/GitPlugin.ts` — uses `electronAPI.git.*`
- **Markdown Plugin** `src/renderer/components/MarkdownPlugin.ts` — uses `electronAPI.fs.*`
- **SpecsMap Plugin** `src/renderer/components/SpecsMapPlugin.ts` — uses `electronAPI.fs.*`
- **Command Palette** `src/renderer/components/CommandPalette.ts` — uses `electronAPI.fs.*`
- **Welcome Modal** `src/renderer/components/WelcomeModal.ts` — uses `electronAPI.workspace.*`
- **About Modal** `src/renderer/components/AboutModal.ts` — uses `electronAPI.shell.*`
- **Tutorial** `src/renderer/components/Tutorial.ts` — uses `electronAPI.shell.*`
- **AiDrawer** `src/renderer/components/AiDrawer.ts` — uses `electronAPI` methods

## IPC Channels

All channels listed in the `electronAPI` interface — see `global-types.spec.md` and `main-process.spec.md`.
