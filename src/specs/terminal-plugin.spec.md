---
name: Terminal Plugin
file: src/renderer/components/TerminalPlugin.ts
type: ui
layer: plugin
singleton: false
exports: [TerminalPlugin]
---

# Terminal Plugin

xterm.js-based PTY terminal emulator running as a canvas card plugin. Creates a real shell process via `terminal:create` IPC (which spawns node-pty in the main process), then pipes stdin/stdout between the xterm.js Terminal UI and the PTY. Handles terminal lifecycle: creation, resize (columns/rows), clipboard copy/paste, and process termination. Fires an `onExit` callback when the shell process exits.

## Dependencies

None — uses only xterm.js and IPC bridge.

## Referenced By

- **canvas-area** `src/renderer/components/CanvasArea.ts` — instantiates terminal cards via `createTerminal()`

## IPC Channels

- `terminal:create` — spawns PTY process with shell and dimensions
- `terminal:write` — sends keystrokes to PTY stdin
- `terminal:resize` — resizes PTY cols/rows on container resize
- `terminal:data` — listener for PTY stdout (rendered to xterm)
- `terminal:exit` — listener for shell process exit (fires onExit)
- `terminal:kill` — terminates PTY process
- `clipboard:writeText` — copies selection to clipboard
- `clipboard:readText` — reads clipboard for paste

## Interface

### Classes

- **TerminalPlugin**
  - **constructor** `(container: HTMLElement, cardTitle: string): TerminalPlugin` — creates xterm Terminal, opens PTY
  - **focus** `(): void` — focuses the terminal input
  - **resize** `(cols: number, rows: number): void` — resizes terminal + PTY dimensions
  - **write** `(data: string): void` — writes directly to PTY
  - **destroy** `(): void` — kills PTY, disposes xterm
  - **onExit** — callback `(code: number) => void` — fired when shell exits
  - **onTitleChange** — callback `(title: string) => void` — fired on OSC title change

### Properties

- **terminal** `Terminal` — xterm.js Terminal instance
- **ptyId** `string` — PTY process identifier

## State

Terminal dimensions (cols, rows), PTY process ID, shell type.

## Lifecycle

- **created_by:** `CanvasArea.createTerminal()` when user opens a terminal card
- **destroyed_by:** card close → `terminal:kill` IPC → xterm dispose

## External Dependencies

- `@xterm/xterm`

## Test

`src/renderer/components/TerminalPlugin.test.ts`
