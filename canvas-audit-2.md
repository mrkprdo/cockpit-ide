# Canvas Panning & Window Dragging — Audit Findings Register (2)

> Findings distilled from `canvas-audit-1.md` (investigation) — evidence-grounded register.
> Method: static code audit of `src/renderer` (no code changes, no runtime profiling yet).
> Confidence: **C = confirmed by code** · **P = partially confirmed, needs runtime profile**.

## 1. Findings summary

| ID | Finding | Severity | Confidence | Effort |
|----|---------|----------|------------|--------|
| F1 | Single composited world layer holds grid + all cards; no per-card layer promotion | **High** | C | Med |
| F2 | Card drag uses 2D `translate()` without `will-change` → not reliably GPU-promoted | **High** | C | Low |
| F3 | `.card:hover` 32px-blur box-shadow active during drag (no suppression) | **High** | C | Low |
| F4 | z-index churn (`bringToFront`) on every mousedown → full-layer repaint at drag start | Med | C | Low |
| F5 | Zoom `scale()` re-rasters 8000×4500 world; oversize texture at scale ≥ 2 | Med | P | Med |
| F6 | 8000×4500 grid pattern painted inside the world layer | Med | C | Med |
| F7 | Full workspace save (serialize + IPC + fs write) after every gesture | Low | C | Low |
| F8 | GPU shader-cache creation fails (Access denied); no GPU flags set in main | Low–Med* | C* | Low |
| F9 | Card **resize** writes `width/height` per mousemove, unbatched (layout thrash) | Med | C | Low |

\* F8 impact depends on `chrome://gpu` (hardware vs SwiftShader) — logs confirm the cache
failure; whether compositing has fallen back to software is unverified.

## 2. Detailed findings

### F1 — One giant layer holds everything (no layer isolation) · High
- Evidence: `CanvasArea.ts:117–133` — grid, boundary, origin dot, and (via
  `card-lifecycle.ts`) all cards are children of `.canvas-world`. `styles-canvas.css:9–17`
  — `.canvas-world` is the only element with any `will-change`; `.card`
  (`styles-window-card.css`) has no `will-change` / `translateZ(0)` / compositing trigger.
- Impact: any repaint in any card (xterm canvas redraws, Monaco cursor blink, terminal
  output, AgentsWindow `innerHTML` rewrites at `AgentsWindow.ts:189/198`, git/explorer DOM
  updates) dirties the whole world texture. Mid-pan, the frame pays a re-raster of a huge
  region instead of a pure GPU translate. This is the systemic cause behind the "panning
  fights the app" feel.
- Action: per-card compositing (see R1).

### F2 — Drag transform is 2D and unpromoted · High
- Evidence: `WindowCard.ts:151` `el.style.transform = translate(dx, dy)` (2D) with no
  `will-change` anywhere on `.card`. In Blink, static 2D transforms are not guaranteed
  compositing triggers (unlike `translate3d`/`will-change`).
- Impact: every drag frame is a main-thread repaint of the card region (incl. Monaco/xterm
  content) inside the world texture instead of a composite-only move → the jankiest path.
- Action: see R1/R2.

### F3 — Blurred hover shadow re-rasterized every drag frame · High
- Evidence: `styles-window-card.css` `.card:hover { box-shadow: 0 8px 32px rgba(...) }`.
  Pan suppresses it via `.is-navigating` (`styles-canvas.css:22–25`), but `WindowCard` drag
  never enters navigating state (no `is-dragging` equivalent exists).
- Impact: 32px gaussian blur over the whole dragged card, repainted per frame, on top of F2.
- Action: see R3.

### F4 — z-index churn at drag start · Med
- Evidence: `WindowCard.ts` capture-phase `mousedown → opts.onFocus` →
  `card-lifecycle.ts:232` `bringToFront()` → z-index rewrite.
- Impact: stacking-order change inside an unpromoted layer invalidates paint → full-layer
  repaint = "first-frame hitch" at the start of every drag.
- Action: see R4.

### F5 — Zoom re-rasters the world at new scale · Med
- Evidence: `canvas-grid.ts:52` `translate3d(...) scale(scale)` on the world layer;
  `viewport.ts` `clampScale` allows up to `5`; world is 8000×4500 (`viewport.ts:9–10`).
- Impact: each zoom step re-rasters up to 8000×4500; at scale ≥ 2 the texture reaches
  16k×9k (~576 MB RGBA) — tile thrash / possible software-raster fallback. Pan-while-zoomed
  keeps the oversized layer alive.
- Action: see R5.

### F6 — Grid pattern inside the world layer · Med
- Evidence: `canvas-grid.ts:22–38` `applyGridPattern` paints a repeating data-URL over the
  full 8000×4500 layer (`CanvasArea.ts:122–129`).
- Impact: inflates the layer's painted area (raster cost, tile count) for zero visual gain
  during pan.
- Action: see R6.

### F7 — Workspace save after every gesture · Low
- Evidence: pan end → `viewport.ts` `endNavigating → scheduleTransform(true)` →
  `CanvasArea` `onStateChange` → `App.ts` `trySave()` (300 ms debounce) → `getSaveState()`
  serialization + IPC + fs write. Same for every drag end.
- Impact: one full-state save per gesture; stacks into a post-gesture hitch with many cards.
- Action: see R7.

### F8 — GPU environment degraded · Low–Med (conditional)
- Evidence: `electron-stderr.log` — `Gpu Cache Creation failed: -2` (Access denied) ×6;
  `main.ts` sets no GPU flags (no `disableHardwareAcceleration`, no
  `ignore-gpu-blocklist`, no `enable-gpu-rasterization`).
- Impact: on VM/RDP/weak iGPU, Chromium may silently run SwiftShader → transform-heavy
  panning *always* slow regardless of code fixes.
- Action: see R8 (verify first).

### F9 — Card resize is unbatched (bonus, same interaction family) · Med
- Evidence: `WindowCard.ts` `initResize` `onMouseMove` writes `style.width/height` +
  tooltip `textContent`/`left/top` synchronously on every mousemove — no rAF.
- Impact: layout thrash per resize frame (unlike drag, which is rAF-batched).
- Action: rAF-batch resize like drag; throttle tooltip.

## 3. What is already correct (don't waste effort here)

- Pan & drag writes are **rAF-coalesced** — one transform string per frame
  (`CanvasArea.ts` `scheduleTransform`, `WindowCard.ts` `dragRafId`).
- Pan transform is `translate3d` (compositor-friendly) and the world gets
  `will-change: transform` while navigating.
- Drag commits `left/top` once on mouseup (no per-frame layout writes).
- Snap-to-grid math is trivial; no heavy per-frame computation.
- `TerminalWindow` already avoids PTY resize on canvas zoom (zoom via CSS transform;
  `ResizeObserver` only reacts to physical size changes).
- `.canvas-world` has `contain: layout style` and cards `overflow: hidden` (children clip).

## 4. Open items — runtime verification still to run

1. **Layer borders** (DevTools → Rendering): confirm one yellow border around world, none
   per card → validates F1/F2.
2. **Performance profile** of a drag + a pan: long Paint/Rasterize tasks (F1–F4) vs pure
   GPU tasks; measure with a streaming terminal vs idle (content-churn dependence).
3. **`chrome://gpu`**: hardware vs SwiftShader for Canvas/Compositing → decides F8 severity.
4. **Shadow A/B test**: remove `.card:hover` box-shadow, re-drag → quantifies F3's share.
5. **Zoom-while-panning** profile at scale 2–3 → validates F5's texture-cost hypothesis.

## 5. Recommended action order (for implementation follow-up)

### Phase 1 — quick wins (Low effort, biggest perceived gain)
- **R1/R2:** add `will-change: transform` to `.card` (or `translateZ(0)`), switch drag to
  `translate3d`. Per-card GPU promotion isolates content invalidation.
- **R3:** add `.is-dragging` class during drag and suppress `.card:hover` box-shadow
  (mirror the existing `.is-navigating` pattern); keep blurred shadow only on focused card.
- **R7:** skip workspace save during/right after gestures (save on idle only).
- **R9:** rAF-batch resize writes; throttle the resize tooltip.

### Phase 2 — structural (Med effort)
- **R6:** move grid + boundary to a fixed background layer on `#canvas`, syncing
  `background-position` to pan (precedent: deprecated `applyGridToElement`). World layer
  then contains cards only.
- **R4:** defer z-index writes to drag/pan end (or rely on per-card layers, where z-order
  changes become compositor-only).
- **R5:** clamp max zoom (e.g. 2.5×) or re-render content at zoom instead of GPU-scaling
  the giant layer.

### Phase 3 — environment (verify first)
- **R8:** check `chrome://gpu`; if software compositing, add
  `app.commandLine.appendSwitch('ignore-gpu-blocklist')` / confirm GPU rasterization;
  fix the GPU disk-cache permission failure.

Re-measure after each phase (open items §4) to attribute wins per finding.
