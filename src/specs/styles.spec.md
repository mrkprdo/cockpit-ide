---
name: Styles
file: src/renderer/styles.css
type: config
layer: foundation
singleton: true
exports: []
---

# Styles

Complete design system implemented in CSS custom properties. Defines the Noir × Art Nouveau × Floating aesthetic: color palette (`--bg`, `--surface`, `--primary`, `--accent`, etc.), type scale (9px to 18px via `--text-*`), line heights, border radius micro-scale (3px–16px), z-index semantic scale (titlebar at 100 through tutorial tooltip at 620), scrollbar styling, and component styles for title bar, canvas, plugin list panel, arrange panel, context menu, status bar, cards (with arranging animation), card header, card controls, editor tabs, editor tab-bar, file tree, terminal, markdown preview, modals, tutorial overlays, AI drawer, command palette, git plugin, and the welcome screen. All styles scoped through `var(...)` references.

## Dependencies

No imports from `src/`.

## Referenced By

- **App Shell** `src/renderer/index.html` — linked as stylesheet

## IPC Channels

None — pure CSS.
