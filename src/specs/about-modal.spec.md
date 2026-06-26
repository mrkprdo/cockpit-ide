---
name: About Modal
file: src/renderer/components/AboutModal.ts
type: ui
layer: modal
singleton: true
exports: [AboutModal]
---

# About Modal

Version and credits dialog showing Cockpit IDE version (from `package.json`), build date, Electron/Chrome/Node versions, project links (GitHub, website), and license information. Clicking the website link opens the default browser via `shell:openExternal` IPC. Dismissed by clicking the overlay background or the Close button.

## Dependencies

None — standalone modal.

## Referenced By

- **app** `src/renderer/components/App.ts` — opens via Help → About menu

## IPC Channels

- `shell:openExternal` — opens website URL in default browser

## Interface

### Classes

- **AboutModal**
  - **constructor** `(): AboutModal` — creates modal DOM with version info, links
  - **open** `(): void` — shows modal overlay
  - **close** `(): void` — hides modal
  - **onClose** — callback `() => void`

### Properties

- **version** `string` — app version from package.json

## State

Modal visibility only.

## Lifecycle

- **created_by:** `App` constructor (singleton)
- **destroyed_by:** App destruction

## Test

`src/renderer/components/AboutModal.test.ts`
