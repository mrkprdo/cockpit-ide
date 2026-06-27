---
name: Plugin Card
file: src/renderer/components/PluginCard.ts
type: ui
layer: widget
singleton: false
exports: [PluginCard, CardOptions]
---

# Plugin Card

Draggable, resizable, floatable card widget that hosts all plugin UIs. Each card has a header (title text + control buttons) and a body where the plugin DOM mounts. Supports drag via mousedown on the header (snaps to 28px grid), resize via three edge handles (east, south, southeast, also snapped to 28px grid), minimize (hides card body), fit-viewport (calls `onFitViewport` to auto-pan canvas to card), and terminate (removes card and destroys its plugin). Card DOM uses CSS `position: absolute` with `left`/`top`/`width`/`height` set in world coordinates * scale + pan offset. UUID is generated via `crypto.randomUUID()`. All mouse event handlers are registered on `document` and cleaned up on `remove()`. An `arranging` CSS class is toggled for smooth transitions during auto-arrange.

## Dependencies

No imports from `src/`.

## Referenced By

- **Canvas Area** `src/renderer/components/CanvasArea.ts` — instantiates all PluginCard instances via `new PluginCard(parent, opts, getTransform)`

## IPC Channels

None — DOM-only widget.
