---
name: Top Bar
file: src/renderer/components/TopBar.ts
type: ui
layer: widget
singleton: true
exports: [TopBar]
---

# Top Bar

Custom menu bar with dropdown menus rendered entirely via `innerHTML` template strings. Provides File menu (New, Open Folder, Close Window), Edit menu (Undo, Redo, Cut, Copy, Paste), View menu (Zoom In, Zoom Out, Reset Zoom, Theme toggle), Tools menu (Command Palette, Terminal, Explorer, Markdown Viewer, Git, AI Chat, Theme Settings, Tutorial), and Help menu (About, Website). Dispatches callbacks for every menu action. Handles menu open/close state, click-outside-to-close behavior, and keyboard navigation (Escape to close).

## Dependencies

- **theme** `../theme` — calls `theme.toggle()` from View → Theme menu item

## Referenced By

- **app** `src/renderer/components/App.ts` — creates and mounts TopBar to `#menu-bar`

## IPC Channels

None — delegates actions to App callbacks.

## Interface

### Classes

- **TopBar**
  - **constructor** `(callbacks: TopBarCallbacks): TopBar` — renders menu bar into container
  - **render** `(): void` — rebuilds full menu DOM
  - **onNewWindow** — callback `() => void`
  - **onOpenFolder** — callback `() => void`
  - **onCloseWindow** — callback `() => void`
  - **onUndo** / **onRedo** — callback `() => void`
  - **onCut** / **onCopy** / **onPaste** — callback `() => void`
  - **onZoomIn** / **onZoomOut** / **onResetZoom** — callback `() => void`
  - **onToggleTheme** — callback `() => void`
  - **onCommandPalette** — callback `() => void`
  - **onOpenTerminal** — callback `() => void`
  - **onOpenExplorer** — callback `() => void`
  - **onOpenMarkdown** — callback `() => void`
  - **onOpenGit** — callback `() => void`
  - **onOpenAiChat** — callback `() => void`
  - **onOpenThemeSettings** — callback `() => void`
  - **onTutorial** — callback `() => void`
  - **onAbout** — callback `() => void`
  - **onWebsite** — callback `() => void`
  - **el** `HTMLDivElement` — root menu bar DOM

## Lifecycle

- **created_by:** `App` constructor, mounted to `#menu-bar`
- **destroyed_by:** App destruction

## External Dependencies

None.

## Test

`src/renderer/components/TopBar.test.ts`
