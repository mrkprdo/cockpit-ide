---
name: Makefile
file: Makefile
type: entry
layer: foundation
singleton: true
exports: []
---

# Makefile

GNU Make build automation with targets: build, dev, prod, package, install, clean, test. Orchestrates TypeScript compilation (main/preload via tsc, renderer via esbuild), Electron packaging, and test execution.

## Dependencies

None — root build file.

## Referenced By

None — invoked by `make <target>`.

## IPC Channels

None.

## Scripts

- **build**: `tsc -p tsconfig.main.json && node scripts/build-renderer.js`
- **dev**: `node dev.js`
- **prod**: `set NODE_ENV=production && tsc -p tsconfig.main.json && node scripts/build-renderer.js`
- **package**: `node scripts/pack.js`
- **test**: `npx vitest run --coverage && npx tsc -p tsconfig.main.json --noEmit && npx tsc -p tsconfig.renderer.json --noEmit`
- **clean**: `rm -rf dist`
- **postinstall**: `npx electron-builder install-app-deps`

## Build

- **TypeScript main**: `tsc -p tsconfig.main.json`
- **TypeScript renderer**: `node scripts/build-renderer.js`
- **Production**: `set NODE_ENV=production && tsc -p tsconfig.main.json && node scripts/build-renderer.js`
