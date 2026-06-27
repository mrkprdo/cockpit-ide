---
name: Theme System
file: src/renderer/theme.ts
type: logic
layer: foundation
singleton: true
exports: [ThemeColors, defaultDarkTheme, defaultLightTheme, monokaiDarkTheme, monokaiLightTheme, idolDarkTheme, idolLightTheme, Theme, theme]
---

# Theme System

Singleton `Theme` class that manages three palette families (default, monokai, idol), each with dark and light variants. Applies all 14 CSS custom properties (`--bg` through `--scrim`) directly on `document.documentElement.style` via `apply()`. Supports `setTheme(base, mode)`, `setBase(base)`, `setMode(mode)`, `setDark(dark)`, and `toggle()` (dark ↔ light). Handles legacy theme name mapping (`'dark'` → default/dark, `'monokai'` → monokai/dark). The singleton `theme` is exported and auto-applies on import.

## Dependencies

No imports from `src/`.

## Referenced By

- **App Orchestrator** `src/renderer/components/App.ts` — calls `theme.setTheme()` on preference load and `theme.toggle()` via TopBar callback
- **Top Bar** `src/renderer/components/TopBar.ts` — imports `theme` for theme toggle button
- **Monaco Editor Plugin** `src/renderer/components/MonacoEditorPlugin.ts` — imports `theme` to sync editor theme
- **Theme Modal** `src/renderer/components/ThemeModal.ts` — imports `theme` to read/set base and mode

## IPC Channels

None — operates entirely in the renderer process via CSS custom properties.
