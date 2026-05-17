# Cockpit IDE — Architecture

## Stack

- **Runtime:** Electron 35 (contextIsolation, no nodeIntegration)
- **Language:** TypeScript (ES2022)
- **Bundler:** esbuild (renderer IIFE), tsc (main/preload CommonJS)
- **Text Rendering:** `@chenglou/pretext` (canvas-based text measurement & layout)
- **Terminal:** `@xterm/xterm` v6 + `node-pty` v1
- **Editor:** Monaco Editor v0.55 (dynamically loaded via AMD `require()`)

## Process Model

```
┌──────────────────────────────────────────────────────────────┐
│                     Main Process                             │
│                  src/main/main.ts                            │
│                                                              │
│  - Frameless BrowserWindow (1440×900, maximized)              │
│  - PTY terminal sessions (multi-session, node-pty)            │
│  - File system I/O (readDir, readFile, writeFile)             │
│  - Recursive file watching (debounced 100ms)                  │
│  - Workspace persistence (.cockpit/window.json)               │
│  - Recent workspaces tracking (JSON in userData)              │
│  - Window controls IPC handlers                               │
│  - Native dialog (directory picker)                           │
└──────────────────────┬───────────────────────────────────────┘
                       │ IPC (invoke / on / send)
                       │ contextIsolation: true
                       │ nodeIntegration: false
┌──────────────────────┴───────────────────────────────────────┐
│                    Preload Script                             │
│                  src/preload/preload.ts                       │
│                                                              │
│  contextBridge.exposeInMainWorld('electronAPI', { ... })     │
│  - platform, versions                                        │
│  - window.* (minimize/maximize/close/isMaximized)            │
│  - terminal.* (create/write/resize/kill/onData)              │
│  - workspace.* (select/getPath/load/save/getRecent/addRecent) │
│  - shell.* (openExternal)                                     │
│  - fs.* (readDir/readFile/writeFile/watch/unwatch/onChanged)  │
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
│  ├── WelcomeModal.ts        — Startup workspace picker        │
│  ├── PreferencesModal.ts    — Settings (grid style)           │
│  └── AboutModal.ts          — Version/credits dialog          │
│                                                              │
│  Theme: theme.ts — CSS custom properties singleton           │
│  Styles: styles.css — Complete design system (476 lines)     │
└──────────────────────────────────────────────────────────────┘
```

## Project Structure

```
cockpit-ide/
├── src/
│   ├── main/
│   │   └── main.ts              # Electron main process (241 lines)
│   ├── preload/
│   │   └── preload.ts           # Context bridge (50 lines)
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
│   │       ├── WelcomeModal.ts  # Startup workspace picker
│   │       ├── PreferencesModal.ts # Grid style settings
│   │       └── AboutModal.ts    # Version/credits dialog
│   └── global.d.ts              # Electron API type declarations
├── public/
│   ├── cockpit_ide_icon.ico
│   └── icon.svg
├── dist/                        # Build output
│   ├── main/main.js
│   ├── preload/preload.js
│   ├── renderer/index.js
│   ├── vs/                      # Vendored Monaco Editor
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
| `terminal:create` | Renderer → Main (invoke) | uuid?, cwd? → `boolean` | Spawn PTY |
| `terminal:write` | Renderer → Main | uuid, data | Write to PTY stdin |
| `terminal:resize` | Renderer → Main | uuid, cols, rows | Resize PTY |
| `terminal:kill` | Renderer → Main | uuid | Kill PTY process |
| `terminal:data` | Main → Renderer | uuid, data | PTY stdout → xterm |
| `workspace:select` | Renderer → Main (invoke) | → path `string | null` | Open directory dialog |
| `workspace:getPath` | Renderer → Main (invoke) | → path `string | null` | Get current workspace |
| `workspace:load` | Renderer → Main (invoke) | → `WorkspaceState | null` | Load `.cockpit/window.json` |
| `workspace:save` | Renderer → Main (invoke) | state → `boolean` | Save `.cockpit/window.json` |
| `workspace:getRecent` | Renderer → Main (invoke) | → `string[]` | Get recent workspaces |
| `workspace:addRecent` | Renderer → Main (invoke) | path → void | Add to recent list |
| `shell:openExternal` | Renderer → Main (invoke) | url → `boolean` | Open URL in browser |
| `fs:readDir` | Renderer → Main (invoke) | dirPath → `DirEntry[] | null` | Read directory |
| `fs:readFile` | Renderer → Main (invoke) | filePath → `string | null` | Read file |
| `fs:writeFile` | Renderer → Main (invoke) | filePath, content → `boolean` | Write file |
| `file:watch` | Renderer → Main (invoke) | dir → `boolean` | Start watching directory |
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
- **Zoom**: Mouse wheel — zoom centers on cursor position
- **Grid**: Configurable background (dots/grid/none) rendered via CSS `background-image` with canvas-generated pattern; scales and pans with viewport
- **Snap**: All cards snap to a 28px grid (position and size)
- **Origin indicator**: Red dot at grid origin (patternSize/2, patternSize/2)

### Plugin Cards

Cards are the primary UI unit. Each card has:
- A header with canvas-rendered title (via `@chenglou/pretext`)
- A close button (hover-reveal)
- A body that hosts plugin content
- Edge resize handles (east, south, southeast)
- World coordinates stored for position persistence

Card types:
- **Terminal**: `@xterm/xterm` connected to `node-pty` process
- **Dev**: Split pane with `FileExplorerPlugin` (left, 260px, resizable 120–600px) + `MonacoEditorPlugin` (right)
- **Editor**: Standalone `MonacoEditorPlugin` (standalone)
- **Explorer**: Standalone `FileExplorerPlugin` (standalone)

### Terminal Multi-Session

Each terminal gets a `crypto.randomUUID()`. PTY processes are tracked in a `Map<string, any>` in the main process. Terminals persist even when their card is closed — they can be reopened from the View → Terminal submenu.

### Monaco Editor

Loaded dynamically at runtime via AMD:
1. `vs/loader.js` script injected into `<head>`
2. `require.config()` points to vendored `dist/vs/` directory
3. `require(['vs/editor/editor.main'], ...)` loads editor
4. Custom themes (`cockpit-dark`, `cockpit-light`) defined matching Noir palette
5. Multi-tab editing with cursor position tracking per tab
6. Language detection from file extension
7. External file change detection via `file:changed` IPC → auto-reload

### File Watching

Recursive `fs.watch` on the workspace directory, filtering out `.git`, `node_modules`, `.cockpit`. Debounced at 100ms. File change events sent to renderer as `file:changed` IPC.

### Workspace State Persistence

State saved to `.cockpit/window.json` in the workspace directory:

```typescript
interface WorkspaceState {
  plugins: PluginEntry[]      // uuid, title, world position, size, isOpen, editorState
  zOrder: string[]            // Bottom-to-top card order (by uuid)
  zoom: number
  panX: number
  panY: number
}
```

Auto-save triggers on any state change (debounced via JSON diff). Editor state includes open files, active file, and cursor positions per file.

### Theme

Singleton `Theme` class applies CSS custom properties to `document.documentElement`:
- `--bg`, `--surface`, `--panel`, `--primary`, `--secondary`, `--tertiary`, `--border`
- Dark: Noir palette (`#0A0E14` background, `#C8D6E5` text)
- Light: Inverse palette (`#f8f8f8` background, `#1a1a1a` text)
- Toggle also updates Monaco Editor theme and regenerates canvas grid pattern

### Modals

Rendered as DOM overlay elements (not canvas). Three modal types:
- **WelcomeModal**: Shown on first launch — Open Workspace, Close, or select from recent
- **PreferencesModal**: Canvas background grid style selection (Dots/Grid/None)
- **AboutModal**: Version info + DESIGN.md badge link

### Status Bar

Shows zoom percentage, pan coordinates, workspace name, and an "origin" button that animates (ease-out cubic, 300ms) the viewport back to center.

## Build Pipeline

```
npm run build
├── tsc -p tsconfig.main.json        # main.js + preload.js → dist/
├── esbuild src/renderer/index.ts     # → dist/renderer/index.js (IIFE)
│   --bundle --format=iife
├── copy src/renderer/*.html dist/renderer/
├── copy src/renderer/*.css dist/renderer/
├── copy @xterm/xterm/css/*.css dist/renderer/  (xterm.css)
└── xcopy monaco-editor/min/vs → dist/vs/       (vendored, 113 files)
```

| Script | Purpose |
|--------|---------|
| `npm run build` | Full build |
| `npm run start` | Build + launch Electron |
| `npm run dev` | Launch with DevTools (`--dev`) |
| `npm run prod` | Launch without DevTools |
| `npm run clean` | Remove `dist/` |

## Dependencies

| Dependency | Role |
|------------|------|
| `electron` ^35.0.0 | Desktop runtime |
| `typescript` ^5.8.0 | TypeScript compiler |
| `esbuild` ^0.28.0 | Renderer bundler |
| `@xterm/xterm` ^6.0.0 | Terminal emulator widget |
| `node-pty` ^1.1.0 | PTY (pseudo-terminal) spawning |
| `monaco-editor` ^0.55.1 | Code editor (dynamically loaded) |
| `@chenglou/pretext` ^0.0.7 | Canvas text measurement & layout |
| `electron-builder` ^25.0.0 | Packaging (not yet configured) |

**Unused dependencies:** `concurrently`, `wait-on` (dev), `xterm` v5.3.0 (runtime — legacy, `@xterm/xterm` is the active package).

## Design Tokens (CSS Custom Properties)

Defined in `styles.css` `:root` block:

- `--bg`, `--surface`, `--panel`, `--primary`, `--secondary`, `--tertiary`, `--border` — themeable via JS
- `--accent` (`#00E5FF`), `--accent2` (`#7C4DFF`), `--green`, `--amber`, `--red`
- `--font`: `'Space Mono', 'Courier New', monospace`
- `--radius-sm` (8px), `--radius-md` (12px), `--radius-lg` (16px)
- `--shadow`: layered shadow for depth

## Missing / Notable Gaps

- **No testing framework** — zero test files or scripts
- **No linting/formatting** — no eslint, prettier, or similar
- **No CI/CD** — no GitHub Actions or similar configured
- **No electron-builder config** — dependency listed but no packaging script
- **`xterm` v5.3.0** is an unused legacy dependency; `@xterm/xterm` v6 is the active terminal library
- **`concurrently` + `wait-on`** are unused devDependencies
