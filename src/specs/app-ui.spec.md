---
name: App Orchestrator UI
parent: app
---

# App Orchestrator UI

The App orchestrator has no direct DOM of its own — it renders through child components (TopBar, CanvasArea, modals). The UI interactions described here are the keyboard shortcuts and lifecycle UI flows it coordinates.

## Interactions

### Keyboard: New Window
- **trigger:** `Ctrl+Shift+N` / `Cmd+Shift+N`
- Calls `window.electronAPI.window.newWindow()`

### Keyboard: Close Tab
- **trigger:** `Ctrl+W` / `Cmd+W`
- Calls `canvas.getActiveExplorerPlugin()?.closeActiveTab()`

### Keyboard: Cycle Cards
- **trigger:** `Ctrl+Tab` (forward), `Ctrl+Shift+Tab` (backward)
- Calls `canvas.cycleCard(direction)`

### Keyboard: File Search
- **trigger:** `Ctrl+P` / `Cmd+P`
- Calls `canvas.getActiveExplorerPlugin()?.openFileSearch()`

### Keyboard: New Terminal
- **trigger:** `Ctrl+J` / `Cmd+J`
- Calls `canvas.addTerminal(wsPath)`

### Workspace Load Flow
- **trigger:** `App.loadWorkspace(path)`
- **sequence:** `ws.setPath(path)` → `ws.load(path)` → restore plugins or create defaults → restore zoom/pan → load prefs → save state → optionally start tutorial

## DOM Structure

```html
<!-- App creates no own DOM; it populates existing elements -->
<div id="menu-bar"> <!-- TopBar renders here --> </div>
<div id="canvas">   <!-- CanvasArea renders here --> </div>
```

## States

No visual states — the App is a controller, not a visual component.
