---
name: Cockpit IDE
title: Cockpit IDE
version: 0.0.1
---

# Cockpit IDE

A spatial, canvas-based IDE where plugin cards (Explorer, Terminal, Git, Markdown, SpecsMap) float on an infinite zoomable/pannable 2D canvas. Built with Electron, TypeScript, esbuild, Monaco Editor, xterm.js, and node-pty. Sessions persist to `.cockpit/window.json`. Design: Noir × Art Nouveau × Floating with dark/light themes.

## Stack

- **Runtime:** Electron 42 (Chrome 132+, Node 22)
- **Language:** TypeScript 5.8 (ES2022)
- **Renderer Build:** esbuild 0.28 (IIFE bundle)
- **Main/Preload Build:** tsc (CommonJS)
- **Editor:** Monaco Editor 0.53 (AMD-loaded)
- **Terminal:** @xterm/xterm 6 + @xterm/addon-fit + node-pty 1
- **Markdown:** marked 18
- **Canvas Text:** @chenglou/pretext
- **Testing:** Vitest 4 + jsdom

## Architecture

- **Process Model:** Two-process Electron app (main + renderer), plus a preload script with `contextIsolation: true` and `sandbox: true`. All IPC is typed through `window.electronAPI`.
- **IPC Pattern:** `ipcRenderer.invoke` (async request/response) for file system, workspace, git, preferences. `ipcRenderer.send` (fire-and-forget) for terminal write, window controls. `ipcRenderer.on` (event listener) for terminal data, file change notifications, IDE server open-file requests. `ipcRenderer.sendSync` (blocking) for app version and clipboard read.
- **Canvas Model:** Cards are absolutely positioned `<div>` elements inside a viewport that applies `transform: scale(zoom) translate(panX, panY)`. All coordinates are in world space (28px grid), converted to screen via `screenX = worldX * scale + panX`.
- **State Persistence:** Plugin layout (position, size, open/minimized state, editor tabs/cursors, git state, markdown state) serialized as JSON and saved to `.cockpit/window.json` via `workspace:save` on every state change. Preferences (theme, grid style, zoom lock) saved via `prefs:save`.
- **IDE Server:** HTTP+WebSocket JSON-RPC 2.0 server on random port for external editor integration (Claude Code, opencode protocol). Broadcasts selection changes, accepts open-file requests.
- **File Watching:** chokidar-based watcher scoped to workspace, debounced at 100ms. Notifies all windows of file changes for auto-refresh.

## Features

### foundation

| id | name | file | spec | ui |
|----|------|------|------|----|
| global-types | Global Type Declarations | src/global.d.ts | global-types.spec.md | |
| main-process | Main Process | src/main/main.ts | main-process.spec.md | |
| preload | Preload Script | src/preload/preload.ts | preload.spec.md | |
| app-shell | App Shell | src/renderer/index.html | app-shell.spec.md | |
| styles | Styles | src/renderer/styles.css | styles.spec.md | |
| theme | Theme System | src/renderer/theme.ts | theme.spec.md | |
| canvas-grid | Canvas Grid | src/renderer/components/canvas-grid.ts | canvas-grid.spec.md | |

### core

| id | name | file | spec | ui |
|----|------|------|------|----|
| ide-server | IDE Server | src/main/ide-server.ts | ide-server.spec.md | |
| renderer-entry | Renderer Entry | src/renderer/index.ts | renderer-entry.spec.md | |
| app | App Orchestrator | src/renderer/components/App.ts | app.spec.md | app-ui.spec.md |
| canvas-area | Canvas Area | src/renderer/components/CanvasArea.ts | canvas-area.spec.md | canvas-area-ui.spec.md |

### widget

| id | name | file | spec | ui |
|----|------|------|------|----|
| canvas-statusbar | Canvas Status Bar | src/renderer/components/canvas-statusbar.ts | canvas-statusbar.spec.md | |
| plugin-card | Plugin Card | src/renderer/components/PluginCard.ts | plugin-card.spec.md | plugin-card-ui.spec.md |
| top-bar | Top Bar | src/renderer/components/TopBar.ts | top-bar.spec.md | top-bar-ui.spec.md |
| file-explorer-plugin | File Explorer Plugin | src/renderer/components/FileExplorerPlugin.ts | file-explorer-plugin.spec.md | file-explorer-plugin-ui.spec.md |

### modal

| id | name | file | spec | ui |
|----|------|------|------|----|
| welcome-modal | Welcome Modal | src/renderer/components/WelcomeModal.ts | welcome-modal.spec.md | welcome-modal-ui.spec.md |
| about-modal | About Modal | src/renderer/components/AboutModal.ts | about-modal.spec.md | |
| theme-modal | Theme Modal | src/renderer/components/ThemeModal.ts | theme-modal.spec.md | theme-modal-ui.spec.md |
| confirm-modal | Confirm Modal | src/renderer/components/ConfirmModal.ts | confirm-modal.spec.md | |

### overlay

| id | name | file | spec | ui |
|----|------|------|------|----|
| context-menu | Context Menu | src/renderer/components/ContextMenu.ts | context-menu.spec.md | context-menu-ui.spec.md |
| command-palette | Command Palette | src/renderer/components/CommandPalette.ts | command-palette.spec.md | command-palette-ui.spec.md |
| ai-drawer | AI Drawer | src/renderer/components/AiDrawer.ts | ai-drawer.spec.md | ai-drawer-ui.spec.md |
| tutorial | Tutorial | src/renderer/components/Tutorial.ts | tutorial.spec.md | tutorial-ui.spec.md |

### plugin

| id | name | file | spec | ui |
|----|------|------|------|----|
| terminal-plugin | Terminal Plugin | src/renderer/components/TerminalPlugin.ts | terminal-plugin.spec.md | terminal-plugin-ui.spec.md |
| explorer-plugin | Explorer Plugin | src/renderer/components/ExplorerPlugin.ts | explorer-plugin.spec.md | explorer-plugin-ui.spec.md |
| monaco-editor-plugin | Monaco Editor Plugin | src/renderer/components/MonacoEditorPlugin.ts | monaco-editor-plugin.spec.md | monaco-editor-plugin-ui.spec.md |
| git-plugin | Git Plugin | src/renderer/components/GitPlugin.ts | git-plugin.spec.md | git-plugin-ui.spec.md |
| markdown-plugin | Markdown Plugin | src/renderer/components/MarkdownPlugin.ts | markdown-plugin.spec.md | markdown-plugin-ui.spec.md |
| specsmap-plugin | SpecsMap Plugin | src/renderer/components/SpecsMapPlugin.ts | specsmap-plugin.spec.md | specsmap-plugin-ui.spec.md |

### utility

| id | name | file | spec | ui |
|----|------|------|------|----|
| specgen-hash | SpecGen Hash | src/renderer/specgen-hash.ts | specgen-hash.spec.md | |

## IPC Channels

### window
- `window:new` — Create a new BrowserWindow
- `window:minimize` — Minimize current window
- `window:maximize` — Maximize/restore current window
- `window:close` — Close current window
- `window:isMaximized` — Check if window is maximized

### clipboard
- `clipboard:readText` — Read system clipboard (sync)
- `clipboard:writeText` — Write to system clipboard

### terminal
- `terminal:create` — Spawn a new PTY process with UUID and cwd
- `terminal:write` — Write data to PTY stdin
- `terminal:resize` — Resize PTY cols/rows
- `terminal:kill` — Terminate PTY process
- `terminal:data` — PTY stdout data event (main → renderer)
- `terminal:exit` — PTY exit event (main → renderer)

### workspace
- `workspace:select` — Open native directory picker dialog
- `workspace:setPath` — Register workspace path for a window (starts watcher + IDE server)
- `workspace:getPath` — Get the current workspace path for the window
- `workspace:load` — Load saved plugin state from `.cockpit/window.json`
- `workspace:save` — Save plugin state to `.cockpit/window.json`
- `workspace:getRecent` — Get list of recent workspace paths
- `workspace:addRecent` — Add a workspace to recent list
- `workspace:removeRecent` — Remove a workspace from recent list

### shell
- `shell:openExternal` — Open URL in default system browser

### prefs
- `prefs:load` — Load user preferences (theme, grid, zoom lock)
- `prefs:save` — Save user preferences

### git
- `git:remotes` — List remotes for a repo
- `git:branches` — List branches
- `git:checkout` — Checkout a branch
- `git:log` — Get commit log
- `git:showTree` — Get file tree for a commit
- `git:diff` — Get diff for a commit/file
- `git:currentBranch` — Get current branch name
- `git:stagedFiles` — List staged files
- `git:unstagedFiles` — List unstaged files
- `git:stagedDiff` — Get diff for a staged file
- `git:unstagedDiff` — Get diff for an unstaged file
- `git:commitBody` — Get full commit message body
- `git:stage` — Stage a file
- `git:unstage` — Unstage a file
- `git:commit` — Commit staged changes
- `git:push` — Push commits to remote
- `git:checkAhead` — Check if local branch is ahead of remote

### fs
- `fs:readDir` — List directory entries
- `fs:readFile` — Read file content as string
- `fs:writeFile` — Write string content to file
- `fs:mkdir` — Create directory (recursive)
- `fs:delete` — Delete file or directory (recursive)
- `fs:copy` — Copy file or directory (recursive)
- `fs:rename` — Rename/move file or directory

### file
- `file:watch` — Start watching a directory for changes
- `file:unwatch` — Stop watching
- `file:changed` — File change notification (main → renderer)

### ide
- `ide:editorState` — Send editor cursor/selection state to IDE server
- `ide:status` — Get IDE server status (running, port, workspace, lock paths)
- `ide:openFile` — Request from IDE server to open a file in the editor (main → renderer)

### app
- `app:version` — Get app version (sync)

## Keyboard Shortcuts

| key | scope | action |
|-----|-------|--------|
| Ctrl+Shift+N / Cmd+Shift+N | Global | New window |
| Ctrl+W / Cmd+W | Global | Close active editor tab |
| Ctrl+Tab | Global | Cycle cards forward |
| Ctrl+Shift+Tab | Global | Cycle cards backward |
| Ctrl+P / Cmd+P | Global | Open file search palette |
| Ctrl+J / Cmd+J | Global | New terminal |
| Ctrl+= / Ctrl++ | Global | Zoom in (main process, before-input-event) |
| Ctrl+- | Global | Zoom out (main process) |
| Ctrl+0 | Global | Reset zoom (main process) |
| Escape | Modal/Overlay | Close modal, palette, context menu, tutorial |
| ArrowRight | Tutorial | Next step |
| ArrowLeft | Tutorial | Previous step |

## Test Coverage

- **total_test_files:** 16 (in `src/`)
- **total_tests:** ~755 (including edge cases + workflows + E2E)
- **framework:** Vitest 4 + jsdom + custom IPC mocks
