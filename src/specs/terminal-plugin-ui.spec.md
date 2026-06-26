---
name: Terminal Plugin UI
parent: terminal-plugin
---

# Terminal Plugin UI

DOM structure, terminal interactions, and states for the xterm.js-based PTY terminal emulator embedded in a PluginCard.

## DOM Structure

```
.card-body (PluginCard body container)
└── .terminal-container | width: 100%; height: 100%
    └── .xterm (mounted by xterm.js Terminal.open())
        ├── .xterm-viewport (scrollable area)
        ├── .xterm-screen (character grid)
        └── .xterm-cursor (blinking block cursor)
```

## Interactions

### Keyboard Input

- **trigger:** Any keypress while terminal is focused
- Keystrokes sent to PTY via `terminal:write` IPC
- PTY stdout streamed back via `terminal:data` listener → xterm.write()
- **result:** Real shell interaction with sub-100ms latency

### Terminal Resize

- **trigger:** `ResizeObserver` fires on `.terminal-container` or card resize
- Compute `cols = Math.floor(width / charWidth)`, `rows = Math.floor(height / charHeight)`
- `terminal.resize(cols, rows)` + `terminal:resize` IPC to PTY
- **result:** Shell process informed of new dimensions, output reflows

### Copy

- **trigger:** Terminal text selection + Ctrl+C or right-click → Copy
- If terminal has selection: `clipboard:writeText` IPC with selected text
- Otherwise: passes through to shell as SIGINT
- **result:** Selected text in clipboard or signal sent to process

### Paste

- **trigger:** Ctrl+V or right-click → Paste
- `clipboard:readText` IPC → `terminal:write` to PTY
- **result:** Clipboard content typed into shell

### Process Exit

- **trigger:** Shell process exits (user types `exit` or process terminates)
- `terminal:exit` listener fires with exit code
- Terminal displays "[Process exited with code N]" message
- `onExit(code)` callback fires → CanvasArea may close card
- **result:** Terminal shows exit status, card may auto-close

### Scrollback

- **trigger:** Mouse wheel over terminal viewport
- xterm.js scrollback buffer navigates (default 1000 lines)
- **result:** Previously output lines visible in viewport

## States

### Active

Terminal running, cursor blinking, PTY connected, accepting input.

### Exited

Shell process terminated, static "[Process exited]" message, no input accepted, cursor hidden.

### Resizing

During card resize: terminal dimensions recalculating, PTY resize in-flight.

### Unfocused

Card not focused → terminal cursor stops blinking, faint border, still receiving output.

## Accessibility

- **Font:** `--font-mono` (Space Mono), antialiased for legibility
- **Colors:** xterm.js theme synced with current Cockpit theme (dark/light)
