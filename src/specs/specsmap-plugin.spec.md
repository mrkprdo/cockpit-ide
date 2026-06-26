---
name: SpecsMap Plugin
file: src/renderer/components/SpecsMapPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [SpecsMapPlugin]
---

# SpecsMap Plugin

Interactive dependency graph visualizer for src/specs/ spec files. Loads all .spec.json files, parses them into nodes organized by architectural layer (foundation/core/widget/modal/overlay/plugin) with color-coded backgrounds, renders directed edges (SVG paths) for dependencies, supports pan/zoom on the graph viewport, node search with keyboard navigation, detail panel on node click showing full spec data, cycle analysis mode showing dependency layers, isolated node focus mode, and validation badge showing broken reference counts. Auto-layouts nodes per layer row. Imports SPECGEN.md template and specgen-hash for validation.

## Dependencies

- [[specgen-hash.spec.md|specgen-hash]] `src/renderer/specgen-hash.ts` — Reads SPECGEN_HASH and SPECGEN_VERSION to validate spec freshness

## Referenced By

- [[canvas-area.spec.md|canvas-area]] `src/renderer/components/CanvasArea.ts`

## Interface

### Methods

- **constructor** `(container: HTMLElement, wsPath: string)` — Builds graph viewport, SVG layer, node layer, search bar, header with refresh/fit/settings/search buttons
- **refresh** `(): Promise<void>` — Reloads all spec files from src/specs/, rebuilds node graph, re-layouts, redraws edges
- **triggerRefresh** `(): void` — Public method called by __cockpit.refreshSpecsMap(); delegates to refresh()
- **triggerRegenerate** `(): void` — Public method for __cockpit.regenerateSpecs(); triggers full spec regeneration
- **fitGraph** `(): void` — Fits all nodes into the visible viewport
- **openSettingsPanel** `(): void` — Opens settings panel for layer visibility toggles

### Properties

- **onFileOpen**: ((filePath: string) => void) | null — Callback to open a source file in the editor from node click

## Lifecycle

- **created_by:** CanvasArea.addSpecsmap()
- **destroyed_by:** CanvasArea.terminateCard()

