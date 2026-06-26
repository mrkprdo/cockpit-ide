---
name: Theme System
file: src/renderer/theme.ts
type: logic
layer: foundation
singleton: true
exports: [ThemeColors, defaultDarkTheme, defaultLightTheme, monokaiDarkTheme, monokaiLightTheme, idolDarkTheme, idolLightTheme, theme]
---

# Theme System

Theme singleton managing color palette selection and application. Provides three base themes (Default, Monokai, Idol) each with dark and light variants. Exports typed ThemeColors for each variant. apply() sets 14 CSS custom properties (--bg, --surface, --panel, --primary, --secondary, --tertiary, --border, --accent, --accent2, --green, --amber, --red, --onAccent, --scrim) on document root. Supports setTheme() with legacy name mapping, setDark() toggle, and direct setBase/setMode.

## Referenced By

- [[app.spec.md|app]] `src/renderer/components/App.ts`
- [[top-bar.spec.md|top-bar]] `src/renderer/components/TopBar.ts`
- [[monaco-editor-plugin.spec.md|monaco-editor-plugin]] `src/renderer/components/MonacoEditorPlugin.ts`
- [[theme-modal.spec.md|theme-modal]] `src/renderer/components/ThemeModal.ts`
- [[ai-drawer.spec.md|ai-drawer]] `src/renderer/components/AiDrawer.ts`

## Interface

### Methods

- **setBase** `(base: string): void` — Switch base palette preserving current mode
- **setMode** `(mode: string): void` — Switch dark/light preserving current base
- **setTheme** `(base: string, mode?: string): void` — Set both base and mode with legacy name fallback mapping
- **setDark** `(dark: boolean): void` — Toggle to default dark or light
- **toggle** `(): void` — Flip between dark and light on the current base
- **apply** `(): void` — Apply all 14 CSS custom properties to document root

### Properties

- **base**: string — Active base palette name: 'default', 'monokai', or 'idol'
- **mode**: string — Active mode: 'dark' or 'light'
- **themeName**: string — Composite name e.g. 'default-dark'
- **isDark**: boolean — True if current mode is dark
- **colors**: ThemeColors — Computed color object for the active theme

## Lifecycle

- **created_by:** Module import (singleton instantiates and calls apply() immediately)
- **destroyed_by:** Page navigation/unload

