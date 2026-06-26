---
name: Theme System
file: src/renderer/theme.ts
type: logic
layer: foundation
singleton: true
exports: [ThemeColors, defaultDarkTheme, defaultLightTheme, monokaiDarkTheme, monokaiLightTheme, idolDarkTheme, idolLightTheme, theme]
---

# Theme System

Dark/light theme manager that sets CSS custom properties on `document.documentElement` at runtime. Maintains current theme state (dark/light) and active palette identifier. Provides six predefined theme palettes: default dark, default light, Monokai dark, Monokai light, Idol dark, Idol light — each defining 20+ color tokens for backgrounds, text, accents, borders, and component surfaces. The `theme` singleton persists preference via `localStorage` and `prefs:save` IPC.

## Dependencies

None — uses only browser `document.documentElement` and `localStorage`.

## Referenced By

- **app** `src/renderer/components/App.ts` — calls `theme.toggle()` on theme button click
- **top-bar** `src/renderer/components/TopBar.ts` — calls `theme.toggle()` from View menu
- **monaco-editor-plugin** `src/renderer/components/MonacoEditorPlugin.ts` — reads `theme.isDark` to set Monaco theme
- **theme-modal** `src/renderer/components/ThemeModal.ts` — calls `theme.setTheme()` for palette switching

## IPC Channels

- `prefs:save` — persists theme preference across sessions

## Interface

### Types

- **ThemeColors** — interface with 24 color slots: `bgPrimary`, `bgSecondary`, `bgTertiary`, `bgOverlay`, `textPrimary`, `textSecondary`, `textMuted`, `accentPrimary`, `accentSecondary`, `borderColor`, `borderRadius`, `fontMono`, `fontSizeSm`, `fontSizeBase`, `fontSizeLg`, `spacingXs`, `spacingSm`, `spacingMd`, `spacingLg`, plus card/modal/terminal/markdown-specific slots

### Classes

- **Theme** — singleton theme manager
  - **isDark** `boolean` — current dark mode state
  - **currentPalette** `string` — active palette identifier
  - **toggle** `(): void` — toggles dark/light
  - **setTheme** `(paletteName: string): void` — applies named palette
  - **apply** `(colors: ThemeColors): void` — sets CSS custom properties on `:root`
  - **savePreference** `(): Promise<void>` — persists via `prefs:save`
  - **loadPreference** `(): Promise<void>` — restores from localStorage + `prefs:load`

### Instances

- **theme** `Theme` — global singleton

## Lifecycle

- **created_by:** module import (singleton)
- **destroyed_by:** never (persists for app lifetime)

## Test

`src/renderer/theme.test.ts`
