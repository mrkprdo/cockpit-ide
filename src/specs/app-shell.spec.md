---
name: App Shell
file: src/renderer/index.html
type: entry
layer: foundation
singleton: true
exports: []
---

# App Shell

The single HTML page loaded by Electron's `BrowserWindow.loadFile`. Defines the static DOM skeleton: a frameless title bar (`#titlebar`) with drag region, menu bar placeholder, and window control buttons (minimize, maximize, close); an infinite canvas container (`#canvas`); a status bar (`#statusbar`); and a Content-Security-Policy that restricts script/style sources. Loads `styles.css`, `xterm.css`, and the compiled renderer bundle `index.js`. Also loads Google Fonts (Space Mono) from CDN.

## Dependencies

- **Styles** `src/renderer/styles.css` — linked as `<link rel="stylesheet" href="styles.css">`
- **Renderer Entry** `src/renderer/index.ts` — loaded as `<script src="index.js"></script>`

## Referenced By

- **Main Process** `src/main/main.ts` — calls `mainWindow.loadFile(path.join(..., 'index.html'))`

## IPC Channels

None — static HTML.
