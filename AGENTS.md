# Cockpit IDE — AGENTS.md

## Overview

Cockpit IDE (`0.0.20260731`) — spatial/floating-panel IDE built in Electron. Monaco editor (markdown preview opens as an editor tab), xterm.js terminal, file explorer and git live as draggable/resizable cards on a zoomable/pannable canvas. Sessions persist to `.cockpit/window.json`. An in-app AI agent (drawer) drives the IDE via MCP-style tools; SpecsMap generates and validates a workspace's spec graph on demand (this repo ships no corpus — see *Spec System*).

**Stack:** Electron 42 · TypeScript 5.8 · esbuild (renderer bundle) · tsc (main/preload) · Monaco 0.52 (AMD-loaded) · @xterm/xterm 6 + node-pty · marked · zod · vitest 4 (jsdom).

**Design:** Noir x Art Nouveau x Floating, dark/light themes via CSS custom properties (`theme.ts` rewrites the tokens declared in `styles-base.css`), Space Mono monospace, solid 1px hairlines (dashes only in agent/dev-console chrome), 8px default radius. Values are documented in `DESIGN.md`.

**Two separate compile pipelines** (do not mix):
- **Main/preload** (`tsconfig.main.json`): ES2022 CommonJS → `dist/main`, `dist/preload`. Type-checked by tsc.
- **Renderer** (`tsconfig.renderer.json`): type-check-only (`noEmit`, moduleResolution bundler). The actual renderer bundle is built by **esbuild** (`scripts/build-renderer.js`) → `dist/renderer/index.js`, `format: iife`. Renderer uses DOM globals directly, no modules at runtime.

## Commands (Windows, cmd)

| Task | Command |
|------|---------|
| Build | `npm run build` (deletes stale `dist/renderer/*.css` + `index.js.map`, then esbuild renderer + tsc main + copy html/css/xterm.css to dist/) |
| Build (prod) | `npm run build:prod` (sets `NODE_ENV=production` → minified renderer, no sourcemap; uses `tsconfig.main.prod.json`) |
| Typecheck main/preload | `npx tsc -p tsconfig.main.json --noEmit` |
| Typecheck renderer | `npx tsc -p tsconfig.renderer.json` |
| Run built app | `npm start` / `npm run prod` (stamps version, builds, launches via `scripts/launch.js`) |
| Dev mode | `npm run dev` (launch.js `--dev`) or `npm run dev:watch` (concurrently: tsc --watch + esbuild --watch) |
| Tests | `npm test` (`vitest run`), `npm run test:watch`, `npm run test:coverage` |
| Single test file | `npx vitest run src/renderer/components/TerminalWindow.test.ts` |
| Single test | `npx vitest run src/main/main.test.ts -t "workspace:getRecent"` |
| Coverage | `vitest` enforces thresholds: statements 70 / branches 60 / functions 65 / lines 70 — a passing test run can still fail on coverage |
| File-size guardrail | `npm run loc:check` — fails on any in-scope `.ts` file over 700 lines |
| Console-usage guardrail | `npm run console:check` — fails on `console.error`/`console.warn` in monitored folders |
| Package | `npm run pack` (electron-packager + NSIS via `scripts/pack.js`) |

`Makefile` wraps `build`/`dev`/`prod`/`package`/`test`/`clean`. `dev.js` is the legacy watcher — prefer the `dev`/`dev:watch` npm scripts.

## Code Standards (Guardrails)

- **File-size policy** (enforced by `npm run loc:check`, wired into CI `test.yml` + `make test`):
  - Target ≤500 LOC per file; buffer zone (500, 700] is tolerated but not a default landing zone; **hard ceiling 700 LOC** — a file over it must be split before further changes merge.
  - **Minor overage remedy:** if a file exceeds the 700-LOC ceiling by only a few lines, prefer trimming/reducing comments (or minor blank-line tightening) to pull it back under the limit rather than introducing a splitting. Splitting is still required for genuine overflow beyond a handful of lines or when the overage reflects real growth in code. Keep substantive logic intact — only comment/whitespace reduction counts, not dropping code to dodge the guardrail.
  - Applies to working source only: `src/main/**/*.ts` and `src/renderer/**/*.ts`. Exempt: `*.test.ts`, `src/test/**`, `scripts/**`, `*.config.ts`.
  - Split pattern: the original file stays as a thin facade (constructor + wiring + delegation + one-line forwarders for every externally-called method); groups move into a kebab-case subfolder (`AiDrawer.ts` → `ai-drawer/`). Extracted sub-controllers/utilities depend inward only — never import the facade back. Tests split 1:1 alongside (a thin `<Facade>.test.ts` stays for wiring/public-API coverage).
- **Console-usage guardrail** (`npm run console:check`): no `console.error`/`console.warn` under monitored folders — `src/renderer/health`, `src/renderer/components/dev-console`, `git-window`, `canvas-area`, `ai-drawer`, `specsmap`. Scope grows by one entry per refactor phase.
- **Failure logging convention**: log via `reportFailure({ kind, source, message })` and `bindGuarded(el, event, handler, source)` from `src/renderer/health/monitor.ts` — never ad-hoc `console.error`. Signals land in the dev-console Health tab and main-process `diagnostics:rendererError`/`health:mainFailure`.

## Spec System (opt-in per workspace)

- **The corpus is generated, not vendored.** `src/specs/*.spec.md` is produced per workspace by SPECGEN. This repository does not carry one: there is no `src/specs/` directory. `.gitignore` deliberately does **not** exclude `*.spec.md`, so a project that does run SPECGEN can commit its corpus.
- **Generate it before relying on it** — SpecsMap window: Tools → SpecsMap → *Apply structural*, or the agent tool `specs_reconcile`. Structural mode creates a skeleton spec per unspecced source file, then patches the structural fields. Headless equivalent: `set SPECS_RECONCILE=structural && npx vitest run src/test/specs-reconcile.test.ts`.
- **Engine** — `src/renderer/specs/` (`graph.ts`, `format.ts`, `reconcile.ts`, `validate.ts`, `snapshot.ts`, `extract-ts.ts`, `layout.ts`, `types.ts`) parses/graphs/reconciles whatever corpus the open workspace has. Schema and field rules live in `SPECGEN.md`.
- **Field ownership** (`SPECGEN.md`): **structural** fields (exports, Dependencies, Referenced By, IPC lists, Features rows) are machine-maintained by reconcile; **contract** prose (description, Interface, State, Lifecycle, UI specs) is written only by humans/agents. Never hand-edit structural fields — run a structural reconcile instead.
- **Agent toolset** (`src/renderer/ai/`): `specs_explore`, `specs_validate`, `specs_reconcile`, `specs_reload` are real and wired into the AI drawer's tool registry.
- **Absence is explicit in tests** — corpus-dependent cases are declared as `describe.skipIf(!HAS_SPECS)` under a suite name that states the corpus is missing (`src/renderer/specs/format.test.ts`, `src/test/specs-reconcile.test.ts`). A green run in this repo reports 4 skipped corpus checks; it never claims to have validated a corpus it does not have.
- `src/renderer/specgen-hash.ts` is **generated** on every build by `scripts/gen-specgen-hash.js` (invoked from `scripts/build-renderer.js`) and is **gitignored** — it is recreated automatically by `npm run build` / `npm run dev:watch`. Regenerate on demand with `node scripts/gen-specgen-hash.js`; never commit or hand-edit it.

## Change Protocol (MANDATORY — every add / fix / update)

1. **Read the spec first — if the workspace has one** — when `src/specs/` exists, `src/specs/<feature>.spec.md` (and `*-ui.spec.md` if present) is the authoritative contract: public interface, IPC channels, DOM structure, interactions, states. Schema in `SPECGEN.md`. Fix the spec before or alongside the source change, never after. When `src/specs/` does not exist (as in this repo), generate it via SpecsMap → Apply structural before relying on it, or work from the source and its peers and write the contract into the corpus once generation has run.
2. **Traverse neighbors** — check `dependencies` / `referenced_by` in the spec, then read those sources. Read at least one peer modal/card/panel (e.g. editing `ConfirmModal` → also `AboutModal`, `WelcomeModal`). Trace both ends of any IPC channel (`preload.ts` ↔ `main.ts`) and re-read `src/global.d.ts` for boundary types.
3. **Apply + ripple check** — mirror peer structure exactly (method naming like `open()`/`close()`, CSS class names, DOM nesting, event delegation). Re-read neighboring sources after the change: optional chaining (`?.`) hides broken callsites silently. Verify sync/async stays consistent across IPC. Update the spec to match before calling the task done.
4. **Verify guardrails** — before declaring done, run `npm run loc:check` and `npm run console:check` (plus the relevant typecheck/test) on any change touching `src/main/**` or `src/renderer/**`. New `reportFailure`/`bindGuarded` call sites go through `src/renderer/health/monitor.ts`.

> Bugs here have repeatedly come from: wrong method names via `?.`, sync/async IPC mismatches, private methods listed in public interfaces, duplicate init blocks, and structural spec fields edited by hand.

## Source Map

```
src/
├── global.d.ts           # Window.electronAPI types (IPC boundary)
├── main/
│   ├── main.ts           # Electron main: window lifecycle + app wiring (~250 lines)
│   ├── ipc/              # ipcMain handlers by domain (fs, file, git, terminal, window, app,
│   │                     # clipboard, prefs, diagnostics, ide, memory, workspace, state,
│   │                     # security, logging, shell, context, types)
│   ├── ide-server.ts     # WebSocket server (plain `ws` + a JSON-RPC-ish envelope) exposing tools to the AI drawer
│   ├── shell.ts          # child-process exec with cwd/env filtering
├── preload/preload.ts    # contextBridge IPC exposure
├── renderer/
│   ├── index.ts          # bootstrap → App
│   ├── theme.ts          # dark/light palette singleton (rewrites the color tokens)
│   ├── styles-*.css      # design system, split per component (see below); index.html <link>s all 25 in cascade order
│   ├── specgen-hash.ts   # GENERATED, gitignored (do not edit by hand)
│   ├── ai/               # AI agent: index, llm-client, prompts, memory-store,
│   │                     # token-counter, tool-definitions, tool-executor,
│   │                     # tool-registry, cockpit-context, zod-to-openai, types
│   ├── agents/           # sub-agent fleet (~2.9k LOC): executor (spawn/kill/dispatch/wait),
│   │                     # session (headless loop + compaction), bus (mailbox pub/sub),
│   │                     # agent-tools, permissions, hooks, pipeline, skills,
│   │                     # definitions + definition-file, prompts, memory-scopes, types
│   ├── health/           # failure reporting: reportFailure, bindGuarded, onFailure,
│   │                     # initHealthMonitor (feeds the dev-console Health tab)
│   ├── specs/            # spec graph engine: graph, format, reconcile, validate,
│   │                     # snapshot, extract-ts, layout, types
│   └── components/
│       ├── App.ts        # root orchestrator; registers windows + cards
│       ├── CanvasArea.ts # infinite canvas (zoom/pan/layout) + WindowCard + canvas-grid
│       ├── TerminalWindow.ts, MonacoEditorWindow.ts (multi-tab + markdown preview tab),
│       ├── FileExplorerWindow.ts, ExplorerWindow.ts (split FileExplorer+Monaco),
│       ├── GitWindow.ts, SearchOverlay.ts (Ctrl+P), AiDrawer.ts,
│       ├── CommandPalette.ts, TopBar.ts, ThemeModal.ts, Tutorial.ts,
│       ├── modals: WelcomeModal / AboutModal / ConfirmModal / ContextMenu
│       ├── ai-drawer/     # AI panel sub-controllers (agent-feed.ts, agent-sessions.ts,
│       │                  # render, sessions, settings, slash-commands, llm-loop, layout)
│       ├── dev-console/   # runtime diagnostics window (Health tab, console capture)
│       └── specsmap/      # SpecsMap window helpers (cycles.ts, search.ts)
└── test/                 # cross-component suites (edge-cases, workflows, e2e-advanced)
```

Main-process APIs cross to the renderer exclusively via `window.electronAPI` (preload bridge); the AI drawer talks to `ide-server.ts` over a WebSocket (port picked in main). `preload.ts` also exposes a one-way `notice:on` / `notice:off` bridge for user-facing notices from main; it has no renderer consumer yet (the `health:*` channels are its developer-facing sibling). Third-party UI is AMD-loaded (Monaco) or lazy DOM-mounted; renderer code itself is plain IIFE-style TS with global namespace access — no imports at runtime.

## Testing conventions

- 68 test files / 1618 tests: 1614 pass, 4 skip (the opt-in spec-corpus checks — see *Spec System*). Global mocks in `src/test/setup.ts` (IPC, Canvas, xterm, DOM, ResizeObserver) — most tests need no extra mocking. `.md` files are imported as text via the `md-text` vitest window.
- Unit tests live next to each source file; `src/test/` holds cross-cutting suites: `edge-cases.test.ts`, `workflows.test.ts`, `e2e-advanced.test.ts`, plus the headless `specs-reconcile.test.ts` harness.
- Integration tests that touch the main process use `main._testTrustPath(...)` (test-only export) to bypass the workspace-path trust gate.
- Full suite is green (2026-11-13): 1614/1614 runnable tests pass; the only skips are corpus checks that need a generated `src/specs/`.
- `src/test/README.md` carries the suite inventory — keep its numbers in step with this file.

## Gotchas

- **Dangling npm scripts:** `npm run ralph` and `npm run user-stories:verify` reference `scripts/ralph/*.mjs` which does **not exist** — they will fail. Ignore unless you're (re)adding the ralph-loop workflow.
- **Fresh clone:** `src/renderer/specgen-hash.ts` is generated and gitignored, and several suites import `SPECGEN_VERSION` from it — run `npm run build` (or `node scripts/gen-specgen-hash.js`) once before `npm test`, or those imports fail.
- Windows-only repo conventions: `copy`/`rm -rf` in npm scripts, `bin/cockpit.bat` launcher, NSIS packaging. Renderer CSS is the design system — new components should use existing CSS custom properties, not hardcoded colors.
- `renderer/styles.css` was split (2026-08-03) into 25 `styles-*.css` files, one per component (`styles-topbar.css`, `styles-git-window.css`, etc.); oversized/non-contiguous components use `-01`/`-02` suffixes (`styles-ai-drawer-01..05.css`, `styles-tutorial-01/02.css`; `styles-ai-drawer-05.css` holds the sub-agent PoV strip — the main chat is the shared conversation). Cascade order matters — `index.html` `<link>`s them in the original file's line order. Build's `copy src\renderer\*.css` wildcard picks up new files automatically; adding a new one only needs the `<link>` in `index.html`.
- `npm run dev` launches the app detached via `Start-Process` (no console attached); logs go to Electron's stdout only if run directly.
