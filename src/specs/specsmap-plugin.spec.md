---
name: SpecsMap Plugin
file: src/renderer/components/SpecsMapPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [SpecsMapPlugin]
---

# SpecsMap Plugin

Specification visualization and generation tool accessible via Tools → SpecsMap. Parses the project's spec files (`src/specs/*.spec.md`) into a dependency graph and renders a visual map of nodes (features) connected by directed edges (dependencies/references). Supports: auto-generation of spec files from source code audit, integrity verification against `SPECGEN_HASH`, snapshot management (save/load spec state), and export of generation prompts for AI-assisted spec creation.

## Dependencies

- **specgen-hash** `../specgen-hash` — reads `SPECGEN_HASH` and `SPECGEN_VERSION` for integrity verification

## Referenced By

- **canvas-area** `src/renderer/components/CanvasArea.ts` — creates SpecsMap cards

## IPC Channels

- `fs:readDir` — reads spec files directory, source files directory, workspace root
- `fs:readFile` — reads spec files, workspace snapshot, main.spec.md, SPECGEN.md, AGENTS.md, source files
- `fs:writeFile` — saves snapshot, writes SPECGEN.md template, writes generated spec files, writes main.spec.md
- `fs:mkdir` — creates `.cockpit/` directory for snapshot storage
- `clipboard:writeText` — copies generation prompt to clipboard

## Interface

### Classes

- **SpecsMapPlugin**
  - **constructor** `(container: HTMLElement): SpecsMapPlugin` — initializes graph renderer
  - **loadSpecs** `(): Promise<void>` — parses all spec files into dependency graph
  - **renderGraph** `(): void` — renders visual graph of feature dependencies
  - **generateSpecs** `(): Promise<void>` — audits source and generates spec files
  - **saveSnapshot** `(): Promise<void>` — saves current spec state
  - **loadSnapshot** `(): Promise<void>` — restores spec state from snapshot
  - **verifyIntegrity** `(): boolean` — checks SPECGEN_HASH against workspace
  - **getGenerationPrompt** `(): string` — builds AI prompt for spec generation
  - **destroy** `(): void`

## State

Snapshot data persisted to `.cockpit/specs-snapshot.json`.

## Lifecycle

- **created_by:** `CanvasArea` on Tools → SpecsMap menu action
- **destroyed_by:** card close

## External Dependencies

None beyond IPC.

## Test

`src/renderer/components/SpecsMapPlugin.test.ts`
