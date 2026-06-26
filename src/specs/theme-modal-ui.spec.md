---
name: Theme Modal UI
parent: theme-modal
---

# Theme Modal UI

DOM structure, theme palette selection, and theme toggle interactions for the Theme settings modal.

## DOM Structure

```
.modal-overlay | position: fixed; inset: 0; z-index: 1000
└── .theme-modal | centered, max-width: 480px
    ├── .theme-modal-header
    │   ├── .theme-modal-title "Theme Settings"
    │   └── button.theme-modal-close (× close button)
    ├── .theme-mode-toggle | flex row
    │   ├── button.theme-mode-dark[.active] "Dark"
    │   └── button.theme-mode-light[.active] "Light"
    └── .theme-palettes | grid: 3 columns
        └── .theme-palette[] (one per theme palette)
            ├── .palette-preview (row of color swatch squares)
            │   ├── .palette-swatch (bg-primary)
            │   ├── .palette-swatch (bg-secondary)
            │   ├── .palette-swatch (accent-primary)
            │   ├── .palette-swatch (text-primary)
            │   └── .palette-swatch (border-color)
            ├── .palette-name "Default Dark"
            └── .palette-check (✓ when active)
```

## Interactions

### Dark/Light Mode Toggle

- **trigger:** Click "Dark" or "Light" button in `.theme-mode-toggle`
- Toggle `.active` class between buttons
- Switch displayed palettes to dark or light variants
- Call `theme.toggle()` or `theme.setTheme()` as appropriate
- **result:** Mode switched, corresponding palettes shown

### Palette Selection

- **trigger:** Click on `.theme-palette` card
- Call `theme.setTheme(paletteName)` with selected palette ID
- Move `.palette-check` (✓ indicator) to selected palette
- Apply palette colors via CSS custom properties on `:root`
- Persist preference via `prefs:save` IPC
- **result:** Theme colors updated application-wide, preference saved

### Close

- **trigger:** Click × button, click overlay background, or press Escape
- Modal fades out, overlay removed
- **result:** Modal dismissed

## States

### Open (Dark Mode Active)

Dark mode toggle active, dark palette swatches displayed, current palette highlighted with ✓.

### Open (Light Mode Active)

Light mode toggle active, light palette swatches displayed, current palette highlighted with ✓.

### Palette Switching

Brief flash on `.palette-preview` as colors transition, CSS custom properties updating with smooth transition (0.3s).

### Closing

Fade-out animation (200ms), modal removed from DOM.

## Accessibility

- **Escape:** Close modal
- **Tab:** Cycle through mode toggle → palettes → close button
- **Enter/Space:** Select focused palette
