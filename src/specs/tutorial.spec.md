---
name: Tutorial
file: src/renderer/components/Tutorial.ts
type: ui
layer: overlay
singleton: true
exports: [Tutorial]
---

# Tutorial

Interactive guided tutorial overlay that walks first-time users through Cockpit IDE features in sequential steps. Each step highlights a UI element (card, menu, button) with a positioned tooltip explaining its function. Supports: step navigation (Next/Previous/Skip), auto-positioning tooltips near target elements, progress indicator, and a "Learn More" link that opens documentation via `shell:openExternal` IPC. Tracks completion state in localStorage to avoid re-showing.

## Dependencies

None — standalone overlay with document query selectors for element targeting.

## Referenced By

- **app** `src/renderer/components/App.ts` — opens via Help → Tutorial menu or auto-shows on first run

## IPC Channels

- `shell:openExternal` — opens documentation links in default browser

## Interface

### Classes

- **Tutorial**
  - **constructor** `(): Tutorial` — creates overlay DOM with tooltip, navigation buttons
  - **start** `(): void` — begins tutorial from step 0
  - **next** `(): void` — advances to next step
  - **previous** `(): void` — returns to previous step
  - **skip** `(): void` — dismisses tutorial
  - **isActive** `(): boolean` — checks if tutorial overlay is visible
  - **onComplete** — callback `() => void`

## State

Current step index, tooltip position, target element reference, completion flag.

## Lifecycle

- **created_by:** `App` constructor (singleton, may not be shown)
- **destroyed_by:** App destruction

## Test

`src/renderer/components/Tutorial.test.ts`
