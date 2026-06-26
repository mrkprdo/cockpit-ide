---
name: Renderer Entry
file: src/renderer/index.ts
type: entry
layer: core
singleton: true
exports: []
---

# Renderer Entry

Renderer process entry point. Instantiates the App class to bootstrap the full IDE UI. Attaches click listener on the #theme-toggle button to toggle dark/light mode on the document root.

## Dependencies

- [[app.spec.md|app]] `src/renderer/components/App.ts` — Creates new App() instance which bootstraps all canvas UI, modals, and top bar

## Interface

## Lifecycle

- **created_by:** index.html <script> tag execution
- **destroyed_by:** Page unload

