---
name: AI Drawer
file: src/renderer/components/AiDrawer.ts
type: ui
layer: overlay
singleton: true
exports: [AiDrawer]
---

# AI Drawer

AI assistant side panel that slides in from the right edge of the window. Toggled via Tools > AI or the ▶ notch button. Communicates with a local HTTP+WebSocket backend (not yet connected — ready for integration). Contains a chat message list (user, assistant, tool, thinking messages), a text input with send button, session management (create, rename, delete, switch), a model selection dropdown, an "Attach" button to add file context, and model status indicators. Sessions are persisted to localStorage. The system prompt (Cockpit Agent rules) is embedded inline (~280 lines). Implements a key-sequence map (`KEY_SEQUENCES`) for translating symbolic key names to escape codes when sending keystrokes to terminals via the agent.

## Dependencies

No imports from `src/`.

## Referenced By

- **App Orchestrator** `src/renderer/components/App.ts` — creates instance, calls `toggle()` on Tools > AI

## IPC Channels

- `terminal:write` — agent writes commands to terminal
- `terminal:kill` — agent kills terminal processes
- `clipboard:readText` — agent reads clipboard
- `clipboard:writeText` — agent writes clipboard
- `fs:readFile` — agent reads files
- `fs:writeFile` — agent writes files
- `fs:readDir` — agent lists directories
- `fs:mkdir` — agent creates directories
- `fs:delete` — agent deletes files
- `fs:copy` — agent copies files
- `fs:rename` — agent renames files
- `workspace:load` — agent gets canvas state
- `workspace:save` — agent saves state
- `shell:openExternal` — agent opens URLs
- `git:*` — agent runs git operations
