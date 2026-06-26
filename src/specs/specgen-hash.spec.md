---
name: SpecGen Build Hash
file: src/renderer/specgen-hash.ts
type: config
layer: foundation
singleton: false
exports: [SPECGEN_HASH, SPECGEN_VERSION]
---

# SpecGen Build Hash

Auto-generated build artifact containing the SHA-256 hash of SPECGEN.md and a version string. Regenerated on every npm run build by build-renderer.js. Consumed by SpecsMapPlugin to validate spec freshness and by AiDrawer for system context.

## Referenced By

- [[specsmap-plugin.spec.md|specsmap-plugin]] `src/renderer/components/SpecsMapPlugin.ts`
- [[ai-drawer.spec.md|ai-drawer]] `src/renderer/components/AiDrawer.ts`

## Interface

## Lifecycle

- **created_by:** build-renderer.js (regenerated on each build)
- **destroyed_by:** N/A (static module)

