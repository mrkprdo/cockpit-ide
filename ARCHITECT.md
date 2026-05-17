# Cockpit IDE — Architecture

## Stack

- **Runtime:** Electron 42 (contextIsolation, no nodeIntegration)
- **Language:** TypeScript 5.8 (ES2022)
- **Bundler:** esbuild 0.28 (renderer IIFE), tsc (main/preload CommonJS)
- **Text Rendering:** `@chenglou/pretext` (canvas-based text measurement & layout)
- **Terminal:** `@xterm/xterm` v6 + `node-pty` v1
- **Editor:** Monaco Editor v0.53 (dynamically loaded via AMD `require()`)
- **Markdown:** `marked` v18

## Process Model

```
┌──────────────────────────────────────────────────────────────┐
│                     Main Process                             │
│                  src/main/main.ts (~284 lines)               │
│                                                              │
│  - Frameless BrowserWindow (1440×900, maximized)              │
│  - PTY terminal sessions (multi-session, node-pty)            │
│  - File system I/O (readDir, readFile, writeFile, delete,     │
│    copy, rename)                                              │
│  - Recursive file watching via chokidar (debounced 100ms)     │
│  - Workspace persistence (.cockpit/window.json)               │
│  - Recent workspaces tracking (JSON in userData)              │
│  - User preferences persistence (JSON in userData)            │
│  - Window controls IPC handlers                               │
│  - Native dialog (directory picker)                           │
└──────────────────────┬───────────────────────────────────────┘
                       │ IPC (invoke / send / on)
                       │ contextIsolation: true
                       │ nodeIntegration: false
┌──────────────────────┴───────────────────────────────────────┐
│                    Preload Script                             │
│                  src/preload/preload.ts (~62 lines)           │
│                                                              │
│  contextBridge.exposeInMainWorld('electronAPI', { ... })     │
│  - platform, versions                                        │
│  - window.* (minimize/maximize/close/isMaximized)            │
│  - terminal.* (create/write/resize/kill/onData/onExit)       │
│  - workspace.* (select/getPath/load/save/getRecent/addRecent) │
│  - shell.* (openExternal)                                     │
│  - prefs.* (load/save)                                        │
│  - fs.* (readDir/readFile/writeFile/delete/copy/rename/      │
│    watch/unwatch/onChanged)                                   │
└──────────────────────┬───────────────────────────────────────┘
                       │ window.electronAPI
┌──────────────────────┴───────────────────────────────────────┐
│                    Renderer Process                           │
│                src/renderer/ (browser-side)                   │
│                                                              │
│  index.html ──→ index.ts ──→ App.ts                          │
│                                                              │
│  App.ts orchestrates the full lifecycle:                      │
│  ├── TopBar.ts              — Custom menu bar + theme toggle  │
│  ├── CanvasArea.ts          — Infinite canvas engine          │
│  │   ├── PluginCard.ts      — Draggable/resizable card widget │
│  │   ├── TextRenderer.ts    — Canvas text rendering utility   │
│  │   ├── TerminalPlugin.ts  — xterm.js terminal emulator      │
│  │   ├── DevPlugin.ts       — Combined explorer + editor      │
│  │   │   ├── FileExplorerPlugin.ts  — File tree browser      │
│  │   │   └── MonacoEditorPlugin.ts  — VS Code Monaco editor  │
│  │   └── ContextPlugin.ts   — Markdown preview viewer         │
│  ├── WelcomeModal.ts        — Startup workspace picker        │
│  ├── AboutModal.ts          — Version/credits dialog          │
│  ├── ContextMenu.ts         — Right-click context menu        │
│  └── ConfirmModal.ts        — Confirmation dialog             │
│                                                              │
│  Theme: theme.ts — CSS custom properties singleton           │
│  Styles: styles.css — Complete design system (~591 lines)    │
└──────────────────────────────────────────────────────────────┘
```

## Project Structure

```
cockpit-ide/
├── src/
│   ├── main/
│   │   └── main.ts              # Electron main process (~284 lines)
│   ├── preload/
│   │   └── preload.ts           # Context bridge (~62 lines)
│   ├── renderer/
│   │   ├── index.html           # Shell HTML (CSP, custom titlebar)
│   │   ├── index.ts             # Renderer entry point
│   │   ├── styles.css           # Complete design system
│   │   ├── theme.ts             # Dark/light theme singleton
│   │   └── components/
│   │       ├── App.ts           # Root orchestrator
│   │       ├── TopBar.ts        # Custom menu bar
│   │       ├── CanvasArea.ts    # Infinite canvas engine
│   │       ├── PluginCard.ts    # Draggable/resizable card
│   │       ├── TextRenderer.ts  # Canvas text utility
│   │       ├── TerminalPlugin.ts # xterm.js PTY terminal
│   │       ├── MonacoEditorPlugin.ts # Monaco code editor
│   │       ├── FileExplorerPlugin.ts # File tree browser
│   │       ├── DevPlugin.ts     # Split explorer + editor
│   │       ├── ContextPlugin.ts # Markdown preview viewer
│   │       ├── WelcomeModal.ts  # Startup workspace picker
│   │       ├── AboutModal.ts    # Version/credits dialog
│   │       ├── ContextMenu.ts   # Right-click context menu
│   │       └── ConfirmModal.ts  # Confirmation dialog
│   └── global.d.ts              # Electron API type declarations
├── dev.js                        # Custom dev runner (watcher + Electron respawn)
├── public/
│   ├── cockpit_ide_icon.ico
│   └── icon.svg
├── dist/                        # Build output
│   ├── main/main.js
│   ├── preload/preload.js
│   ├── renderer/index.js
│   ├── vs/                      # Vendored Monaco Editor (~113 files)
│   └── ...
├── ARCHITECT.md
├── DESIGN.md
├── Makefile
├── package.json
├── tsconfig.main.json
└── tsconfig.renderer.json
```

## IPC Channels

| Channel | Direction | Payload | Purpose |
|---------|-----------|---------|---------|
| `window:minimize` | Renderer → Main | — | Minimize window |
| `window:maximize` | Renderer → Main | — | Toggle maximize |
| `window:close` | Renderer → Main | — | Close window |
| `window:isMaximized` | Renderer → Main (invoke) | → `boolean` | Check maximized state |
| `terminal:create` | Renderer → Main (invoke) | uuid, cwd? → `boolean` | Spawn PTY |
| `terminal:write` | Renderer → Main | uuid, data | Write to PTY stdin |
| `terminal:resize` | Renderer → Main | uuid, cols, rows | Resize PTY |
| `terminal:kill` | Renderer → Main | uuid | Kill PTY process |
| `terminal:data` | Main → Renderer | uuid, data | PTY stdout → xterm |
| `terminal:exit` | Main → Renderer | uuid | PTY process exited |
| `workspace:select` | Renderer → Main (invoke) | → `string | null` | Open directory dialog |
| `workspace:getPath` | Renderer → Main (invoke) | → `string | null` | Get current workspace |
| `workspace:load` | Renderer → Main (invoke) | → `WorkspaceState | null` | Load `.cockpit/window.json` |
| `workspace:save` | Renderer → Main (invoke) | state → `void` | Save `.cockpit/window.json` |
| `workspace:getRecent` | Renderer → Main (invoke) | → `string[]` | Get recent workspaces |
| `workspace:addRecent` | Renderer → Main (invoke) | path → `void` | Add to recent list |
| `shell:openExternal` | Renderer → Main (invoke) | url → `boolean` | Open URL in browser |
| `prefs:load` | Renderer → Main (invoke) | → `object` | Load user preferences |
| `prefs:save` | Renderer → Main (invoke) | prefs → `boolean` | Save user preferences |
| `fs:readDir` | Renderer → Main (invoke) | dirPath → `DirEntry[] | null` | Read directory |
| `fs:readFile` | Renderer → Main (invoke) | filePath → `string | null` | Read file |
| `fs:writeFile` | Renderer → Main (invoke) | filePath, content → `boolean` | Write file |
| `fs:delete` | Renderer → Main (invoke) | targetPath → `boolean` | Delete file/directory |
| `fs:copy` | Renderer → Main (invoke) | src, dest → `boolean` | Copy file/directory |
| `fs:rename` | Renderer → Main (invoke) | oldPath, newPath → `boolean` | Rename file/directory |
| `file:watch` | Renderer → Main (invoke) | dir → `boolean` | Start chokidar watching |
| `file:unwatch` | Renderer → Main (invoke) | — → `boolean` | Stop watching |
| `file:changed` | Main → Renderer | filePath | File change notification |

## Key Concepts

### Canvas / Card System

The infinite canvas uses **world coordinates** transformed to **screen coordinates**:
```
screenX = worldX × scale + panX
screenY = worldY × scale + panY
```

- **Pan**: Left-click or middle-click drag on empty canvas area
- **Zoom**: Mouse wheel — zoom centers on cursor position (0.1×–5× range)
- **Grid**: Configurable background (dots/grid/none) rendered via CSS `background-image` with canvas-generated pattern; scales and pans with viewport
- **Snap**: All cards snap to a 28px grid unit (position and size)
- **Origin indicator**: Red dot at grid center (patternSize/2, patternSize/2)

### Plugin Cards

Cards are the primary UI unit. Each card has:
- A header with canvas-rendered title (via `@chenglou/pretext`)
- A close button (hover-reveal)
- A body that hosts plugin content
- Edge resize handles (east, south, southeast)
- World coordinates stored for position persistence

Card types:
- **Terminal**: `@xterm/xterm` connected to `node-pty` process
- **Dev**: Split pane with `FileExplorerPlugin` (left, 260px default, resizable 120–600px) + `MonacoEditorPlugin` (right)
- **Editor**: Standalone `MonacoEditorPlugin` (unused in current UI)
- **Explorer**: Standalone `FileExplorerPlugin` (unused in current UI)
- **Context**: Standalone `ContextPlugin` for markdown preview

### Terminal Multi-Session

Each terminal gets a `crypto.randomUUID()`. PTY processes are tracked in a `Map<string, any>` in the main process. Terminals persist even when their card is closed — they can be reopened from the View → Terminal submenu.

### Monaco Editor

Loaded dynamically at runtime via AMD:
1. `vs/loader.js` script injected into `<head>`
2. `require.config()` points to vendored `dist/vs/` directory
3. `require(['vs/editor/editor.main'], ...)` loads editor
4. Custom themes (`cockpit-dark`, `cockpit-light`) defined matching Noir palette
5. Multi-tab editing with per-tab cursor position and scroll state tracking
6. Language detection from file extension (30+ languages)
7. Auto-save on content change (debounced 1.5s)
8. External file change detection via `file:changed` IPC → auto-reload

### Context Plugin (Markdown Preview)

Renders `.md` files using `marked.parse()`:
- Loads file content via IPC, renders to styled HTML
- Tracks scroll position across reloads
- Listens for external file changes and auto-reloads preview
- Handles deleted files gracefully ("File deleted" placeholder)

### File Explorer

Recursive file tree with:
- Directories sorted first, expand/collapse with arrow indicators
- **Right-click context menus** via `ContextMenu` class:
  - Files: Copy, Paste, Delete, "View in CONTEXT" (for `.md` files)
  - Directories: New File, New Folder, Copy, Paste, Delete
  - Empty area: New File, New Folder
- **Inline creation**: `<input>` rendered in tree for instant file/folder creation (Enter to commit, Escape to cancel)
- **Copy/Paste**: Tracks `copiedPath`, generates `_copy_N` filenames
- **Delete confirmation**: Uses `ConfirmModal` (returns `Promise<boolean>`)
- **File change watching**: Debounced refresh (500ms) on `file:changed` events

### File Watching

Uses **chokidar** for reliable cross-platform file watching on the workspace directory. Ignores `.git`, `node_modules`, `.cockpit`. Depth-limited to 20. Changes debounced at 100ms. File change events sent to renderer as `file:changed` IPC.

### Workspace State Persistence

State saved to `.cockpit/window.json` in the workspace directory:

```typescript
interface WorkspaceState {
  plugins: {
    uuid: string;
    title: string;
    x: number; y: number;
    width: number; height: number;
    isOpen: boolean;
    editorState?: EditorState;
    contextState?: { loadedFile: string; scrollTop: number } | null;
  }[];
  zOrder: string[];            // Bottom-to-top card order (by uuid)
  zoom: number;
  panX: number;
  panY: number;
  isDark: boolean;             // Theme state
}
```

Auto-save triggers on any state change, debounced via JSON diff comparison against `lastSaved`. Editor state includes open files, active file, explorer width, and cursor positions per file. Context state includes loaded file path and scroll position.

### Theme

Singleton `Theme` class (`theme.ts`) applies CSS custom properties to `document.documentElement`:
- `--bg`, `--surface`, `--panel`, `--primary`, `--secondary`, `--tertiary`, `--border`
- Dark: Noir palette (`#0A0E14` background, `#C8D6E5` text)
- Light: Inverse palette (`#f8f8f8` background, `#1a1a1a` text)
- Toggle also updates Monaco Editor theme and regenerates canvas grid pattern
- Persisted in both workspace state and user preferences

### Modals

Rendered as DOM overlay elements (not canvas). Four modal types:
- **WelcomeModal**: Shown on startup — Open Workspace, select from recent, or Close (closes app)
- **AboutModal**: Version info, description, DESIGN.md badge link
- **ContextMenu**: Generic right-click context menu (floating, singleton, click-outside dismiss)
- **ConfirmModal**: Generic confirmation dialog with Cancel/Delete buttons, returns `Promise<boolean>`

### Status Bar

Shows zoom percentage, pan coordinates, workspace name, and an "origin" button that animates (ease-out cubic, 300ms) the viewport back to center. Also shows a plugin list hover zone in the lower-left corner with context menu options (Show/Terminate).

## Build Pipeline

```
npm run build
├── tsc -p tsconfig.main.json        # main.js + preload.js → dist/
├── esbuild src/renderer/index.ts     # → dist/renderer/index.js (IIFE)
│   --bundle --format=iife
├── copy src/renderer/*.html dist/renderer/
├── copy src/renderer/*.css dist/renderer/
├── copy @xterm/xterm/css/*.css dist/renderer/  (xterm.css)
└── xcopy monaco-editor/min/vs → dist/vs/       (vendored, ~113 files)
```

| Script | Purpose |
|--------|---------|
| `npm run build` | Full production build |
| `npm run start` | Build + launch Electron |
| `npm run dev` | Launch Electron with DevTools (`--dev` flag) |
| `npm run dev:watch` | Concurrent watch mode: tsc + esbuild + asset copy with Electron launch |
| `npm run prod` | Launch Electron without DevTools (no rebuild) |
| `npm run clean` | Remove `dist/` |

A custom `dev.js` file also exists as an alternative dev runner that watches source files, rebuilds on change (200ms debounce), and respawns Electron.

## Dependencies

### Runtime

| Dependency | Role |
|------------|------|
| `electron` ^42.1.0 | Desktop runtime |
| `@xterm/xterm` ^6.0.0 | Terminal emulator widget |
| `node-pty` ^1.1.0 | PTY (pseudo-terminal) spawning |
| `monaco-editor` ^0.53.0 | Code editor (dynamically loaded via AMD) |
| `@chenglou/pretext` ^0.0.7 | Canvas text measurement & layout |
| `marked` ^18.0.3 | Markdown to HTML rendering (ContextPlugin) |
| `xterm` ^5.3.0 | **Legacy — unused**, `@xterm/xterm` is the active package |

### Dev

| Dependency | Role |
|------------|------|
| `typescript` ^5.8.0 | TypeScript compiler |
| `esbuild` ^0.28.0 | Renderer bundler |
| `chokidar` ^5.0.0 | File watching in main process |
| `concurrently` ^9.0.0 | Parallel script runner (used by `dev:watch`) |
| `wait-on` ^8.0.0 | Wait for build artifacts (used by `dev:watch`) |
| `electron-builder` ^26.8.1 | Packaging (not yet configured) |
| `electron-reload` ^2.0.0-alpha.1 | Hot reload in dev mode |

## Design Tokens (CSS Custom Properties)

Defined in `styles.css` `:root` block:

- `--bg`, `--surface`, `--panel`, `--primary`, `--secondary`, `--tertiary`, `--border` — themeable via JS
- `--accent` (`#00E5FF`), `--accent2` (`#7C4DFF`), `--green`, `--amber`, `--red`
- `--font`: `'Space Mono', 'Courier New', monospace`
- `--radius-sm` (8px), `--radius-md` (12px), `--radius-lg` (16px)
- `--shadow`: layered shadow for depth

## State Management

No formal state management library (no Redux, MobX, Zustand). State is managed through:

- **Class-level mutable state**: Each component owns its data (cards in `CanvasArea`, tabs in `MonacoEditorPlugin`, tree in `FileExplorerPlugin`)
- **Callback-based communication**: Components expose observer-style hooks (e.g. `onStateChange`, `onTerminalsChanged`, `onFileOpen`)
- **Persistence as state mirror**: `WorkspaceState` serialized to `.cockpit/window.json` on every change
- **Theme as singleton**: `Theme` class with `apply()` setting CSS custom properties on `:root`
- **IPC as state bridge**: All filesystem and PTY operations go through IPC to the main process

## Notable Gaps

- **No testing framework** — zero test files or scripts
- **No linting/formatting** — no ESLint, Prettier, or similar
- **No CI/CD** — no GitHub Actions or similar configured
- **No electron-builder config** — dependency listed but no packaging script
- **`xterm` v5.3.0** is an unused legacy dependency; `@xterm/xterm` v6 is the active terminal library
- **No formal plugin API** — plugins are plain classes composed into cards; no registration system
