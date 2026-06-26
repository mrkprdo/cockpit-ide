---
name: AI Drawer UI
parent: ai-drawer
---

# AI Drawer UI

DOM structure, chat interactions, context gathering, and states for the slide-out AI assistant panel.

## DOM Structure

```
.ai-drawer | position: fixed; top: 0; right: 0; height: 100vh; z-index: 1500
├── .ai-drawer-header
│   ├── .ai-drawer-title "AI Assistant"
│   ├── .ai-drawer-model-selector (model dropdown)
│   └── button.ai-drawer-close (× close button)
├── .ai-drawer-chat | flex: 1; overflow-y: auto
│   └── .ai-message[] (one per chat turn)
│       ├── .ai-message-user (user messages, right-aligned)
│       │   └── .ai-message-content (text or code blocks)
│       └── .ai-message-assistant (AI responses, left-aligned)
│           ├── .ai-message-content (markdown-rendered text)
│           └── .ai-message-actions
│               ├── button.copy (copy response)
│               └── button.apply (apply suggested file changes)
├── .ai-drawer-context | collapsible
│   ├── .ai-context-header "Workspace Context" (toggle)
│   └── .ai-context-body
│       ├── .ai-context-section "Current Branch: main"
│       ├── .ai-context-section "Changed Files: N"
│       └── .ai-context-section "Open Files: N"
├── .ai-drawer-input-area
│   ├── textarea.ai-drawer-input (message input)
│   └── button.ai-drawer-send (send button)
└── .ai-drawer-resizer (left edge drag handle, 4px)
```

## Interactions

### Toggle Open/Close

- **trigger:** Menu action (View → AI Chat) or toolbar button
- Panel slides in from right (transform: translateX transition, 300ms ease)
- Close: slides out or button click
- **result:** AI assistant panel visible or hidden

### Send Message

- **trigger:** Type in textarea + press Enter or click Send button
- Gather workspace context (git status, open files, file tree)
- Send message + context to LLM API via `fetch`
- Show user message bubble immediately
- Stream response: render markdown incrementally in assistant bubble
- **result:** AI response displayed in chat

### Copy Response

- **trigger:** Click Copy button on assistant message
- `clipboard:writeText` IPC with message content
- **result:** Response text in clipboard

### Apply Code Suggestion

- **trigger:** Click Apply button on code block in AI response
- Extract file path and content from code block
- `fs:writeFile` IPC to create/overwrite file
- Optionally stage with `git:stage`
- **result:** AI-suggested code written to workspace

### Clear History

- **trigger:** Click Clear button in header
- Clear `localStorage['cockpit-ai-history']`
- Remove all message DOM elements
- **result:** Fresh conversation context

### Resize Drawer

- **trigger:** `mousedown` on `.ai-drawer-resizer` (left edge)
- Drag horizontally to resize drawer width
- Clamp between 300px and 600px
- Save width preference via `prefs:save`
- **result:** Panel width adjusted

### Context Toggle

- **trigger:** Click `.ai-context-header` 
- Toggle `.ai-context-body` visibility
- **result:** Workspace context shown or collapsed

## States

### Closed

Panel off-screen (transform: translateX(100%)), no DOM interaction.

### Open (Idle)

Panel visible, chat history displayed, input focused, ready for message.

### Sending

Send button disabled, input disabled, "Thinking..." animation in new assistant bubble.

### Receiving Response

Assistant bubble growing as response streams, markdown rendering incrementally, scroll follows content.

### Error

Error message bubble: "Failed to reach AI service: [reason]", retry button.

### Empty (First Use)

Welcome message: "Ask me about your codebase. I can see your file structure, git status, and open files."

## Accessibility

- **Escape:** Close drawer
- **Enter:** Send message (Shift+Enter for newline)
- **Tab:** Input → Send button → Context sections
