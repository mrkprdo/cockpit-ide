---
name: Markdown Plugin UI
parent: markdown-plugin
---

# Markdown Plugin UI

DOM structure, tab management, and content rendering for the Markdown preview viewer.

## DOM Structure

```
.card-body (PluginCard body container)
├── .markdown-tab-bar | flex row, scrollable
│   └── .markdown-tab[] (one per open .md file)
│       ├── .tab-title (file basename)
│       └── .tab-close (× button)
└── .markdown-content | overflow-y: auto; padding: 16px
    └── .markdown-body (rendered HTML from marked)
        ├── h1, h2, h3... (headings with anchor links)
        ├── p, ul, ol, blockquote (styled prose)
        ├── pre > code (syntax highlighted code blocks)
        ├── table (bordered tables)
        └── a (external links, open in browser)
```

## Interactions

### Tab Open (Load File)

- **trigger:** Call `openFile(filePath)` from CanvasArea or double-click in file explorer
- `fs:readFile` IPC → `marked.parse(markdown)` → set `.markdown-content` innerHTML
- Add tab to bar if not already open
- Switch to new tab
- **result:** Markdown rendered as styled HTML in content area

### Tab Switch

- **trigger:** Click on tab in `.markdown-tab-bar`
- Show corresponding content div, hide others
- Update `.active` class on tabs
- **result:** Different file content displayed

### Tab Close

- **trigger:** Click × button on tab, or right-click → Close
- Remove tab and associated content div
- If closed tab was active: switch to adjacent tab
- **result:** Tab removed

### Tab Context Menu

- **trigger:** Right-click on markdown tab
- `ContextMenu.show()` with: Close, Close Others, Copy Path
- Copy Path: `clipboard:writeText` IPC with full file path
- **result:** Context actions executed

### Auto-Reload (External Change)

- **trigger:** `file:changed` listener fires for open markdown file
- Re-read file via `fs:readFile` → re-render with marked
- Preserve scroll position in content area
- **result:** Preview updated to reflect file changes

### External Links

- **trigger:** Click on `<a>` link in rendered markdown
- Determine if link is external (http/https) or internal (relative)
- External: `shell:openExternal` IPC
- Internal: `openFile(relativePath)` if exists in workspace
- **result:** Link opened in browser or opened as new tab

## States

### Empty (No Tabs)

Placeholder: "Open a Markdown file to preview" centered in content area.

### Single Tab

One tab with file name, markdown content rendered below tab bar.

### Multiple Tabs

Tab bar scrollable, one `.active` tab, inactive tabs dimmed slightly.

### Loading

Content area shows spinner or "Loading..." while `fs:readFile` resolves.

### Error

Content area shows "Error loading file: [message]" if read fails.

### Reloading (External Change)

Brief flash on content area when auto-reloading from external change.

## Accessibility

- **Tab order:** Tab bar → content area
- **Keyboard:** Ctrl+W closes active tab
- **Scroll:** Content area independently scrollable
