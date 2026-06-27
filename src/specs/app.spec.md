---
name: App Orchestrator
file: src/renderer/components/App.ts
type: ui
layer: core
singleton: true
exports: [App]
---

# App Orchestrator

Root component of the renderer UI. Constructed by `renderer-entry.ts`. Creates and wires all major subsystems: `CanvasArea`, `TopBar`, `WelcomeModal`, `AboutModal`, `ThemeModal`, `AiDrawer`, and `Tutorial`. Registers global keyboard shortcuts (`Ctrl+Shift+N` new window, `Ctrl+W` close tab, `Ctrl+Tab` cycle cards, `Ctrl+P` file search, `Ctrl+J` new terminal). Loads persisted theme preference on construction. Orchestrates workspace lifecycle: prompts for workspace via `WelcomeModal` on first launch, loads saved plugin layout (`workspace:load`), restores zoom/pan state, and auto-saves on every state change. Exposes `__cockpit` global API for agent integration (get canvas state, open files, write terminals, manage cards). Connects CanvasArea callbacks to TopBar display updates (terminal list, git list, specsmap list).

## Dependencies

- **Top Bar** `src/renderer/components/TopBar.ts` — creates menu bar and wires all user-initiated actions
- **Canvas Area** `src/renderer/components/CanvasArea.ts` — the infinite canvas hosting all plugin cards
- **Welcome Modal** `src/renderer/components/WelcomeModal.ts` — shown on first launch to select a workspace
- **About Modal** `src/renderer/components/AboutModal.ts` — version/credits overlay
- **Theme Modal** `src/renderer/components/ThemeModal.ts` — palette and mode selection dialog
- **AiDrawer** `src/renderer/components/AiDrawer.ts` — AI assistant side panel
- **Tutorial** `src/renderer/components/Tutorial.ts` — interactive guided tour
- **Theme System** `src/renderer/theme.ts` — reads/saves theme preferences

## Referenced By

- **Renderer Entry** `src/renderer/index.ts` — instantiates `new App()`

## IPC Channels

- `workspace:select` — native directory picker
- `workspace:setPath` — register workspace with main process
- `workspace:load` — load saved plugin state from disk
- `workspace:save` — persist current plugin layout
- `workspace:getPath` — get the currently set workspace path
- `prefs:load` — load theme, grid, zoom-lock preferences
- `prefs:save` — persist preferences
- `ide:onOpenFile` — receive external file-open requests from IDE server
- `window:newWindow` — open a new Electron window
- `terminal:write` — agent terminal command execution
