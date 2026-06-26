---
name: Preload Bridge
file: src/preload/preload.ts
type: process
layer: foundation
singleton: true
exports: []
---

# Preload Bridge

Electron preload script that exposes `window.electronAPI` to the renderer process via `contextBridge.exposeInMainWorld`. Maps ~50 IPC channels through typed invoke/send/sendSync/on patterns. Declares a full exports whitelist to prevent privilege escalation — only those functions listed in the whitelist are exposed.

## Dependencies

None — imports only `electron` for `contextBridge` and `ipcRenderer`.

## Referenced By

- **index-html** `src/renderer/index.html` — loaded as preload script in BrowserWindow
- **app** `src/renderer/components/App.ts` — calls `electronAPI` methods
- **canvas-area** `src/renderer/components/CanvasArea.ts` — calls `electronAPI` methods
- **terminal-plugin** `src/renderer/components/TerminalPlugin.ts` — calls `electronAPI` methods
- **monaco-editor-plugin** `src/renderer/components/MonacoEditorPlugin.ts` — calls `electronAPI` methods
- **file-explorer-plugin** `src/renderer/components/FileExplorerPlugin.ts` — calls `electronAPI` methods
- **markdown-plugin** `src/renderer/components/MarkdownPlugin.ts` — calls `electronAPI` methods
- **welcome-modal** `src/renderer/components/WelcomeModal.ts` — calls `electronAPI` methods
- **about-modal** `src/renderer/components/AboutModal.ts` — calls `electronAPI` methods
- **command-palette** `src/renderer/components/CommandPalette.ts` — calls `electronAPI` methods
- **tutorial** `src/renderer/components/Tutorial.ts` — calls `electronAPI` methods
- **git-plugin** `src/renderer/components/GitPlugin.ts` — calls `electronAPI` methods
- **specsmap-plugin** `src/renderer/components/SpecsMapPlugin.ts` — calls `electronAPI` methods
- **ai-drawer** `src/renderer/components/AiDrawer.ts` — calls `electronAPI` methods
- **theme-modal** `src/renderer/components/ThemeModal.ts` — calls `electronAPI` methods

## IPC Channels

### Invoke

`window:new`, `window:isMaximized`, `clipboard:writeText`, `terminal:create`, `workspace:select`, `workspace:setPath`, `workspace:getPath`, `workspace:load`, `workspace:save`, `workspace:getRecent`, `workspace:addRecent`, `workspace:removeRecent`, `shell:openExternal`, `prefs:load`, `prefs:save`, `git:remotes`, `git:branches`, `git:checkout`, `git:log`, `git:showTree`, `git:diff`, `git:currentBranch`, `git:stagedFiles`, `git:unstagedFiles`, `git:stagedDiff`, `git:unstagedDiff`, `git:commitBody`, `git:stage`, `git:unstage`, `git:commit`, `git:push`, `git:checkAhead`, `fs:readDir`, `fs:readFile`, `fs:writeFile`, `fs:mkdir`, `fs:delete`, `fs:copy`, `fs:rename`, `file:watch`, `file:unwatch`, `ide:status`

### Send

`window:minimize`, `window:maximize`, `window:close`, `terminal:write`, `terminal:resize`, `terminal:kill`, `ide:editorState`

### SendSync

`app:version`, `clipboard:readText`

### On (listeners)

`terminal:data`, `terminal:exit`, `file:changed`, `ide:openFile`

## Interface

### Functions

- Exposed as methods on `window.electronAPI` via `contextBridge.exposeInMainWorld('electronAPI', { ... })`

## Test

`src/preload/preload.test.ts`
