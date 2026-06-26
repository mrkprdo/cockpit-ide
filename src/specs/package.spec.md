---
name: Package Manifest
file: package.json
type: entry
layer: foundation
singleton: true
exports: []
---

# Package Manifest

NPM package manifest for Cockpit IDE v0.0.1. Defines project metadata, build scripts (tsc + esbuild), Electron builder configuration for Windows/macOS/Linux, and all runtime dependencies including Electron 42, Monaco Editor 0.53, xterm.js 6, node-pty 1, marked 18, and vitest 4.

## Dependencies

None — root configuration file.

## Referenced By

None — consumed by Node.js/npm toolchain.

## IPC Channels

None.

## Scripts

- **build**: `make build`
- **dev**: `node dev.js`
- **prod**: `make prod`
- **package**: `make package`
- **test**: `make test && npm run typecheck`
- **test:run**: `vitest run --coverage`

## Build

- **main/preload**: `tsc -p tsconfig.main.json`
- **renderer**: `node scripts/build-renderer.js`
- **full build**: `make build`
