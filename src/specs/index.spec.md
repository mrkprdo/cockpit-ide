---
name: Renderer Entry
file: src/renderer/index.ts
type: process
layer: core
singleton: true
exports: []
---

# Renderer Entry

Renderer process entry point. Bootstraps the application by instantiating the `App` orchestrator. Attaches a click listener to the `#theme-toggle` button for manual dark/light toggling. This is the single IIFE entry loaded by `index.html`.

## Dependencies

- **app** `src/renderer/components/App.ts` — creates and initializes the root App instance

## Referenced By

- **index-html** `src/renderer/index.html` — loaded as `<script>` tag

## IPC Channels

None — delegates all initialization to App.

## Interface

### Functions

- None exported; entry point bootstrap only.

## Lifecycle

- **created_by:** script load in `index.html`
- **destroyed_by:** window unload

## Test

None — tested via App integration tests.
