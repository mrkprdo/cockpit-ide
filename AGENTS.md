# Cockpit IDE — Project Map

## Overview

Cockpit IDE v0.0.1 — spatial/floating-panel IDE built in Electron. Monaco editor, xterm.js terminal, file explorer, and markdown viewer live as draggable/resizable cards on an infinite zoomable/pannable canvas. Sessions persist to `.cockpit/window.json`.

**Stack:** Electron 42 · TypeScript 5.8 · esbuild 0.28 (renderer) · tsc (main/preload) · Monaco Editor 0.53 (AMD-loaded) · @xterm/xterm 6 + node-pty 1 · @chenglou/pretext (canvas text) · marked 18 · vitest 4

**Design:** Noir x Art Nouveau x Floating, dark/light theme via CSS custom properties, Space Mono monospace, dashed borders, 8px border radius.

---

## Project Tree

```
D:\cockpit_ide\
├── .gitignore                     # Git ignore rules
├── AGENTS.md                      # This file — project map
├── ARCHITECT.md                   # ~360 lines, comprehensive architecture docs
├── DESIGN.md                      # Design system: colors, typography, spacing, components
├── LICENSE                        # MIT License
├── Makefile                       # Build automation (build/dev/package/test/clean)
├── PRODUCT.md                     # Product philosophy, target users, design principles
├── README.md                      # Project intro, run instructions, stack
├── dev.js                         # Custom dev runner (watcher + Electron respawn)
├── package.json                   # NPM manifest, dependencies, build/test scripts
├── package-lock.json              # Lockfile
├── tsconfig.main.json             # TS config: main/preload (ES2022, CommonJS)
├── tsconfig.renderer.json         # TS config: renderer (ES2022, module:none, IIFE)
├── vitest.config.ts               # Vitest config: jsdom, setup, coverage
├── bin/
│   └── cockpit.bat                # Windows launcher — starts Cockpit.exe with args
├── public/
│   ├── cockpit_ide_icon.ico       # App icon (Electron window & installer)
│   └── icon.svg                   # SVG logo: 4 overlapping circles (Noir palette)
├── scripts/
│   └── generate-installer-assets.js  # Generates installer BMP images (dot-grid pattern)
├── src/
│   ├── global.d.ts                # Window.electronAPI type declarations
│   ├── main/
│   │   ├── main.ts                # Electron main process (~395 lines)
│   │   └── main.test.ts           # Main process IPC handler tests (~426 lines)
│   ├── preload/
│   │   ├── preload.ts             # contextBridge IPC exposure (~66 lines)
│   │   └── preload.test.ts        # Preload bridge API shape & wiring tests (~281 lines)
│   ├── renderer/
│   │   ├── index.html             # HTML shell: titlebar, canvas, statusbar, CSP
│   │   ├── index.ts               # Renderer entry: bootstraps App
│   │   ├── styles.css             # Complete design system (~766 lines)
│   │   ├── theme.ts               # Dark/light theme singleton with CSS custom properties
│   │   ├── theme.test.ts          # Theme unit tests (~58 lines)
│   │   └── components/
│   │       ├── App.ts             # Root orchestrator (~177 lines)
│   │       ├── App.test.ts        # App integration tests (~154 lines)
│   │       ├── CanvasArea.ts      # Infinite canvas engine (~1073 lines)
│   │       ├── CanvasArea.test.ts # Canvas tests: grid, zoom, arrange, save state (~405 lines)
│   │       ├── PluginCard.ts      # Draggable/resizable card widget (~223 lines)
│   │       ├── PluginCard.test.ts # Card tests: drag, resize, structure, UUID (~315 lines)
│   │       ├── TextRenderer.ts    # Canvas text measurement & rendering utility (~79 lines)
│   │       ├── TerminalPlugin.ts  # xterm.js PTY terminal emulator (~116 lines)
│   │       ├── TerminalPlugin.test.ts # Terminal tests: create/destroy/onExit (~87 lines)
│   │       ├── MonacoEditorPlugin.ts  # Monaco code editor w/ multi-tab (~388 lines)
│   │       ├── MonacoEditorPlugin.test.ts # Editor tests: tabs, language detection, state (~229 lines)
│   │       ├── FileExplorerPlugin.ts   # Recursive file tree browser (~262 lines)
│   │       ├── FileExplorerPlugin.test.ts # File tree tests: expand/collapse, CRUD, errors (~312 lines)
│   │       ├── DevPlugin.ts       # Split-pane: FileExplorer + MonacoEditor (~86 lines)
│   │       ├── DevPlugin.test.ts  # Dev plugin tests: split layout, state delegation (~84 lines)
│   │       ├── ContextPlugin.ts   # Markdown preview viewer w/ tabs (~230 lines)
│   │       ├── ContextPlugin.test.ts # Context tests: load/render/state/legacy format (~110 lines)
│   │       ├── WelcomeModal.ts    # Startup workspace picker (~64 lines)
│   │       ├── WelcomeModal.test.ts # Welcome modal tests: open/close/recent (~102 lines)
│   │       ├── AboutModal.ts      # Version/credits dialog (~61 lines)
│   │       ├── AboutModal.test.ts # About modal tests: open/close/link/callback (~101 lines)
│   │       ├── ContextMenu.ts     # Right-click floating context menu (~54 lines)
│   │       ├── ContextMenu.test.ts # Context menu tests: items/position/actions/singleton (~89 lines)
│   │       ├── ConfirmModal.ts    # Generic confirmation dialog (~56 lines)
│   │       ├── ConfirmModal.test.ts # Confirm modal tests: ok/cancel/dismiss (~73 lines)
│   │       ├── TopBar.ts          # Custom menu bar with dropdowns
│   │       ├── TopBar.test.ts     # TopBar tests: menus, buttons, callbacks (~166 lines)
│   │       ├── edge-cases.test.ts # 63 edge case tests across all components (~902 lines)
│   │       └── workflows.test.ts  # 36 integration workflow tests (~1157 lines)
│   └── test/
│       ├── README.md              # Test infrastructure docs (16 files, 216+ tests)
│       └── setup.ts               # Global mocks: IPC, Canvas, xterm, DOM, ResizeObserver
```

---

## File Descriptions

### Root Configuration & Build

| File | Description |
|------|-------------|
| `package.json` | NPM manifest for "cockpit-ide" v0.0.1. Build scripts (tsc + esbuild), Electron builder config (Win/Mac/Linux), deps (Electron 42, xterm 6, node-pty, Monaco 0.53, esbuild, vitest). |
| `tsconfig.main.json` | TS config for main/preload: ES2022, CommonJS, output to `dist/`, includes `src/main/`, `src/preload/`, `src/global.d.ts`. |
| `tsconfig.renderer.json` | TS config for renderer: ES2022, `module: "none"` (IIFE style), single output file `dist/renderer/index.js`. |
| `vitest.config.ts` | Vitest runner: jsdom env, setup from `src/test/setup.ts`, all `src/**/*.test.ts`, V8 coverage provider. |
| `dev.js` | Custom dev runner: watches `src/main/`, `src/preload/`, `src/renderer/` for changes, rebuilds (tsc + esbuild + asset copy) with 200ms debounce, respawns Electron. |
| `Makefile` | Build targets: build, dev, prod, package, install, clean, test. |
| `.gitignore` | Ignores: node_modules/, dist/, build/, release/, .cockpit/, *.log, .DS_Store, Thumbs.db, coverage/. |

### Documentation

| File | Description |
|------|-------------|
| `README.md` | Project intro: spatial/floating-panel IDE concept, running instructions, stack, design. |
| `ARCHITECT.md` | Comprehensive architecture doc (~360 lines): startup flow, process model, IPC channels (30+), canvas/card system, plugins, terminal sessions, Monaco loading, file explorer, persistence, theme, build pipeline, design tokens, state management, and notable gaps. |
| `DESIGN.md` | Design system: Noir palette, Space Mono typography, 8px/4px spacing scale, 8px border radius, component styles (buttons, cards). Art Nouveau x Floating mashup. |
| `PRODUCT.md` | Product philosophy: target users (vibe coders on small screens), purpose (spatial schematics-viewer), brand personality (precise/quiet/dense), anti-references, 5 design principles. |

### Scripts & Assets

| File | Description |
|------|-------------|
| `bin/cockpit.bat` | Windows launcher: `start "" "..\Cockpit.exe" %*` — passes CLI args to packaged Electron app. |
| `scripts/generate-installer-assets.js` | Generates installer header (150x57) and sidebar (164x314) BMP files with dot-grid pattern (`#161C24` bg, `#243248` dots). |
| `public/icon.svg` | SVG logo: 4 overlapping circles in gray tones (`#eeeeee`, `#6a6a6a`, `#2a2a2a`, `#4a4a4a`). |
| `public/cockpit_ide_icon.ico` | Application icon for Electron window and NSIS installer. |

### Source: Type Declarations

| File | Description |
|------|-------------|
| `src/global.d.ts` | Global `Window.electronAPI` interface: all IPC namespaces (`window`, `clipboard`, `terminal`, `workspace`, `shell`, `prefs`, `fs`) with method signatures. Also defines `EditorState`, `WorkspaceState`, `DirEntry`. |

### Source: Main Process

| File | Description |
|------|-------------|
| `src/main/main.ts` | Electron main process (~395 lines). Creates frameless BrowserWindow (1440x900, maximized) with contextIsolation. Handles all IPC: filesystem (readDir/readFile/writeFile/delete/copy/rename), PTY terminal sessions via node-pty (multi-session, platform-aware shell), chokidar file watching (debounced 100ms, ignores .git/node_modules/.cockpit), workspace persistence (last-workspace.txt, recent-workspaces.json, .cockpit/window.json), window controls (minimize/maximize/close/isMaximized/new), user preferences, native directory picker. Supports multi-window. |
| `src/main/main.test.ts` | Tests all IPC handlers with mocked electron/fs. Behavioral tests for fs:readDir/readFile/writeFile/delete, window:new, and registration verification for all 20+ IPC channels. |

### Source: Preload Script

| File | Description |
|------|-------------|
| `src/preload/preload.ts` | Electron preload (~66 lines). Uses `contextBridge.exposeInMainWorld` to expose `window.electronAPI` with IPC namespaces. Bridges `ipcRenderer.invoke` (request/response) and `ipcRenderer.send` (fire-and-forget). Registers listeners for `terminal:data`, `terminal:exit`, `file:changed` — returns unsubscribe functions. |
| `src/preload/preload.test.ts` | Verifies exposed API shape (all namespaces and functions) and correct IPC wiring (invoke vs send channels). Tests listener registration and event propagation for terminal/file events. |

### Source: Renderer — Entry Point & Shell

| File | Description |
|------|-------------|
| `src/renderer/index.html` | HTML shell (~30 lines). CSP meta tag, Space Mono font from Google Fonts, styles.css + xterm.css. DOM: `#titlebar` (frameless drag region, logo, menu bar, window controls), `#canvas` (infinite canvas), `#statusbar`. Loads `index.js`. |
| `src/renderer/index.ts` | Renderer entry (~9 lines). Instantiates `App` class. Has a legacy theme-toggle click listener (deprecated — TopBar handles toggling). |
| `src/renderer/styles.css` | Complete design system (~766 lines). CSS custom properties (--bg/surface/panel/primary/secondary/tertiary/border, --accent/green/amber/red, --font, --radius, --shadow). Styles for: title bar, menu bar with dropdowns, canvas, plugin list panel (lower-left), arrange panel (lower-right), context menu, status bar, cards (with edge resize handles), modals (generic, welcome, about, confirm), markdown content rendering. |
| `src/renderer/theme.ts` | Theme singleton (~61 lines). Defines `darkTheme` (Noir: `#161C24` bg, `#C8D6E5` text) and `lightTheme` (inverse: `#f8f8f8` bg, `#1a1a1a` text) palettes. Class manages state with `setDark()`, `toggle()`, `apply()` that sets 7 CSS custom properties on `document.documentElement`. Auto-applies on import. |
| `src/renderer/theme.test.ts` | Verifies dark/light initial state, toggle, palette correctness, CSS property propagation after apply(). |

### Source: Renderer — Components

| File | Description |
|------|-------------|
| `src/renderer/components/App.ts` | Root orchestrator (~177 lines). Creates CanvasArea and TopBar. Sets up keyboard shortcuts (Ctrl+Shift+N new window, Ctrl+W prevention, Ctrl+Tab card cycling). Manages workspace lifecycle: checks CLI path, shows WelcomeModal if none, auto-saves on state change (debounced JSON diff), restores user prefs. |
| `src/renderer/components/App.test.ts` | Tests: title, CanvasArea/TopBar creation, window control bindings, keyboard shortcuts, CLI workspace path loading flow. |
| `src/renderer/components/CanvasArea.ts` | Core infinite canvas engine (~1073 lines). World-to-screen coordinate transform (`screenX = worldX * scale + panX`). Pan (left/middle-click drag), zoom (wheel, cursor-centered, 0.1x-5x). Grid rendering (dots/grid/none) via CSS background-image. Card management (add/remove/terminate/reopen/focus with z-order stacking). Snap-to-grid (28px). Plugin lifecycle (Terminal/Dev/Context). Arrange panel (Auto Arrange, Tile Plugins with custom WxH). Status bar (zoom/pan/workspace/origin, View All button). Animated pan (ease-out cubic 300ms). State serialization. |
| `src/renderer/components/CanvasArea.test.ts` | Tests: grid styles, zoom bounds, resetView, setView, save state structure, state change callbacks, fit all / Auto Arrange / Tile Plugins with edge cases. |
| `src/renderer/components/PluginCard.ts` | Draggable/resizable card widget (~223 lines). DOM card with header (canvas-rendered title via @chenglou/pretext), close button (hover-reveal), body, edge resize handles (east/south/southeast). Drag by header (snaps to 28px grid). Resize with minimum snap. UUID via `crypto.randomUUID()`. |
| `src/renderer/components/PluginCard.test.ts` | Tests: card structure, positioning, UUID, callbacks (close/focus/destroy), canvas title rendering, drag interaction, resize edge handles. |
| `src/renderer/components/TextRenderer.ts` | Canvas text utility (~79 lines). Wraps `@chenglou/pretext` for `measure()`, `draw()`, `createCanvas()` (single-style), `createCanvas2()` (multi-style with varied line heights). |
| `src/renderer/components/TerminalPlugin.ts` | xterm.js terminal emulator (~116 lines). Creates Terminal with Noir custom theme. Connects to node-pty via IPC (create/write/resize/kill). Clipboard paste (Ctrl+Shift+V, Ctrl+V). ResizeObserver-based fit. Keyboard event handling. Process exit detection. |
| `src/renderer/components/TerminalPlugin.test.ts` | Tests: container creation, UUID storage, terminal.create call with/without cwd, onData/onExit listeners, destroy cleanup, onExit callback. |
| `src/renderer/components/MonacoEditorPlugin.ts` | Monaco code editor (~388 lines). Dynamically loads Monaco via AMD require() at runtime. Defines custom themes (cockpit-dark, cockpit-light). Multi-tab editing with per-tab cursor/scroll tracking. 30+ language detection (file extension). Auto-save (debounced 1.5s). External file change detection with auto-reload. Ctrl+S save action. Full state serialization/restoration. |
| `src/renderer/components/MonacoEditorPlugin.test.ts` | Tests: editor structure, initial state, getState null handling, reloadIfOpen (no-op/close/content update), file change listener, 30+ language detection. |
| `src/renderer/components/FileExplorerPlugin.ts` | File tree browser (~262 lines). Recursive directory listing with expand/collapse (arrow indicators), directories sorted first. Right-click context menus (files: Copy/Paste/Delete, .md files: "Open to CONTEXT"; dirs: New File/Folder/Copy/Paste/Delete). Inline input for instant creation (Enter commit, Escape cancel). Copy/paste with `_copy_N` auto-naming. Delete confirmation via ConfirmModal. External change watching with 500ms debounced refresh. |
| `src/renderer/components/FileExplorerPlugin.test.ts` | Tests: tree rendering, .gitkeep filter, directory-first sort, click callback, error state, wheel stopPropagation, expand/collapse (icon, children, cycle, reload preserves state, empty dir, nested). |
| `src/renderer/components/DevPlugin.ts` | Combined split-pane Dev plugin (~86 lines). FileExplorerPlugin (left, 260px default, resizable 120-600px) + MonacoEditorPlugin (right) in horizontal flex layout with drag handle. Delegates context openers. Bridges editor state changes and theme updates. |
| `src/renderer/components/DevPlugin.test.ts` | Tests: split layout (flex row, 3 children), MonacoEditorPlugin access, setContextOpeners delegation, updateTheme propagation, getEditorState/restoreEditorState null/empty handling. |
| `src/renderer/components/ContextPlugin.ts` | Markdown preview viewer (~230 lines). Renders .md files via `marked.parse()`. Multi-tab with per-tab scroll tracking. External file change detection with auto-reload (preserves scroll). State serialization/restoration (including legacy single-file format). Handles empty/deleted/error states gracefully. |
| `src/renderer/components/ContextPlugin.test.ts` | Tests: preview pane, title, file loading (tab + render), duplicate prevention, empty file, state get/restore (null/multi-tab/legacy), destroy cleanup. |
| `src/renderer/components/WelcomeModal.ts` | Startup workspace picker (~64 lines). Modal overlay with "Open Workspace" button (native dir picker via IPC), recent workspaces list, Close button. Returns `Promise<string | null>`. |
| `src/renderer/components/WelcomeModal.test.ts` | Tests: overlay/modal rendering, Open Workspace resolves path, Close resolves null, recent workspaces display/click resolves path. |
| `src/renderer/components/AboutModal.ts` | Version/credits dialog (~61 lines). Shows version (0.0.1), Electron/Node runtime versions, clickable "design.md" link. Optional onClose callback. |
| `src/renderer/components/AboutModal.test.ts` | Tests: open/close visibility, close button and overlay dismissal, design.md link existence, onClose callback and cleanup. |
| `src/renderer/components/ContextMenu.ts` | Right-click context menu (~54 lines). Floating singleton menu with items (labels + actions), separators, disabled items. Positions at click coordinates. Closes on outside click or item selection. Tracks all open menus and closes previous before opening new one. |
| `src/renderer/components/ContextMenu.test.ts` | Tests: item creation, positioning, action firing with menu removal, separators, disabled items, outside-click close, onClose, singleton behavior. |
| `src/renderer/components/ConfirmModal.ts` | Generic confirmation dialog (~56 lines). Shows message (supports HTML) with Cancel and configurable confirm button (default "Delete"). Returns `Promise<boolean>`. Overlay click = cancel. Removes DOM on resolution. |
| `src/renderer/components/ConfirmModal.test.ts` | Tests: confirm(true)/cancel(false)/overlay(false) resolution, DOM overlay removal, message display, custom confirm label, default label. |
| `src/renderer/components/TopBar.ts` | Custom menu bar with dropdown menus (File/View/Help). Plugin submenus (Terminal/Dev/Context) for focus/reopen. Buttons: Open Workspace, New Terminal/Dev/Context, Zoom In/Out, Reset View, Theme Toggle, About. |
| `src/renderer/components/TopBar.test.ts` | Tests: menu rendering, theme toggle, button callbacks, focus/reopen behavior, empty item lists. |
| `src/renderer/components/workflows.test.ts` | 36 integration workflow tests (~1157 lines): File CRUD (create/read/delete/copy+paste), Editor tab CRUD, Context tab CRUD (load/render/switch/close/serialize/restore/empty), Dev Plugin workflows (split layout, state delegation, context bridge, theme, restore), Theme persistence, ConfirmModal workflows, E2E file-to-editor/context flows, deep nested directory operations, error recovery. |
| `src/renderer/components/edge-cases.test.ts` | 63 edge case tests (~902 lines): Theme (rapid toggles, same-value set), ConfirmModal (empty/long/HTML messages, double-click), ContextMenu (empty/only-separators/error action/extreme coords), WelcomeModal (no electronAPI, long paths), AboutModal (no electronAPI), PluginCard (zero dimensions, long titles, double-remove/click), CanvasArea (zoom bounds, grid cycle, empty save, extreme pan), TopBar (undefined callbacks, empty lists), FileExplorer (empty dir, special chars, paste without copy), Context+Monaco+Dev+Terminal edge cases, cross-component chains. |

### Source: Test Infrastructure

| File | Description |
|------|-------------|
| `src/test/setup.ts` | Global test mocks (~232 lines). Mocks: @chenglou/pretext, @xterm/xterm (lightweight Terminal), crypto.randomUUID() (deterministic), Canvas2D context (all vi.fn()), ResizeObserver, requestAnimationFrame (setTimeout 0), devicePixelRatio (1). Creates mock `window.electronAPI` with all 24 IPC channels. Sets CSS custom properties. Bootstraps DOM scaffolding. Exports `mockElectronAPI`. |
| `src/test/README.md` | Test infrastructure docs (~117 lines). Vitest + jsdom setup, 16 test files with 216+ tests (~3s run time). Test patterns, mock access, known limitations (Monaco AMD loader, node-pty, canvas rendering). |
