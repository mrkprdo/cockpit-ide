---
name: SpecGen Hash
file: src/renderer/specgen-hash.ts
type: config
layer: utility
singleton: false
exports: [SPECGEN_HASH, SPECGEN_VERSION]
---

# SpecGen Hash

Auto-generated constants file produced by `build-renderer.js` on every `npm run build`. Exports `SPECGEN_HASH` (SHA-256 hex digest of the SPECGEN.md template) and `SPECGEN_VERSION` (date-based version string). Used by SpecsMap Plugin to detect when the spec generation template has changed and trigger a re-scan of the source tree.

## Dependencies

No imports from `src/`.

## Referenced By

- **SpecsMap Plugin** `src/renderer/components/SpecsMapPlugin.ts` — imports `SPECGEN_HASH` and `SPECGEN_VERSION`

## IPC Channels

None.
