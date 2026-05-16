# Cockpit IDE — Architecture

## Stack

- **Runtime:** Electron
- **Language:** TypeScript
- **Bundler:** esbuild (renderer), tsc (main/preload)
- **Text Rendering:** @chenglou/pretext (canvas-based text measurement & layout)

## Project Structure

```
cockpit-ide/
├── src/
│   ├── main/           # Electron main process
│   │   └── main.ts     # Window creation, IPC handlers
│   ├── preload/        # Context bridge
│   │   └── preload.ts
│   ├── renderer/       # UI (browser process)
│   │   ├── index.html  # Shell HTML
│   │   ├── styles.css  # All styles
│   │   ├── theme.ts    # Dark/light theme toggle
│   │   └── components/
│   │       ├── App.ts          # App root — wires everything
│   │       ├── TopBar.ts       # Title bar + menus
│   │       ├── CanvasArea.ts   # Infinite canvas, pan/zoom, grid
│   │       ├── PluginCard.ts   # Draggable card with pretext rendering
│   │       └── PreferencesModal.ts
│   └── global.d.ts    # Electron API types
├── resources/
│   └── resources.qrc  # (Qt legacy, unused)
├── ARCHITECT.md
├── DESIGN.md
├── Makefile
├── package.json
├── tsconfig.main.json
└── tsconfig.renderer.json
```

## Key Concepts

### Canvas Grid
The background grid (dots/grid/none) is rendered via CSS `background-image` with a small generated pattern. It repeats infinitely and scales with zoom via `background-size`.

### Pan & Zoom
Pan is left-click drag on the canvas. Zoom is mouse wheel. Cards are positioned mathematically: `screenPos = worldPos × scale + panOffset`. All text in cards is rendered on canvas via pretext.

### Plugin Cards
Draggable, closable cards positioned on the infinite canvas. Each card stores its world coordinates and is repositioned on every zoom/pan frame. The header text is rendered with pretext.

### Theme
Dark/light toggle via CSS custom properties on `:root`. A `Theme` singleton object applies the switch. The grid pattern regenerates on toggle to pick up the new color.
