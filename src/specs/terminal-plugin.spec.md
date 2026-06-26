---
name: Terminal Plugin
file: src/renderer/components/TerminalPlugin.ts
type: ui
layer: widget
singleton: false
exports: [TerminalPlugin]
---

# Terminal Plugin

PTY terminal emulator using xterm.js with FitAddon. Creates a terminal instance in a card body, wires IPC to main-process node-pty via terminal:create/write/resize/kill channels. Handles Ctrl+Shift+C for copy selection and Ctrl+Shift+V for paste (write to PTY only to avoid echo double-paste). Reads theme colors from CSS custom properties for terminal background/foreground/cursor. Provides getScreenBuffer() for AI agent access to terminal output.

## Referenced By

- [[canvas-area.spec.md|canvas-area]] `src/renderer/components/CanvasArea.ts`

## IPC Channels

- `terminal:create`
- `terminal:write`
- `terminal:resize`
- `terminal:kill`
- `terminal:data`
- `terminal:exit`

## Interface

### Methods

- **constructor** `(container: HTMLElement, uuid: string, cwd?: string)` — Creates xterm Terminal with FitAddon, attaches IPC listeners for data/exit, observes resize
- **static readTheme** `(): { background: string; foreground: string; cursor: string; selectionBackground: string }` — Reads --bg, --primary, --accent CSS vars for terminal theme
- **updateTheme** `(): void` — Applies current CSS theme colors to the xterm instance
- **getScreenBuffer** `(maxLines?: number): string` — Returns the last N lines of terminal output as plain text
- **fit** `(): void` — Adjusts terminal cols/rows to match container size
- **destroy** `(): void` — Kills PTY, detaches IPC listeners, disposes xterm and ResizeObserver

### Properties

- **uuid**: string — PTY process UUID matching main process terminal map
- **element**: HTMLDivElement — Container element for the xterm terminal
- **onExit**: (() => void) | null — Callback invoked when the PTY process exits

## Lifecycle

- **created_by:** CanvasArea.addTerminal()
- **destroyed_by:** CanvasArea.terminateCard() or user clicking X

## External Dependencies

- `@xterm/xterm`
- `@xterm/addon-fit`

