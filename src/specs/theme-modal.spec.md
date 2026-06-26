---
name: Theme Modal
file: src/renderer/components/ThemeModal.ts
type: ui
layer: modal
singleton: true
exports: [ThemeModal]
---

# Theme Modal

Theme settings dialog that displays available theme palettes as clickable color swatches (default dark, default light, Monokai dark, Monokai light, Idol dark, Idol light). Each swatch previews the palette's primary colors. Clicking a swatch calls `theme.setTheme()`, which updates CSS custom properties and persists the preference. Includes a dark/light mode toggle button at the top.

## Dependencies

- **theme** `../theme` — calls `theme.setTheme()` to apply selected palette

## Referenced By

- **app** `src/renderer/components/App.ts` — opens via View → Theme Settings menu

## IPC Channels

None — delegates to theme singleton which uses `prefs:save`.

## Interface

### Classes

- **ThemeModal**
  - **constructor** `(): ThemeModal` — creates modal DOM with theme swatch grid
  - **open** `(): void` — shows modal with current theme highlighted
  - **close** `(): void` — hides modal
  - **onClose** — callback `() => void`

## State

Modal visibility only; theme state delegated to `theme` singleton.

## Lifecycle

- **created_by:** `App` constructor (singleton)
- **destroyed_by:** App destruction

## Test

`src/renderer/components/ThemeModal.test.ts`
