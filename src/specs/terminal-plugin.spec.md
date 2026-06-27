---
name: Terminal Plugin
file: src/renderer/components/TerminalPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [TerminalPlugin]
---

# Terminal Plugin

Full PTY terminal emulator wrapped around `@xterm/xterm` with the `@xterm/addon-fit` addon. Each instance corresponds to one terminal card on the canvas. Creates an xterm.js instance in a container div, wires it to the Node PTY process via `electronAPI.terminal.*` IPC channels. Handles data flow: `term.onData` → `terminal:write` (send keystrokes to PTY), `terminal:data` listener → `term.write` (render PTY output). Implements `Ctrl+Shift+C` for copy selection and `Ctrl+Shift+V` for paste (writes clipboard text to PTY). Adapts cols/rows to container size via `ResizeObserver` calling `fitAddon.fit()`. Reads theme colors from CSS custom properties (`--bg`, `--primary`, `--accent`) on construction and on `updateTheme()`. Exposes `getScreenBuffer(maxLines)` for agent integration (reads last N lines of terminal output). Cleanup destroys xterm, disconnects IPC listeners, kills PTY, and removes DOM.

## Dependencies

No imports from `src/`.

## Referenced By

- **Canvas Area** `src/renderer/components/CanvasArea.ts` — instantiates TerminalPlugin per terminal card

## IPC Channels

- `terminal:create` — spawn a new PTY process with given UUID and optional cwd
- `terminal:write` — write data string to the PTY stdin
- `terminal:resize` — resize the PTY cols/rows
- `terminal:kill` — terminate the PTY process
- `terminal:data` — receive output data from PTY (listener)
- `terminal:exit` — receive PTY exit notification (listener)
- `clipboard:readText` — read system clipboard for paste
- `clipboard:writeText` — write selection to clipboard for copy
