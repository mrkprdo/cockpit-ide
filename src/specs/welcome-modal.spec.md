---
name: Welcome Modal
file: src/renderer/components/WelcomeModal.ts
type: ui
layer: modal
singleton: true
exports: [WelcomeModal]
---

# Welcome Modal

Startup workspace picker shown when no CLI workspace path is provided. Displays "COCKPIT IDE" branding, a "Select a workspace" prompt, a list of recent workspaces (fetched via `workspace:getRecent`), and two buttons: "Open Workspace" (triggers native directory picker via `workspace:select`) and "Close" (closes the window). Recent workspace items show the full path; missing directories are marked with a CSS class `welcome-recent-item-missing` and cannot be clicked. Each recent item has a remove button (×) that calls `workspace:removeRecent`. Escape key dismisses with `null`. Returns a Promise that resolves to the selected path or `null`.

## Dependencies

No imports from `src/`.

## Referenced By

- **App Orchestrator** `src/renderer/components/App.ts` — instantiates and calls `modal.open()` on first launch

## IPC Channels

- `workspace:select` — native directory picker dialog
- `workspace:getRecent` — load list of recently opened workspaces
- `workspace:removeRecent` — remove a workspace from the recent list
- `fs:readDir` — check if a recent workspace path still exists
