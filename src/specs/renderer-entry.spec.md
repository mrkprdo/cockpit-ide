---
name: Renderer Entry
file: src/renderer/index.ts
type: process
layer: core
singleton: true
exports: []
---

# Renderer Entry

Renderer process entry point. Instantiates the `App` class to bootstrap the entire UI. Also attaches a click listener on `#theme-toggle` that toggles the `light` class on `<html>`, providing a direct light/dark switch independent of the Theme modal.

## Dependencies

- **App Orchestrator** `src/renderer/components/App.ts` — creates the root `App` instance

## Referenced By

- **App Shell** `src/renderer/index.html` — loads this script as `index.js`

## IPC Channels

None — entry point only.
