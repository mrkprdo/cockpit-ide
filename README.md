# Cockpit IDE

**v1.0.0-alpha** — *Art Nouveau × Floating*

An experimental, canvas-based desktop IDE built with Electron. Code editors, terminals, and file explorers exist as draggable, resizable plugin cards on an infinite canvas workspace.

## Features

- **Infinite Canvas** — Pan (drag) and zoom (scroll wheel) an infinite workspace. Configurable background grid (dots, grid lines, or none). Snap-to-grid for all cards (28px).
- **Plugin Cards** — Draggable, resizable cards that host:
  - **Dev** — Split-pane file explorer + Monaco code editor with multi-tab support, syntax highlighting for 30+ languages, and auto-save
  - **Terminal** — Real PTY shell via `node-pty` with `@xterm/xterm`, multi-session support
  - **Editor** — Standalone Monaco editor card
  - **Explorer** — Standalone file tree browser card
- **Workspace Persistence** — Auto-saves all card positions, sizes, open/closed state, zoom/pan, editor tabs and cursor positions to `.cockpit/window.json`
- **File Watching** — Recursive file change detection with auto-reload in the editor
- **Dark/Light Theme** — Noir palette with CSS custom properties, updates Monaco editor themes
- **Custom Title Bar** — Frameless window with HTML/CSS title bar, menu bar, and window controls
- **Recent Workspaces** — Remembers last 5 workspaces

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron 35 |
| Language | TypeScript 5.8 (ES2022) |
| Bundler | esbuild (renderer), tsc (main/preload) |
| Editor | Monaco Editor 0.55 |
| Terminal | @xterm/xterm 6 + node-pty 1.1 |
| Canvas Text | @chenglou/pretext |

## Quick Start

```
npm install
npm run start      # build + launch
npm run dev        # launch with DevTools
npm run prod       # launch without DevTools
```

## Project Structure

```
src/
├── main/              # Electron main process
│   └── main.ts        #   window, PTY, filesystem, IPC
├── preload/
│   └── preload.ts     #   contextBridge (electronAPI)
└── renderer/
    ├── index.html     #   shell HTML (CSP, titlebar)
    ├── index.ts       #   entry point
    ├── styles.css     #   design system (476 lines)
    ├── theme.ts       #   dark/light theme singleton
    └── components/
        ├── App.ts             #   root orchestrator
        ├── TopBar.ts          #   menu bar + theme toggle
        ├── CanvasArea.ts      #   infinite canvas engine
        ├── PluginCard.ts      #   draggable/resizable card widget
        ├── TerminalPlugin.ts  #   xterm.js terminal
        ├── MonacoEditorPlugin.ts  #   Monaco code editor
        ├── FileExplorerPlugin.ts  #   file tree browser
        ├── DevPlugin.ts       #   split explorer + editor
        ├── WelcomeModal.ts    #   startup workspace picker
        ├── PreferencesModal.ts #   grid style settings
        └── AboutModal.ts      #   version/credits dialog
```

## Architecture

Three-process Electron model with `contextIsolation: true` and `nodeIntegration: false`:

```
Main Process  ←→  Preload (contextBridge)  ←→  Renderer
(IPC handlers)      (electron API proxy)       (canvas UI)
```

See [ARCHITECT.md](ARCHITECT.md) for full architecture details and [DESIGN.md](DESIGN.md) for the design system.

## License

ISC
