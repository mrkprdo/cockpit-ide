# Test Infrastructure

Vitest + jsdom + lightweight mocks.

## Quick start

```bash
make test              # Run all tests
npm test               # Same
npm run test:watch     # Watch mode (re-run on change)
npm run test:coverage  # With V8 coverage report
```

## Architecture

```
src/test/setup.ts   ← global mocks, DOM stubs, CSS vars (runs once before all tests)
vitest.config.ts    ← jsdom env, setup file, test include pattern, coverage config
```

Every test file gets:
- jsdom `window` + `document` (headless DOM)
- `window.electronAPI` — mock of all IPC channels (terminal, workspace, fs, prefs, shell, window, git, clipboard)
- `@xterm/xterm` → lightweight mock class (open, write, resize, dispose, onData, onExit, attachCustomKeyEventHandler)
- `@chenglou/pretext` → returns text as single-line (renders identically, skips layout)
- `HTMLCanvasElement.getContext('2d')` → plain JS object with all Canvas2D methods as `vi.fn()`
- `crypto.randomUUID()` → deterministic counter-based UUIDs
- `requestAnimationFrame` → `setTimeout(..., 0)`
- `devicePixelRatio` → `1`
- CSS custom properties preset (dark theme: `#0A0E14` bg, etc.)

## File inventory

| File | Type | What's tested |
|------|------|---------------|
| `theme.test.ts` | unit | dark/light toggle, color palette, CSS var propagation |
| `ConfirmModal.test.ts` | unit | OK/Cancel resolution, overlay dismiss, custom labels, DOM cleanup |
| `ContextMenu.test.ts` | unit | item creation, positioning, separators, disabled items, outside-click close, singleton |
| `WelcomeModal.test.ts` | unit | open/close, recent workspaces, workspace selection, null close |
| `AboutModal.test.ts` | unit | open/close, overlay dismiss, design.md link |
| `WindowCard.test.ts` | unit | card structure, positioning, UUID, close/focus/destroy callbacks, canvas title, setContent |
| `CanvasArea.test.ts` | unit | grid styles, zoom bounds, reset view, save state structure, state change callbacks |
| `TopBar.test.ts` | unit | menu rendering, all button callbacks, Terminal/Dev/Context item lists, focus vs reopen |
| `FileExplorerWindow.test.ts` | unit | tree rendering, .gitkeep filter, directory sort, file click, refresh, error state, wheel stop |
| `MarkdownWindow.test.ts` | unit | tab CRUD, duplicate prevention, markdown render, getState/restoreState, file watcher cleanup |
| `MonacoEditorWindow.test.ts` | unit | editor structure, initial state, getState/getContent/getCurrentFile (empty), reloadIfOpen, file listener |
| `DevWindow.test.ts` | unit | split pane, explorer/editor columns, state delegation, updateTheme, restoreEditorState |
| `TerminalWindow.test.ts` | unit | container, UUID, terminal.create with/without cwd, onData/onExit, destroy, exit callback |
| `App.test.ts` | unit | title, CanvasArea/TopBar creation, window controls, Ctrl+W prevention |
| `workflows.test.ts` | integration | file CRUD (create/read/delete/copy-paste), editor tab lifecycle, context tab lifecycle, Dev window operations, theme persistence, ConfirmModal paths, end-to-end browse→open→render |
| `edge-cases.test.ts` | edge | null/undefined/empty inputs, bounds (zoom 0.1–5), rapid calls, double-remove/destroy, special chars in filenames, long strings, missing electronAPI, legacy state formats, UUID filtering, idempotency |

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

## Known limitations

- **Monaco Editor** — `openFile()` hangs because the Monaco AMD loader can't load in jsdom. Tests only verify pre-Monaco state (empty tabs, getState null, etc.). Real Monaco integration needs e2e (Playwright + Electron).
- **node-pty** — Terminal PTY requires a real OS process. Tests mock the IPC layer (`electronAPI.terminal`) but not the PTY spawn.
- **Canvas rendering** — Mock returns void from all draw methods; tests verify canvas structure exists but not pixel output.
- **App orchestrator** — `new App()` was moved to `index.ts` so `App` class can be instantiated in tests without side effects.
