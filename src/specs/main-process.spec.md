---
name: Main Process
file: src/main/main.ts
type: process
layer: foundation
singleton: true
exports: []
---

# Main Process

Electron main process entry. Creates BrowserWindow with frameless titlebar, registers IPC handlers for filesystem CRUD, file watching via chokidar, terminal PTY management via node-pty, window controls, workspace persistence, and renderer zoom (Ctrl+=/-/0) using before-input-event. Resolves CLI workspace path, initializes IDE server, and manages per-window workspace paths with path-security validation.

## Dependencies

- [[ide-server.spec.md|ide-server]] `src/main/ide-server.ts` — Starts/stops IdeServer HTTP+WebSocket server when a workspace is set; delegates editor state updates to ideServer.updateEditorState()

## IPC Channels

- `app:version`
- `clipboard:readText`
- `clipboard:writeText`
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
- `window:new`
- `window:minimize`
- `window:maximize`
- `window:close`
- `window:isMaximized`
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
- `ide:editorState`
- `ide:status`

## Interface

### Methods

- **resolveCliWorkspace** `(): string | null` — Parses CLI argv for a directory argument, resolving to absolute path
- **isPathSafe** `(targetPath: string, event?: IpcMainInvokeEvent): boolean` — Validates that targetPath is within the current workspace boundary
- **filterEnv** `(): Record<string, string>` — Returns a safe subset of environment variables for PTY processes
- **createWindow** `(): void` — Builds the main BrowserWindow with preload, zoom controls, and event wiring
- **createNewWindow** `(): void` — Opens a secondary window sharing workspace and terminal state
- **installZoomControls** `(wc: WebContents): void` — Attaches before-input-event handler for Ctrl+=/-/0 zoom across the entire renderer

## Lifecycle

- **created_by:** Electron app.whenReady()
- **destroyed_by:** app quit or window close

## External Dependencies

- `electron`
- `chokidar`
- `node-pty`

## Test

`src/main/main.test.ts`

