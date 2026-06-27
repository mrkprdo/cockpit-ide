---
name: IDE Server
file: src/main/ide-server.ts
type: logic
layer: core
singleton: true
exports: [IdeServer, ideServer, EditorSelectionState]
---

# IDE Server

HTTP+WebSocket server running on `127.0.0.1:0` (random port) that implements a JSON-RPC 2.0 protocol for external editor integration (Claude Code, Cursor, opencode). Broadcasts `selection_changed` notifications to all connected WebSocket clients whenever the renderer cursor or selection changes. Accepts `openFile` requests from external clients and fires the `onOpenFile` callback to open files in the renderer. Writes lock files (`.cockpit/ide.lock`, `~/.claude/ide/<port>.lock`, and XDG opencode path) so external tools can discover the running server instance. Started when a workspace is set, stopped on app quit.

## Dependencies

No imports from `src/`.

## Referenced By

- **Main Process** `src/main/main.ts` — calls `ideServer.start()` and `ideServer.updateEditorState()`
- **Preload Script** `src/preload/preload.ts` — exposes `ide:editorState` and `ide:openFile` channels

## IPC Channels

- `ide:editorState` — renderer sends cursor/selection state to be broadcast via WebSocket
- `ide:status` — renderer requests server status (running, port, workspace, lock paths)
- `ide:openFile` — server fires callback, main sends `ide:openFile` to renderer
