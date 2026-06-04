<p align="center">
  <img src="https://raw.githubusercontent.com/mrkprdo/cockpit-ide/dev/public/icon.svg" alt="Logo" height=170>
</p>

<h1 align="center">Cockpit IDE</h1>
<div align="center">
  The IDE for developers who think spatially
</div>

---

[![Nightly Build](https://github.com/mrkprdo/cockpit-ide/actions/workflows/main.yml/badge.svg)](https://github.com/mrkprdo/cockpit-ide/actions/workflows/main.yml)
[![Test](https://github.com/mrkprdo/cockpit-ide/actions/workflows/test.yml/badge.svg?branch=dev)](https://github.com/mrkprdo/cockpit-ide/actions/workflows/test.yml)

---

Cockpit is a spatial IDE built on Electron. Drag your File Explore, Terminal, and Git anywhere on the canvas — stack them, zoom out to see everything at once, open as many instances as you need if applicable. Layout persist and restore exactly as you left them.

Monitor your workspace Markdown files in a tabbed Markdown viewer with live file watching. Edit with VSCode style editor, run commands in a full PTY terminal, and browse files in a split-pane explorer — all on a canvas that bends to your workflow, not the other way around.

Generate your project's code graph, by integrating SPECGEN.md and let your LLM efficiently traverse your codebase and produce codebase specifications. Which then you can visualize in SpecsMap. Use this visualization tool and specs document to let AI fix your app efficiently and effectively.

<p align="center" width="100%">
<video src="https://github.com/user-attachments/assets/6c921410-5c9a-4df5-b0e1-c2cf3da64271" width="80%" controls></video>
</p>

---

**Explorer** — Monaco editor + resizable file explorer in one card  
**Terminal** — Full PTY terminal via node-pty + xterm.js  
**Markdown** — Tabbed markdown viewer with live file watching  
**Git** — Branch visualization, staging, diffs, and commit tooling  
**SpecsMap** — Live dependency graph of the spec system  

---

## Getting Started

```bash
# Quick start
npm install
npm start           # stamp version, build, and launch

# Open a workspace from the CLI
cockpit .           # open current directory
cockpit ~/projects  # open specific directory
```

When launched with a path, Cockpit skips the welcome prompt and opens directly into that workspace.

## Development

```bash
npm run dev         # stamp version and launch (no rebuild)
npm run dev:watch   # watch mode (concurrent tsc + esbuild)
make dev            # build then launch with dev runner
```

### Testing

```bash
npm test               # run all tests (vitest)
npm run test:watch     # watch mode
npm run test:coverage  # coverage report
npm run test:ui        # vitest UI dashboard
```

### Build & Package

```bash
npm run build       # compile TypeScript + bundle renderer
npm run build:prod  # production build (separate tsconfig)
npm run pack        # build installer (all platforms)
npm run pack:win    # Windows NSIS installer
npm run pack:mac    # macOS DMG
npm run pack:linux  # Linux AppImage
```

## Stack

**Runtime:** Electron 42 (Node 22, Chromium 138)  
**Language:** TypeScript 5.8  
**Build:** tsc (main/preload) + esbuild 0.28 (renderer IIFE)  
**Editor:** Monaco Editor 0.52 (AMD-loaded)  
**Terminal:** @xterm/xterm 6 + @xterm/addon-fit + node-pty  
**Rendering:** @chenglou/pretext (canvas text) + marked 18 (markdown)  
**File watching:** chokidar 5  
**MCP:** @modelcontextprotocol/sdk + ws (WebSocket IDE server)  
**Validation:** zod 4  
**Testing:** vitest 4 + jsdom (26 test files, 755+ tests)

## Design

Noir x Art Nouveau x Floating — dark/light theme with Space Mono typography, dashed borders, and 8px radius. By <a src="https://www.usedesign.md/?mash=1&p=noir&c=Art+Nouveau&s=Floating&b=dashed+border&r=8px&f=%27Space+Mono%27%2C+%27Courier+New%27%2C+monospace&sh=rgba%2858%2C106%2C232%2C0.08%29+0+4px+12px%2C+rgba%280%2C0%2C0%2C0.04%29+0+2px+4px&shs=noir&mode=dark" target="_blank">UseDesign.md</a>

---

MIT License
