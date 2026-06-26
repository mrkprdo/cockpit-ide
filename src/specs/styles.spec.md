---
name: Design System Styles
file: src/renderer/styles.css
type: config
layer: foundation
singleton: true
exports: []
---

# Design System Styles

Complete CSS design system (~700 lines) implementing the Noir x Art Nouveau x Floating visual language. Defines CSS custom properties for dark/light theme colors, typography (Space Mono monospace), spacing scale (4px/8px base), border radius (8px), dashed borders, and component styles for cards, modals, overlays, menus, buttons, inputs, tabs, xterm.js terminal, markdown content, and scrollbars. All theming is driven through CSS custom properties on `:root` and `[data-theme="light"]`, allowing runtime theme toggling without stylesheet reload.

## Dependencies

None — pure CSS with no `@import` statements.

## Referenced By

- **index-html** `src/renderer/index.html` — linked as stylesheet
- **theme** `src/renderer/theme.ts` — sets CSS custom properties programmatically

## IPC Channels

None.

## Interface

### CSS Custom Properties

- `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-overlay`
- `--text-primary`, `--text-secondary`, `--text-muted`
- `--accent-primary`, `--accent-secondary`
- `--border-color`, `--border-radius`
- `--font-mono`, `--font-size-sm`, `--font-size-base`, `--font-size-lg`
- `--spacing-xs` (4px), `--spacing-sm` (8px), `--spacing-md` (16px), `--spacing-lg` (24px)

## Test

None — tested implicitly via visual tests in all component test files.
