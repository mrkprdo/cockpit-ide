# Cockpit IDE — Project Map

## Overview

Cockpit IDE v0.0.1 — spatial/floating-panel IDE built in Electron. Monaco editor, xterm.js terminal, file explorer, and markdown viewer live as draggable/resizable cards on a zoomable/pannable canvas. Sessions persist to `.cockpit/window.json`.

**Stack:** Electron 42 · TypeScript 5.8 · esbuild 0.28 (renderer) · tsc (main/preload) · Monaco Editor 0.53 (AMD-loaded) · @xterm/xterm 6 + node-pty 1 · @chenglou/pretext (canvas text) · marked 18 · vitest 4

**Design:** Noir x Art Nouveau x Floating, dark/light theme via CSS custom properties, Space Mono monospace, dashed borders, 8px border radius.

---

## Spec System

- Spec files live in `src/specs/`, one per source module
- `src/specs/main.spec.json` is the authoritative index
- The SpecsMap plugin (Tools → SpecsMap) visualizes the dependency graph
- When adding or changing source files, update the corresponding spec

---

## Change Protocol (MANDATORY — applies to every add / fix / update)

Before writing any code, an agent **MUST** complete all three steps below. Skipping any step is not allowed.

> **Spec format reference:** `SPECGEN.md` defines the full JSON schema for every spec tier (root index, feature spec, UI sub-spec), the type/layer taxonomy, and the generation methodology. Read it when writing or updating any `src/specs/*.spec.json` file.

### Step 1 — Read the spec

Find the relevant `src/specs/<feature>.spec.json` (and its `*-ui.spec.json` if it exists). Read it fully. This is the authoritative contract for the feature: public interface, IPC channels, DOM structure, interactions, and states. The spec schema is defined in `SPECGEN.md`.

### Step 2 — Traverse neighboring implementations and shared UI

Identify every neighboring feature and UI element that participates in the same workflow:

- **Caller / callee chain**: who calls into the changed component, and what does it call out to? Check `dependencies` and `referenced_by` in the spec, then read those source files.
- **Shared UI patterns**: if the change touches a modal, card, context menu, or panel — read at least one peer component that uses the same pattern (e.g., if editing `ConfirmModal`, also read `AboutModal` and `WelcomeModal`). Consistency matters: layout, lifecycle, public interface shape, and interaction behavior must stay coherent across peers.
- **IPC path**: if the change touches an IPC channel, trace both ends — preload (`preload.ts`) and main (`main.ts`) handler — and verify the spec for each.
- **Type declarations**: re-read `src/global.d.ts` for any type that crosses the IPC boundary.

### Step 3 — Apply changes with full context

Use the gathered information to make the change. Specifically:

- **Spec first**: if the spec is wrong or incomplete, fix the spec file **before** (or alongside) the source change — not after.
- **Consistency**: mirror the structure of peer implementations. If similar features have `open()` / `close()` as public/private methods, follow that pattern exactly. Match CSS class naming, DOM nesting depth, event delegation style.
- **Ripple check**: after the change, re-read the neighboring feature source to confirm no callsite broke silently. Optional chaining (`?.`) hides many failures at runtime — verify the method actually exists where it's called.
- **Spec update**: update the affected `src/specs/*.spec.json` to reflect any changed interface, IPC channels, DOM structure, or interaction behavior before considering the task done.

> **Why this matters:** Bugs in this codebase have repeatedly come from changes applied without reading peers — wrong method names called via `?.` (silent failure), sync/async mismatches across the IPC boundary, private methods listed in public interfaces, duplicate initialization blocks. The spec+traverse protocol catches these before they ship.

---

## Project Tree

```
D:\cockpit_ide\
├── .gitignore                     # Git ignore rules
├── AGENTS.md                      # This file — project map
├── DESIGN.md                      # Design system: colors, typography, spacing, components
├── SPECGEN.md                     # Specs graph format & generation methodology
├── LICENSE                        # MIT License
├── Makefile                       # Build automation (build/dev/package/test/clean)
├── README.md                      # Project intro, run instructions, stack
├── dev.js                         # Custom dev runner (watcher + Electron respawn)
├── package.json                   # NPM manifest, dependencies, build/test scripts
├── package-lock.json              # Lockfile
├── tsconfig.main.json             # TS config: main/preload (ES2022, CommonJS)
├── tsconfig.renderer.json         # TS config: renderer (ES2022, module:none, IIFE)
├── vitest.config.ts               # Vitest config: jsdom, setup, coverage
├── bin/
│   ├── cockpit.bat                # Windows launcher — starts Cockpit.exe with args

├── public/
│   ├── cockpit_ide_icon.ico       # App icon (Electron window & installer)
│   └── icon.svg                   # SVG logo: 4 overlapping circles (Noir palette)
├── scripts/
│   ├── build-renderer.js          # esbuild renderer bundler + Monaco copy
│   ├── generate-installer-assets.js  # Generates installer BMP images (dot-grid pattern)
│   ├── installer.nsi              # NSIS installer script (~115 lines)
│   ├── pack.js                    # Electron packager + NSIS build orchestrator (~91 lines)
│   └── version.js                 # Version stamp/restore for builds (~21 lines)
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
│   │       ├── ExplorerPlugin.ts       # Split-pane: FileExplorer + MonacoEditor (~86 lines)
│   │       ├── ExplorerPlugin.test.ts  # Explorer plugin tests: split layout, state delegation (~84 lines)
│   │       ├── MarkdownPlugin.ts   # Markdown preview viewer w/ tabs (~230 lines)
│   │       ├── MarkdownPlugin.test.ts # Markdown tests: load/render/state/legacy format (~110 lines)
│   │       ├── WelcomeModal.ts    # Startup workspace picker (~64 lines)
│   │       ├── WelcomeModal.test.ts # Welcome modal tests: open/close/recent (~102 lines)
│   │       ├── AboutModal.ts      # Version/credits dialog (~61 lines)
│   │       ├── AboutModal.test.ts # About modal tests: open/close/link/callback (~101 lines)
│   │       ├── ContextMenu.ts     # Right-click floating context menu (~54 lines)
│   │       ├── ContextMenu.test.ts # Context menu tests: items/position/actions/singleton (~89 lines)
│   │       ├── CommandPalette.ts  # Ctrl+P fuzzy file finder (~247 lines)
│   │       ├── ConfirmModal.ts    # Generic confirmation dialog (~56 lines)
│   │       ├── ConfirmModal.test.ts # Confirm modal tests: ok/cancel/dismiss (~73 lines)
│   │       ├── TopBar.ts          # Custom menu bar with dropdowns
│   │       ├── TopBar.test.ts     # TopBar tests: menus, buttons, callbacks (~166 lines)
│   │       ├── Tutorial.ts        # Interactive guided tutorial overlay (~324 lines)
│   │       └── Tutorial.test.ts   # Tutorial step navigation tests (~179 lines)
│   ├── specs/
│   │   ├── main.spec.json         # Root specs index: features, IPC, shortcuts, dep graph
│   │   ├── *.spec.json            # 28 feature specs (one per non-test source file)
│   │   └── *-ui.spec.json         # 7 UI sub-specs (DOM details, interactions, states)
│   └── test/
│       ├── README.md              # Test infrastructure docs (23 files, 755 tests)
│       ├── setup.ts               # Global mocks: IPC, Canvas, xterm, DOM, ResizeObserver
│       ├── edge-cases.test.ts     # 63 edge case tests across all components (~902 lines)
│       ├── workflows.test.ts      # 36 integration workflow tests (~1157 lines)
│       └── e2e-advanced.test.ts   # Advanced E2E integration tests (~1136 lines)
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
| `.gitignore` | Ignores: node_modules/, dist/, release/, .cockpit/, *.log, .env, .DS_Store, Thumbs.db, coverage/. |

### Documentation

| File | Description |
|------|-------------|
| `README.md` | Project intro: spatial/floating-panel IDE concept, running instructions, stack, design. |
| `DESIGN.md` | Design system: Noir palette, Space Mono typography, 8px/4px spacing scale, 8px border radius, component styles (buttons, cards). Art Nouveau x Floating mashup. |
| `SPECGEN.md` | Specs graph format & generation methodology. Defines 3-tier JSON schema (main.spec.json → feature.spec.json → feature-ui.spec.json), feature taxonomy (type + layer), dependency edge format, and 8-phase generation pipeline from source audit. |

### Scripts & Assets

| File | Description |
|------|-------------|
| `bin/cockpit.bat` | Windows launcher: `start "" "..\Cockpit.exe" %*` — passes CLI args to packaged Electron app. |
| `scripts/build-renderer.js` | esbuild renderer bundler + Monaco `vs/` copy. Wipes `dist/vs`, re-copies from `node_modules/monaco-editor/min/vs`. |
| `scripts/generate-installer-assets.js` | Generates installer header (150x57) and sidebar (164x314) BMP files with dot-grid pattern (`#161C24` bg, `#243248` dots). |
| `scripts/installer.nsi` | NSIS installer script (~115 lines). Build: `makensis /DVERSION="x.y.z" /DOUTDIR="out" /DSRCDIR="out\CockpitIDE-win32-x64" scripts\installer.nsi`. |
| `scripts/pack.js` | Electron packager + NSIS build orchestrator (~91 lines). Stamps version, runs electron-packager, runs makensis, restores version. |
| `scripts/version.js` | Version stamp/restore for builds (~21 lines). Reads package.json, writes `src/renderer/specgen-hash.ts`, restores after pack. |
