---
name: Plugin Card
file: src/renderer/components/PluginCard.ts
type: ui
layer: widget
singleton: false
exports: [CardOptions, PluginCard]
---

# Plugin Card

Draggable, resizable, focusable card widget that wraps a plugin's content DOM. Provides header bar with title, control buttons (minimize, maximize, close), and 8 resize handles (corners + edges). Drag is initiated via `mousedown` on the `.card-header`, constrained by the parent container bounds. Resize uses the 8-directional edge handles with minimum dimension enforcement (200x100). Focus is managed globally — clicking a card raises its z-index and adds a highlight border.

## Dependencies

None — standalone card widget with no project imports.

## Referenced By

- **canvas-area** `src/renderer/components/CanvasArea.ts` — creates PluginCard instances for every loaded plugin

## IPC Channels

None.

## Interface

### Types

- **CardOptions** — `{ title: string; x: number; y: number; width: number; height: number; minWidth?: number; minHeight?: number; onClose?: () => void; onFocus?: () => void; onDragEnd?: (x: number, y: number) => void; onResizeEnd?: (width: number, height: number) => void }`

### Classes

- **PluginCard**
  - **constructor** `(container: HTMLElement, options: CardOptions): PluginCard`
  - **getBodyElement** `(): HTMLElement` — returns the card body container for plugin content mounting
  - **setTitle** `(title: string): void` — updates header title text
  - **focus** `(): void` — brings card to front, applies focus styling
  - **setBounds** `(x: number, y: number, w: number, h: number): void` — programmatic position/size
  - **destroy** `(): void` — removes card DOM and cleans up listeners
  - **id** `string` — unique UUID
  - **el** `HTMLDivElement` — root card DOM element

### Events

- **onDragStart** — callback `(x: number, y: number) => void`
- **onDrag** — callback `(dx: number, dy: number) => void`
- **onDragEnd** — callback `(x: number, y: number) => void`
- **onResizeStart** — callback `() => void`
- **onResize** — callback `(width: number, height: number) => void`
- **onResizeEnd** — callback `(width: number, height: number) => void`
- **onFocus** — callback `() => void`
- **onClose** — callback `() => void`

## State

Card position, size, z-index, title, and minimize state are stored as instance properties. Serialized to `EditorState` via CanvasArea for persistence.

## Lifecycle

- **created_by:** `CanvasArea.addPlugin()` when adding a new plugin card
- **destroyed_by:** close button → `CanvasArea.removeCard()` → `card.destroy()`

## External Dependencies

None.

## Test

`src/renderer/components/PluginCard.test.ts`
