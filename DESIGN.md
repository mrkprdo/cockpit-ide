# Cockpit IDE — Design System

Implementation reference for the shipped UI. Everything below is read from the
running code — `src/renderer/styles-base.css` (token declarations) and
`src/renderer/theme.ts` (runtime palette overrides). If a value here disagrees
with those two files, those files win; this document is descriptive, not
normative.

## Identity

**Noir × Art Nouveau × Floating.**

- **Noir** — deep, low-chroma navy surfaces; light type on dark by default; a
  single muted teal accent, never saturated blocks of color.
- **Art Nouveau** — curves are reserved for the canvas layer (grid, node
  connections, agent bubble graph) and for ornament-free hairline separators.
  UI chrome is rectilinear.
- **Floating** — the unit of layout is a *card hovering over a canvas*, not a
  tab in a dock. Depth, offset and stacking carry hierarchy; there is no
  document frame, no window chrome inside the app.
- **Type** — a single monospace stack: `'Space Mono', 'Courier New', monospace`,
  declared once as `--font`.
- **Radius** — 8px is the default (`--radius` → `--radius-sm`). Cards sit one
  step above it at 12px; small controls at 3–4px. See *Shape*.

Dashes are **not** a global motif. `border-style: dashed` ships in exactly two
places: the agent PoV strip (waiting/replay states in `styles-ai-drawer-05.css`)
and the dev-console header/inputs (`DevConsoleWindow.ts`), plus the SpecsMap
search bar. Card, panel and modal borders are solid `1px var(--border)`.

## Tokens

Tokens live in `:root` in `styles-base.css`. `theme.ts` re-writes the fourteen
color tokens inline on `document.documentElement` whenever the theme changes, so
a palette swap is a token swap — no component knows the palette.

### Color

| Token | Dark (default) | Light (default) | Role |
|---|---|---|---|
| `--bg` | `#161C24` | `#f8f8f8` | app background, canvas void |
| `--surface` | `#1C2538` | `#eeeeee` | cards, top bar, modals, menus |
| `--panel` | `#243248` | `#e0e0e0` | raised controls, hover fills, inputs |
| `--primary` | `#C8D6E5` | `#1a1a1a` | body and title text |
| `--secondary` | `#78909C` | `#3a3a3a` | secondary labels |
| `--tertiary` | `#7894A3` | `#6a6a6a` | muted text, icons, hints (4.79:1 on `--surface` in dark — WCAG AA) |
| `--border` | `#2A3A4A` | `#bbbbbb` | every 1px hairline |
| `--accent` | `#4B9EB5` | `#2A7A8C` | primary accent: focus rings, active tab, links, selection |
| `--accent2` | `#7B6FA0` | `#5A4F7A` | second accent: agent/structural highlights |
| `--green` | `#4C9A6E` | `#3A7A56` | success, additions, live state |
| `--amber` | `#C68B00` | `#9A6B00` | warning, minimize hover |
| `--red` | `#D44F4F` | `#C04040` | destructive, errors, close hover |
| `--onAccent` | `oklch(97% 0.006 20)` | `#ffffff` | text on accent/danger fills |
| `--scrim` | `rgba(8,14,22,0.72)` | `rgba(0,0,0,0.35)` | modal backdrop |

Palettes are selectable per base × mode in `theme.ts`:

| Base | Character |
|---|---|
| `default` | noir navy (the values above) |
| `monokai` | warm charcoal, lime/magenta accents |
| `idol` | near-black with coral/pink accents |
| `carbon` | pure black with orange accent |
| `alien` | olive-green surfaces, sage/ochre accents |

Each base ships a dark and a light variant. Light mode is a real palette, not an
inversion — surfaces stay flat (`#f8f8f8` → `#eeeeee` → `#e0e0e0`) and the
accents are darkened for contrast.

### Type

`--font` is the whole type system: one family, one weight (700) for anything
that is a label, title, badge or button; 400 for body text. Italic is reserved
for empty/pending copy (`.git-changes-empty`, `.ai-tool-result-pending`) — it
never marks emphasis.

`html, body` sets `font-size: 16px` as the rem anchor, so every `rem` token is
exact. Body text carries `letter-spacing: 0.01em` — the light-on-dark
compensation — while tiny all-caps labels add their own tracking (most commonly
`0.05em`, up to `0.2em` for eyebrow badges).

| Token | Size | Used for |
|---|---|---|
| `--text-2xs` | 0.5625rem (9px) | eyebrow labels, spec keys, agent badges |
| `--text-xs` | 0.6875rem (11px) | all UI chrome: menus, tabs, status bar, buttons |
| `--text-sm` | 0.8125rem (13px) | card titles, primary UI text |
| `--text-base` | 0.875rem (14px) | readable body text |
| `--text-md` | 0.9375rem (15px) | compact titles |
| `--text-lg` | 1.0625rem (17px) | step headers, display moments |
| `--text-xl` | 1.125rem (18px) | largest heading in the app (markdown `h1`) |

**Nothing in the UI is larger than 18px.** Hierarchy comes from weight, color
(`primary` → `secondary` → `tertiary`), spacing and casing — not from display
type.

Line heights: `--lh-tight` 1.2 (single-line chrome), `--lh-ui` 1.45 (default,
set on `body`), `--lh-loose` 1.6, `--lh-read` 1.7 (markdown prose).

### Shape

| Token | Value | Applied to |
|---|---|---|
| `--radius-2xs` | 3px | chips, badges |
| `--radius-xs` | 4px | buttons, menu items, inputs, small controls |
| `--radius-s` | 6px | popovers, floating panels, code blocks |
| `--radius-sm` / `--radius` | 8px | default radius (`--radius` aliases it); used sparingly — drawer inputs, PoV tabs |
| `--radius-md` | 12px | window cards, modals |
| `--radius-lg` | 16px | large surfaces |
| `--radius-full` | 9999px | pills, capsules, status dots |

Distinct small radii dominate by count (`--radius-xs` 28 uses, literal `4px` 18,
`3px` 8) because the UI is made of dense controls; the 12px card radius is what
the eye reads as "the Cockpit shape". Border radius is never used to fake depth.

### Elevation

One shadow token, used sparsely:

```
--shadow: rgba(0,0,0,0.30) 0 6px 20px, rgba(0,0,0,0.20) 0 3px 10px;
```

- **Resting card** — no shadow. Cards are separated from the canvas by their
  `--surface` fill and a 1px `--border`.
- **Hovered card** — `var(--shadow)` plus `border-color: var(--tertiary)`.
- **Dragging / panning** — `box-shadow: none`. Suppressing the blur during a
  gesture is a deliberate paint optimization (`styles-window-card.css`,
  `.canvas-world.is-navigating`), not a state change.
- **Floating overlays** (context menu, resize tooltip, git popover) — `var(--shadow)`.
- **Modals** — a deeper, hand-written stack (`0 16px 48px rgba(0,0,0,0.45),
  0 4px 12px rgba(0,0,0,0.25)`) because they sit above the scrim, not above the canvas.

### Spacing

There is **no enforced spacing scale**. Padding is authored per component: the
authored values include `0`, `4px`, `6px 8px`, `6px 12px`, `4px 10px`,
`16px 20px`, `20px` and a long tail of one-offs. The distribution is dominated by
a 4px rhythm — `0` (25 uses), `6px 12px` (8), `4px` (6), `6px 8px` (6),
`16px 20px` (5), `4px 10px` (5), `4px 8px` (5), `12px` (4) — so new work should
land on 2/4/6/8/12/16/20/24 and reuse an existing pattern rather than invent a
new step. Do not claim a 4/8/16/24/32/64 scale in review: it does not exist in
the code.

Fixed layout constants that behave like tokens:

| Constant | Value | Where |
|---|---|---|
| top bar height | 30px | `styles-topbar.css` |
| card header height | 30px | `.card-header` |
| card control button | 28×28px | `.card-btn` |
| card body padding | 20px | `.card-body` |
| resize handle thickness | 6px edges, 16px corner | `.card-edge-*` |
| icon sizes | `--icon-sm` 16px, `--icon-md` 20px | global |
| status bar height | `var(--icon-md)` = 20px | `styles-statusbar.css` |
| scrollbars | 8px, thumb `--border` → `--tertiary` on hover | `styles-base.css` |

## The floating-card model

```
#app
├── topbar (30px, --surface, 1px bottom border)
├── #canvas                     ← viewport; overflow hidden
│   └── .canvas-world           ← pan/zoom transform; single compositor layer
│       ├── .canvas-grid-layer  ← background grid (pointer-events: none)
│       └── .card × N           ← absolutely positioned in world coordinates
│           ├── .card-header    ← 30px: title text + controls (grab cursor)
│           └── .card-body      ← fills the rest; hosts xterm / Monaco / lists
└── statusbar (20px)
```

- **Cards are absolute children of the world, not of a grid.** Position and size
  live in world coordinates and persist verbatim (`.cockpit/window.json`).
- **One transform moves everything.** `zoom`/`pan` set a single transform on
  `.canvas-world`; during navigation it gets `will-change: transform` and
  `pointer-events: none`. Cards keep `will-change: transform` for themselves so
  content churn (xterm, Monaco, agent streams) dirties only that card.
- **Hover reveals chrome.** `.card-btn` is `opacity: 0` at rest, `1` on
  `:hover` or `:focus-within` — the card title is the only persistent chrome.
- **Resize affordances are invisible until touched.** Edge strips are
  transparent; the SE corner paints a 6px `border-right`/`border-bottom` chevron
  at `opacity: 0.4`, `0.65` on hover.
- **Modals, context menus, palettes, the AI drawer and the tutorial do not live
  in the world** — they are `position: fixed` at the root stacking context and
  are ordered by the semantic `--z-*` scale: canvas 1 → AI drawer 10 → titlebar
  100 → modal 200 → confirm 300 → context menu 400 → palette 500 → tutorial
  600–620 → corner zone/panel 1000–1001 → dropdown 1100–1101 → layout overlay 9999.
- **Glass is local, not global.** `backdrop-filter` appears on the AI drawer and
  floating input only, and is dropped to a flat `--panel` fill while
  `body.canvas-busy` (pan/zoom/drag) to avoid re-blurring every frame.

## Interaction & accessibility

- **Focus** — every interactive element paints `outline: 2px solid var(--accent)`
  with `outline-offset: 2px` (0 for text inputs), collected in
  `styles-focus-visibility.css` (WCAG AA). Hover is never the only affordance.
- **Motion** — transitions are functional and short: `0.1s` for background/color
  on hover, `0.15s ease-out` for shadow/border and opacity, `0.25s` for
  card arrange glides (FLIP via `transform`), and `0.15–0.28s` for panel reveals
  (the corner zones use `cubic-bezier(0.16, 1, 0.3, 1)`).
  `prefers-reduced-motion: reduce` disables the arrange glide.
- **Selection** — the app chrome is `user-select: none` (so `Ctrl+A` doesn't
  highlight the shell); content surfaces opt back in: markdown prose, terminal,
  Monaco, chat messages, diffs, inputs.
- **Color is never the only signal** — states pair a color with a label, glyph,
  dashed border or opacity change.

## Adding UI

1. Use an existing token. No literal hex, no literal font size, no literal
   radius in component CSS.
2. Reach for an existing pattern before a new value: `--text-xs` + 700 for
   chrome, `--text-sm` for card titles, `--radius-xs` for controls,
   `--radius-md` for cards, `--shadow` only on overlays/hover.
3. New component → new `styles-<component>.css`, linked in `index.html` in
   cascade order (see `AGENTS.md`).
4. If a component genuinely needs a new token, declare it in `styles-base.css`
   `:root` next to its siblings, and — if it is a color — add it to
   `ThemeColors` in `theme.ts` so every palette stays complete.
