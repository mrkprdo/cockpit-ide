---
name: AI Drawer
file: src/renderer/components/AiDrawer.ts
type: ui
layer: overlay
singleton: true
exports: [AiDrawer]
---

# AI Drawer

Slide-out AI agent panel opened via Tools > AI or the notch button. Implements a full agentic loop: sends user messages to an OpenAI-compatible LLM, executes tool calls against the __cockpit canvas bridge and electronAPI, and renders results as Markdown. Supports three agent modes (AUTO / PLAN / STEP), abort, prompt queuing, mid-run steering, and persistent per-workspace session storage in {workspace}/.cockpit/ai-sessions.json.

## Dependencies

- [[app.spec.md|app]] `src/renderer/components/App.ts` — Reads `window.__cockpit` for canvas operations (getCanvasState, panToCard, setView, zoomIn, zoomOut, openFile, addPlugin, focusCard, closeCard, moveCard, resizeCard, autoArrange, writeToTerminal, readTerminal, insertInEditor, readEditor, getEditorState, setEditorContent, goToLine, getWorkspacePath, reopenCard, resetView, refreshSpecsMap, regenerateSpecs)

## Referenced By

- [[app.spec.md|app]] `src/renderer/components/App.ts`

## IPC Channels

- `prefs:load`
- `prefs:save`
- `fs:readFile`
- `fs:writeFile`
- `fs:readDir`
- `fs:mkdir`
- `fs:delete`
- `fs:rename`
- `fs:copy`
- `git:currentBranch`
- `git:stagedFiles`
- `git:unstagedFiles`
- `git:unstagedDiff`
- `git:log`
- `git:stage`
- `git:unstage`
- `git:commit`
- `git:push`
- `git:branches`
- `git:checkout`
- `shell:openExternal`
- `clipboard:readText`
- `clipboard:writeText`

## Interface

### Methods

- **constructor** `()` — Builds drawer DOM (header with mode bar + sessions/settings buttons, message area, step controls, queue bar, input area with send/abort/steer buttons, settings panel, sessions panel), mounts notch button outside drawer, binds all event listeners, shows welcome message, loads API settings.
- **toggle** `(): Promise<void>` — Opens or closes the drawer. On open, awaits loadSessions() before showing UI to prevent stale state flash. On close, hides settings and sessions panels.
- **resetSessions** `(): void` — Clears all session state (sessions, currentSessionId, sessionsLoaded, cockpitDirEnsured, promptQueue, steeringMessage) and shows welcome message. Called by App.loadWorkspace() on workspace change.

## Lifecycle

- **created_by:** App constructor — one instance per window
- **destroyed_by:** Page unload
