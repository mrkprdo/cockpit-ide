---
name: SpecsMap Plugin
file: src/renderer/components/SpecsMapPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [SpecsMapPlugin]
---

# SpecsMap Plugin

Visual dependency graph viewer that parses all `*.spec.md` files in the specs directory and renders a layered interactive graph. Each spec node is drawn as a positioned `<div>` with color-coded border by layer (foundation → green, core → blue, widget → purple, modal → amber, overlay → red, plugin → gray). Edges (dependency arrows) are rendered on a shared SVG layer using quadratic bezier curves. Supports pan and zoom (wheel to zoom, click-drag to pan), node selection (click opens a detail panel showing frontmatter, dependencies, and referenced-by), and search (Ctrl+F opens a search bar with result highlighting and arrow-key navigation). Cycle detection groups nodes into toggleable cycles. Validation badge shows spec count vs. source file count. A settings panel allows configuring the specs directory path (default `src/specs/`). The `triggerRefresh()` reloads specs from disk; `triggerRegenerate()` re-scans `src/` and rebuilds all spec files.

## Dependencies

- **SpecGen Hash** `src/renderer/specgen-hash.ts` — `SPECGEN_HASH` and `SPECGEN_VERSION` for template change detection

## Referenced By

- **Canvas Area** `src/renderer/components/CanvasArea.ts` — instantiates SpecsMapPlugin per specsmap card

## IPC Channels

- `fs:readDir` — scan specs directory and source directory
- `fs:readFile` — read spec markdown files
- `fs:writeFile` — write regenerated spec files
