# TEST_TODO — Cockpit IDE

Test framework: **Vitest** with jsdom. Existing test setup is in `src/test/setup.ts` and exposes `mockElectronAPI` for all `window.electronAPI.*` calls. Follow naming and structural patterns from existing test files.

---

## 1. `src/renderer/components/TopBar.test.ts` — UPDATE

Current callbacks mock is **stale**: has `onOpenPreferences`, `onNewEditor` (removed), and is **missing** `onNewGit`, `onZoomLock`. Fix the `beforeEach` mock object first, then add the following tests.

### Fix mock object
```ts
callbacks = {
  onGridChange: vi.fn(),
  onThemeToggle: vi.fn(),
  onOpenWorkspace: vi.fn(),
  onNewTerminal: vi.fn(),
  onNewExplorer: vi.fn(),
  onNewGit: vi.fn(),          // ADD — was missing
  onNewMarkdown: vi.fn(),     // ADD — was missing
  onFocusTerminal: vi.fn(),
  onReopenTerminal: vi.fn(),
  onFocusExplorer: vi.fn(),
  onReopenExplorer: vi.fn(),
  onFocusMarkdown: vi.fn(),
  onReopenMarkdown: vi.fn(),
  onAbout: vi.fn(),
  onTutorial: vi.fn(),
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onResetView: vi.fn(),
  onZoomLock: vi.fn(),        // ADD — was missing
};
```

### New tests to add

**Git & Markdown menu items**
- `clicking "Git" under View menu calls onNewGit` — click `#menu-new-git`, expect `callbacks.onNewGit` called once
- `clicking "New" under Markdown calls onNewMarkdown` — click `#menu-new-markdown`, expect `callbacks.onNewMarkdown` called once

**Zoom Lock**
- `clicking "Lock" in Zoom submenu calls onZoomLock(true) when not locked` — click `#menu-zoom-lock`, expect `callbacks.onZoomLock` called with `false` (current state is unlocked, so it passes `!this.zoomLocked` = `!false` = `true`)
  > Note: handler passes `!this.zoomLocked` so first click passes `true`
- `setZoomLocked(true) shows check mark next to Lock item` — call `topbar.setZoomLocked(true)`, then check `#menu-zoom-lock` text contains `✓`
- `setZoomLocked(false) removes check mark from Lock item` — call `setZoomLocked(true)` then `setZoomLocked(false)`, check no `✓` in `#menu-zoom-lock`

**Dynamic submenu instances**
- `setGitItems() populates git section — but View > Git is a single item not a submenu`: N/A — Git is a direct menu item, no instance list. Skip.
- `setMarkdownItems() renders markdown instances with correct titles` — call `topbar.setMarkdownItems([{ uuid: 'md1', title: 'Markdown 1', isOpen: true }])`, check DOM contains 'Markdown 1'
- `clicking open markdown instance calls onFocusMarkdown with uuid` — after `setMarkdownItems([{ uuid: 'md1', title: 'Markdown 1', isOpen: true }])`, click the `.md-instance`, expect `callbacks.onFocusMarkdown` called with `'md1'`
- `clicking closed markdown instance calls onReopenMarkdown with uuid` — set `isOpen: false`, click, expect `callbacks.onReopenMarkdown` called with uuid
- `clicking open terminal instance calls onFocusTerminal with uuid` — after `setTerminalItems([{ uuid: 'tid', title: 'Terminal 1', isOpen: true }])`, click `.term-instance`, expect `callbacks.onFocusTerminal('tid')`
- `clicking closed terminal instance calls onReopenTerminal with uuid` — `isOpen: false`, expect `callbacks.onReopenTerminal`
- `clicking open explorer instance calls onFocusExplorer with uuid`
- `clicking closed explorer instance calls onReopenExplorer with uuid`

**Canvas grid style**
- `clicking Dot grid option calls onGridChange('dots')` — click `[data-grid="dots"]`, expect `callbacks.onGridChange` called with `'dots'`
- `clicking Grid option calls onGridChange('grid')` — same for `'grid'`
- `clicking None option calls onGridChange('none')` — same for `'none'`
- `setGridStyle('grid') shows check mark on Grid item` — call `topbar.setGridStyle('grid')`, check `[data-grid="grid"]` text contains `✓`

---

## 2. `src/renderer/components/CanvasArea.test.ts` — UPDATE

### Add to existing `describe('CanvasArea')`:

**addTerminal / addExplorer / addGit / addMarkdown**
- `addTerminal() creates a card with title matching Terminal N pattern` — call `addTerminal()`, await rAF, expect `getSaveState().plugins[0].title` to match `/^Terminal \d+$/`
- `addTerminal() fires onTerminalsChanged` — set `canvas.onTerminalsChanged = vi.fn()`, call `addTerminal()`, await rAF, expect called
- `addExplorer() creates a card with title matching Explorer N pattern` — same pattern
- `addExplorer() fires onExplorersChanged` — same pattern
- `addGit() creates card with title "Git"` — `getSaveState().plugins[0].title === 'Git'`
- `addGit() single-instance: second call reopens existing card, not create new` — call `addGit()` twice (with await), expect `getSaveState().plugins.length === 1`
- `addMarkdown() creates card with title matching Markdown N pattern`
- `addMarkdown() fires onMarkdownChanged`

**terminateCard**
- `terminateCard() removes card from getSaveState().plugins` — add terminal, get cs, call `terminateCard(cs)`, expect 0 plugins
- `terminateCard() fires onStateChange`
- `terminateCard() for a terminal card calls terminal.kill IPC` — `expect(mockElectronAPI.terminal.kill).toHaveBeenCalledWith(uuid)`
- `terminateCard() for non-terminal does not call terminal.kill`

**reopen / focus**
- `reopenTerminal() makes minimized terminal visible again` — add terminal, set `cs.isOpen = false; cs.card.el.style.display = 'none'`, call `reopenTerminal(uuid)`, expect `cs.isOpen === true` and `cs.card.el.style.display !== 'none'`
- `reopenExplorer() restores minimized explorer`
- `reopenGit() restores minimized git card`
- `reopenMarkdown() restores minimized markdown card`
- `focusTerminal() brings card to front (highest z-index among open cards)` — add two terminals, call `focusTerminal(uuid1)`, expect card1's z-index > card2's z-index
- `focusTerminal() no-op for non-existent uuid` — expect no throw
- `cycleCard(1) moves focus to next open card` — add 3 terminals, call `cycleCard(1)`, expect different card is now highest z-index
- `cycleCard(-1) moves focus to previous card`
- `cycleCard() no-op when fewer than 2 open cards`

**getActiveExplorerPlugin**
- `getActiveExplorerPlugin() returns null when no explorers exist`
- `getActiveExplorerPlugin() returns topmost open explorer's ExplorerPlugin instance` — requires rAF, complex to test; test that it returns non-null after `addExplorer()`

**getMarkdownLabels**
- `getMarkdownLabels() returns empty array when no markdowns`
- `getMarkdownLabels() returns title array of all markdown plugins`

**offsetCard**
- `offsetCard() moves card to specified world coordinates` — add terminal, call `offsetCard('Terminal 1', 100, 200)`, expect `getSaveState().plugins[0].x === 100`

**setView / centerView**
- `setView() sets zoom and pan` — call `setView({ zoom: 2, panX: 100, panY: 200 })`, expect `getSaveState()` returns those values
- `centerView() sets panX/panY to half viewport dimensions` — after `centerView()`, expect `getSaveState().panX` to be `el.clientWidth / 2`

**Plugin list panel (.pli-zone)**
- `plugin list zone exists with ◣ icon`
- `plugin list shows on mouseenter zone`
- `plugin list shows "(No plugins)" message when no cards exist`
- `plugin list shows card titles after adding cards`
- `plugin list shows "(minimized)" suffix for closed cards`

**Zoom lock**
- `locked = true prevents pan initiation` — set `canvas.locked = true`, dispatch `mousedown` on canvas el, expect no panning state
- `onLockToggle callback fires when statusbar lock button clicked` — this requires knowing how StatusBar triggers it; may need to call the statusBar.update's onLockToggle function directly

**restorePlugins — edge cases**
- `restorePlugins() migrates "Dev" title to "Explorer 1"` — pass state with `plugins: [{ title: 'Dev', ... }]`, after restore, expect `getSaveState().plugins[0].title === 'Explorer 1'`
- `restoreZOrder() assigns z-indexes matching order array` — add two terminals, call `restoreZOrder([uuid2, uuid1])`, expect cs2.card.el.style.zIndex < cs1.card.el.style.zIndex

---

## 3. `src/renderer/components/App.test.ts` — UPDATE

### New tests to add:

**Ctrl+P — now fixed (was calling getActiveDevPlugin which didn't exist)**
- `Ctrl+P does not throw even with no active explorer plugin` — dispatch keydown `{ key: 'p', ctrlKey: true }`, expect no throw
- `Cmd+P does not throw even with no active explorer plugin`

**Theme toggle**
- `onThemeToggle calls canvas.refresh()` — spy on canvas.refresh, trigger `onThemeToggle`, expect called
  > Note: App wires `onThemeToggle` which calls `this.canvas.refresh()` and `this.canvas.getActiveExplorerPlugin()?.updateTheme()`

**Auto-save diff guard**
- `trySave does not call workspace:save if state is identical` — trigger `onStateChange` twice with same state, expect `workspace.save` called once not twice
- `trySave calls workspace:save when state changes` — trigger `onStateChange` with different state (add card), expect `workspace.save` called

**Tutorial pref**
- `tutorial starts when showTutorial pref is not false` — mock `prefs.load` returns `{ showTutorial: true }`, construct App, await startup, expect tutorial overlay visible (`.tutorial-overlay` display !== `'none'`)
- `tutorial skipped when showTutorial pref is false` — mock `prefs.load` returns `{ showTutorial: false }`, expect `.tutorial-overlay` NOT visible

**Workspace loaded with saved state**
- `loadWorkspace with existing state calls canvas.restorePlugins` — mock `workspace.load` returns `{ plugins: [{ title: 'Terminal 1', ... }], zOrder: [], zoom: 1, panX: 0, panY: 0 }`, after startup expect at least one card in DOM

---

## 4. `src/renderer/components/TerminalPlugin.test.ts` — UPDATE

### New tests to add:

**IPC wiring**
- `terminal:create IPC called with uuid on construction` — construct `TerminalPlugin(container, 'test-uuid', '/cwd')`, expect `mockElectronAPI.terminal.create` called with `('test-uuid', '/cwd')`
- `terminal:create called without cwd when not provided` — construct with no cwd, expect `mockElectronAPI.terminal.create` called with `('test-uuid', undefined)`
- `destroy() calls terminal:kill IPC` — construct, call `destroy()`, expect `mockElectronAPI.terminal.kill` called with `'test-uuid'`
- `onExit fires when terminal:exit IPC fires for matching uuid` — construct, set `term.onExit = vi.fn()`, trigger `terminal:exit` via the onExit listener registered in setup, expect `term.onExit` called
- `onExit does NOT fire when terminal:exit fires for different uuid`

**fit() and setScale()**
- `fit() does not throw` — construct, call `term.fit()`, expect no throw
- `setScale() does not throw` — construct, call `term.setScale(0.5)`, expect no throw

**Clipboard**
- `Ctrl+Shift+V paste calls clipboard.readText() synchronously` — construct, mock `mockElectronAPI.clipboard.readText` returns `'pasted text'`, simulate Ctrl+Shift+V via the custom key handler (access `(window as any).electronAPI.clipboard.readText`), expect `mockElectronAPI.clipboard.readText` was called
  > The key handler is attached via `term.attachCustomKeyEventHandler`. Fire a synthetic KeyboardEvent on the xterm element or call the handler directly via `(term as any).xterm.attachCustomKeyEventHandler` callback. Simplest: `mockElectronAPI.clipboard.readText` is a spy — construct term, verify it's callable sync, no await.
- `Ctrl+Shift+C copy calls clipboard.writeText with selection` — similar approach: mock selection, fire Ctrl+Shift+C handler, expect `mockElectronAPI.clipboard.writeText` called

---

## 5. `src/main/main.test.ts` — UPDATE

### New tests to add:

**Git IPC handler registration** (add to `describe('window lifecycle IPC handlers')` or new `describe('git handlers')`)
```
git:remotes, git:branches, git:checkout, git:log, git:showTree, git:diff,
git:currentBranch, git:stagedFiles, git:unstagedFiles, git:stagedDiff, 
git:unstagedDiff, git:commitBody, git:stage, git:unstage, git:commit,
git:push, git:checkAhead
```
- `all 17 git handlers are registered` — for each channel above: `expect(handleMap.has('git:remotes')).toBe(true)` etc.

**clipboard:writeText handler** (invoke-based)
- `clipboard:writeText handler is registered` — `expect(handleMap.has('clipboard:writeText')).toBe(true)`
- `clipboard:writeText calls electron clipboard.writeText` — `const handler = handleMap.get('clipboard:writeText'); await handler({}, 'hello'); expect(clipboard.writeText).toHaveBeenCalledWith('hello')`

---

## 6. `src/preload/preload.test.ts` — UPDATE

### New tests to add:

**Git namespace — API shape** (add to `describe('preload.ts — exposed API shape')`)
- `exposes git namespace with all 17 methods` — `expect(api.git).toBeDefined()`, then check each: `remotes, branches, checkout, log, showTree, diff, currentBranch, stagedFiles, unstagedFiles, stagedDiff, unstagedDiff, commitBody, stage, unstage, commit, push, checkAhead`

**Git IPC wiring** (add to `describe('preload.ts — IPC wiring (invoke-based)')`)
- `git.remotes invokes git:remotes with repoPath`
- `git.branches invokes git:branches`
- `git.checkout invokes git:checkout with repoPath and branch`
- `git.log invokes git:log with repoPath and optional maxCount`
- `git.stage invokes git:stage with repoPath and filePath`
- `git.unstage invokes git:unstage`
- `git.commit invokes git:commit`
- `git.push invokes git:push`
- `git.checkAhead invokes git:checkAhead`

---

## 7. `src/renderer/components/ConfirmModal.test.ts` — UPDATE

### New tests to add:

**Keyboard and overlay dismiss**
- `Escape key resolves false` — `modal.open()`, dispatch `new KeyboardEvent('keydown', { key: 'Escape' })` on document, await result, expect `false`
- `clicking overlay background resolves false` — `modal.open()`, dispatch click on `.modal-overlay.confirm` (target = overlay itself), expect `false`
- `clicking inside modal box does not close it` — click on `.modal` box element, expect promise still pending (not resolved)

**HTML sanitization**
- `sanitizes <script> tags from message` — `new ConfirmModal('<script>alert(1)</script>Are you sure?')`, expect `.confirm-modal-msg` innerHTML does NOT contain `<script`
- `sanitizes <img> tags` — `new ConfirmModal('<img src=x onerror=alert(1)>Are you sure?')`, expect no `<img` in innerHTML
- `sanitizes inline on* event handlers` — `new ConfirmModal('<span onclick="evil()">text</span>')`, expect no `onclick` in innerHTML
- `allows safe text content` — `new ConfirmModal('<strong>Important</strong> action')`, expect `.confirm-modal-msg` contains 'Important'

**Destructive styles**
- `destructive=true (default) adds btn-ok-destructive class to confirm button` — check `#confirm-ok.classList.contains('btn-ok-destructive')`
- `destructive=false does NOT add btn-ok-destructive class` — `new ConfirmModal('msg', 'OK', false)`, expect `#confirm-ok` does NOT have `btn-ok-destructive`

**Focus behavior**
- `open() focuses the cancel button` — `modal.open()`, expect `document.activeElement === document.querySelector('#confirm-cancel')`

**Cleanup**
- `resolved modal removes itself from DOM` — after confirm click, expect `.modal-overlay.confirm` no longer in DOM

---

## 8. `src/renderer/components/AboutModal.test.ts` — UPDATE

### New tests to add:

- `overlay click (on background, not modal) dismisses modal` — `modal.open()`, dispatch click on `.modal-overlay` with `e.target = overlay`, expect `overlay.style.display === 'none'`
- `clicking inside modal box does NOT dismiss` — dispatch click on `.about-modal`, expect still visible
- `onClose callback fires when closed via close button` — `modal.open(onClose)`, click `#about-close`, expect `onClose` called once
- `onClose callback fires when closed via overlay click`
- `onClose is null after close (not called twice on second close call)` — open with onClose spy, close, close again, expect spy called only once
- `design link fires shell:openExternal with https URL` — click `#about-design-link`, expect `mockElectronAPI.shell.openExternal` called with URL starting `https://`
- `version info shown from electronAPI.versions.app` — in setup mock `(window as any).electronAPI.versions.app = '1.2.3'`, construct modal, expect text contains `'1.2.3'`

---

## 9. `src/renderer/components/Tutorial.test.ts` — UPDATE

### New tests to add:

- `Next button advances to step 2` — `t.start()`, click Next button (`.tutorial-btn-primary` or button containing 'Next'), expect tooltip title changes to step 2 title (`'Wide Canvas'`)
- `Back button hidden on first step` — `t.start()`, find Back button, expect it hidden (`display:none` or not in DOM)
- `Back button visible on step 2` — advance to step 2, expect Back button visible
- `Back button returns to previous step`
- `Skip button fires onFinish callback` — `t.start(onFinish)`, click Skip, expect `onFinish` called
- `Done button on last step fires onFinish callback` — advance to last step (step 13), click Done, expect `onFinish` called
- `ArrowRight key advances step` — `t.start()`, dispatch `ArrowRight` keydown on document, expect step 2
- `ArrowLeft key goes to previous step` — advance to step 2, dispatch `ArrowLeft`, expect step 1
- `getShowOnLaunch() returns true by default`
- `"Do not show again" checkbox toggles getShowOnLaunch()` — find checkbox, check it, expect `t.getShowOnLaunch() === false`
- `destroy() removes overlay from DOM` — `t.start()`, `t.destroy()`, expect `.tutorial-overlay` not in DOM
- `overlay has pointer-events:none (non-blocking)` — check `.tutorial-overlay` CSS has `pointerEvents: 'none'`
- `13 total steps — tutorial_steps count matches spec` — access `(t as any).steps.length`, expect `13`

---

## 10. `src/renderer/components/WelcomeModal.test.ts` — UPDATE (check existing, add gaps)

### Add if not already present:

- `clicking recent path that exists closes modal with that path` — mock `fs.readDir` returns valid array, click `.welcome-recent-item` path area, expect modal resolves with that path
- `clicking missing recent path does NOT close modal` — mock `fs.readDir` returns null for that path, click, expect modal still open (overlay still `display:flex`)
- `recent path with missing status has opacity styling` — `fs.readDir` returns null, check `.welcome-recent-item-path` has `.welcome-recent-item-missing` class
- `remove button calls workspace:removeRecent and removes item from DOM` — click `×` button on recent item, expect `mockElectronAPI.workspace.removeRecent` called with path, and item removed
- `remove button stops propagation (does not trigger path click)` — click remove, expect modal still open

---

## 11. `src/renderer/components/GitPlugin.test.ts` — UPDATE (check existing, add gaps)

### Add if not already present:

- `checkout: clicking a branch calls git:checkout with branch name` — find branch item, click it, expect `mockElectronAPI.git.checkout` called
- `stage: clicking stage button on unstaged file calls git:stage`
- `unstage: clicking unstage button on staged file calls git:unstage`
- `commit: clicking commit button with non-empty message calls git:commit`
- `commit: clicking commit button with empty message does NOT call git:commit`
- `push: clicking push button calls git:push`
- `getState() returns serializable object with at minimum a selectedHash field` — `const state = plugin.getState()`, expect it has `selectedHash` property
- `restoreState() does not throw when passed a valid state` — `plugin.restoreState({ selectedHash: 'abc123', selectedFile: null, diffMode: 'unified' })`, expect no throw
- `destroy() removes all child elements from container`
- `auto-refresh: file change event triggers refresh` — get the `fs.onChanged` callback, call it with a path, expect `git.log` called again

---

## 12. `src/renderer/components/MarkdownPlugin.test.ts` — UPDATE (check existing, add gaps)

### Add if not already present:

- `loadFile twice for same path switches to existing tab (no duplicate tabs)` — load same file twice, expect only 1 tab
- `loadFile for different path adds second tab` — load two different files, expect 2 tabs
- `tab close button removes tab` — load a file, click tab close (`×`), expect tab gone
- `external file change reloads content` — load file, get `fs.onChanged` callback, update `fs.readFile` mock, fire callback with same path, await, expect new content
- `destroy() removes DOM and unlistens file changes` — `plugin.destroy()`, expect container empty
- `getState() / restoreState() round-trip preserves openFiles and activeFile` — `getState()` after loading files, `restoreState(state)` on new plugin, expect same files restored
- `empty file shows "<Empty file>" placeholder` — mock `fs.readFile` returns `''`, `loadFile('/empty.md')`, expect text contains `'<Empty file>'`
- `XSS: javascript: links are blocked in markdown output` — mock readFile returns `'[click](javascript:alert(1))'`, load file, expect rendered HTML does NOT contain `javascript:`
- `external link target=_blank is applied` — readFile returns `'[link](https://example.com)'`, load, expect rendered `<a>` has `target="_blank"`

---

## 13. `src/renderer/theme.test.ts` — CHECK EXISTING

Verify this already covers: `setDark()`, `isDark` getter, `toggle()`, CSS variable injection. If not:
- `setDark(true) sets isDark to true`
- `setDark(false) sets isDark to false`
- `toggle() flips isDark`
- `CSS variables applied to document.documentElement on toggle`

---

## 14. `src/renderer/components/PluginCard.test.ts` — CREATE (if not exists)

Check if `PluginCard.test.ts` exists. If not, create with:
- `renders card with correct title and subtitle`
- `minimize button triggers onMinimize callback`
- `terminate button triggers onTerminate callback`
- `fit-viewport button triggers onFitViewport callback`
- `drag: mousedown on header + mousemove + mouseup calls onDragEnd with delta`
- `resize: mousedown on resize handle + mousemove + mouseup calls onResizeEnd`
- `focus: click on card body calls onFocus`
- `renderTitle() reflects current zoom (scale)`
- `remove() detaches element from DOM`

---

## 15. `src/renderer/components/CommandPalette.test.ts` — CHECK/CREATE

Verify the `CommandPalette` test coverage. The spec says it does fuzzy file search. Add or create:
- `open() shows overlay`
- `Escape closes palette`
- `clicking overlay background closes palette`
- `typing in input filters results`
- `ArrowDown selects next result`
- `ArrowUp selects previous result`
- `Enter selects highlighted result and calls onSelect`
- `clicking a result calls onSelect with file path`
- `file indexing via fs.readDir — results populated after indexing`

---

## Notes for the implementing LLM

1. **Test environment**: `vitest-environment jsdom`. Import `mockElectronAPI` from `../../test/setup` for all renderer tests.
2. **rAF flushing**: Many canvas operations use `requestAnimationFrame`. Use `await new Promise(r => setTimeout(r, 50))` to let them settle in jsdom.
3. **Private method access**: Access private methods/properties via `(instance as any).methodName` — acceptable in tests.
4. **IPC mocks**: `mockElectronAPI` already mocks all `window.electronAPI` methods. Use `(mockElectronAPI.git.remotes as any).mockResolvedValue(...)` for per-test setup.
5. **Keyboard events**: Use `document.dispatchEvent(new KeyboardEvent('keydown', { key: '...', ctrlKey: true, bubbles: true }))`.
6. **Mouse events**: `element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))`.
7. **DOM cleanup**: Each `beforeEach` should do `document.body.innerHTML = ''` before reconstruction.
8. **No implementation**: This file documents WHAT to test, not HOW to implement. The implementing LLM writes the actual test code following the patterns in existing test files.
