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
search bar. Floating surfaces — window cards, modals, menus, palettes, the AI
drawer — carry **no perimeter stroke**. Their edge is drawn by a solid face,
a tonal header band and stacked contact/ambient shadows. Hairlines survive only
on controls, internal dividers and content boxes, and they use `--border`.

## Tokens

Tokens live in `:root` in `styles-base.css`. `theme.ts` re-writes the fourteen
color tokens inline on `document.documentElement` whenever the theme changes, so
a palette swap is a token swap — no component knows the palette.

### Color

| Token | Dark (default) | Light (default) | Role |
|---|---|---|---|
| `--bg` | `#161C24` | `#f8f8f8` | app background, canvas void |
| `--surface` | `#1C2538` | `#eeeeee` | base for the derived card face; top bar |
| `--panel` | `#243248` | `#e0e0e0` | raised controls, hover fills, inputs |
| `--primary` | `#C8D6E5` | `#1a1a1a` | body and title text |
| `--secondary` | `#78909C` | `#3a3a3a` | secondary labels |
| `--tertiary` | `#7894A3` | `#6a6a6a` | muted text, icons, hints (4.79:1 on `--surface` in dark — WCAG AA) |
| `--border` | `#2A3A4A` | `#bbbbbb` | controls, internal dividers, content boxes (not floating edges) |
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

Depth is the only card boundary. Each floating shell is a stack of opaque tonal
layers (face → header band) plus a layered shadow: an inset top sheen, a tight
contact shadow, a key shadow and a wide ambient shadow.

Derived surface tokens (`styles-base.css`, re-derived in light mode):

| Token | Role |
|---|---|
| `--card-face` | opaque body face; equals `--surface` in dark (keeps secondary/tertiary at AA), leans white in light |
| `--card-face-active` | focused face; equal in dark, one step brighter in light |
| `--card-header-face` | title band; mixes toward `--bg` in dark (darker strip), toward `--primary` in light |
| `--card-header-face-active` | focused title band, one shade lighter (closer to the face) |
| `--card-sheen` | 1px inset top highlight |
| `--shade-header` | inset sheen + short shadow the header casts onto the body (replaces `border-bottom`) |

Shadow tokens:

| Token | Applied to |
|---|---|
| `--shadow-card-rest` | every window card at rest |
| `--shadow-card-hover` | hovered window card |
| `--shadow-card-active` | focused (`is-active`) window card |
| `--shadow-card-drag` | card being dragged — contact layers only |
| `--shadow-menu` | context menus, dropdowns, popovers, corner panels, notch |
| `--shadow-float` | modals, palette, tutorial, AI drawer, floating input |

- **Resting card** — solid `--card-face`, header band, `--shadow-card-rest`.
  There is no border and no accent outline.
- **Hovered card** — `--shadow-card-hover`; the face and header do not change hue.
- **Focused card** — `--card-header-face-active` and the deepest shadow (light
  mode also lifts the face to `--card-face-active`). Accent is **not** used to
  mark the active card.
- **Dragging / panning** — a dragged card and every card during pan/zoom
  collapse to `--shadow-card-drag` (contact layers only). Zooming re-rasterizes
  the world at a new scale, so dropping the wide blurred layers keeps the
  gesture cheap; full elevation returns on the next idle frame. Shadows are
  never removed entirely, because nothing else draws the edge.
- **Menus and small overlays** — `--shadow-menu`.
- **Modals, palette, tutorial, drawer** — `--shadow-float`, above the scrim or canvas.

### Controls

Buttons and links use the same subtle card material, not a second visual
language. The recipe lives in the `--control-*` tokens:

| Token | Role |
|---|---|
| `--control-face` | tonal fill for secondary buttons and chips |
| `--control-face-hover` | hover fill |
| `--control-face-active` | pressed / selected fill |
| `--control-border` | hairline boundary (still present for control affordance) |
| `--control-border-hover` | hover boundary |
| `--control-sheen` | 1px inset top highlight |
| `--control-danger-tint` | red-tinted fill for destructive icon buttons |

- **Primary** — `--primary` fill, `--bg` ink, no border (`Apply`, `Next`,
  `Commit`, `Save settings`, send). This is the only heavy control treatment.
- **Secondary** — `--control-face` + `--control-border` + `--control-sheen`,
  4px radius, `--secondary` label; hover raises to `--control-face-hover` and
  `--primary`. Used by Cancel/Close/Back/Push/Test/filter toggles/status actions.
- **Icon buttons** — transparent at rest, `--control-face-hover` on hover,
  `--tertiary` glyph, 4px radius. Destructive icons use `--control-danger-tint`
  and the red ink instead of a solid red fill.
- **Selected controls** (search modes, POV tabs, session rows, segmented
  choices) use `--control-face-active`; accent is text/ring only, never a fill.
- **Links** — accent text, no underline at rest in chrome, underline on hover
  with a 2px offset. Content links (markdown prose) stay underlined at rest.
- **Tabs** — 6px radius for POV chips; active editor tabs use the panel fill and
  no accent top rule.

Do not add a new button style for one component: reuse a recipe or add a token
here only when the role is genuinely new.

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
│           ├── .card-header    ← 30px: shaded title band + controls (grab cursor)
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
- **Surfaces are opaque.** The AI drawer, floating input, sessions panel and
  settings dialog share the same solid card face as canvas cards. There is no
  `backdrop-filter` anywhere in the chrome, so pan/zoom/drag needs no
  glass-bailout state and no surface flicker.

## Interaction & accessibility

- **Focus** — every interactive element paints `outline: 2px solid var(--accent)`
  with `outline-offset: 2px` (0 for text inputs), collected in
  `styles-focus-visibility.css` (WCAG AA). Hover is never the only affordance.
- **Motion** — transitions are functional and short: `0.1s` for background/color
  on hover, `0.15s ease-out` for shadow/border and opacity, `0.25s` for
  card arrange glides (FLIP via `transform`), and `0.15–0.28s` for panel reveals
  (the corner zones use `cubic-bezier(0.16, 1, 0.3, 1)`).
  `prefers-reduced-motion: reduce` disables the arrange glide and applies wheel
  zoom immediately.
- **Canvas gestures** — wheel zoom eases toward a target over ~6–8 frames with
  the cursor's world point pinned; card drags track the pointer at full
  resolution and snap to the 28px world grid on release; pan/zoom collapses
  cards to the contact shadow with shadow interpolation disabled.
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
   `--radius-md` for cards. A floating shell uses `--card-face` +
   `--shadow-menu`/`--shadow-float` and **no** `border`; a card uses
   `--shadow-card-rest` and swaps to the hover/active token by state.
3. New component → new `styles-<component>.css`, linked in `index.html` in
   cascade order (see `src/renderer/index.html`).
4. If a component genuinely needs a new token, declare it in `styles-base.css`
   `:root` next to its siblings, and — if it is a color — add it to
   `ThemeColors` in `theme.ts` so every palette stays complete.
