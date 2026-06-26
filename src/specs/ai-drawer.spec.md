---
name: AI Drawer
file: src/renderer/components/AiDrawer.ts
type: ui
layer: overlay
singleton: true
exports: [AiDrawer]
---

# AI Drawer

Slide-out AI assistant panel that provides chat-based interaction with an LLM backend. Reads workspace context (file tree, git status, open files) to provide project-aware responses. Supports: chat message input/output, conversation history, code block rendering, file operation suggestions (create/modify/delete), and preference management for API configuration. Uses `localStorage` for chat history persistence and `fetch` for LLM API calls.

## Dependencies

None — self-contained with IPC and `fetch`.

## Referenced By

- **app** `src/renderer/components/App.ts` — opens via View → AI Chat menu or toolbar button

## IPC Channels

- `prefs:load` — loads API key and model preferences
- `prefs:save` — saves API key and model preferences
- `fs:readFile` — reads file content for context
- `fs:writeFile` — writes generated files
- `fs:readDir` — reads directory structure for context
- `fs:mkdir` — creates directories
- `fs:delete` — deletes files
- `fs:rename` — renames files
- `fs:copy` — copies files
- `git:currentBranch` — gets branch name for context
- `git:stagedFiles` — gets staged files for context
- `git:unstagedFiles` — gets unstaged files for context
- `git:unstagedDiff` — gets unstaged diff for context
- `git:log` — gets commit log for context
- `git:stage` — stages AI-generated files
- `git:unstage` — unstages files
- `git:commit` — commits AI changes
- `git:push` — pushes commits
- `git:branches` — lists branches
- `git:checkout` — switches branches
- `shell:openExternal` — opens external URLs
- `clipboard:readText` — reads clipboard for paste
- `clipboard:writeText` — copies response to clipboard

## Interface

### Classes

- **AiDrawer**
  - **constructor** `(): AiDrawer` — creates panel DOM with chat area, input, tabs
  - **open** `(): void` — slides panel in from right
  - **close** `(): void` — slides panel out
  - **toggle** `(): void` — toggles open/close
  - **sendMessage** `(message: string): Promise<void>` — sends to LLM, renders response
  - **clearHistory** `(): void` — clears chat history
  - **getWorkspaceContext** `(): Promise<object>` — gathers git, fs, editor state for LLM

### Properties

- **isOpen** `boolean`

## State

Chat history (persisted in localStorage), API preferences, panel open/close state.

## Lifecycle

- **created_by:** `App` constructor (singleton)
- **destroyed_by:** App destruction

## External Dependencies

- `fetch` (browser API)
- `localStorage` (browser API)

## Test

`src/renderer/components/AiDrawer.test.ts`
