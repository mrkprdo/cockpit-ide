---
name: Cockpit IDE
title: Cockpit
version: 0.0.20260622
---

# Cockpit IDE

Spatial/floating-panel IDE built in Electron. Monaco editor, xterm.js terminal, file explorer, and markdown viewer live as draggable/resizable cards on a zoomable/pannable canvas. Sessions persist to `.cockpit/window.json`. Includes a WebSocket IDE server for external editor relay, an AI assistant drawer, git management, and a self-auditing SpecsMap plugin.

## Stack

- **runtime:** Electron 42
- **language:** TypeScript 5.8
- **renderer bundle:** esbuild 0.28
- **main/preload compile:** tsc
- **editor:** Monaco Editor 0.53 (AMD-loaded)
- **terminal:** @xterm/xterm 6 + node-pty 1
- **canvas text:** @chenglou/pretext
- **markdown:** marked 18
- **testing:** vitest 4, jsdom
- **design:** CSS custom properties, Space Mono monospace, Noir x Art Nouveau palette

## Architecture

- **process model:** Electron main + preload + renderer (single IIFE bundle)
- **IPC pattern:** contextBridge (invoke/send/sendSync/on) across ~55 channels
- **state persistence:** `.cockpit/window.json` in workspace directory, localStorage for theme/prefs
- **concurrency model:** Single-threaded renderer; main process handles PTY and git subprocesses
- **card lifecycle:** PluginCard → Plugin (Terminal/Monaco/Explorer/Git/Markdown/SpecsMap) instantiated dynamically by CanvasArea
- **external integration:** WebSocket server on port 41451 for external editor relay

## Features

### foundation

| id | name | file | spec | ui |
|----|------|------|------|----|
| package | Package Manifest | package.json | package.spec.md | |
| makefile | Makefile | Makefile | makefile.spec.md | |
| global-d | Global Type Declarations | src/global.d.ts | global.d.spec.md | |
| main-process | Main Process | src/main/main.ts | main-process.spec.md | |
| ide-server | IDE Server | src/main/ide-server.ts | ide-server.spec.md | |
| preload | Preload Bridge | src/preload/preload.ts | preload.spec.md | |
| index-html | HTML Shell | src/renderer/index.html | index-html.spec.md | |
| styles | Design System Styles | src/renderer/styles.css | styles.spec.md | |
| theme | Theme System | src/renderer/theme.ts | theme.spec.md | |
| specgen-hash | SpecGen Hash | src/renderer/specgen-hash.ts | specgen-hash.spec.md | |

### core

| id | name | file | spec | ui |
|----|------|------|------|----|
| index | Renderer Entry | src/renderer/index.ts | index.spec.md | |
| app | App Orchestrator | src/renderer/components/App.ts | app.spec.md | |
| canvas-area | Canvas Area | src/renderer/components/CanvasArea.ts | canvas-area.spec.md | canvas-area-ui.spec.md |

### widget

| id | name | file | spec | ui |
|----|------|------|------|----|
| canvas-grid | Canvas Grid | src/renderer/components/canvas-grid.ts | canvas-grid.spec.md | |
| canvas-statusbar | Canvas Status Bar | src/renderer/components/canvas-statusbar.ts | canvas-statusbar.spec.md | |
| plugin-card | Plugin Card | src/renderer/components/PluginCard.ts | plugin-card.spec.md | plugin-card-ui.spec.md |
| top-bar | Top Bar | src/renderer/components/TopBar.ts | top-bar.spec.md | top-bar-ui.spec.md |

### modal

| id | name | file | spec | ui |
|----|------|------|------|----|
| welcome-modal | Welcome Modal | src/renderer/components/WelcomeModal.ts | welcome-modal.spec.md | welcome-modal-ui.spec.md |
| about-modal | About Modal | src/renderer/components/AboutModal.ts | about-modal.spec.md | |
| confirm-modal | Confirm Modal | src/renderer/components/ConfirmModal.ts | confirm-modal.spec.md | |
| theme-modal | Theme Modal | src/renderer/components/ThemeModal.ts | theme-modal.spec.md | theme-modal-ui.spec.md |

### overlay

| id | name | file | spec | ui |
|----|------|------|------|----|
| context-menu | Context Menu | src/renderer/components/ContextMenu.ts | context-menu.spec.md | |
| command-palette | Command Palette | src/renderer/components/CommandPalette.ts | command-palette.spec.md | command-palette-ui.spec.md |
| tutorial | Tutorial | src/renderer/components/Tutorial.ts | tutorial.spec.md | tutorial-ui.spec.md |
| ai-drawer | AI Drawer | src/renderer/components/AiDrawer.ts | ai-drawer.spec.md | ai-drawer-ui.spec.md |

### plugin

| id | name | file | spec | ui |
|----|------|------|------|----|
| terminal-plugin | Terminal Plugin | src/renderer/components/TerminalPlugin.ts | terminal-plugin.spec.md | terminal-plugin-ui.spec.md |
| monaco-editor-plugin | Monaco Editor Plugin | src/renderer/components/MonacoEditorPlugin.ts | monaco-editor-plugin.spec.md | monaco-editor-plugin-ui.spec.md |
| file-explorer-plugin | File Explorer Plugin | src/renderer/components/FileExplorerPlugin.ts | file-explorer-plugin.spec.md | file-explorer-plugin-ui.spec.md |
| explorer-plugin | Explorer Plugin | src/renderer/components/ExplorerPlugin.ts | explorer-plugin.spec.md | explorer-plugin-ui.spec.md |
| markdown-plugin | Markdown Plugin | src/renderer/components/MarkdownPlugin.ts | markdown-plugin.spec.md | markdown-plugin-ui.spec.md |
| specsmap-plugin | SpecsMap Plugin | src/renderer/components/SpecsMapPlugin.ts | specsmap-plugin.spec.md | specsmap-plugin-ui.spec.md |
| git-plugin | Git Plugin | src/renderer/components/GitPlugin.ts | git-plugin.spec.md | git-plugin-ui.spec.md |

### entry

| id | name | file | spec | ui |
|----|------|------|------|----|
| package | Package Manifest | package.json | package.spec.md | |
| makefile | Makefile | Makefile | makefile.spec.md | |

## IPC Channels

### app

- `app:version`

### clipboard

- `clipboard:readText`
- `clipboard:writeText`

### window

- `window:minimize`
- `window:maximize`
- `window:new`
- `window:isMaximized`
- `window:close`

### terminal

- `terminal:create`
- `terminal:write`
- `terminal:resize`
- `terminal:kill`
- `terminal:data` (outgoing)
- `terminal:exit` (outgoing)

### fs

- `fs:readDir`
- `fs:readFile`
- `fs:writeFile`
- `fs:mkdir`
- `fs:delete`
- `fs:copy`
- `fs:rename`

### file

- `file:watch`
- `file:unwatch`
- `file:changed` (outgoing)

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

### ide

- `ide:status`
- `ide:editorState`
- `ide:openFile` (outgoing)

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

## Keyboard Shortcuts

| key | scope | action |
|-----|-------|--------|
| Ctrl+N | global | New window |
| Ctrl+Shift+P | global | Open command palette |
| Ctrl+P | explorer | Open command palette (file finder) |
| Ctrl+S | editor | Save current file |
| Ctrl+W | editor | Close active tab |
| Ctrl+Tab | editor | Next tab |
| Ctrl+Shift+Tab | editor | Previous tab |
| Ctrl+Plus | canvas | Zoom in |
| Ctrl+Minus | canvas | Zoom out |
| Arrow keys | canvas | Pan canvas |
| Escape | overlay | Dismiss context menu / modal / palette |
| F1 | global | Open tutorial |
| Ctrl+C | terminal | Copy selection / SIGINT |
| Ctrl+V | terminal | Paste |
| Alt / F10 | menu bar | Focus menu |

## Test Coverage

- **total_test_files:** 26
- **total_tests:** 755+ across 26 test files
- **framework:** vitest 4 with jsdom
- **test_suites:**
  - `src/main/main.test.ts`
  - `src/main/ide-server.test.ts`
  - `src/preload/preload.test.ts`
  - `src/renderer/theme.test.ts`
  - `src/renderer/components/App.test.ts`
  - `src/renderer/components/CanvasArea.test.ts`
  - `src/renderer/components/PluginCard.test.ts`
  - `src/renderer/components/TopBar.test.ts`
  - `src/renderer/components/TerminalPlugin.test.ts`
  - `src/renderer/components/MonacoEditorPlugin.test.ts`
  - `src/renderer/components/FileExplorerPlugin.test.ts`
  - `src/renderer/components/ExplorerPlugin.test.ts`
  - `src/renderer/components/MarkdownPlugin.test.ts`
  - `src/renderer/components/SpecsMapPlugin.test.ts`
  - `src/renderer/components/GitPlugin.test.ts`
  - `src/renderer/components/WelcomeModal.test.ts`
  - `src/renderer/components/AboutModal.test.ts`
  - `src/renderer/components/ConfirmModal.test.ts`
  - `src/renderer/components/ThemeModal.test.ts`
  - `src/renderer/components/ContextMenu.test.ts`
  - `src/renderer/components/CommandPalette.test.ts`
  - `src/renderer/components/Tutorial.test.ts`
  - `src/renderer/components/AiDrawer.test.ts`
  - `src/test/edge-cases.test.ts`
  - `src/test/workflows.test.ts`
  - `src/test/e2e-advanced.test.ts`
