---
name: App Orchestrator
file: src/renderer/components/App.ts
type: ui
layer: core
singleton: true
exports: [App]
---

# App Orchestrator

Root application controller that wires the menu bar, infinite canvas, workspace management, and all modal/overlay components. On initialization, loads saved workspace state via `workspace:load` IPC, restores card layout, and sets up keyboard shortcuts (Ctrl+N new window, Ctrl+Shift+P command palette, F1 tutorial, etc.). Manages the WelcomeModal workspace picker lifecycle, AboutModal display, ThemeModal, AiDrawer, and Tutorial overlay. Delegates canvas rendering to CanvasArea.

## Dependencies

- **top-bar** `./TopBar` — menu bar with File/Edit/View/Tools/Help menus
- **canvas-area** `./CanvasArea` — infinite canvas hosting plugin cards
- **welcome-modal** `./WelcomeModal` — startup workspace picker dialog
- **about-modal** `./AboutModal` — version/credits dialog
- **theme-modal** `./ThemeModal` — theme palette selection dialog
- **ai-drawer** `./AiDrawer` — AI assistant side panel
- **tutorial** `./Tutorial` — guided first-run tutorial overlay
- **theme** `../theme` — theme toggle and preference persistence

## Referenced By

- **index** `src/renderer/index.ts` — instantiated on renderer entry

## IPC Channels

- `window:new` — opens new Cockpit window
- `window:minimize` / `window:maximize` / `window:close` — window controls
- `ide:openFile` — listener for external editor file open requests
- `prefs:load` / `prefs:save` — theme and preference persistence
- `workspace:getPath` / `workspace:setPath` — workspace path management
- `workspace:load` / `workspace:save` — window state persistence
- `workspace:select` — native directory picker
- `terminal:write` / `terminal:kill` — terminal cleanup on workspace change

## Interface

### Classes

- **App** — root orchestrator
  - **constructor** `(): App` — sets up IPC listeners, keyboard shortcuts, UI components
  - **init** `(): Promise<void>` — loads workspace, restores state, shows welcome if needed
  - **onWorkspaceSelected** `(path: string): Promise<void>` — handles workspace switch
  - **saveState** `(): Promise<void>` — persists current canvas state
  - **openWelcome** `(): void` — shows workspace picker
  - **openAbout** `(): void` — shows about dialog
  - **openTheme** `(): void` — shows theme settings
  - **openTutorial** `(): void` — launches guided tutorial

### Events

- **onWorkspaceChange** — callback `(path: string) => void`

## State

Loads/saves `SaveState` (card positions, sizes, plugin types, workspace path) via `workspace:load`/`workspace:save` IPC.

## Lifecycle

- **created_by:** `index.ts` on page load
- **destroyed_by:** window unload (calls saveState)

## External Dependencies

None beyond IPC bridge.

## Test

`src/renderer/components/App.test.ts`
