---
name: Canvas Area
file: src/renderer/components/CanvasArea.ts
type: ui
layer: core
singleton: true
exports: [CanvasArea, SaveState, PluginEntry, EditorState]
---

# Canvas Area

The infinite canvas engine. Manages an ordered list of `CardState` objects, each wrapping a `PluginCard` instance with world coordinates, open/minimized state, and typed plugin references (terminal, explorer, git, specsmap). Implements zoom/pan via CSS `transform: scale()` on a viewport div, with wheel-based zooming centered on mouse position, left-click-drag panning (Ctrl-held when over a card), and viewport bounds clamping (±50000px world). Hosts two corner panels: a plugin list (lower-left hover zone with right-click context menu) and an arrange panel (lower-right for auto-arrange, tile, snap origin, and grid unit input). Provides factory methods for each plugin type (`addTerminal`, `addExplorer`, `addGit`, `addMarkdown`, `addSpecsmap`) and delegates card lifecycle (focus, minimize, reopen, terminate, offset, resize) through CardState lookups by UUID or title. Serializes full save state (`getSaveState`) for persistence. Exposes the grid pattern rendering via `setGridStyle`. Maintains callbacks for state change, terminal/explorer/git/markdown/specsmap list changes, and lock-toggle.

## Dependencies

- **Canvas Grid** `src/renderer/components/canvas-grid.ts` — `GridStyle`, `generateGridPattern`, `applyGridToElement`
- **Status Bar** `src/renderer/components/canvas-statusbar.ts` — `StatusBar` instance
- **Plugin Card** `src/renderer/components/PluginCard.ts` — card DOM element with drag/resize/controls
- **Terminal Plugin** `src/renderer/components/TerminalPlugin.ts` — PTY terminal instance per card
- **Explorer Plugin** `src/renderer/components/ExplorerPlugin.ts` — split-pane file tree + editor per card
- **Git Plugin** `src/renderer/components/GitPlugin.ts` — git UI per card
- **Markdown Plugin** `src/renderer/components/MarkdownPlugin.ts` — markdown preview per card
- **SpecsMap Plugin** `src/renderer/components/SpecsMapPlugin.ts` — dependency graph per card
- **Context Menu** `src/renderer/components/ContextMenu.ts` — right-click on plugin list items

## Referenced By

- **App Orchestrator** `src/renderer/components/App.ts` — creates CanvasArea, wires all callbacks

## IPC Channels

- `workspace:load` — restored saved plugin layout
- `workspace:save` — persist layout on state change
- `terminal:write` — agent terminal integration
- `terminal:kill` — terminate PTY process
- `fs:readDir` — explorer file tree loading
- `prefs:load` — restore grid style and zoom-lock preferences
