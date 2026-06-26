---
name: SpecGen Hash
file: src/renderer/specgen-hash.ts
type: config
layer: foundation
singleton: true
exports: [SPECGEN_HASH, SPECGEN_VERSION]
---

# SpecGen Hash

Auto-generated version stamp file written by `scripts/version.js` during the build process. Exports two constants: `SPECGEN_HASH` (content hash of bundled files) and `SPECGEN_VERSION` (version string from package.json). Used by SpecsMapPlugin to verify workspace integrity.

## Dependencies

None — auto-generated file with no imports.

## Referenced By

- **specsmap-plugin** `src/renderer/components/SpecsMapPlugin.ts` — reads hash for integrity verification

## IPC Channels

None.

## Interface

### Constants

- **SPECGEN_HASH** `string` — content hash of build artifacts
- **SPECGEN_VERSION** `string` — version string matching package.json

## Test

None — auto-generated; not tested directly.
