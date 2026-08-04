# Canvas Panning & Window Dragging — Performance Audit (1)

> Investigation only — no code changes made.
> Date: 2026-08-04 · Scope: `src/renderer` canvas/window-card rendering paths

## 1. Architecture (how it works today)

**Rendering model:** the entire canvas is **one composited layer** — `.canvas-world` gets
`translate3d(panX, panY, 0) scale(zoom)` via `applyViewTransform()` (`canvas-grid.ts`).
Everything lives inside it:

- the 8000×4500 grid layer + boundary + origin dot (`CanvasArea.ts`)
- **every** window card, including Monaco editors, xterm terminals, the file tree, the
  SpecsMap SVG graph, and the Agents fleet UI (cards are appended to `worldEl` in
  `card-lifecycle.ts`; Monaco mounts into `.card-body` via `ExplorerWindow`)

**Pan hot path** (`CanvasArea.ts` `boundMouseMove`): mousemove → set `panX/panY` →
`beginNavigating()` → rAF-coalesced `scheduleTransform()` → write one `transform` string.
That part is correctly rAF-batched and cheap.

**Drag hot path** (`WindowCard.ts` `applyDrag`): mousemove → rAF → set
`el.style.transform = translate(dx, dy)` (2D) → commit `left/top` once on mouseup.

**Per-gesture tail:** every pan/drag end → `endNavigating()` → `scheduleTransform(true)` →
`onStateChange()` → `trySave()` → (300 ms debounce) → `getSaveState()` + IPC +
**full workspace JSON write**.

The code comments claim "compositor-only, no reflow" — **that assumption is where the lag
comes from**. Here is what is actually happening.

## 2. Root causes, ranked

### 2.1 Zero layer isolation — one giant layer holds everything · highest impact
`.canvas-world` is one composited texture containing the grid **and** all cards. `.card`
has **no `will-change`, no `translateZ(0)`, no compositing trigger** (verified: the only
`will-change` in the CSS is on `.canvas-world`, `styles-canvas.css`). So card content is
painted *into* the world layer's texture, not onto its own GPU surface.

Consequence: **any repaint anywhere in the world dirties the giant layer** — and there is
constant repaint in an IDE: xterm cursor blink/canvas redraws, Monaco cursor blink,
terminal output, AgentsWindow `innerHTML` rewrites on agent activity
(`AgentsWindow.ts:189/198`), git/explorer DOM updates. When one of those lands mid-pan,
the frame pays a re-raster of a huge region instead of a pure GPU translate. Panning
therefore feels like it is "fighting" the app's normal content churn.

### 2.2 Dragged card is not reliably promoted to its own layer
The drag writes a **2D** `translate(...)` (`WindowCard.ts:151`) with no `will-change` on
`.card`. In Blink, a static 2D transform is *not* a guaranteed compositing trigger
(unlike `translate3d` / `will-change: transform` / animations). If the card stays inside
the world layer, **every drag frame is a main-thread repaint of the card region inside the
world texture** — including Monaco/xterm content — instead of a composite-only move. This
is the most likely direct cause of janky dragging.

### 2.3 `.card:hover` 32px-blur box-shadow stays active during drag
`.card:hover { box-shadow: 0 8px 32px ... }` (`styles-window-card.css`). The
`.is-navigating` class (added on pan) suppresses it — but **drag does not enter navigating
state**, so the dragged card re-rasterizes a blurred shadow on every drag frame. A 32px
gaussian blur over the whole card every frame is expensive on its own, on top of 2.2.

### 2.4 z-index churn on every mousedown
`WindowCard` fires `onFocus` on mousedown (capture) → `bringToFront()` → z-index rewrite
(`card-lifecycle.ts`). Inside a single un-layered texture, a stacking-order change
invalidates paint → a full-layer repaint at the *start* of every drag (the "first-frame
hitch").

### 2.5 Zoom re-rasters the whole world at the new scale
`scale()` on the world layer means each zoom step re-rasters up to 8000×4500 px at the
new resolution; at scale 2+ the texture approaches/exceeds comfortable GPU size
(16k×9k = 576 MB RGBA) and can push Chromium into tile thrash / software raster. Panning
while zoomed keeps that oversized layer alive. (Tiled raster mitigates this partly —
needs profiling to quantify.)

### 2.6 The 8000×4500 grid pattern is *inside* the world layer
`applyGridPattern` paints a repeating data-URL background over the full world bounds
(`canvas-grid.ts`), inflating the layer's painted area. It should be its own background /
tile layer, not part of the card layer.

### 2.7 Per-gesture workspace save
Each pan/drag end → `trySave()` → full `getSaveState()` serialization + IPC + file write
(`App.ts`). Not per-frame, but it stacks with heavy interaction and can add a post-gesture
hitch (especially with many cards).

### 2.8 Environment flags to check
- `electron-stderr.log` shows **`Gpu Cache Creation failed: -2` (Access denied)** — the
  GPU *shader disk cache* cannot be created. GPU compositing itself is not confirmed dead,
  but the environment is already degrading GPU paths.
- Main process sets **no GPU flags** (`main.ts` — no `disableHardwareAcceleration`, no
  `ignore-gpu-blocklist`). On a VM / RDP / laptop with a weak iGPU, Chromium silently
  falls back to SwiftShader (software compositing) — transform-heavy panning is then
  *always* slow. **Verify with `chrome://gpu` before assuming the code is the whole story.**

## 3. How to confirm (before fixing)

1. Run the app with DevTools → **Rendering → "Layer borders"**. Expect: one big yellow
   border around the world; cards inside it with no borders of their own → confirms 2.1/2.2.
2. **Performance tab** → record a drag and a pan. Look for long **Rasterize Paint / Paint**
   tasks (main-thread repaint = 2.1/2.2/2.3) vs. only **GPU** tasks.
3. `chrome://gpu` → check "Graphics Feature Status: Canvas/Compositing" for **hardware vs
   SwiftShader** (2.8).
4. Temporarily remove the `.card:hover` box-shadow → drag again. If drag smooths out, 2.3
   is confirmed as the dominant drag cost.
5. Drag while nothing else is animating (no terminal output) vs. with a streaming terminal —
   the delta shows how much 2.1 depends on content churn.

## 4. Recommended fix directions (in order of ROI — for a follow-up implementation)

1. **Promote each card to its own composited layer** — `will-change: transform` (or
   `translateZ(0)`) on `.card`, and use `translate3d` in the drag transform. Isolates
   content invalidation per card; drag becomes a true composite-only move.
2. **Suppress the hover shadow during drag** (add an `.is-dragging` class analogous to
   `.is-navigating`), and only run the blurred shadow on the *focused* card.
3. **Move grid + boundary out of the card layer** — e.g. a fixed background layer on
   `#canvas` whose `background-position` is synced to pan (there is already a deprecated
   `applyGridToElement` doing exactly this), keeping the world layer for cards only.
4. **Avoid z-index repaints during interaction** — defer `bringToFront` z-index writes to
   pan/drag end, or make cards layers (then z-order changes are compositor-only).
5. **Cheap wins in the hot path:** skip the workspace save right after pan/drag (save on
   idle only), and consider clamping zoom (e.g. 2.5×) or re-rendering content at zoom
   instead of GPU-scaling the giant layer.
6. **Environment:** verify `chrome://gpu`; if software-compositing, add
   `app.commandLine.appendSwitch('ignore-gpu-blocklist')` / confirm GPU rasterization is
   enabled; fix the GPU cache permission issue.

## 5. Bottom line

The architecture's core assumption ("one compositor layer = fast pan") is only valid if
that layer never repaints. In an IDE with live terminals, editors, and agent UI inside the
same layer, it repaints constantly — so panning pays for content churn, and dragging pays
for an un-promoted card + a blurred hover shadow. The fix is layer isolation (per-card
compositing) + suppressing per-frame paint triggers, not changing the pan math (which is
already correct).
