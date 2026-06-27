---
name: Main Process
file: src/main/main.ts
type: process
layer: foundation
singleton: true
exports: []
---

# Main Process

Electron main-process entry point. Creates and manages `BrowserWindow` instances (frameless, maximized), initializes user-data paths (`last-workspace.txt`, `recent-workspaces.json`, `zoom-level.txt`), and registers all IPC handlers — file system, terminal PTY, window controls, clipboard, workspace persistence, git, IDE server status, and preferences. Operates a chokidar-based file watcher (`startWatching`/`stopWatching`) scoped to the workspace directory. Implements a per-window workspace path security layer (`isPathSafe`) that constrains file-system IPC to the active workspace directory. Installs `before-input-event` zoom controls (Ctrl+=/-/0) at the `WebContents` level, bypassing renderer key handling.

## Dependencies

- **Ide Server** `src/main/ide-server.ts` — `ideServer.start()` on workspace open, `ideServer.updateEditorState()` on selection change

## Referenced By

- **Preload Script** `src/preload/preload.ts` — targets the IPC channels registered here
- **All renderer components** that call `electronAPI.*` — all channel names originate from handlers in this file

## IPC Channels

- `app:version`
- `window:new`
- `window:minimize`
- `window:maximize`
- `window:close`
- `window:isMaximized`
- `clipboard:readText`
- `clipboard:writeText`
- `terminal:create`
- `terminal:write`
- `terminal:resize`
- `terminal:kill`
- `terminal:data`
- `terminal:exit`
- `workspace:select`
- `workspace:setPath`
- `workspace:getPath`
- `workspace:load`
- `workspace:save`
- `workspace:getRecent`
- `workspace:addRecent`
- `workspace:removeRecent`
- `shell:openExternal`
- `prefs:load`
- `prefs:save`
- `git:remotes`
- `git:branches`
- `git:checkout`
- `git:log`
- `git:showTree`
- `git:diff`
- `git:currentBranch`
- `git:stagedFiles`
- `git:unstagedFiles`
- `git:stagedDiff`
- `git:unstagedDiff`
- `git:commitBody`
- `git:stage`
- `git:unstage`
- `git:commit`
- `git:push`
- `git:checkAhead`
- `fs:readDir`
- `fs:readFile`
- `fs:writeFile`
- `fs:mkdir`
- `fs:delete`
- `fs:copy`
- `fs:rename`
- `file:watch`
- `file:unwatch`
- `file:changed`
- `ide:editorState`
- `ide:status`
- `ide:openFile`
