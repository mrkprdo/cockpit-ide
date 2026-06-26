---
name: HTML Shell
file: src/renderer/index.html
type: ui
layer: foundation
singleton: true
exports: []
---

# HTML Shell

The single HTML file loaded by Electron's BrowserWindow. Provides the structural DOM skeleton: `#titlebar` with window controls (minimize/maximize/close buttons) and brand logo, `#canvas` container for the infinite canvas, `#statusbar` for status messages, and `#menu-bar` for the TopBar mount point. Loads `styles.css`, `xterm.css`, and `index.js` (renderer bundle). Implements a Content Security Policy restricting script sources to self and Monaco AMD loader origins.

## Dependencies

None — static HTML with no JS imports.

## Referenced By

None — loaded directly by Electron main process as the BrowserWindow HTML.

## IPC Channels

None — purely structural DOM.

## Interface

### DOM Elements

- `#titlebar` — draggable window title bar
- `#titlebar-logo` — brand icon container
- `#titlebar-buttons` — window control buttons (minimize, maximize, close)
- `#canvas` — infinite canvas container
- `#statusbar` — status bar container
- `#menu-bar` — TopBar mount point
- `#theme-toggle` — dark/light theme toggle button

## Test

None — tested implicitly via all renderer component tests.
