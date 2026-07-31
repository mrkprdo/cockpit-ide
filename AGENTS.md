# Cockpit IDE — AGENTS.md

## Overview

Cockpit IDE (`0.0.20260701`) — spatial/floating-panel IDE built in Electron. Monaco editor, xterm.js terminal, file explorer, and markdown viewer live as draggable/resizable cards on a zoomable/pannable canvas. Sessions persist to `.cockpit/window.json`. An in-app AI agent (drawer) drives the IDE via MCP-style tools; SpecsMap validates this repo's own spec graph.

**Stack:** Electron 42 · TypeScript 5.8 · esbuild (renderer bundle) · tsc (main/preload) · Monaco 0.52 (AMD-loaded) · @xterm/xterm 6 + node-pty · marked · zod · vitest 4 (jsdom).

**Design:** Noir x Art Nouveau x Floating, dark/light theme via CSS custom properties (`theme.ts`), Space Mono monospace, dashed borders, 8px border radius. See `DESIGN.md`.

**Two separate compile pipelines** (do not mix):
- **Main/preload** (`tsconfig.main.json`): ES2022 CommonJS → `dist/main`, `dist/preload`. Type-checked by tsc.
- **Renderer** (`tsconfig.renderer.json`): type-check-only (`noEmit`, moduleResolution bundler). The actual renderer bundle is built by **esbuild** (`scripts/build-renderer.js`) → `dist/renderer/index.js`, `format: iife`. Renderer uses DOM globals directly, no modules at runtime.

## Commands (Windows, cmd)

| Task | Command |
|------|---------|
| Build | `npm run build` (esbuild renderer + tsc main + copy html/css/xterm.css to dist/) |
| Build (prod) | `npm run build:prod` (adds `tsconfig.main.prod.json`, no sourcemaps) |
| Typecheck main/preload | `npx tsc -p tsconfig.main.json --noEmit` |
| Typecheck renderer | `npx tsc -p tsconfig.renderer.json` |
| Run built app | `npm start` / `npm run prod` (stamps version, builds, launches via `scripts/launch.js`) |
| Dev mode | `npm run dev` (launch.js `--dev`) or `npm run dev:watch` (concurrently: tsc --watch + esbuild --watch) |
| Tests | `npm test` (`vitest run`), `npm run test:watch`, `npm run test:coverage` |
| Single test file | `npx vitest run src/renderer/components/TerminalPlugin.test.ts` |
| Single test | `npx vitest run src/main/main.test.ts -t "workspace:getRecent"` |
| Coverage | `vitest` enforces thresholds: statements 70 / branches 60 / functions 65 / lines 70 — a passing test run can still fail on coverage |
| Package | `npm run pack` (electron-packager + NSIS via `scripts/pack.js`) |

`Makefile` wraps `build`/`dev`/`prod`/`package`/`test`/`clean`. `dev.js` is the legacy watcher — prefer the `dev`/`dev:watch` npm scripts.

## Spec System

- Spec corpus lives in `src/specs/` (68 `.spec.md` files + `*-ui.spec.md` sub-specs); `src/specs/main.spec.md` is the authoritative index. Engine that parses/graphs/reconciles them lives in `src/renderer/specs/` (`graph.ts`, `format.ts`, `reconcile.ts`, `validate.ts`, `snapshot.ts`, `extract-ts.ts`, `layout.ts`).
- **Field ownership** (`SPECGEN.md`): **structural** fields (exports, Dependencies, Referenced By, IPC lists, Features rows) are machine-maintained by reconcile; **contract** prose (description, Interface, State, Lifecycle, UI specs) is written only by humans/agents.
- Never hand-edit structural fields — run a structural reconcile instead (SpecsMap plugin: Tools → SpecsMap → Apply structural; or the agent tool `specs_reconcile` in `src/renderer/ai/tool-definitions.ts`).
- The agent toolset (`src/renderer/ai/`) includes `specs_explore`, `specs_validate`, `specs_reconcile`, `specs_reload` — they are real and wired into the AI drawer's tool registry, not just documentation.
- `src/renderer/specgen-hash.ts` is **generated** by `scripts/gen-specgen-hash.js` on every build (`npm run build` and `npm run dev:watch`). It IS committed; regenerate + commit alongside spec/version changes.

## Change Protocol (MANDATORY — every add / fix / update)

1. **Read the spec first** — `src/specs/<feature>.spec.md` (and `*-ui.spec.md` if present) is the authoritative contract: public interface, IPC channels, DOM structure, interactions, states. Schema in `SPECGEN.md`. Fix the spec before or alongside the source change, never after.
2. **Traverse neighbors** — check `dependencies` / `referenced_by` in the spec, then read those sources. Read at least one peer modal/card/panel (e.g. editing `ConfirmModal` → also `AboutModal`, `WelcomeModal`). Trace both ends of any IPC channel (`preload.ts` ↔ `main.ts`) and re-read `src/global.d.ts` for boundary types.
3. **Apply + ripple check** — mirror peer structure exactly (method naming like `open()`/`close()`, CSS class names, DOM nesting, event delegation). Re-read neighboring sources after the change: optional chaining (`?.`) hides broken callsites silently. Verify sync/async stays consistent across IPC. Update the spec to match before calling the task done.

> Bugs here have repeatedly come from: wrong method names via `?.`, sync/async IPC mismatches, private methods listed in public interfaces, duplicate init blocks, and structural spec fields edited by hand.

## Source Map

```
src/
├── global.d.ts           # Window.electronAPI types (IPC boundary)
├── main/
│   ├── main.ts           # Electron main + all ipcMain.handle handlers (~1200 lines)
│   ├── ide-server.ts     # WebSocket server (MCP SDK) exposing tools to the AI drawer
├── preload/preload.ts    # contextBridge IPC exposure
├── renderer/
│   ├── index.ts          # bootstrap → App
│   ├── theme.ts          # dark/light CSS custom-property singleton
│   ├── specgen-hash.ts   # GENERATED (do not edit by hand)
│   ├── ai/               # AI agent: index, llm-client, prompts, memory-store,
│   │                     # token-counter, tool-definitions, tool-executor,
│   │                     # tool-registry, cockpit-context, zod-to-openai, types
│   ├── specs/            # spec graph engine: graph, format, reconcile, validate,
│   │                     # snapshot, extract-ts, layout, types
│   └── components/
│       ├── App.ts        # root orchestrator; registers plugins + cards
│       ├── CanvasArea.ts # infinite canvas (zoom/pan/layout) + PluginCard + canvas-grid
│       ├── TerminalPlugin.ts, MonacoEditorPlugin.ts (multi-tab), FileExplorerPlugin.ts,
│       ├── ExplorerPlugin.ts (split FileExplorer+Monaco), MarkdownPlugin.ts,
│       ├── GitPlugin.ts, SearchOverlay.ts (Ctrl+P), AiDrawer.ts,
│       ├── CommandPalette.ts, TopBar.ts, ThemeModal.ts, Tutorial.ts,
│       ├── modals: WelcomeModal / AboutModal / ConfirmModal / ContextMenu
│       └── specsmap/     # SpecsMap plugin helpers (cycles.ts, search.ts)
└── test/                 # cross-component suites (edge-cases, workflows, e2e-advanced)
```

Main-process APIs cross to the renderer exclusively via `window.electronAPI` (preload bridge); the AI drawer talks to `ide-server.ts` over a WebSocket (port picked in main). Third-party UI is AMD-loaded (Monaco) or lazy DOM-mounted; renderer code itself is plain IIFE-style TS with global namespace access — no imports at runtime.

## Testing conventions

- 48 test files, 1430 tests. Global mocks in `src/test/setup.ts` (IPC, Canvas, xterm, DOM, ResizeObserver) — most tests need no extra mocking. `.md` files are imported as text via the `md-text` vitest plugin.
- Unit tests live next to each source file; `src/test/` holds cross-cutting suites: `edge-cases.test.ts` (63), `workflows.test.ts` (36), `e2e-advanced.test.ts`.
- Integration tests that touch the main process use `main._testTrustPath(...)` (test-only export) to bypass the workspace-path trust gate.
- **Known pre-existing failures (as of 2026-07-30):** `src/main/main.test.ts` — "workspace:addRecent adds path to recent list" and "workspace:addRecent caps list at 5 entries" fail (2 tests). Cause: recent `workspace:addRecent` trust-gate change; tests still assert the old push-unshift shape. Don't confuse these with regressions from your work.
- `src/test/README.md` ("23 files, 755 tests") is stale — the suite is ~48 files / ~1430 tests.

## Gotchas

- **Dangling npm scripts:** `npm run ralph` and `npm run user-stories:verify` reference `scripts/ralph/*.mjs` which does **not exist** — they will fail. Ignore unless you're (re)adding the ralph-loop workflow.
- Windows-only repo conventions: `copy`/`rm -rf` in npm scripts, `bin/cockpit.bat` launcher, NSIS packaging. Renderer CSS is the design system — new components should use existing CSS custom properties, not hardcoded colors.
- `npm run dev` launches the app detached via `Start-Process` (no console attached); logs go to Electron's stdout only if run directly.
