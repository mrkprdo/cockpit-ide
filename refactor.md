# Refactor Plan — Modularization + Self-Healing + Dev Console

**Status:** ✅ **Complete.** Phases 0b–7 plus the post-plan additions (unified dev-console log stream, structured app-wide logging with main→renderer `log:push`, keep-view-still-on-tool-calls toggle, SpecsMapPlugin facade API extraction) are all implemented and committed on `refactor-file-split` (9 commits). Full audit (2026-08-03, §G.10): `npm test` 62/62 files / 1711/1711 green, `loc:check` + `console:check` green and wired into CI + the Makefile test target, `tsc` main clean and renderer down to only the pre-existing baseline debt (SearchOverlay.test, TerminalPlugin `.ready`, `.click`/`.style` DOM-typing), reconcile gate green (only the two pre-existing stale `flock` specs). §E's one-PR-per-phase ideal wasn't followed (entangled diff → a few logical commits), recorded in §G.7/G.9.
**Owner:** Cockpit Agent + user
**Relation to existing code:** builds on the existing `src/renderer/components/specsmap/` split (already 2 files extracted from `SpecsMapPlugin.ts`), the SPECGEN specs graph (`SPECGEN.md`, `.spec.md` files under `src/specs/`), and the existing crash-recovery substrate (`src/main/main.ts` `logFatal`/`wireCrashRecovery`, `src/renderer/index.ts` `window.onerror`/`unhandledrejection` → `diagnostics:rendererError`).

**Primary goal is A — housekeeping the codebase into bite-size files.** B and C are not new-feature workstreams; they exist only to give visibility *while* A happens, built first (see §E for exact phase numbering — this doc states phase numbers in §E only, nowhere else, to stop the numbering drifting out of sync across sections on edits) so a logging/observability pattern emerges organically from actually writing the split-up modules, rather than being over-designed upfront. B is log-only for now — no auto-remediation.

Three workstreams, one plan, landing together file-by-file: **(A)** split monoliths into sized modules — the deliverable, **(B)** structured failure logging at the new module boundaries — support tooling, **(C)** an in-app dev console to view that log — support tooling, built before A's first split lands so it's usable throughout.

---

## A. File Size Guardrail

### A.1 Current LOC snapshot (non-test `.ts`, top offenders)

| File | LOC | Over cap by |
|---|---|---|
| `src/renderer/components/SpecsMapPlugin.ts` | 2326 | 1626 |
| `src/renderer/components/AiDrawer.ts` | 2140 | 1440 |
| `src/renderer/components/CanvasArea.ts` | 1908 | 1208 |
| `src/renderer/components/GitPlugin.ts` | 1163 | 463 |
| `src/main/main.ts` | 1015 | 315 |
| `src/renderer/ai/tool-definitions.ts` | 921 | 221 |
| `src/renderer/components/MonacoEditorPlugin.ts` | 636 | 0 (watch) |

Monolithic files mix unrelated concerns (parsing, I/O, rendering, event handling, sub-panel UI, public API) in one file. Costs: hard to review/hold in context, and it defeats SPECGEN's 1-spec-per-file granularity — a 2300-line file forces one spec to describe six unrelated responsibilities.

### A.2 Size policy

- **Target:** ≤500 LOC per file.
- **Buffer zone:** strictly >500 up to 700 LOC — acceptable, not a trigger to force-split for its own sake. 500 itself counts as "at target," not "in buffer" — this boundary is load-bearing for A.3 rule 9 below, not just descriptive.
- **Hard ceiling:** 700 LOC — must split before merging further changes to that file.
- **Applies to:** working source code only — `src/main/**/*.ts` and `src/renderer/**/*.ts` application logic.
- **Exempt:** `*.test.ts`, `src/test/**` (test infra), `scripts/**`, `*.config.ts` (build/tooling config). Cap is about hand-maintained app logic, not tests or build plumbing.

### A.3 Split methodology

1. **Group by responsibility, not by size** — the grep below shows each monolith already has clean method-group boundaries.
2. **Facade stays put** — the original file keeps its name/path, shrinks to constructor + wiring + delegation + the public methods external code already calls. No import-path changes for consumers in most cases.
3. **Two extraction patterns, chosen per group, not one blanket rule:**
   - **Stateless utility** — no access to the facade's private fields (`specsmap/parse.ts`, `curvePoints`, `esc`, format/math helpers). Plain exported functions, explicit typed params. No class.
   - **Stateful sub-controller** — needs private state (`viewport.ts`, `sessions.ts`, `card-lifecycle.ts`, etc.). The state **moves with the logic** into a small class instantiated once in the facade's constructor; the facade holds it as `private viewport: Viewport` and delegates. Fields do **not** stay on the facade and get reached into from outside — TS `private` blocks that anyway. This is the only pattern used when a group touches state the facade used to own privately.
4. **Extracted modules depend inward only** — sub-controllers/utilities never import the facade back, no cycles. A sub-controller may take a narrow constructor-injected reference to another sub-controller it genuinely needs (e.g. `card-lifecycle` needs `viewport`'s transform), never the whole facade.
5. **One concern per file, verb-noun name** (`render-graph.ts`, not `helpers.ts`).
6. **Subfolder = kebab-case of the original file stem** — matches the existing `specsmap/` precedent: `AiDrawer.ts` → `ai-drawer/`, `CanvasArea.ts` → `canvas-area/`, `GitPlugin.ts` → `git-plugin/`.
7. **Tests split 1:1 with the new structure** — `ai-drawer/sessions.ts` gets `ai-drawer/sessions.test.ts`, etc. A thin `<Facade>.test.ts` remains at the original path, narrowed to wiring/public-API/integration coverage only, not re-testing what moved. Test files stay exempt from the LOC cap (§A.2), but splitting them isn't optional — a giant untouched test file defeats half the reason to split the source.
8. **Facade delegator budget, no second API surface.** Every externally-called method gets a one-line forwarder on the facade, full stop — sub-controllers stay `private`, never exposed via a public getter (that would just recreate the encapsulation break rule 3 exists to prevent). Forwarders are cheap (1-2 LOC each), so this isn't the LOC risk it first looks like. If a facade still exceeds 700 after adding every forwarder it genuinely needs, the fix is splitting the facade itself into two files **inside the same kebab-case subfolder** rule 6 already established — e.g. `git-plugin/core.ts` + `git-plugin/commands.ts` — not flat siblings at the original path (`GitPlugin.core.ts` would sit next to `GitPlugin.ts` using a different naming scheme than everything else pulled out of it). `GitPlugin.ts` itself stays a pure re-export barrel at the original path either way, so external import paths still don't change.
9. **No file plan-estimated >500 LOC without justification.** The buffer zone (500, 700] exists for groups that genuinely can't cut smaller along a real seam, not as a default landing zone. At most 2 files per monolith split may land there; a third means re-draw the group boundaries. Checked against every table in §A.4 (only files strictly over 500 count, per §A.2):
   - SpecsMapPlugin: `render-graph.ts` ~550 → 1 file in buffer. OK.
   - AiDrawer: `llm-loop.ts` ~550 → 1 file in buffer. OK.
   - CanvasArea: `viewport.ts` and `plugin-factories.ts` both land exactly at 500 → 0 files in buffer (at target, not over). OK.
   - GitPlugin, `main/ipc/*`: nothing over 400. OK.
10. **Estimates are provisional** — each table in §A.4 was built from method-name grouping, not measured line spans. Before opening a phase's PR, re-run the line-range check (`grep -n` on method signatures, sum actual spans) against that file specifically and adjust boundaries if a group is materially bigger than estimated.

### A.4 Per-file breakdown

**`SpecsMapPlugin.ts` (2326 → `components/specsmap/`)** — already has `cycles.ts`, `search.ts`. Add:

| New file | Pulls in | Est. LOC |
|---|---|---|
| `specsmap/parse.ts` | `parseSpecMd`, `parseMainSpecMd`, `specFullPath`, `tryResolveSourcePath`, `esc` | ~250 |
| `specsmap/data.ts` | `loadSpecs`, `buildFromFiles`, `findAllCollections`, `walkFindAll`, snapshot load/save | ~450 |
| `specsmap/render-graph.ts` | `renderGraph`, `renderSVGDefs`, `renderLayerHeaders`, `curvePoints`, `renderEdges`, `hoverNode`, `selectNode`, `zoomToNode`, `animateTo`, `fitGraph`, `getFitTarget` | ~550 |
| `specsmap/panel.ts` | `openPanel`, `openSettingsPanel`, `renderSettingsContent`, `validationSectionHtml`, `runReconcileFromPanel`, `closePanel`, `renderPanelContent` | ~450 |
| `specsmap/empty-state.ts` | `detectEntrycandidates`, `showEmptyState`, `generateAndCopyPrompt` | ~250 |
| `SpecsMapPlugin.ts` (facade) | constructor, `injectStyles`, `initInteractions`, `applyTransform`, tab bar, `refresh`, `updateHeaderCounts`, `showValidation`, public API | ~500 |

**`AiDrawer.ts` (2140 → `components/ai-drawer/`)**

| New file | Pulls in | Est. LOC |
|---|---|---|
| `ai-drawer/sessions.ts` | session CRUD + persistence | ~350 |
| `ai-drawer/settings.ts` | `load/saveSettings` | ~90 |
| `ai-drawer/render.ts` | message/queue/token-usage rendering | ~500 |
| `ai-drawer/slash-commands.ts` | slash command registry + popup | ~250 |
| `ai-drawer/llm-loop.ts` | `callLLMWithTools`, streaming, `sendMessage`/`runMessage`, tool execution | ~550 |
| `ai-drawer/context-window.ts` | token estimation, folding, compaction | ~300 |
| `ai-drawer/layout.ts` | attach/detach/open/close, resize, float preview, canvas offset | ~350 |
| `AiDrawer.ts` (facade) | constructor, `bindEvents` (wiring only), queue/steer, input handling, `toggle` | ~450 |

**`CanvasArea.ts` (1908 → `components/canvas-area/`)**

| New file | Pulls in | Est. LOC |
|---|---|---|
| `canvas-area/viewport.ts` | clamp/transform math, zoom/pan, fit, animate | ~500 |
| `canvas-area/card-lifecycle.ts` | add/close/minimize/resize/terminate, z-order | ~400 |
| `canvas-area/plugin-factories.ts` | `addEditor/Explorer/Git/Markdown/Specsmap/Agents/Terminal`, `restorePlugins`, `getSaveState` | ~500 |
| `canvas-area/plugin-focus.ts` | `focus*`, `cycleCard`, `reopen*`, `getActive*Plugin` | ~450 |
| `canvas-area/layout-overlays.ts` | arrange/tile, drag-drop-zone overlays | ~400 |
| `canvas-area/notify.ts` | `notify*Changed`, `updateAllThemes` | ~80 |
| `CanvasArea.ts` (facade) | constructor, `setDrawerOffset`, `killAllTerminals`, `destroy` | ~300 |

**`GitPlugin.ts` (1163 → `components/git-plugin/`)**

| New file | Pulls in | Est. LOC |
|---|---|---|
| `git-plugin/ui-build.ts` | `buildUI`, dropdown/diff-mode chrome | ~350 |
| `git-plugin/changes.ts` | stage/unstage, changes list | ~400 |
| `git-plugin/history.ts` | branches/remotes/commits | ~300 |
| `git-plugin/diff-view.ts` | file tree + diff rendering | ~250 |
| `GitPlugin.ts` (facade) | constructor/`destroy`, state, commit/push, `refresh` | ~250 |

**`main.ts` (1015 → `src/main/ipc/`)** — 13 IPC namespaces (`app`, `clipboard`, `diagnostics`, `file`, `fs`, `git`, `ide`, `memory`, `prefs`, `shell`, `terminal`, `window`, `workspace`), 57 handlers total. One file per namespace exporting `register<Namespace>Handlers(ipcMain, ctx)`. Two more files hold what no single namespace owns:

| New file | Pulls in | Est. LOC |
|---|---|---|
| `main/ipc/security.ts` | `isPathSafe`, `isTrustedWorkspacePath`, `ALLOWED_ENV_KEYS`, `resolveCliWorkspace` — used across `fs`/`file`/`git`/`terminal` handlers alike | ~150 |
| `main/ipc/state.ts` | `ptyProcesses`, `terminalSenders`, `windowWorkspaces`, `defaultWorkspacePath`, `mainWindow` ref — shared mutable state, not namespace-owned | ~80 |

Dependency direction: `security.ts` imports `state.ts`, not the other way round — `isPathSafe`/`isTrustedWorkspacePath` need `windowWorkspaces` (keyed by `webContents.id`) to resolve which workspace a given window is scoped to before checking a path against it. `state.ts` has no imports of its own. Every namespace file imports both; neither re-declares this state locally. `main.ts` shrinks to app lifecycle + `BrowserWindow` creation + a flat list of `register*Handlers()` calls, each passed `{ security, state }`.

**`tool-definitions.ts` (921 → `src/renderer/ai/tool-definitions/`)** — split by tool domain (file, terminal, git, specs — `agent-tools.ts` already separate). `index.ts` concatenates into the existing export.

**`MonacoEditorPlugin.ts` (636 LOC)** — under the hard ceiling, no action now. Watch item: re-check LOC before the next non-trivial change.

---

## B. Self-Healing System — Log-Only for Now

**Scope decision:** self-healing ships as **structured failure logging only** in this pass. No auto-remediation, no retry engine, no escalation UX — that's future work, deliberately deferred (see B.4). The reason to build even this much now, alongside the refactor rather than after: capturing failures in a consistent structured shape *while* splitting the monoliths is what lets a real recovery-procedure pattern emerge later from actual observed failure data, instead of being guessed upfront.

### B.1 What exists today

Detection already exists but stops at unstructured logging:

- `src/renderer/index.ts` — `window.onerror` / `unhandledrejection` → `electronAPI.diagnostics.reportError(...)`.
- `src/main/main.ts` — `logFatal()` writes `crash.log`; `ipcMain.on('diagnostics:rendererError', ...)` receives renderer errors; `wireCrashRecovery()` reloads the window on `render-process-gone`.

This plan keeps that substrate as-is (don't duplicate `logFatal`/`wireCrashRecovery`) and adds a structured layer in front of it so failures are typed and filterable instead of free-text.

**Cross-process correction:** `reportFailure` (below) only exists in the renderer bundle. `main/ipc/*` is main-process code — a separate Electron process, can't import a renderer module. Main-side failures log through the *existing* `logFatal(kind, err)` in `main.ts`, never through `reportFailure` directly. Both sides share one vocabulary via `src/shared/health-types.ts` (`FailureSignalKind` only — no runtime code, just the closed string-union type), so `logFatal('ipc.handler-error', err)` on the main side and `reportFailure({ kind: 'ipc.handler-error', ... })` on the renderer side use the same `kind` strings without either process importing the other's code.

### B.2 "Procedural" = one defined log shape per failure kind, applied consistently

Every failure site (per split module, per §B.3) logs through the same typed call, not ad-hoc `console.error`:

```ts
interface FailureSignal {
  kind: FailureSignalKind;   // e.g. 'terminal.pty-exit' | 'plugin.crash' | 'llm.stream-error' | 'ipc.handler-error' | 'specs.corrupt-cache'
  source: string;            // originating module, e.g. 'git-plugin/changes.ts'
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  at: number;                // timestamp
}
```

`kind` is a closed enum, grown only as real failure modes are found while splitting §A's files — not pre-populated speculatively. This is what "procedural" means here: a consistent, code-enforced procedure for *recording* a failure, not (yet) for *fixing* one.

### B.3 Structure

| File | Responsibility | Est. LOC |
|---|---|---|
| `src/shared/health-types.ts` | `FailureSignalKind` only — the closed string-union, importable from both `src/main` and `src/renderer` since it's plain types, no runtime code | ~30 |
| `src/renderer/health/types.ts` | `FailureSignal` (renderer-only shape, uses `FailureSignalKind` from `shared/`) | ~20 |
| `src/renderer/health/monitor.ts` | `reportFailure(signal)` — single entry point; extends existing `window.onerror`/`unhandledrejection` hook; forwards to `diagnostics:rendererError` (existing IPC channel); listens for `health:mainFailure` pushed from main (below) and merges it into the same stream the dev console's Health tab (§C) reads | ~170 |

**Main → renderer failure path:** today `diagnostics:rendererError` only flows renderer→main (§B.1). A main-process failure (e.g. `ipc.handler-error`) has no way to reach the dev console without a return path. `logFatal` itself stays untouched (it's called from places with no window context at all — `uncaughtException`, `unhandledRejection` — so it can't be the thing that pushes to a specific window). Instead the push lives in `withHandlerLogging` (§B.4), which always has the triggering IPC event and so can target the *correct* window — `BrowserWindow.fromWebContents(event.sender)?.webContents.send('health:mainFailure', { kind, message })`, not the module-level `mainWindow` singleton (this app supports multiple windows per `windowWorkspaces: Map<number, ...>` — pushing to the wrong/stale window would misroute or drop the notification). `message` is derived with the same stringification `logFatal` already uses internally (`err instanceof Error ? (err.stack || err.message) : String(err)`), factored into a small main-process-internal `formatError(err)` helper both call, rather than a fresh undefined variable. `preload.ts` exposes `electronAPI.health.onMainFailure(cb)` (a third place, alongside IPC trace, where this plan's "no code changes yet" scope touches `preload.ts` — noted once here, not repeated per phase). `health/monitor.ts` subscribes on init.

**Re-entrancy guard:** `reportFailure` never calls `console.error`/`console.warn` (those are what `log-capture.ts` intercepts — logging a failure-report through the channel it feeds would loop). Its body is wrapped in try/catch that drops silently on failure, same as `logFatal`'s existing `/* best effort */` pattern — reporting a failure must never itself throw or cascade.

That's the whole of B for this pass. `procedures/*`, `registry.ts`, retry/backoff/escalate, and the TopBar health dot are **explicitly out of scope** — listed in B.4 as future work so they aren't silently dropped from the plan, just not built now.

### B.4 Where logging attaches (per split module)

Not a separate phase — a checklist item attached to each split in §A.4. Each of these calls `reportFailure(...)` at its existing catch/error site instead of `console.error`:

- **`main/ipc/*`** — mirrors `bindGuarded`'s "one wrapper, not boilerplate per call-site" shape, on the main-process side. **Hard rule: this refactor only inserts logging, it never changes a handler's resolve/reject contract or return-value shape.** Renderer call sites for these handlers were written against the existing behavior (mostly "resolves with a `null`/`false` sentinel on failure," per `fs:readDir`) with no guarantee they wrap every `electronAPI.xxx()` call in try/catch — rethrowing after logging would turn existing resolved-`null` call sites into unhandled rejections at an unaudited number of renderer call sites. So no rethrow, ever. `main/ipc/security.ts` (§A.4) gains one shared push helper plus three registration wrappers, matched to how each handler is currently registered — `.handle`, fire-and-forget `.on`, and `sendSync`-backed `.on` aren't interchangeable (same three-way split §C.2 already needed for IPC tracing):
  ```ts
  // Best-effort — a destroyed webContents (window closed mid-request) makes
  // .send() itself throw. Never let the push be the thing that breaks the
  // "no rethrow, ever" rule above.
  function pushMainFailure(event: IpcMainEvent | IpcMainInvokeEvent, kind: FailureSignalKind, err: unknown) {
    logFatal(kind, err);
    try {
      BrowserWindow.fromWebContents(event.sender)?.webContents.send(
        'health:mainFailure', { kind, message: formatError(err) },
      );
    } catch { /* best effort, same as logFatal's own crash.log write */ }
  }

  // ipcMain.handle (promise-returning) — preserves the exact fallback the
  // original handler used; never rethrows, never changes what the renderer sees.
  function withHandlerLogging<T>(channel: string, fn: (...a: any[]) => Promise<T>, fallback: T) {
    ipcMain.handle(channel, async (event, ...args) => {
      try { return await fn(event, ...args); }
      catch (err) { pushMainFailure(event, 'ipc.handler-error', err); return fallback; }
    });
  }

  // ipcMain.on, fire-and-forget (ipcRenderer.send) — nothing to reject, just logs.
  function withListenerLogging(channel: string, fn: (event: IpcMainEvent, ...a: any[]) => void) {
    ipcMain.on(channel, (event, ...args) => {
      try { fn(event, ...args); }
      catch (err) { pushMainFailure(event, 'ipc.handler-error', err); }
    });
  }

  // ipcMain.on, sendSync-backed (ipcRenderer.sendSync) — MUST set event.returnValue
  // even on the catch path, or the renderer's blocking call resolves to undefined
  // instead of the fallback it used to get. Confirmed pattern: clipboard:readText
  // sets e.returnValue directly; this wrapper preserves that contract on error too.
  function withSyncListenerLogging<T>(channel: string, fn: (event: IpcMainEvent, ...a: any[]) => T, fallback: T) {
    ipcMain.on(channel, (event, ...args) => {
      try { event.returnValue = fn(event, ...args); }
      catch (err) { pushMainFailure(event, 'ipc.handler-error', err); event.returnValue = fallback; }
    });
  }
  ```
  Every namespace file registers through whichever of these three matches its original `ipcMain.handle`/`ipcMain.on` call — never raw `ipcMain.*` directly. `formatError(err)` is the main-process-internal helper both `logFatal` and `pushMainFailure` use for stringification (named distinctly from `src/shared/health-types.ts` above — one is cross-process types, the other is a same-process string helper, different scopes, not to be confused). This also fixes a scoping mismatch in an earlier draft of this guard: most existing handlers (e.g. `fs:readDir`) already `catch { return null }` internally rather than throwing — a wrapper that only reacts to thrown errors would catch almost nothing, since the real gap is *silent* swallowing. Handlers being migrated into `main/ipc/*` drop their internal catch-and-swallow for genuinely unexpected errors (permission errors, unexpected exceptions) and let them propagate to the wrapper's catch — but **not** for expected control flow (e.g. `ENOENT` on a directory that legitimately doesn't exist yet, which `fs:readDir` returning `null` for is correct behavior, not a failure). That judgment call — and picking each handler's `fallback` value to match its current behavior exactly — is made per handler during the actual split, not blanket-applied.
- **`git-plugin/*`, `canvas-area/*`, `ai-drawer/*`** — `plugin.crash` logging needs an actual catch point, not just intent: a listener body that throws fires as an uncaught exception on `window`, invisible to any try/catch placed around the constructor. Concrete mechanism — `health/monitor.ts` exports:
  ```ts
  function bindGuarded(
    el: EventTarget, event: string, handler: (e: Event) => unknown, source: string,
  ): () => void {
    const wrapped = (e: Event) => {
      try {
        const r = handler(e);
        if (r instanceof Promise) r.catch(err => reportFailure({ kind: 'plugin.crash', source, message: String(err) }));
      } catch (err) {
        reportFailure({ kind: 'plugin.crash', source, message: String(err) });
      }
    };
    el.addEventListener(event, wrapped);
    return () => el.removeEventListener(event, wrapped);
  }
  ```
  Sync throws go through the `try/catch`; async rejections go through the explicit `.catch` on the returned promise — a bare `try/catch` around an `async` call does **not** catch a rejection from a fire-and-forget call, so this has to be `r.catch(...)`, not just wrapped in `try`. `bindGuarded` **returns an unbind function**; each facade collects these in a `private unbinders: (() => void)[] = []` array during `bindEvents`/`initInteractions` and runs them all in `destroy()` — without this, wrapping every top-level binding in `bindGuarded` would be a straight listener leak on card teardown, worse than the raw `addEventListener` calls it replaces. Used for top-level bindings only (not every internal helper) — one call-site swap per binding (no auto-remove/respawn yet — just visibility with a known source).
- **`ai-drawer/llm-loop.ts`** — logs `llm.stream-error` on a failed stream/call.
- **`specsmap/data.ts`** — logs `specs.corrupt-cache` on snapshot parse/hash failure.
- **terminal IPC + `TerminalPlugin`** — logs `terminal.pty-exit` on unexpected PTY death.

### B.5 Future work (not this pass)

Once §B's logging has run long enough to show real recurring failure kinds: promote select `FailureSignalKind`s to actual `RecoveryProcedure`s (Detect → Diagnose → Remediate → Verify → Escalate), add `health/registry.ts` + `health/procedures/*`, and a TopBar health indicator. Not scheduled — revisit after phase 6.

---

## C. Dev Console (built first, used throughout)

Built before A's first split lands (§E has the exact phase number) so it's available to observe every subsequent split and every logged failure as they land — this is the "at the same time during refactoring" requirement.

### C.1 Purpose

One pane, one card (same pattern as `TerminalPlugin`/`GitPlugin` in `CanvasArea`'s card system), showing:

- Intercepted `console.log/warn/error` (ring buffer, level filter).
- IPC trace — channel, payload size, plus duration/success where the call is request-response (see correction below; not every `electronAPI` call has those).
- `FailureSignal` events from `health/monitor.ts` (§B) — log only, no remediation state.
- Agent bus messages — `agents/bus.ts` already has pub/sub; the console subscribes as a passive listener.
- Specs validation output (`validateSpecs()` results) on demand.

### C.2 Structure (`src/renderer/components/dev-console/`)

| File | Responsibility | Est. LOC |
|---|---|---|
| `dev-console/DevConsolePlugin.ts` | Facade — card lifecycle, tabs (Logs / IPC / Health / Agents / Specs) | ~300 |
| `dev-console/log-capture.ts` | `console.*` interception into a ring buffer | ~120 |
| `dev-console/ipc-trace.ts` | Subscribes to trace events forwarded from `preload.ts` (see note below) — channel/duration/payload/success | ~100 |
| `dev-console/health-feed.ts` | Subscribes to `health/monitor.ts` `FailureSignal`s | ~80 |
| `dev-console/filter-bar.ts` | Search/level/tab filter UI | ~150 |
| `dev-console/render.ts` | DOM rendering of log lines (virtualized if the buffer grows large) | ~350 |

**IPC trace correction:** `contextIsolation` is on (`preload.ts` uses `contextBridge.exposeInMainWorld`) — the renderer has no `ipcRenderer` reference to wrap, only `window.electronAPI.*`. Tracing has to happen in `preload.ts` itself: a `wrapTraced(channel, fn)` helper wraps each exposed method before `exposeInMainWorld`, buffers the last N trace entries, and exposes `electronAPI.__trace.subscribe(cb)`/`getRecent()`. This is the one place §C's "no code changes yet" scope touches an existing file (`preload.ts`) rather than only adding new ones — called out explicitly so it isn't missed at implementation time.

`wrapTraced` branches on the wrapped method's shape, since not every `electronAPI` call is request-response — `preload.ts` line 3 uses `sendSync` and several exposed methods use fire-and-forget `send` (`window.minimize`, etc.):
- **`invoke`-backed** (returns a `Promise`) → trace `{ channel, durationMs, payloadSize, ok }`.
- **`send`-backed** (returns `void`) → trace `{ channel, payloadSize }` only — no duration/ok, there's no response to time.
- **`sendSync`-backed** → trace `{ channel, durationMs, payloadSize }` — has a duration (it blocks) but no separate ok/failure signal beyond a thrown exception.

### C.3 Access

Toggle via `CommandPalette` entry and a backtick (`` ` ``) shortcut, consistent with the existing `SearchOverlay`/`CommandPalette` overlay pattern. No dev/prod build split needed — this is a desktop app, not a web bundle shipped to end users; gate it behind a settings flag only if perf overhead from `console.*`/IPC interception turns out to matter (measure after C is built, don't pre-optimize).

---

## D. Specs Realignment (SPECGEN)

SPECGEN is 1 feature spec per source file. Splitting N monoliths into M files means M specs replace 1 — and the new `health/*` and `dev-console/*` files need specs from scratch (they're brand-new source, not splits). Per-file sequence:

1. Split/add the code.
2. Run structural reconcile (`SpecsMapPlugin.reconcileSpecs('structural')` — dogfooding the tool this codebase ships) to auto-create skeleton specs: correct `file`/`type`/`layer`/`exports`, computed `## Dependencies`/`## Referenced By`, stub description flagged by `description.stub`.
3. Fill in contract prose: description, `## Interface`, `## State`, `## Lifecycle`.
4. Generate `-ui.spec.md` sub-specs for UI-heavy files meeting the 3+ criteria in `SPECGEN.md` (`render-graph.ts`, `panel.ts`, `ai-drawer/render.ts`, `git-plugin/ui-build.ts`, `dev-console/render.ts`).
5. Update the facade's existing spec — description → "thin orchestrator delegating to `<subfolder>/*`"; `## Interface` prunes to what the facade still exports directly; `## Dependencies` gains edges to every new sibling module.
6. Update `main.spec.md`'s Features table — new rows per split/new file; `layer` inherited from the parent except pure-function extractions (`layer: utility`). `health/*` and `dev-console/*` are brand-new, not splits, so their `type`/`layer` pair is classified independently per SPECGEN's two separate taxonomies, not lumped together: `health/monitor.ts` is `type: logic`, `layer: service` (singleton, no DOM). `dev-console/*` is `type: ui`, `layer: plugin` (a card, same taxonomy slot as `GitPlugin`/`TerminalPlugin`).
7. Run `validateSpecs()` — zero `main.missing-feature`/`edge.unresolved` errors — before starting the next file.

---

## E. Phased Rollout

One PR per phase. Each phase: split/build → fix imports → wire `reportFailure`/`bindGuarded` at the split's error sites (where listed) → add that phase's new folder to the console-usage check's include-list (§F) → full test suite green → specs reconcile + validate → next phase. A (housekeeping) is the deliverable of every phase from 1 onward; B/C only ride along.

0a. **Gate: clean working tree.** `git status` currently shows uncommitted changes to `main.ts`/`preload.ts`/`App.ts`/`global.d.ts` (a workspace-reload fix, unrelated to this refactor). Commit or stash that WIP before phase 1 touches `main.ts` — splitting a file with an unrelated uncommitted diff on it forks or loses that work. No code written in this step — a checkpoint, not a PR.
0b. **Infrastructure.** `loc:check` + console-usage guardrails (§F), dev console scaffold (§C in full), health log core (§B.3 `types.ts`/`monitor.ts`, including `bindGuarded`). Lands before any monolith is split, so the cap, the logging convention, and the observability tooling are all live from the first real split onward instead of retrofitted.
1. **`main.ts` → `main/ipc/*`** + `ipc.handler-error` logging — pure IPC registration, easiest to verify, unblocks reasoning about the main process.
2. **`tool-definitions.ts` → `tool-definitions/*`** — data-only, no logging hook needed.
3. **`GitPlugin.ts` → `git-plugin/*`** + `plugin.crash` logging — first dry run of the facade + sub-controller pattern on a stateful DOM plugin.
4. **`CanvasArea.ts` → `canvas-area/*`** — central orchestrator, do after the pattern is proven on GitPlugin.
5. **`AiDrawer.ts` → `ai-drawer/*`** + `llm.stream-error` logging — largest and most stateful, do after 3 prior phases de-risk the pattern.
6. **`SpecsMapPlugin.ts` → `specsmap/*`** + `specs.corrupt-cache` logging — finishes the split already begun (`cycles.ts`, `search.ts` exist); sequenced last since this file *is* the specs tooling used to validate every other phase.
7. **Terminal PTY logging** (`terminal.pty-exit`) — can land any time after **0b** specifically (needs `reportFailure`/`logFatal` wiring to exist first — 0a alone doesn't provide that), independent of the other splits; grouped last only because it touches both main and renderer.

---

## F. Guardrails Going Forward

- **`npm run loc:check`** (CI + pre-commit) — fails on any file in scope per §A.2 over 700 lines.
- **Console-usage check**, same script or a sibling one — fails on new `console.error`/`console.warn` calls added under the specific folders this refactor creates (`src/renderer/health/**`, `src/renderer/components/dev-console/**`, and each monolith's new subfolder once its phase lands — e.g. `git-plugin/**` after the GitPlugin split). Scoped to those paths only, not repo-wide (existing `console.*` usage elsewhere is out of scope for this refactor). Its include-list grows by one entry per phase — that's a checklist item on every phase in §E, not a one-time setup. Without this check, §B's "log through `reportFailure`, not `console.error`" convention has no enforcement and erodes the same way ungoverned `console.error` calls already have — same failure mode §A.3.7 calls out for test-file splitting, applied to logging discipline instead.

Both checks are built in the infra phase — see §E for the number — so the cap and the logging convention are enforced from the first real split onward, not audited after the fact.

---

## Decisions (resolved)

- Cap scope: working source only (`src/main`, `src/renderer` app logic). Tests, `scripts/**`, `*.config.ts` exempt.
- `loc:check` ships in the infra phase, alongside the splitting work, not after — see §E for the phase number (stated once, there only).
- Phase order confirmed. A (housekeeping/file-size split) is the actual deliverable; B and C are support tooling for A, not features in their own right.
- B (self-healing) is log-only this pass — `reportFailure(signal)` at existing error sites, no retry/remediation/escalation engine. That's future work (§B.5), revisit after phase 6 once real failure patterns exist to design procedures against.

---

## G. Audit (2026-08-03) — grilled against actual working-tree state

Ran the real checks (`tsc --noEmit` on both tsconfigs, `npm run loc:check`, `npm run console:check`, `npx vitest run`, diffed against a stash of the tracked baseline, grepped CI/Makefile) instead of trusting the plan doc. Findings, worst first.

### G.1 Blocker — full test suite fails, isolated files pass
`npx vitest run`: **7 test files fail, 115 tests fail, 74 uncaught-exception errors.** Every failure is the same crash: `TypeError: this.initEditor is not a function` inside `MonacoEditorPlugin`'s constructor, reached via `new ExplorerPlugin(...)` from the `requestAnimationFrame`-deferred callback in `canvas-area/plugin-factories.ts:66-79` (`addExplorer`). `src/test/setup.ts` stubs `requestAnimationFrame` as a real `setTimeout(..., 0)`, so the callback fires *after* the scheduling test has already returned, and lands on whatever test happens to be running next (hence it's blamed on unrelated tests — `e2e-advanced.test.ts`, `CanvasArea.test.ts`, `App.test.ts`).
- Confirmed isolated: `vitest run src/renderer/components/CanvasArea.test.ts` alone → 128/128 pass. `MonacoEditorPlugin.test.ts` alone → 57/57 pass. Only the full-suite run cascades.
- Confirmed new: stashing tracked changes (untracked new files stay in place) drops this to 3 pre-existing failures, not 115. This regression was introduced by this refactor's tracked-file changes, not inherited.
- This is exactly the "full test suite green" gate §E requires before any phase is done. Currently failing — **no phase in §E can be honestly marked complete yet**, regardless of how much code exists.
- Not root-caused to the byte here — needs a real fix session (likely: `addExplorer` needs to await/flush the RAF in tests, or `MonacoEditorPlugin` construction needs to not depend on timing that a stubbed RAF changes across file boundaries).

### G.2 Blocker — `loc:check` fails, the one file the plan explicitly flagged
`npm run loc:check` → **FAIL: `src/renderer/components/MonacoEditorPlugin.ts` at 734 lines**, over the 700 hard ceiling. §A.4 named this file by number (636 LOC) as a "watch item — no action now, re-check LOC before the next non-trivial change." It received a non-trivial change (Monaco/markdown extraction partially happened — `monaco-bootstrap.ts`, `markdown-render.ts` exist as new siblings) and grew past the ceiling instead of being watched. Needs its own split (facade + `monaco-bootstrap.ts`/`markdown-render.ts` already partially extracted — finish it) before this can land.

### G.3 Blocker — `tsc -p tsconfig.renderer.json --noEmit` has 3 new errors
Diffed against tracked baseline (stash) to separate pre-existing debt from new breakage:
- **New, real:** `CanvasArea.ts:495` — `git.restoreState(p.gitState)` inside a `setTimeout` closure; TS can't narrow `GitState | undefined` → `GitState` through the closure even though the enclosing `if (git && p.gitState)` checked it. `npm run build` fails on this today.
- **New, real:** `tool-executor.test.ts:89` and `:102` — `new ToolRegistry([specsExploreTool])` fails: `ToolDefinition<typeof ExploreSpecsMapArgs>` not assignable to `ToolDefinition<ZodTypeAny>`. The split gave each tool a narrower, more specific type than the old monolith did; `ToolRegistry`'s constructor signature (or the individual tool exports) needs a variance fix — not investigated further here, flagged for the fix pass.
- **Pre-existing, not this refactor's fault:** `SearchOverlay.test.ts` (mock typing), `TerminalPlugin.ts:11` (`ready` field), `tool-executor.test.ts` zod version mismatch elsewhere — confirmed present in the stashed baseline too. Don't waste a fix cycle chasing these under this plan.
- Note: `SpecsMapPlugin.ts`'s two baseline errors (`onSearchKeydown` read-only/uninitialized) are **fixed** by the split. Net progress, not just regression.
- `tsc -p tsconfig.main.json --noEmit` is clean — main-process split (phase 1) has no type errors.

### G.4 Gap — §F guardrails aren't wired to anything
§F promises `loc:check`/`console:check` run in "CI + pre-commit." Checked both: no `.husky/` directory exists (no pre-commit hook at all), and `.github/workflows/test.yml` → `make test` → `npm test` only — no `loc:check`, no `console:check` anywhere in `.github/workflows/*.yml` or the `Makefile`. The scripts exist (`scripts/loc-check.js`, wired as `npm run loc:check`/`console:check`) but nothing calls them automatically. G.2's regression is the direct, predicted consequence of this gap — the plan even says as much in §F's last paragraph ("without this check... erodes the same way ungoverned console.error calls already have"), and it's already happened once, on the file the plan called out by name. Wire both checks into `.github/workflows/test.yml` before this refactor can claim the guardrail exists.

### G.5 Facades landed well over their own estimates — watch, not yet a rule violation
Per §A.3.9 (max 2 files per monolith in the (500,700] buffer zone):
- `CanvasArea.ts` facade: estimated ~300 LOC, actual **624** — over double. Combined with `card-lifecycle.ts` (592), that's already 2 files in canvas-area's buffer zone — at the rule's limit. Any further CanvasArea feature work needs a facade split, not just a sub-controller split.
- `SpecsMapPlugin.ts` facade: estimated ~500, actual **696** — 4 LOC from the hard ceiling. One file in specsmap's buffer zone; still within the rule, but there's no room left before the next change trips loc:check on this file too (once G.2's check is actually enforced per G.4).
- `AiDrawer.ts` facade: estimated ~450, actual 506 — marginal, fine.
- `GitPlugin.ts` facade: estimated ~250, actual 339 — fine, under buffer threshold.
- Not a blocker, but the estimates in §A.4 were optimistic enough on the two biggest files that re-running the promised §A.3.10 "re-run the line-range check before opening a phase's PR" step would have caught G.2/this section before merge, not after.

### G.6 What's actually solid — don't re-litigate these
- All 8 monolith/new-module targets from §A.4/§B.3/§C.2 exist on disk with the right subfolder names, matching §A.3.6's kebab-case convention exactly.
- `main/ipc/*` implements the exact 3-way wrapper split (`withHandlerLogging`/`withListenerLogging`/`withSyncListenerLogging`) and `security.ts`/`state.ts` dependency direction described in §A.4 and §B.4 — matches the plan's code sample near-verbatim.
- `console:check` passes clean — no `console.error`/`console.warn` under any monitored folder. B/C's logging discipline is actually being followed, not just documented.
- Main→renderer failure path is wired: `health:mainFailure` pushed from `main/ipc/logging.ts`'s `pushMainFailure`, received via `preload.ts`'s `electronAPI.health.onMainFailure`, consumed in `src/renderer/health/monitor.ts`. `__trace` (§C.2's `wrapTraced`) is also present in `preload.ts`.
- `DevConsolePlugin` is fully wired into the card system (`canvas-area/plugin-factories.ts`, `card-lifecycle.ts`) and into `TopBar.ts`'s menu with the backtick shortcut, per §C.3.
- Phase 7 (`terminal.pty-exit`) is done — `main/ipc/terminal.ts` logs via `logFatal` and pushes `health:mainFailure` on unexpected PTY exit, explicitly comment-tagged `refactor.md §B.4`.
- Specs exist for the new files (`health-failure-kinds.spec.md`, `health-failure-types.spec.md`, `health-feed.spec.md`, `dev-console-plugin.spec.md` found under `src/specs/`) — §D is being followed during the split, not deferred.
- `tsc -p tsconfig.main.json` clean; `main.ts` itself shrank to 250 LOC, well under cap.

### G.7 Process gap — §E's one-PR-per-phase didn't happen
Every phase from 0b through 7 is sitting in the same uncommitted working tree simultaneously, including phase 0a's own gate ("commit or stash WIP before phase 1 touches main.ts") — that gate was never satisfied; `main.ts` was touched anyway, alongside everything else, in one undifferentiated diff. This makes G.1–G.3 harder to attribute to a specific phase and impossible to bisect. Before continuing: commit what's here in the phase order §E lays out (or as close to it as the current diff allows), fixing G.1/G.2/G.3 as part of whichever phase actually owns each broken file (G.1/G.2 → phase 6/MonacoEditorPlugin's own future split; G.3's `CanvasArea.ts:495` → phase 4; G.3's `tool-executor.test.ts` → phase 2), not as one giant final commit.

---

### G.8 Re-audit (2026-08-03, same day) — after user fixes

Re-ran every check in §G from scratch (`tsc` both configs, `loc:check`, `console:check`, full `vitest run`, CI/Makefile grep, `git status`). Verdict per finding:

| # | Finding | Status | Evidence |
|---|---|---|---|
| G.1 | Full suite cascades to 115 failed tests | **FIXED** | `npx vitest run` → 61/61 files, 1698/1698 tests, clean. RAF/`MonacoEditorPlugin` init race is gone. |
| G.2 | `MonacoEditorPlugin.ts` over 700-line hard ceiling | **FIXED** | File split: `monaco-bootstrap.ts` and `markdown-render.ts` extracted as new siblings (both untracked, not yet committed). Facade now 585 LOC. `npm run loc:check` → `ok — no in-scope file exceeds 700 lines`. |
| G.3a | `CanvasArea.ts:495` — `GitState \| undefined` not narrowed through `setTimeout` closure | **STILL OPEN** | Same error, same line, unchanged. `tsc -p tsconfig.renderer.json --noEmit` still reports it. `npm run build` still fails on this. |
| G.3b | `tool-executor.test.ts:89,102` — `ToolDefinition<Specific>` not assignable to `ToolDefinition<ZodTypeAny>` | **STILL OPEN** | Same two errors, unchanged. |
| G.3 (pre-existing) | `SearchOverlay.test.ts`, `TerminalPlugin.ts:11`, `CanvasArea.test.ts` `.click`/`GitPlugin.test.ts` `.style` DOM-typing errors | unchanged, still not this refactor's problem (present in baseline) | not re-verified against stash this pass — no tracked-file churn since first audit suggests baseline classification still holds |
| G.4 | §F guardrails not wired to CI/pre-commit | **STILL OPEN** | No `.husky/` dir. `.github/workflows/*.yml` and `Makefile` still have zero references to `loc:check`/`console:check` — grepped both, no hits. |
| G.5 | Facades over estimate (CanvasArea 624, SpecsMapPlugin 696) | **unchanged, still just a watch item** | Same LOC as first audit — no regression, no fix attempted, correctly out of scope for a "fix some issues" pass. |
| G.6 | Wiring/discipline (main/ipc pattern, health push path, dev-console, specs) | **still solid** | `console:check` still clean; `tsc -p tsconfig.main.json` still clean. |
| G.7 | One giant uncommitted diff, no phased PRs | **STILL OPEN** | `git status` unchanged in shape — same ~25 modified + ~15 untracked paths, nothing committed yet. |

**Net: 2 of 4 blockers cleared (G.1, G.2). 2 remain (G.3's two `tsc` errors, G.4's missing CI wiring) plus the standing process gap (G.7).** `npm run build` still does not succeed end-to-end because of G.3a. Next fix pass should take G.3a (narrow with a local `const gitState = p.gitState` before the closure, or an `!`-assert now that it's already been null-checked one line up) and G.3b (loosen `ToolRegistry`'s constructor param to accept covariant `ToolDefinition<any>` elements, or have the split's tool files export through a widening helper like the monolith implicitly did) — both are small, contained fixes, not architectural. G.4 is a one-line addition to `.github/workflows/test.yml`'s `make test` step or the `Makefile`'s `test:` target. G.7 is a commit-ordering exercise once G.3/G.4 are clear, not new code.

### G.9 Resolution (2026-08-03)

All three remaining blockers from G.8 are fixed and committed. Verified from scratch after the fixes: `tsc` both configs (renderer down to only the G.3 *pre-existing* list — `SearchOverlay.test.ts`, `TerminalPlugin.ts`, `.click`/`.style` DOM-typing — all present in the tracked baseline), `npm run loc:check` → ok, `npm run console:check` → ok, `npx vitest run` → 61/61 files, 1698/1698 tests, `npm run build` → succeeds.

| # | Finding | Resolution |
|---|---|---|
| G.3a | `CanvasArea.ts:495` — `GitState \| undefined` not narrowed through `setTimeout` | **FIXED** — hoisted `const gitState = p.gitState` before the closure (`restorePlugins` Git branch). |
| G.3b | `tool-executor.test.ts:89,102` — `ToolDefinition<Specific>` not assignable to `ToolDefinition<ZodTypeAny>` | **FIXED** — `ToolRegistry` now holds `ToolDefinition<any>` (constructor/register/get/all), per G.8's variance recommendation; one downstream implicit-`any` in `tool-executor.ts` annotated. |
| G.4 | §F guardrails not wired to CI/pre-commit | **FIXED** — `npm run loc:check` + `console:check` added to the `Makefile` `test:` target (after `npm test`) and as explicit named steps in `.github/workflows/test.yml`. No `.husky/` pre-commit hook added (not installed in this repo). |
| G.7 | One giant uncommitted diff | **FIXED** — committed in 2 logical commits on `refactor-file-split`: `c176fd5` (plumbing: guardrails, health core, dev console, preload trace, main/ipc, tool-definitions, G.3b/G.4) and `cfed164` (component layer: phases 3–7 splits, unified markdown tabs, G.3a). §E's 7-PR ideal not followed (diff too entangled to slice into 7 compiling phase commits); the user's unrelated `agents/` WIP was left uncommitted. |

### G.10 Final audit (2026-08-03)

Full pass over the completed tree after the post-G.9 feature work. All checks re-run from scratch; verdict: **complete and green.**

| Area | Check | Result |
|---|---|---|
| Tests | `npx vitest run` | 62/62 files, **1711/1711** pass |
| File cap | `npm run loc:check` | ok — no in-scope file >700 (facades: GitPlugin 346, CanvasArea 625, AiDrawer 513, SpecsMapPlugin 584, main 254) |
| Logging discipline | `npm run console:check` | ok — no `console.error/warn` under monitored folders |
| Types | `tsc` main / renderer | main clean; renderer only the pre-existing baseline debt (SearchOverlay.test, TerminalPlugin `.ready`, `.click`/`.style` DOM-typing) — one new implicit-`any` from this pass's logging edit (`TerminalPlugin` `.then((ok))`) found and fixed |
| Guardrails | Makefile `test:` + `.github/workflows/test.yml` | both wired (`loc:check`, `console:check`) |
| Specs | reconcile gate | green — only the two pre-existing stale `flock` specs; 160 specs in `src/specs/` (gitignored, not committed) |
| Build | `npm run build` | succeeds |

Post-G.9 additions, all committed: **unified dev-console log stream** (no tabs, checkbox filter — `f2b068b`), **structured app-wide logging** with `logMain` → `log:push` main→renderer (`48ea37e` + `463bf13`), **keep-view-still-on-tool-calls** toggle (`a5ea392`), **SpecsMapPlugin facade API extraction** to `specsmap/api.ts` (kept the facade under 700 when logging pushed it to 703), **agents permissions** WIP (`bf31719`).

Known non-blocking debt (pre-existing, not this refactor): the two stale `flock.spec.md`/`specs-flock.spec.md` specs, the `SearchOverlay.test.ts`/`CanvasArea.test.ts`/`GitPlugin.test.ts`/`TerminalPlugin.ts` tsc errors, and §E's phased-PR ideal (records §G.7/G.9).


