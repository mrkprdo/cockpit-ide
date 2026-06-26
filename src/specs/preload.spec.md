---
name: Preload Bridge
file: src/preload/preload.ts
type: process
layer: foundation
singleton: true
exports: []
---

# Preload Bridge

Electron contextBridge adapter. Exposes electronAPI on window with typed IPC wrappers for all main-process handlers: terminal (create/write/resize/kill/onData/onExit), workspace (select/setPath/getPath/load/save/recent), filesystem (readDir/readFile/writeFile/mkdir/delete/copy/rename/watch), git (remotes/branches/checkout/log/diff/stage/commit/push), clipboard, shell, prefs, window controls, and IDE editor state notifications. Every renderer-to-main IPC flows through this bridge.

## Interface

### Properties

- **electronAPI**: Window.electronAPI (see global.d.ts) — Full typed API surface available as window.electronAPI in renderer

## Lifecycle

- **created_by:** Electron preload script execution before page load
- **destroyed_by:** Window close (context destroyed)

## External Dependencies

- `electron`

## Test

`src/preload/preload.test.ts`

