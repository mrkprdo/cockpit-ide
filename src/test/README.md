# Test Infrastructure

Vitest + jsdom + lightweight mocks.

**Suite size (2026-11-13): 68 test files / 1,618 tests — 1,614 pass, 4 skip.**
The four skips are the opt-in SPECGEN corpus checks (`src/renderer/specs/format.test.ts`,
`src/test/specs-reconcile.test.ts`): the corpus is generated per workspace and this repo does not
carry one, so those suites are declared `describe.skipIf(!HAS_SPECS)` and report their absence
instead of passing silently.

## Quick start

```bash
make test              # Run all tests
npm test               # Same
npm run test:watch     # Watch mode (re-run on change)
npm run test:coverage  # With V8 coverage report
```

Coverage thresholds are enforced (statements 70 / branches 60 / functions 65 / lines 70), so a green
test run can still fail `npm run test:coverage`.

## Architecture

```
src/test/setup.ts   ← global mocks, DOM stubs, CSS vars (runs once before all tests)
vitest.config.ts    ← jsdom env, setup file, test include pattern, coverage config
```

Every test file gets:
- jsdom `window` + `document` (headless DOM)
- `window.electronAPI` — mock of all IPC channels (terminal, workspace, fs, prefs, shell, window, git, clipboard, diagnostics, health)
- `@xterm/xterm` → lightweight mock class (open, write, resize, dispose, onData, onExit, attachCustomKeyEventHandler)
- `@chenglou/pretext` → returns text as single-line (renders identically, skips layout)
- `HTMLCanvasElement.getContext('2d')` → plain JS object with all Canvas2D methods as `vi.fn()`
- `crypto.randomUUID()` → deterministic counter-based UUIDs
- `requestAnimationFrame` → `setTimeout(..., 0)`
- `devicePixelRatio` → `1`
- CSS custom properties preset from the default dark palette (`--bg: #161C24`, `--surface: #1C2538`, `--panel: #243248`, …)

## File inventory

68 files total. Unit tests sit next to the module they cover; `src/test/` holds the cross-cutting suites.

| Area | Files | Tests | What's covered |
|---|---|---|---|
| `src/main/` | 2 | 137 | Electron main: window lifecycle, IPC handlers, workspace trust gate, ide-server |
| `src/preload/` | 1 | 60 | every exposed `electronAPI` channel + unsubscribe wiring |
| `src/renderer/components/` | 23 | 816 | window cards, canvas, editor, terminal, explorer, git, SpecsMap, modals, palette, tutorial, top bar |
| `src/renderer/components/ai-drawer/` | 4 | 22 | agent feed, agent sessions, LLM loop, render helpers |
| `src/renderer/components/dev-console/` | 2 | 18 | diagnostics window, console capture |
| `src/renderer/agents/` | 11 | 140 | executor, session, bus, permissions, hooks, pipeline, skills, definitions, agent tools, memory scopes |
| `src/renderer/ai/` | 10 | 110 | LLM client, prompts, tool definitions/registry/executor, memory store, token counter, zod→OpenAI |
| `src/renderer/specs/` | 7 | 90 | format round-trip, graph, validate, reconcile, layout, snapshot, TS extraction (2 corpus cases skipped) |
| `src/renderer/` (misc) | 4 | 61 | theme palettes, specgen hash, logger, health monitor |
| `src/test/` | 4 | 164 | `workflows`, `edge-cases`, `e2e-advanced`, headless `specs-reconcile` (2 corpus cases skipped) |

Largest suites: `AiDrawer` 150, `CanvasArea` 128, `main` 124, `edge-cases` 64, `GitWindow` 63,
`SpecsMapWindow` 60, `preload` 60.

Counts were regenerated with:

```bash
node node_modules/vitest/vitest.mjs run --reporter=json --outputFile=vitest.json
```

## Test patterns

### DOM-dependent components

```ts
beforeEach(() => {
  document.body.innerHTML = '';  // fresh DOM per test
  container = makeContainer(600, 400);
  (mockElectronAPI.fs.readFile as any).mockResolvedValue('content');
});
```

### Async operations

Tests use `await new Promise(r => setTimeout(r, 50))` to flush microtasks after:
- IPC calls (mock resolves on next tick)
- requestAnimationFrame (stubbed to setTimeout(0))
- DOM renders triggered by async operations

### Mock access

```ts
import { mockElectronAPI } from '../../test/setup';
// Override specific mock for a test:
(mockElectronAPI.fs.readDir as any).mockResolvedValue([...]);
```

### Context menus in tests

Context menus are added to `document.body` and cleaned up per-test via `document.body.innerHTML = ''`. When testing context menu interactions:
1. Trigger the right-click event on the target element
2. `await` a tick for the menu DOM to render
3. Query `.ctx-item` elements by textContent
4. Click the desired item

## Adding new tests

1. Create `src/renderer/components/NewComponent.test.ts`
2. Import from `'vitest'` and your component
3. No need to import setup — global mocks are already active
4. Clear DOM in `beforeEach(() => { document.body.innerHTML = ''; })`
5. Reset mock implementations as needed

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NewComponent } from './NewComponent';

describe('NewComponent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does something', () => {
    const comp = new NewComponent(/* ... */);
    expect(comp.value).toBe(42);
  });
});
```

## Spec-corpus tests

Specs are opt-in per workspace. When `src/specs/` does not exist, the corpus suites skip (and say so
in the suite name). To run them for real:

```bash
# generate the corpus first (SpecsMap → Apply structural equivalent)
set SPECS_RECONCILE=structural && npx vitest run src/test/specs-reconcile.test.ts
```

## Known limitations

- **Monaco Editor** — `openFile()` hangs because the Monaco AMD loader can't load in jsdom. Tests only verify pre-Monaco state (empty tabs, getState null, etc.). Real Monaco integration needs e2e (Playwright + Electron).
- **node-pty** — Terminal PTY requires a real OS process. Tests mock the IPC layer (`electronAPI.terminal`) but not the PTY spawn.
- **Canvas rendering** — Mock returns void from all draw methods; tests verify canvas structure exists but not pixel output.
- **App orchestrator** — `new App()` was moved to `index.ts` so `App` class can be instantiated in tests without side effects.
