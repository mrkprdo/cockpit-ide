---
name: Canvas Area
file: src/renderer/components/CanvasArea.ts
type: ui
layer: core
singleton: true
exports: [CanvasArea, EditorState, PluginEntry, SaveState]
---

# Canvas Area

Infinite 2D canvas surface managing floating PluginCard instances. Handles pan (mouse drag on empty space), zoom (mouse wheel), card creation (terminal/explorer/git/markdown/specsmap), card lifecycle (add/remove/minimize/reopen/focus), state serialization for persistence, auto-arrange/tile layout algorithms, grid snapping at 28px, and the plugin list panel (lower-left hover) and arrange panel (lower-right hover). Maintains z-order, world bounds clamping, and per-card plugin references.

## Dependencies

- [[canvas-grid.spec.md|canvas-grid]] `src/renderer/components/canvas-grid.ts` — Generates and applies SVG dot/grid pattern as canvas background image with zoom/pan alignment
- [[canvas-statusbar.spec.md|canvas-statusbar]] `src/renderer/components/canvas-statusbar.ts` — Updates status bar with zoom level, lock state, workspace name, and view-all/reset buttons
- [[plugin-card.spec.md|plugin-card]] `src/renderer/components/PluginCard.ts` — Creates PluginCard instances for each plugin; manages card DOM, drag, resize, minimize, and terminate
- [[terminal-plugin.spec.md|terminal-plugin]] `src/renderer/components/TerminalPlugin.ts` — Instantiates TerminalPlugin inside card bodies for PTY terminal emulation
- [[monaco-editor-plugin.spec.md|monaco-editor-plugin]] `src/renderer/components/MonacoEditorPlugin.ts` — Instantiates MonacoEditorPlugin via ExplorerPlugin for code editing
- [[explorer-plugin.spec.md|explorer-plugin]] `src/renderer/components/ExplorerPlugin.ts` — Instantiates ExplorerPlugin (file tree + editor split) inside explorer cards
- [[git-plugin.spec.md|git-plugin]] `src/renderer/components/GitPlugin.ts` — Instantiates GitPlugin inside git cards for version control UI
- [[context-menu.spec.md|context-menu]] `src/renderer/components/ContextMenu.ts` — Opens context menus for card header right-click and plugin list items
- [[markdown-plugin.spec.md|markdown-plugin]] `src/renderer/components/MarkdownPlugin.ts` — Instantiates MarkdownPlugin inside markdown cards for .md file preview
- [[specsmap-plugin.spec.md|specsmap-plugin]] `src/renderer/components/SpecsMapPlugin.ts` — Instantiates SpecsMapPlugin inside specsmap cards for dependency graph visualization

## Referenced By

- [[app.spec.md|app]] `src/renderer/components/App.ts`

## Interface

### Methods

- **addTerminal** `(wsPath: string): string` — Creates a new terminal card, returns its UUID
- **addExplorer** `(wsPath: string): string` — Creates a new explorer card, returns its UUID
- **addGit** `(wsPath: string): string` — Creates a new git card, returns its UUID
- **addMarkdown** `(): string` — Creates a new markdown card, returns its UUID
- **addSpecsmap** `(wsPath: string): string` — Creates a new specsmap card, returns its UUID
- **autoArrange** `(): void` — Arranges all open cards in a grid using current tile dimensions
- **tilePlugins** `(): void` — Tiles all open cards in a non-overlapping grid
- **getSaveState** `(): SaveState` — Serializes all card positions, sizes, z-order, zoom, and pan for persistence
- **restorePlugins** `(state: SaveState, path: string): void` — Recreates all plugins from a saved state
- **setView** `(v: { zoom: number; panX: number; panY: number }): void` — Sets canvas zoom/pan
- **centerView** `(): void` — Centers the canvas view on origin
- **resetView** `(): void` — Resets zoom to 1 and recenters
- **focusCard** `(title: string): void` — Brings card to front by title
- **closeCard** `(title: string): void` — Terminates and removes a card
- **minimizeCard** `(title: string): void` — Hides a card without destroying
- **reopenCardByTitle** `(title: string): boolean` — Restores a minimized card
- **getTerminalPlugin** `(uuid: string): TerminalPlugin | null` — Finds terminal plugin by UUID
- **getActiveExplorerPlugin** `(): ExplorerPlugin | null` — Returns the most recently focused explorer plugin

### Properties

- **locked**: boolean — When true, zoom/pan interaction is disabled
- **workspaceName**: string — Display name of the currently loaded workspace
- **onStateChange**: (() => void) | null — Callback fired on any state change that triggers auto-save

