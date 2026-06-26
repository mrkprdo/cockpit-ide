---
name: IDE Server
file: src/main/ide-server.ts
type: process
layer: foundation
singleton: true
exports: [EditorSelectionState, IdeServer, ideServer]
---

# IDE Server

WebSocket server that bridges external editors (VS Code, JetBrains) with Cockpit IDE. Listens on `ws://127.0.0.1:41451` and accepts JSON messages: `openFile` opens a file in the Cockpit workspace, `editorState` relays cursor position/selections to the external IDE. Used for the "Edit in External Editor" workflow. Singleton instance exported as `ideServer`.

## Dependencies

None — uses only Node.js standard library (`http`, `fs`, `path`) and the `ws` package.

## Referenced By

- **main-process** `src/main/main.ts` — starts/stops the IDE server on app ready/close

## IPC Channels

None — uses raw WebSocket protocol, not Electron IPC.

## Interface

### Types

- **EditorSelectionState** — `{ filePath: string; language: string; cursorLine: number; cursorColumn: number }`

### Classes

- **IdeServer** — WebSocket server class
  - **start** `(workspacePath: string): void` — starts server on port 41451
  - **stop** `(): void` — stops server and closes all connections
  - **onOpenFile** — callback `(filePath: string) => void` — fired when external IDE requests file open
  - **sendEditorState** `(state: EditorSelectionState): void` — broadcasts cursor position to connected clients
  - **sendLoadedFiles** `(files: string[]): void` — notifies external IDE of currently open files

### Instances

- **ideServer** `IdeServer` — singleton instance

## Lifecycle

- **created_by:** module load (singleton)
- **destroyed_by:** `ideServer.stop()` called on app quit

## External Dependencies

- `ws`
- `http`
- `fs`
- `path`

## Test

`src/main/ide-server.test.ts`
