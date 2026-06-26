---
name: Command Palette
file: src/renderer/components/CommandPalette.ts
type: ui
layer: overlay
singleton: false
exports: [CommandPalette]
---

# Command Palette

Ctrl+P file search overlay. Provides a search input that fuzzy-filters workspace files (excluding .git, node_modules, .cockpit) after loading them via fs.readDir. Results display file name and relative directory, with arrow-key navigation and Enter to open. Shows recent files (persisted in localStorage) when input is empty. Progress bar shown during file tree walk. Lazy-loaded — only created on first invocation.

## Referenced By

- [[explorer-plugin.spec.md|explorer-plugin]] `src/renderer/components/ExplorerPlugin.ts`

## IPC Channels

- `fs:readDir`

## Interface

### Methods

- **constructor** `(wsPath: string, onSelect: (filePath: string) => void)` — Builds overlay, palette, input, results list, progress bar
- **open** `(): void` — Shows overlay, focuses input, starts with recent files
- **close** `(): void` — Hides overlay, clears search timer
- **destroy** `(): void` — Removes overlay from DOM

## Lifecycle

- **created_by:** ExplorerPlugin.openFileSearch() (lazy)
- **destroyed_by:** Page unload (never explicitly destroyed)

