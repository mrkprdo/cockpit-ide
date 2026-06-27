---
name: AI Drawer UI
parent: ai-drawer
---

# AI Drawer UI

AI assistant side panel with chat messages, session management, and tool integration.

## DOM Structure

```html
<div class="ai-drawer" style="width: 0">
  <div class="ai-drawer-notch">▶</div>
  <div class="ai-drawer-content">
    <!-- Session selector -->
    <div class="ai-session-bar">
      <select class="ai-session-select"></select>
      <button class="ai-session-new">+</button>
      <button class="ai-session-rename">✎</button>
      <button class="ai-session-delete">×</button>
    </div>
    <!-- Messages -->
    <div class="ai-messages">
      <div class="ai-message ai-message-user">
        <div class="ai-message-role">User</div>
        <div class="ai-message-content">text or code</div>
      </div>
      <div class="ai-message ai-message-assistant">
        <div class="ai-message-role">Assistant</div>
        <div class="ai-message-content">response</div>
      </div>
      <div class="ai-message ai-message-thinking">
        <div class="ai-message-role">Thinking</div>
        <div class="ai-message-content">thought process</div>
      </div>
      <div class="ai-message ai-message-tool">
        <div class="ai-message-role">Tool: read_file</div>
        <div class="ai-message-content">/path/to/file</div>
        <div class="ai-message-tool-result">result preview</div>
      </div>
    </div>
    <!-- Input area -->
    <div class="ai-input-bar">
      <button class="ai-attach-btn">Attach</button>
      <textarea class="ai-input" placeholder="Ask anything..."></textarea>
      <button class="ai-send-btn" disabled>Send</button>
    </div>
  </div>
</div>
```

## Interactions

### Toggle Open/Close
- **trigger:** `click` on `.ai-drawer-notch` (▶/◀)
- Toggle `.is-open` class, animate width between `0` and `420px`.

### Send Message
- **trigger:** `click` on `.ai-send-btn` or `Enter` in textarea (Ctrl+Enter for newline)
- Read input, create user message, clear input, call backend API (not yet wired).

### Session Switch
- **trigger:** `change` on `.ai-session-select`
- Save current session, load selected session's messages.

### New Session
- **trigger:** `click` on `.ai-session-new`
- Create new session with generated title, switch to it.

### Attach File
- **trigger:** `click` on `.ai-attach-btn`
- Open a file picker or show recent files to attach as context.

### Model Select
- **trigger:** `change` on model selector (in settings area)
- Switch active model.

## States

### Open
- `.is-open` class on drawer. Width animates to 420px. Notch rotates.

### Closed
- Width 0px, notch shows ▶.

### Loading
- While waiting for AI response: "Thinking..." indicator in messages.

### Empty Session
- No messages yet: shows placeholder text in messages area.

### Tool Result
- Tool messages show collapsible result preview.
