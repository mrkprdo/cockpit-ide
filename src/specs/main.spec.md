---
name: Cockpit IDE
title: Cockpit IDE
version: 0.0.1
---

# Cockpit IDE

A spatial, canvas-based IDE where plugin cards (Explorer, Terminal, Git, Markdown, SpecsMap) float on an infinite zoomable/pannable canvas. Built on Electron with Monaco editor and xterm.js.

## Stack

- **runtime:** Node 22 (Electron 42)
- **language:** TypeScript 5.8
- **testing:** vitest 4 + jsdom
- **build:**
  - main: tsc
  - preload: tsc
  - renderer: esbuild 0.28
- **key_deps:**
  - electron: Electron 42
  - monaco: Monaco Editor 0.53
  - xterm: @xterm/xterm 6 + @xterm/addon-fit
  - pty: node-pty 1
  - marked: marked 18
  - chokidar: chokidar (file watching)
  - ws: ws (WebSocket server)

## Architecture

- **process_model:** Electron single-window with optional multi-window (main + preload + renderer)
- **ipc_or_api_pattern:** ipcMain.handle/ipcRenderer.invoke for async FS/workspace/prefs/git operations; ipcMain.on/ipcRenderer.send for terminal data, clipboard, window controls; WebSocket server (ide-server) for MCP/open-code protocol
- **state_persistence:** JSON files in .cockpit/ directory: window.json (canvas state), last-workspace.txt, recent-workspaces.json, zoom-level.txt. User prefs persisted via Electron userData.
- **concurrency_model:** Single-threaded Node.js main process; async IPC; node-pty PTY processes tracked per-window

## Features

### foundation

| id | name | file | spec | ui |
|----|------|------|------|----|
| main-process | Main Process | src/main/main.ts | [[main-process.spec.md]] |  |
| ide-server | IDE Server | src/main/ide-server.ts | [[ide-server.spec.md]] |  |
| preload | Preload Bridge | src/preload/preload.ts | [[preload.spec.md]] |  |
| global-types | Global Type Declarations | src/global.d.ts | [[global-types.spec.md]] |  |
| theme | Theme System | src/renderer/theme.ts | [[theme.spec.md]] |  |
| specgen-hash | SpecGen Build Hash | src/renderer/specgen-hash.ts | [[specgen-hash.spec.md]] |  |

### core

| id | name | file | spec | ui |
|----|------|------|------|----|
| renderer-entry | Renderer Entry | src/renderer/index.ts | [[renderer-entry.spec.md]] |  |
| app | App Orchestrator | src/renderer/components/App.ts | [[app.spec.md]] |  |
| canvas-area | Canvas Area | src/renderer/components/CanvasArea.ts | [[canvas-area.spec.md]] |  |

### widget

| id | name | file | spec | ui |
|----|------|------|------|----|
| plugin-card | Plugin Card | src/renderer/components/PluginCard.ts | [[plugin-card.spec.md]] |  |
| top-bar | Top Bar Menu | src/renderer/components/TopBar.ts | [[top-bar.spec.md]] | [[top-bar-ui.spec.md]] |
| terminal-plugin | Terminal Plugin | src/renderer/components/TerminalPlugin.ts | [[terminal-plugin.spec.md]] |  |
| explorer-plugin | Explorer Plugin | src/renderer/components/ExplorerPlugin.ts | [[explorer-plugin.spec.md]] |  |
| file-explorer-plugin | File Explorer Plugin | src/renderer/components/FileExplorerPlugin.ts | [[file-explorer-plugin.spec.md]] | [[file-explorer-plugin-ui.spec.md]] |
| monaco-editor-plugin | Monaco Editor Plugin | src/renderer/components/MonacoEditorPlugin.ts | [[monaco-editor-plugin.spec.md]] |  |
| markdown-plugin | Markdown Plugin | src/renderer/components/MarkdownPlugin.ts | [[markdown-plugin.spec.md]] | [[markdown-plugin-ui.spec.md]] |
| context-menu | Context Menu | src/renderer/components/ContextMenu.ts | [[context-menu.spec.md]] |  |
| canvas-statusbar | Canvas Status Bar | src/renderer/components/canvas-statusbar.ts | [[canvas-statusbar.spec.md]] |  |

### modal

| id | name | file | spec | ui |
|----|------|------|------|----|
| welcome-modal | Welcome Modal | src/renderer/components/WelcomeModal.ts | [[welcome-modal.spec.md]] | [[welcome-modal-ui.spec.md]] |
| about-modal | About Modal | src/renderer/components/AboutModal.ts | [[about-modal.spec.md]] |  |
| theme-modal | Theme Modal | src/renderer/components/ThemeModal.ts | [[theme-modal.spec.md]] |  |
| confirm-modal | Confirm Modal | src/renderer/components/ConfirmModal.ts | [[confirm-modal.spec.md]] |  |

### overlay

| id | name | file | spec | ui |
|----|------|------|------|----|
| command-palette | Command Palette | src/renderer/components/CommandPalette.ts | [[command-palette.spec.md]] | [[command-palette-ui.spec.md]] |
| ai-drawer | AI Drawer | src/renderer/components/AiDrawer.ts | [[ai-drawer.spec.md]] |  |
| tutorial | Tutorial Overlay | src/renderer/components/Tutorial.ts | [[tutorial.spec.md]] |  |

### plugin

| id | name | file | spec | ui |
|----|------|------|------|----|
| git-plugin | Git Plugin | src/renderer/components/GitPlugin.ts | [[git-plugin.spec.md]] | [[git-plugin-ui.spec.md]] |
| specsmap-plugin | SpecsMap Plugin | src/renderer/components/SpecsMapPlugin.ts | [[specsmap-plugin.spec.md]] | [[specsmap-plugin-ui.spec.md]] |

### utility

| id | name | file | spec | ui |
|----|------|------|------|----|
| canvas-grid | Canvas Grid Pattern | src/renderer/components/canvas-grid.ts | [[canvas-grid.spec.md]] |  |

## IPC Channels

### app

- `app:version`

### clipboard

- `clipboard:readText`
- `clipboard:writeText`

### fs

- `fs:readDir`
- `fs:readFile`
- `fs:writeFile`
- `fs:mkdir`
- `fs:delete`
- `fs:copy`
- `fs:rename`

### file_watch

- `file:watch`
- `file:unwatch`
- `file:changed`

### window

- `window:new`
- `window:minimize`
- `window:maximize`
- `window:close`
- `window:isMaximized`

### terminal

- `terminal:create`
- `terminal:write`
- `terminal:resize`
- `terminal:kill`
- `terminal:data`
- `terminal:exit`

### workspace

- `workspace:select`
- `workspace:setPath`
- `workspace:getPath`
- `workspace:load`
- `workspace:save`
- `workspace:getRecent`
- `workspace:addRecent`
- `workspace:removeRecent`

### shell

- `shell:openExternal`

### prefs

- `prefs:load`
- `prefs:save`

### git

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

### ide

- `ide:editorState`
- `ide:status`

## Keyboard Shortcuts

| key | scope | action |
|-----|-------|--------|
| `Ctrl+Shift+N` | app | Open a new IDE window |
| `Ctrl+W` | editor | Close active editor tab |
| `Ctrl+Tab` | canvas | Cycle cards forward |
| `Ctrl+Shift+Tab` | canvas | Cycle cards backward |
| `Ctrl+P` | editor | Open file search palette |
| `Ctrl+J` | app | Create new terminal |
| `Ctrl+=` | app | Zoom in (renderer) |
| `Ctrl+-` | app | Zoom out (renderer) |
| `Ctrl+0` | app | Reset zoom |
| `Escape` | modal | Close modal/palette/tutorial |

## Test Coverage

- **total_test_files:** 23
- **total_tests:** 755
- **framework:** vitest 4 + jsdom
- **run_time:** ~3s

