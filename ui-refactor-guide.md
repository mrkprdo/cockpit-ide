# UI Refactor Guide — Sizing, Icons, Hit Targets, Token Drift

**Status:** Proposed, not started.
**Scope:** `src/renderer/styles-*.css` (25 files, split per component 2026-08-03 — see `AGENTS.md` source map) + component inline styles/SVG. Visual system only — no copy, no layout/IA changes, no color-palette redesign. Brand identity (Noir × Art Nouveau, dashed borders, Space Mono) stays as-is.
**Origin:** UI feel audit 2026-08-03 — user flagged app as "sloppy" on sizing/outlines/icons specifically, independent of the `/impeccable audit` technical pass (10/20, see that report for a11y/perf/theming-doc findings not repeated here except where they overlap).
**Direction:** Apple HIG-style system discipline — few sizes, one stroke weight, hit target bigger than the mark, spacing over borders where borders aren't load-bearing. Not literal macOS chrome, the *principle* of a closed, deliberate size vocabulary.

Every table below is **current → target**, file:line sourced from the running codebase (not from memory/docs). Re-verify line numbers before editing — this doc is a snapshot, files move.

---

## 0. Priority order

| Phase | What | Why first/last |
|---|---|---|
| 1 | Icon size + stroke-width token pass | Root cause of "sloppy" feel — touches every screen, no dependencies |
| 2 | Hit target sizing (`.card-btn`, resize edges) | Depends on Phase 1's icon tokens existing |
| 3 | Font-size literal sweep onto `--text-*` scale | Independent, mechanical, safe to batch |
| 4 | Radius literal sweep onto `--radius-*` scale | Independent, mechanical, 9 sites only |
| 5 | Border-to-spacing pass (non-card-signature borders) | Judgment calls, do last so 1-4's new grid is in place to judge against |

---

## 1. Icon size + stroke-width — new token, full remap

### 1.1 Add tokens

`styles-base.css :root`, alongside existing `--radius-*` block (~line 34-44):

```css
/* current: nothing exists — icon sizing is ad hoc per call site */

/* target: */
--icon-sm: 16px;   /* inline w/ text, status glyphs, tab icons */
--icon-md: 20px;   /* toolbar / card buttons, standalone controls */
```

Two sizes only. Anything currently at 12/14/18/22/24/26/28/32px maps to the nearer of the two — see 1.2.

### 1.2 Current → target, every icon site found

| File:line | Current | Target | Notes |
|---|---|---|---|
| `styles-topbar.css:27-28` | 16×16 | `--icon-sm` | already correct value, swap literal→token |
| `styles-topbar.css:127` | 28px | `--icon-md` | |
| `styles-statusbar.css:3` | 24px | `--icon-md` | |
| `styles-statusbar.css:19` | `.status-sep` 1×16px | unchanged | divider, not an icon |
| `styles-window-card.css:61-62` (`.card-btn` icon box) | 18×18 | box grows to 28×28 (Phase 2), icon inside stays `--icon-sm` | |
| `styles-window-card.css:142-143` | 16×16 | `--icon-sm` | |
| `styles-about-modal.css:105-106` | 18×18 | `--icon-sm` | |
| `styles-ai-drawer-01.css:111-112` | 24×24 | `--icon-md` | |
| `styles-ai-drawer-01.css:140` | 11px | `--icon-sm` (round up) | small enough it reads as a typo-size, verify context before bumping |
| `styles-ai-drawer-01.css:200-201` | 28×28 | `--icon-md` | |
| `styles-ai-drawer-01.css:376` | 16px | `--icon-sm` | |
| `styles-ai-drawer-01.css:407-408` | 22×22 | `--icon-md` | |
| `styles-ai-drawer-02.css:27` (`.ai-thinking-icon`) | `font-size: 9px` | leave — decorative micro-glyph, not a line icon | |
| `styles-ai-drawer-02.css:126-127` | 28×28 | `--icon-md` | |
| `styles-ai-drawer-02.css:151-152` | 28×28 | `--icon-md` | |
| `styles-ai-drawer-02.css:236-237` | 16×16 | `--icon-sm` | |
| `styles-ai-drawer-02.css:277-278` | 22×22 | `--icon-md` | |
| `styles-ai-drawer-02.css:318` | 13px | `--icon-sm` (round up) | |
| `styles-ai-drawer-02.css:419-420` | 28×28 | `--icon-md` | |
| `styles-ai-drawer-02.css:447-448` | 28×28 | `--icon-md` | |
| `styles-ai-drawer-03.css:28-29` | 28×28 | `--icon-md` | |
| `styles-ai-drawer-03.css:88-89` | 18×18 | `--icon-sm` | |
| `styles-ai-drawer-03.css:244-245` | 24×24 | `--icon-md` | |
| `styles-ai-drawer-03.css:331-332` | 28×28 | `--icon-md` | |
| `styles-ai-drawer-03.css:400,411-412` | 28px / 24×24 | `--icon-md` both | currently two different sizes doing the same job — unify |
| `styles-ai-drawer-03.css:481-482` | 20×20 | `--icon-md` (round up) | |
| `styles-ai-drawer-04.css:7` | 22px | `--icon-md` | |
| `styles-tutorial-01.css:60` | 24px | `--icon-md` | |
| `styles-git-window.css:50` | 12px | `--icon-sm` (round up) | |
| `styles-git-window.css:140` | min-width 14px | `--icon-sm` context-dependent | badge/count pill, verify before touching |
| `styles-git-window.css:161-162` | 18×18 | `--icon-sm` | |
| `styles-git-window.css:408-409` | 26×22 | `--icon-md` | non-square, likely a bug — verify design intent |
| `styles-agents-fleet.css:14` (`.agents-bubble-ring`) | 26×26 | keep as-is | ring diameter, not an icon — distinct role |
| `styles-agents-fleet.css:17` (`.agents-bubble-icon`) | `font-size: 16px` | `--icon-sm` | |
| `styles-agents-fleet.css:42` (`.agents-inspector-icon`) | `font-size: 22px` | `--icon-md` | |
| `ai-drawer/render.ts:12` | inline `width="12" height="12"` | `--icon-sm`, move to CSS class | inline SVG attrs bypass tokens entirely |
| `ai-drawer/render.ts:64` | inline `width="12" height="12"` | `--icon-sm`, move to CSS class | close button |
| `canvas-statusbar.ts:71,72,79` | inline `width="14" height="14"` ×3 | `--icon-sm`, move to CSS class | |
| `layout-overlays.ts:133-141` | `width="32" height="24"` ×7 | **exempt** | these are layout-preview diagrams, not UI icons — different role, don't force into icon scale |
| `git-window/ui-build.ts:317` | inline `width="14" height="14"` | `--icon-sm`, move to CSS class | |
| `specsmap/styles.ts:132` | `width="16" height="16"` | `--icon-sm` (already correct value) | |

### 1.3 Stroke-width — collapse to one value

| File:line | Current `stroke-width` | Target |
|---|---|---|
| `WindowCard.ts:50,55,60` | `1.5` | `1.5` (reference value, keep) |
| `ai-drawer/render.ts:12,64` | `2` | `1.5` |
| `git-window/ui-build.ts:317` | `2` | `1.5` |

Every other inline SVG in the grep pass either has no stroke (filled path) or already omits stroke-width — leave those, this is a line-icon-only rule.

**Verification after Phase 1:** re-grep `width="\d+"|height="\d+"|width:\s*\d+px|height:\s*\d+px` scoped to icon-bearing selectors — should return only `--icon-sm`/`--icon-md` and the two documented exemptions (`.agents-bubble-ring`, `layout-overlays.ts`).

---

## 2. Hit targets

| Element | File:line | Current | Target | Rationale |
|---|---|---|---|---|
| `.card-btn` | `styles-window-card.css:60-62` | 18×18 box, 2px padding → ~14px real target | 28×28 box, icon centered at `--icon-sm` (16px) | Apple toolbar-button standard: click area > mark. Icon doesn't grow, box does. |
| `.card-edge-e` | `styles-window-card.css:120-127` | 3px wide grab strip | 6px | still visually thin (can stay a 1px hairline drawn via `::after`, per `.card-edge-se`'s existing pattern at `:147-156`), but grabbable |
| `.card-edge-s` | `styles-window-card.css:129-136` | 3px tall grab strip | 6px | same pattern as above |
| `.card-edge-se` | `styles-window-card.css:138-146` | 16×16, already reasonable | unchanged | keep as reference size for the other two edges' *visual* affordance (the `::after` corner-bracket technique), even though its hit box itself doesn't need to grow |

No change to `.card-controls` gap (`styles-window-card.css:54-58`, 2px) — spacing between buttons is fine once each button's own box is bigger.

---

## 3. Font-size literal sweep → `--text-*` scale

Existing scale (`styles-base.css:21-27`, unchanged, just enforce it):

```
--text-2xs: 9px   --text-xs: 11px   --text-sm: 13px
--text-base: 14px --text-md: 15px   --text-lg: 17px   --text-xl: 18px
```

Literal (non-token) `font-size` hits by file — 91 total, mechanical map to nearest scale step, spot-check each before batch-replacing since a couple (e.g. `.ai-thinking-icon` 9px) are intentionally sub-scale decorative marks, not body text:

| File | Literal count | Action |
|---|---|---|
| `styles-*.css` (all 25, post-split) | 54 across 8 files — `styles-agents-fleet.css` (24), `styles-ai-drawer-02.css` (10), `styles-ai-drawer-01.css` (9), `styles-ai-drawer-03.css` (7), `styles-base.css`/`styles-git-window.css`/`styles-menu-state.css`/`styles-window-card.css` (1 each) | direct nearest-token swap, batch; recount post-split, original "41" total was pre-split |
| `specsmap/panel.ts` | 21 | swap; file uses inline `style="font-size:Npx"` attrs — convert to class + CSS rule while touching, don't leave inline literals even tokenized |
| `specsmap/styles.ts` | 7 | swap |
| `specsmap/empty-state.ts` | 6 | swap |
| `dev-console/DevConsoleWindow.ts` | 5 | swap — but see §6, this file has a bigger issue than font-size alone |
| `SpecsMapWindow.ts` (facade) | 5 | swap |
| `FileExplorerWindow.ts` | 3 | swap |
| `specsmap/search.ts` | 3 | swap |

---

## 4. Radius literal sweep → `--radius-*` scale

Existing scale: `--radius-2xs: 3px`, `--radius-xs: 4px`, `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`.

All 9 sites found — none of these values (2px, 5px, 10px) exist on the scale at all, so this isn't a "pick the nearest token" job, it's "these need a decision first":

| File:line | Current | Nearest token | Note |
|---|---|---|---|
| `specsmap/empty-state.ts:89` | 5px | `--radius-2xs` (3px) or `--radius-xs` (4px) | round down, small controls stay tight |
| `specsmap/panel.ts:89` | 5px | same as above | |
| `specsmap/panel.ts:125` | 10px (toggle pill) | keep as pill — `border-radius: 10px` on a 36×20 toggle is functionally `9999px`/`--radius-full` if one exists, else leave as a documented exception (pill shape, not a scale step) | verify no `--radius-full` token exists before deciding — grep confirmed none currently |
| `specsmap/panel.ts:132` | 10px (toggle pill) | same as above | |
| `specsmap/search.ts:49` | 5px | `--radius-2xs`/`--radius-xs` | |
| `specsmap/styles.ts:126` | 2px | `--radius-2xs` (3px) | |
| `styles-search-overlay.css:94` | 2px | `--radius-2xs` (3px) | |
| `styles-agents-fleet.css:79` | 10px | pill or `--radius-md` (12px) depending on shape — verify | |
| `styles-agents-fleet.css:91` | 10px | same, verify | |

**Recommendation:** add one token, `--radius-full: 9999px`, for the 4 pill/toggle sites (`panel.ts:125,132`, `styles-agents-fleet.css:79,91`) instead of forcing them onto the box-radius scale — they're a different shape category (capsule, not rounded-rect), same reasoning as Apple's `.continuous` corner being a distinct primitive from a fixed-radius rect.

---

## 5. Borders → spacing (judgment pass, do last)

Not a mechanical sweep — this one needs a human read per site. Rule: keep borders that are the *signature* (card dashed border, per PRODUCT.md principle 3 — "the dashed borders... are intentional, not default. Don't smooth them away"). Cut borders that exist only to separate two adjacent rows/blocks where a padding gap + background-shade delta would read equally clearly and quieter.

Candidates to review once Phases 1-4 land (not exhaustive — spot the pattern, apply where it fits):
- List-row dividers inside panels (file tree rows, git status rows, chat message boundaries) — check if `1px solid var(--border)` is doing real separation work or just habit.
- Toolbar-internal separators beyond `.status-sep` (`styles-statusbar.css:19`, already a deliberate 1px divider — fine, keep).

Do **not** touch: `.card` outer dashed border (signature element), `:focus-visible` outlines (a11y-load-bearing, unrelated to this cleanup), any border that's carrying a semantic-state color (selected/error/active).

---

## 6. Known blocker: `DevConsoleWindow.ts` fake token system

Not part of the sizing/icon/border sweep above, flagging because Phase 3's font-size fix touches this file. `DevConsoleWindow.ts:20-45` writes CSS via `var(--card-bg, #0F141A)`, `var(--card-header-bg, rgba(0,0,0,0.25))` — **`--card-bg` and `--card-header-bg` are not defined anywhere in `styles-*.css`**, so these always resolve to the hardcoded fallback. It also reintroduces `#00E5FF` as a fallback (`:37,40`), the stale accent color removed elsewhere per the 2026-05-31 polish pass. Fix belongs to a separate pass (token audit, not sizing) — don't fold it into Phase 3, just don't assume the `var(--x, ...)` calls in this file are real tokens when doing the font-size swap.

---

## 7. Verification checklist (run after each phase, not just at the end)

- [ ] `npm test` green
- [ ] Grep sweep per phase (commands noted inline above) returns zero unmapped literals
- [ ] Visual check: card toolbar, AI drawer toolbar, git panel, specsmap panel — at both `--icon-sm` and `--icon-md` call sites, nothing clips/overlaps at the new hit-target sizes
- [ ] `prefers-reduced-motion` and `:focus-visible` behavior unchanged (this refactor must not touch either)
- [ ] No new hardcoded hex/px introduced while "fixing" old ones — every replacement is a token, not a different literal
