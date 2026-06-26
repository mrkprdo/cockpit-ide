---
name: IDE Server
file: src/main/ide-server.ts
type: process
layer: foundation
singleton: true
exports: [IdeServer, EditorSelectionState, ideServer]
---

# IDE Server

HTTP+WebSocket server for MCP/open-code protocol integration. Listens on a random localhost port. Broadcasts editor selection state changes to connected WebSocket clients via JSON-RPC 2.0 'selection_changed' notifications. Writes lock files to .cockpit/ide.lock, %USERPROFILE%/.claude/ide/{port}.lock, and XDG data path for tool discovery.

## Referenced By

- [[main-process.spec.md|main-process]] `src/main/main.ts`

## Interface

### Methods

- **start** `(wsPath: string): Promise<void>` — Starts HTTP server + WebSocketServer on random port, writes lock files
- **stop** `(): void` — Closes all client connections, stops server, removes lock files
- **updateEditorState** `(state: EditorSelectionState | null): void` — Broadcasts selection_changed JSON-RPC notification to all connected clients
- **getPort** `(): number` — Returns the listening port number
- **getLockPaths** `(): string[]` — Returns the list of lock file paths written to disk

## Lifecycle

- **created_by:** main.ts on workspace setPath
- **destroyed_by:** main.ts on workspace close or app quit

## External Dependencies

- `ws`

## Test

`src/main/ide-server.test.ts`

