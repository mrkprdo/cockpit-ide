---
name: Canvas Area
file: src/renderer/components/CanvasArea.ts
type: ui
layer: core
singleton: true
exports: [EditorState, PluginEntry, SaveState, CanvasArea]
---

# Canvas Area

Infinite zoomable/pannable canvas engine that hosts draggable/resizable plugin cards. Implements CSS transform-based pan (translate) and zoom (scale) with cubic-bezier easing. Manages the full plugin lifecycle: creation (terminal, editor, explorer, markdown, git, SpecsMap), card arrangement (snap-to-28px-grid, layout overlay), focus management (z-index stacking), and state persistence to `SaveState`. Handles pointer events for canvas interaction: middle-mouse panning, scroll-wheel zoom, right-click context menu for card creation, and drag-and-drop card repositioning. Renders a dot-grid background via canvas-grid and a zoom/dimension status bar via canvas-statusbar.

## Dependencies

- **canvas-grid** `./canvas-grid` — generates dot-grid background pattern
- **canvas-statusbar** `./canvas-statusbar` — floating zoom/dimension status bar
- **plugin-card** `./PluginCard` — card widget for wrapping plugin content
- **terminal-plugin** `./TerminalPlugin` — terminal emulator plugin
- **monaco-editor-plugin** `./MonacoEditorPlugin` — code editor plugin
- **explorer-plugin** `./ExplorerPlugin` — split-pane file browser + editor
- **git-plugin** `./GitPlugin` — git management plugin
- **context-menu** `./ContextMenu` — right-click canvas context menu
- **markdown-plugin** `./MarkdownPlugin` — markdown preview plugin
- **specsmap-plugin** `./SpecsMapPlugin` — specs graph visualization plugin

## Referenced By

- **app** `src/renderer/components/App.ts` — creates and owns the CanvasArea instance

## IPC Channels

- `terminal:kill` — terminates PTY when card is closed via `terminateCard()`

## Interface

### Types

- **EditorState** — `{ id: string; type: string; x: number; y: number; width: number; height: number; scale: number; state: any; zIndex: number }`
- **PluginEntry** — `{ type: string; label: string; create: () => any }`
- **SaveState** — `{ cards: EditorState[]; workspacePath: string }`

### Classes

- **CanvasArea**
  - **constructor** `(container: HTMLElement): CanvasArea` — initializes canvas, grid, status bar, event listeners
  - **setWorkspacePath** `(path: string): Promise<void>` — sets workspace root for file-relative paths
  - **addPlugin** `(type: string, options?: { x?, y?, width?, height? }): PluginCard` — creates and places a plugin card
  - **removeCard** `(card: PluginCard): void` — removes card and its plugin
  - **getState** `(): SaveState` — serializes all card positions and plugin states
  - **restoreState** `(state: SaveState): Promise<void>` — recreates cards from saved state
  - **arrangeCards** `(): void` — auto-arranges cards in grid layout
  - **createTerminal** `(): PluginCard` — creates terminal plugin card
  - **createEditor** `(): PluginCard` — creates editor plugin card
  - **createExplorer** `(): PluginCard` — creates explorer plugin card
  - **createFileExplorer** `(): PluginCard` — creates standalone file explorer card
  - **createGit** `(): PluginCard` — creates git plugin card
  - **createMarkdownViewer** `(): PluginCard` — creates markdown viewer card
  - **createSpecsMap** `(): PluginCard` — creates SpecsMap card
  - **terminateCard** `(card: PluginCard): void` — kills associated processes before removal
  - **focusCard** `(card: PluginCard): void` — brings card to front
  - **zoom** `(factor: number, centerX?: number, centerY?: number): void` — applies zoom transform (0.25x–4x range)
  - **resetZoom** `(): void` — resets to 1x scale

### Properties

- **scale** `number` — current zoom level
- **panX** / **panY** `number` — current pan offset
- **cards** `Map<string, PluginCard>` — active card instances

## State

Full canvas state serialized to `SaveState` on `saveState()`: every card's position, size, z-index, plugin type, and plugin-specific serialized state. Persisted via `workspace:save` IPC.

## Lifecycle

- **created_by:** `App` constructor, attached to `#canvas` element
- **destroyed_by:** App destruction

## External Dependencies

None beyond IPC bridge.

## Test

`src/renderer/components/CanvasArea.test.ts`
