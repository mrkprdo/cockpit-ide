# Feature Request: "Fit Card to Viewport" Command

## Problem

There is no way to make a canvas card fill the entire visible viewport area at 100% zoom in one step. Currently, users must manually:

1. Note their viewport / screen resolution
2. Call `resize_card` with the correct width/height
3. Call `move_card` to reposition to the viewport origin (0,0)
4. Call `set_view` to reset pan/zoom to 1× (or preserve current zoom)

This is tedious, imprecise, and not responsive to different screen sizes. The `auto_arrange` tool does not solve this — it only arranges all cards in a grid and does not scale any card to fill the viewport.

## Proposed Solution

### Option A: New Tool — `fit_card_to_viewport`

Add a new canvas API tool:

```
fit_card_to_viewport(title: string, zoom?: number)
```

**Behaviour:**
- Resizes the specified card to fill the **current viewport dimensions** (width × height of the visible canvas area).
- Optionally sets the canvas zoom (defaults to 1.0 / 100%).
- Pans the canvas so the card is positioned at the viewport origin.
- If the card has a title (e.g. "Markdown"), that card is brought to front and focused.

**Implementation notes:**
- The viewport size should be derived from the **canvas container element** (`clientWidth` / `clientHeight`) in the renderer process.
- The tool should work for any card type (Markdown, Explorer, Terminal, Git, SpecsMap).
- If `zoom` is provided, apply it after calculating dimensions to avoid off-by-one resizing.

### Option B: Right-click Context Menu Action

Add a **"Fit to Viewport"** action to the right-click context menu on every card's title bar.

**Behaviour:**
- On click, the card resizes to fill the viewport at current zoom level.
- Same underlying logic as Option A, but triggered by the user via the UI rather than the API.

### Option C: Dedicated "Maximize" Button

Add a **maximize/fullscreen icon** (🗖) to each card's title bar (next to the close/minimize buttons).

**Behaviour:**
- Toggles between "normal" size and "fill viewport" size.
- Stores the previous size/position so the user can restore it easily.
- This is the most intuitive UX but requires UI changes.

## Recommended Implementation (Hybrid)

Implement **Option A (API tool)** first, then expose it in the UI as **Option C (maximize toggle button)** . The internal logic is shared:

```
// internal helper
function fitCardToViewport(cardId: string, viewportWidth: number, viewportHeight: number) {
  const card = canvasState.cards.find(c => c.id === cardId);
  if (!card) return;

  card.storePreviousSize(); // save {w, h, x, y} for restore
  card.setPosition({ x: 0, y: 0 });
  card.setSize({ width: viewportWidth, height: viewportHeight });
  canvasView.setZoom(1.0);
  canvasView.setPan({ x: 0, y: 0 });
  card.focus();
}
```

The "restore" behaviour would simply set the card back to its stored previous size/position.

## Affected Components

- **Canvas system** (`src/canvas/`) — card sizing/positioning logic
- **Plugin cards** (`src/plugins/`) — each card type should handle resize events gracefully
- **API tool registry** (`src/tools/`) — new tool registration
- **Context menu** (if Option B) or **title bar UI** (if Option C)

## Acceptance Criteria

- [ ] `fit_card_to_viewport(title)` API tool exists and works from the agent
- [ ] The card fills the entire visible canvas area at 100% zoom
- [ ] The card is brought to front / focused
- [ ] Works for all card types
- [ ] (Optional) A UI toggle button exists to fit/restore
- [ ] (Optional) Fit state is persisted and restored on re-open

---

*Drafted by Cockpit Agent — feel free to edit, expand, or ticket this in your project tracker.*
