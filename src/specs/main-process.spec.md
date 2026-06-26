---
name: Main Process
file: src/main/main.ts
type: process
layer: foundation
singleton: true
exports: [_testSetWorkspacePath, _testIsPathSafe]
---

# Main Process

Electron main process entry point. Creates the BrowserWindow, registers all IPC handlers (~40+ channels) for filesystem operations, terminal PTY management, workspace persistence, git operations, window controls, clipboard access, and IDE server relay. Persists workspace state to `.cockpit/window.json` on window close. Manages the application lifecycle (ready, window-all-closed, activate). Implements a path-safety allowlist whitelist to prevent filesystem access outside the workspace root.

## Dependencies

- **ide-server** `src/main/ide-server.ts` — starts/stops the WebSocket IDE server for external editor relay

## Referenced By

- **preload** `src/preload/preload.ts` — IPC channels bridged from main to renderer
- **app** `src/renderer/components/App.ts` — invokes IPC channels for workspace/window/terminal operations
- **canvas-area** `src/renderer/components/CanvasArea.ts` — invokes `terminal:kill` IPC
- **terminal-plugin** `src/renderer/components/TerminalPlugin.ts` — invokes `terminal:create`, `terminal:write`, `terminal:resize` IPC
- **monaco-editor-plugin** `src/renderer/components/MonacoEditorPlugin.ts` — invokes `fs:readFile`, `fs:writeFile` IPC
- **file-explorer-plugin** `src/renderer/components/FileExplorerPlugin.ts` — invokes `fs:readDir`, `fs:mkdir`, `fs:writeFile`, `fs:delete`, `fs:rename`, `fs:copy` IPC
- **markdown-plugin** `src/renderer/components/MarkdownPlugin.ts` — invokes `fs:readFile` IPC
- **welcome-modal** `src/renderer/components/WelcomeModal.ts` — invokes `workspace:select`, `workspace:getRecent` IPC
- **command-palette** `src/renderer/components/CommandPalette.ts` — invokes `fs:readDir` IPC
- **git-plugin** `src/renderer/components/GitPlugin.ts` — invokes `git:*` IPC channels
- **specsmap-plugin** `src/renderer/components/SpecsMapPlugin.ts` — invokes `fs:readDir`, `fs:readFile`, `fs:writeFile`, `fs:mkdir` IPC
- **ai-drawer** `src/renderer/components/AiDrawer.ts` — invokes `fs:*`, `git:*`, `prefs:*` IPC

## IPC Channels

- `app:version` — synchronous, returns app version string
- `clipboard:readText` — synchronous, reads clipboard text
- `clipboard:writeText` — async, writes text to clipboard
- `window:minimize` — send, minimizes window
- `window:maximize` — send, toggles maximize
- `window:new` — invoke, opens new window
- `window:isMaximized` — invoke, checks maximize state
- `window:close` — send, closes window
- `terminal:create` — invoke, spawns PTY terminal
- `terminal:write` — send, writes to PTY stdin
- `terminal:resize` — send, resizes PTY cols/rows
- `terminal:kill` — send, kills PTY process
- `terminal:data` — outgoing (webContents.send), PTY stdout
- `terminal:exit` — outgoing, terminal exited signal
- `fs:readDir` — invoke, reads directory entries
- `fs:readFile` — invoke, reads file contents
- `fs:writeFile` — invoke, writes file contents
- `fs:mkdir` — invoke, creates directory
- `fs:delete` — invoke, deletes file/directory
- `fs:copy` — invoke, copies file
- `fs:rename` — invoke, renames/moves file
- `file:watch` — invoke, starts file watcher
- `file:unwatch` — invoke, stops file watcher
- `file:changed` — outgoing, file change notification
- `workspace:select` — invoke, opens native directory picker
- `workspace:setPath` — invoke, sets active workspace path
- `workspace:getPath` — invoke, gets active workspace path
- `workspace:load` — invoke, loads saved window state
- `workspace:save` — invoke, saves window state
- `workspace:getRecent` — invoke, lists recent workspaces
- `workspace:addRecent` — invoke, adds to recent list
- `workspace:removeRecent` — invoke, removes from recent list
- `shell:openExternal` — invoke, opens URL in default browser
- `prefs:load` — invoke, loads user preferences
- `prefs:save` — invoke, saves user preferences
- `ide:status` — invoke, returns IDE server status
- `ide:editorState` — send, relays editor cursor/selection to IDE server
- `ide:openFile` — outgoing, opens file from external IDE request
- `git:remotes` — invoke, lists git remotes
- `git:branches` — invoke, lists git branches
- `git:checkout` — invoke, switches branch
- `git:log` — invoke, retrieves commit log
- `git:showTree` — invoke, shows file tree at commit
- `git:diff` — invoke, shows diff for commit+file
- `git:currentBranch` — invoke, gets current branch name
- `git:stagedFiles` — invoke, lists staged files
- `git:unstagedFiles` — invoke, lists unstaged files
- `git:stagedDiff` — invoke, shows staged diff
- `git:unstagedDiff` — invoke, shows unstaged diff
- `git:commitBody` — invoke, gets commit body
- `git:stage` — invoke, stages file
- `git:unstage` — invoke, unstages file
- `git:commit` — invoke, commits staged changes
- `git:push` — invoke, pushes to remote
- `git:checkAhead` — invoke, checks if ahead of remote

## Interface

### Functions

- **_testSetWorkspacePath** `(path: string): void` — test-only setter for workspace path
- **_testIsPathSafe** `(requestedPath: string): boolean` — test-only path safety check

## State

Window state persisted to `.cockpit/window.json` in the workspace directory on `window-all-closed`. Schema: `{ cards: EditorState[], workspacePath: string }`.

## Lifecycle

- **created_by:** Electron `app.on('ready')`
- **destroyed_by:** Electron `app.on('window-all-closed')`

## External Dependencies

- `electron`
- `node:path`
- `node:fs`
- `node-pty`
- `node:child_process`

## Test

`src/main/main.test.ts`
