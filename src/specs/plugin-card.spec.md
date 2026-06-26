---
name: Plugin Card
file: src/renderer/components/PluginCard.ts
type: ui
layer: widget
singleton: false
exports: [PluginCard, CardOptions]
---

# Plugin Card

Draggable, resizable card container that hosts any plugin type on the canvas. Renders a header with title, minimize/fit-viewport/close buttons, and a body div for plugin content. Supports mouse-drag repositioning with 28px grid snapping, edge-based resize (E/S/SE corners), and header double-click to fit viewport. Each card generates a unique UUID via crypto.randomUUID(). Card state (position, size) is managed through callbacks.

## Referenced By

- [[canvas-area.spec.md|canvas-area]] `src/renderer/components/CanvasArea.ts`

## Interface

### Methods

- **constructor** `(parent: HTMLElement, opts: CardOptions, getTransform: () => { scale: number; panX: number; panY: number })` — Builds card DOM with header, body, edges; wires drag/resize event handlers
- **renderTitle** `(): void` — Updates header title text if changed
- **setContent** `(html: string): void` — Replaces card body with HTML content
- **remove** `(): void` — Detaches event listeners, calls onDestroy, and removes DOM element

### Properties

- **el**: HTMLDivElement — Root card DOM element
- **opts**: CardOptions — Configuration options including callbacks for drag/resize/focus/minimize/terminate
- **uuid**: string — Unique identifier generated via crypto.randomUUID()
- **onDestroy**: (() => void) | null — Callback invoked when card element is removed

## Lifecycle

- **created_by:** CanvasArea.addTerminal/addExplorer/addGit/addMarkdown/addSpecsmap
- **destroyed_by:** CanvasArea.terminateCard() or user clicking X button

