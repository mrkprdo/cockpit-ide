interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'thinking';
  content: string;
  timestamp: number;
  toolName?: string;
  toolResult?: string;
  isSteer?: boolean;
}

interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

const AGENT_SYSTEM_PROMPT = `You are Cockpit Agent, an AI assistant embedded in Cockpit IDE — a spatial, canvas-based IDE where plugin cards (Explorer, Terminal, Git, Markdown, SpecsMap) float on an infinite canvas.

## Capabilities
- **Files**: read_file, write_file, list_directory, create_directory, delete_file, rename_file, copy_file, grep_workspace
- **Editor**: read_editor, get_editor_state, get_selected_text, set_editor_content, insert_text_in_editor, go_to_line, open_file_in_editor, reveal_file_in_explorer, open_in_markdown
- **Terminal**: write_to_terminal, send_key_to_terminal, read_terminal, kill_terminal (get uuid from get_canvas_state)
- **Canvas cards**: get_canvas_state, add_plugin, focus_card, close_card, minimize_card, reopen_card, move_card, resize_card, auto_arrange, reset_view, pan_to_card, set_view, zoom_in, zoom_out
- **Git**: git_status, git_diff, git_log, git_stage, git_unstage, git_commit, git_push, git_branches, git_checkout
- **System**: open_external, get_clipboard, set_clipboard
- **SpecsMap**: refresh_specsmap (reload graph from disk), regenerate_specsmap (re-scan src/ and rebuild all spec files)

## Rules
- Always use absolute paths for files.
- git_* tools default repo_path to workspace root — omit it unless targeting a different repo.
- To run a terminal command: get_canvas_state → write_to_terminal(uuid, command). Read output with read_terminal(uuid).
- To send a special key (Tab, Escape, ArrowUp, Ctrl+c, etc.): use send_key_to_terminal(uuid, key) — never embed raw escape chars in write_to_terminal.
- When editing a file: read_file first → write_file with full new content. Or open in editor → set_editor_content.
- grep_workspace is fast for finding symbols/patterns. Use it before reading many files.
- Be concise. After completing a task, give a one-sentence summary.`;

const KEY_SEQUENCES: Record<string, string> = {
  Tab: '\x09', Enter: '\r', Escape: '\x1b', Backspace: '\x7f',
  Delete: '\x1b[3~', Home: '\x1b[H', End: '\x1b[F',
  PageUp: '\x1b[5~', PageDown: '\x1b[6~',
  ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D',
  F1: '\x1bOP', F2: '\x1bOQ', F3: '\x1bOR', F4: '\x1bOS',
  F5: '\x1b[15~', F6: '\x1b[17~', F7: '\x1b[18~', F8: '\x1b[19~',
  F9: '\x1b[20~', F10: '\x1b[21~', F11: '\x1b[23~', F12: '\x1b[24~',
  'Ctrl+a': '\x01', 'Ctrl+b': '\x02', 'Ctrl+c': '\x03', 'Ctrl+d': '\x04',
  'Ctrl+e': '\x05', 'Ctrl+f': '\x06', 'Ctrl+k': '\x0b', 'Ctrl+l': '\x0c',
  'Ctrl+r': '\x12', 'Ctrl+u': '\x15', 'Ctrl+w': '\x17', 'Ctrl+z': '\x1a',
};

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file in the workspace. Returns up to 12 000 chars.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file (creates or overwrites). Always use absolute paths.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' },
          content: { type: 'string', description: 'Full file content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and subdirectories at a path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the directory' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create a directory (and any missing parents).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path of directory to create' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_canvas_state',
      description: 'Return the current IDE canvas state: open cards, types, positions, workspace path.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_file_in_editor',
      description: 'Open a file in the Explorer/Editor card.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_plugin',
      description: 'Add a plugin card to the canvas.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['terminal', 'explorer', 'git', 'markdown', 'specsmap'],
            description: 'Plugin type to add',
          },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'focus_card',
      description: 'Bring a canvas card to the front and pan to it.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Card title, e.g. "Explorer", "Terminal 1", "Git"' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file or directory from the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to delete' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_file',
      description: 'Rename or move a file within the workspace.',
      parameters: {
        type: 'object',
        properties: {
          old_path: { type: 'string', description: 'Current absolute path' },
          new_path: { type: 'string', description: 'New absolute path' },
        },
        required: ['old_path', 'new_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'copy_file',
      description: 'Copy a file or directory within the workspace.',
      parameters: {
        type: 'object',
        properties: {
          src: { type: 'string', description: 'Source absolute path' },
          dest: { type: 'string', description: 'Destination absolute path' },
        },
        required: ['src', 'dest'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_card',
      description: 'Close and remove a canvas card entirely.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Card title, e.g. "Terminal 1", "Git"' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'minimize_card',
      description: 'Minimize (hide) a canvas card without removing it.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Card title' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_card',
      description: 'Move a canvas card to world coordinates (x, y).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Card title' },
          x: { type: 'number', description: 'World X position (pixels)' },
          y: { type: 'number', description: 'World Y position (pixels)' },
        },
        required: ['title', 'x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resize_card',
      description: 'Resize a canvas card to the given width and height.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Card title' },
          width: { type: 'number', description: 'Width in pixels' },
          height: { type: 'number', description: 'Height in pixels' },
        },
        required: ['title', 'width', 'height'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'auto_arrange',
      description: 'Auto-arrange all open canvas cards in a grid.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_to_terminal',
      description: 'Send a command to a terminal card and execute it. Call get_canvas_state first to find the terminal uuid.',
      parameters: {
        type: 'object',
        properties: {
          uuid: { type: 'string', description: 'Terminal card uuid from get_canvas_state' },
          command: { type: 'string', description: 'Command to run (Enter is appended automatically)' },
        },
        required: ['uuid', 'command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_key_to_terminal',
      description: 'Send a special key or control sequence to a terminal. Use this instead of embedding escape chars in write_to_terminal. Supported keys: Tab, Enter, Escape, Backspace, Delete, Home, End, PageUp, PageDown, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, F1–F12, Ctrl+a/b/c/d/e/f/k/l/r/u/w/z.',
      parameters: {
        type: 'object',
        properties: {
          uuid: { type: 'string', description: 'Terminal card uuid from get_canvas_state' },
          key: { type: 'string', description: 'Key name, e.g. "Tab", "Escape", "ArrowUp", "Ctrl+c"' },
        },
        required: ['uuid', 'key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insert_text_in_editor',
      description: 'Insert text at the current cursor position in the active editor tab.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to insert at the cursor' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_terminal',
      description: 'Read the current output buffer of a terminal card (last 200 lines). Use get_canvas_state first to find the terminal uuid.',
      parameters: {
        type: 'object',
        properties: {
          uuid: { type: 'string', description: 'Terminal card uuid from get_canvas_state' },
        },
        required: ['uuid'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_editor',
      description: 'Read the full content of the currently active editor tab.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  // ── Editor ──────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_editor_state',
      description: 'Get the active editor state: open files, active file path, cursor position, and any selected text.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_selected_text',
      description: 'Get the text currently selected (highlighted) in the editor.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_editor_content',
      description: 'Replace the entire content of the active editor buffer. Triggers auto-save.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'New full content for the active file' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'go_to_line',
      description: 'Move the editor cursor to a specific line (and optional column) and reveal it.',
      parameters: {
        type: 'object',
        properties: {
          line: { type: 'number', description: 'Line number (1-based)' },
          col: { type: 'number', description: 'Column number (1-based, default 1)' },
        },
        required: ['line'],
      },
    },
  },
  // ── Canvas ───────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'reopen_card',
      description: 'Restore a minimized card back to the canvas.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Card title, e.g. "Terminal 2", "Explorer"' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reset_view',
      description: 'Reset canvas zoom to 1x and re-center the view.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pan_to_card',
      description: 'Pan and zoom the canvas to focus on a specific card by title (partial match ok). Also brings the card to front.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Card title or partial name (e.g. "Terminal 3", "Explorer")' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_view',
      description: 'Set canvas pan position and optional zoom level directly. panX/panY are screen-space pixel offsets (the world origin position on screen). zoom is a scale factor (1.0 = 100%).',
      parameters: {
        type: 'object',
        properties: {
          panX: { type: 'number', description: 'Horizontal pan offset in pixels' },
          panY: { type: 'number', description: 'Vertical pan offset in pixels' },
          zoom: { type: 'number', description: 'Zoom scale factor (0.1–5.0). Omit to keep current zoom.' },
        },
        required: ['panX', 'panY'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'zoom_in',
      description: 'Zoom in the canvas view by one step (~30%).',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'zoom_out',
      description: 'Zoom out the canvas view by one step (~30%).',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_in_markdown',
      description: 'Open a Markdown file in the Markdown preview card.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the .md file' },
        },
        required: ['path'],
      },
    },
  },
  // ── Navigation ───────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'reveal_file_in_explorer',
      description: 'Select and highlight a file in the Explorer file tree.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute path to the file' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_workspace',
      description: 'Search for a regex pattern across all files in a directory. Returns file path, line number, and matching line text.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regular expression to search for' },
          dir: { type: 'string', description: 'Directory to search in (defaults to workspace root)' },
          glob: { type: 'string', description: 'File extension filter e.g. ".ts" or ".json" (optional)' },
        },
        required: ['pattern'],
      },
    },
  },
  // ── Terminal ─────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'kill_terminal',
      description: 'Kill a terminal PTY process by uuid.',
      parameters: {
        type: 'object',
        properties: {
          uuid: { type: 'string', description: 'Terminal card uuid from get_canvas_state' },
        },
        required: ['uuid'],
      },
    },
  },
  // ── Git ──────────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Get current git status: branch, staged files, unstaged files.',
      parameters: {
        type: 'object',
        properties: {
          repo_path: { type: 'string', description: 'Repo path (defaults to workspace root)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Get unstaged diff for the repo or a specific file.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Specific file path (optional, omit for full diff)' },
          repo_path: { type: 'string', description: 'Repo path (defaults to workspace root)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_log',
      description: 'Get recent git commit history.',
      parameters: {
        type: 'object',
        properties: {
          max_count: { type: 'number', description: 'Max commits to return (default 10)' },
          repo_path: { type: 'string', description: 'Repo path (defaults to workspace root)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_stage',
      description: 'Stage a file for commit.',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file to stage' },
          repo_path: { type: 'string', description: 'Repo path (defaults to workspace root)' },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_unstage',
      description: 'Unstage a file (remove from staging area).',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file to unstage' },
          repo_path: { type: 'string', description: 'Repo path (defaults to workspace root)' },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Commit staged changes with a message.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message' },
          repo_path: { type: 'string', description: 'Repo path (defaults to workspace root)' },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_push',
      description: 'Push committed changes to the remote.',
      parameters: {
        type: 'object',
        properties: {
          repo_path: { type: 'string', description: 'Repo path (defaults to workspace root)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_branches',
      description: 'List all git branches (local and remote).',
      parameters: {
        type: 'object',
        properties: {
          repo_path: { type: 'string', description: 'Repo path (defaults to workspace root)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_checkout',
      description: 'Switch to a git branch.',
      parameters: {
        type: 'object',
        properties: {
          branch: { type: 'string', description: 'Branch name to checkout' },
          repo_path: { type: 'string', description: 'Repo path (defaults to workspace root)' },
        },
        required: ['branch'],
      },
    },
  },
  // ── System ───────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'open_external',
      description: 'Open a URL in the default system browser.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to open' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_clipboard',
      description: 'Read the current clipboard text content.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_clipboard',
      description: 'Write text to the clipboard.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to copy to clipboard' },
        },
        required: ['text'],
      },
    },
  },
  // ── SpecsMap ─────────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'refresh_specsmap',
      description: 'Reload the SpecsMap graph from the current spec files on disk.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'regenerate_specsmap',
      description: 'Re-scan the src/ directory and regenerate all SPECGEN spec files, then reload the SpecsMap.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

export class AiDrawer {
  private el: HTMLDivElement;
  private wrapper: HTMLDivElement;
  private notch: HTMLButtonElement;
  private resizeHandle: HTMLDivElement;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;
  private isDragging = false;
  private drawerWidth = 420;

  private messages: ChatMessage[] = [];
  private isLoading = false;
  private apiKey = '';
  private model = 'deepseek-v4-flash';
  private endpoint = 'https://opencode.ai/zen/go/v1';

  // Agentic control state
  private agentMode: 'auto' | 'plan' | 'step' = 'auto';
  private abortRequested = false;
  private continueResolve: (() => void) | null = null;
  private fetchController: AbortController | null = null;

  // Session state
  private sessions: Session[] = [];
  private currentSessionId = '';
  private sessionsLoaded = false;
  private cockpitDirEnsured = false;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Queue + steer state
  private promptQueue: string[] = [];
  private steeringMessage: string | null = null;

  private bodyEl!: HTMLDivElement;
  private messagesEl!: HTMLDivElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private abortBtn!: HTMLButtonElement;
  private steerBtn!: HTMLButtonElement;
  private queueBarEl!: HTMLDivElement;
  private settingsEl!: HTMLDivElement;
  private sessionsPanelEl!: HTMLDivElement;
  private sessionsListEl!: HTMLDivElement;
  private loadingEl!: HTMLDivElement;
  private stepControlsEl!: HTMLDivElement;
  private stepLabelEl!: HTMLSpanElement;
  private stepContinueBtn!: HTMLButtonElement;
  private stepStopBtn!: HTMLButtonElement;

  constructor() {
    const canvas = document.getElementById('canvas')!;
    const canvasParent = canvas.parentElement!;

    this.wrapper = document.createElement('div');
    this.wrapper.id = 'app-main';

    this.el = document.createElement('div');
    this.el.className = 'ai-drawer';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-label', 'AI Panel');

    this.resizeHandle = document.createElement('div');
    this.resizeHandle.className = 'ai-drawer-resize';

    this.notch = document.createElement('button');
    this.notch.className = 'ai-drawer-notch';
    this.notch.setAttribute('aria-label', 'Toggle AI panel');
    this.notch.innerHTML = '<span class="ai-drawer-notch-arrow">&#x25B6;</span>';
    this.notch.addEventListener('click', () => this.toggle());

    this.wrapper.appendChild(this.el);
    this.wrapper.appendChild(this.resizeHandle);
    canvasParent.replaceChild(this.wrapper, canvas);
    this.wrapper.appendChild(canvas);

    document.body.appendChild(this.notch);
    this.bindResize();

    this.showWelcome();
    this.render();
    this.loadSettings();
  }

  private async loadSettings(): Promise<void> {
    try {
      const prefs = await window.electronAPI?.prefs.load();
      if (prefs) {
        if (prefs.aiApiKey) this.apiKey = prefs.aiApiKey;
        if (prefs.aiModel) {
          this.model = prefs.aiModel
            .replace(/^opencode(?:-go)?\//, '')
            .replace(/-free$/, '');
        }
        if (prefs.aiEndpoint) {
          this.endpoint = prefs.aiEndpoint.replace(
            'opencode.ai/zen/v1',
            'opencode.ai/zen/go/v1',
          );
        }
      }
      const endpointInput = this.settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="endpoint"]');
      const apiKeyInput = this.settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="apiKey"]');
      const modelInput = this.settingsEl?.querySelector<HTMLInputElement>('.ai-settings-input[data-key="model"]');
      if (endpointInput) endpointInput.value = this.endpoint;
      if (apiKeyInput) apiKeyInput.value = this.apiKey;
      if (modelInput) modelInput.value = this.model;
      if (prefs && (prefs.aiModel !== this.model || prefs.aiEndpoint !== this.endpoint)) {
        this.saveSettings();
      }
    } catch {}
  }

  private async saveSettings(): Promise<void> {
    try {
      const prefs = (await window.electronAPI?.prefs.load()) || {};
      prefs.aiApiKey = this.apiKey;
      prefs.aiModel = this.model;
      prefs.aiEndpoint = this.endpoint;
      window.electronAPI?.prefs.save(prefs);
    } catch {}
  }

  private showWelcome(): void {
    this.messages = [{
      role: 'assistant',
      content: '**Cockpit Agent ready.** I can read/write files, open them in the editor, add plugins, and arrange the canvas. Ask me to do something in your workspace.',
      timestamp: Date.now(),
    }];
  }

  // ── Sessions ────────────────────────────────────────────────────────────────

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  private getSessionTitle(session: Session): string {
    const first = session.messages.find(m => m.role === 'user');
    if (!first) return 'New session';
    return first.content.slice(0, 48).replace(/\n/g, ' ');
  }

  private getSessionsPath(): string | null {
    const cockpit = (window as any).__cockpit;
    const wp = cockpit?.getWorkspacePath?.();
    return wp ? `${wp}/.cockpit/ai-sessions.json` : null;
  }

  private getCockpitDir(): string | null {
    const cockpit = (window as any).__cockpit;
    const wp = cockpit?.getWorkspacePath?.();
    return wp ? `${wp}/.cockpit` : null;
  }

  private async loadSessions(): Promise<void> {
    if (this.sessionsLoaded) return;
    this.sessionsLoaded = true;
    const path = this.getSessionsPath();
    if (!path) { this.initFirstSession(); return; }
    try {
      const raw = await window.electronAPI?.fs.readFile(path);
      if (!raw) { this.initFirstSession(); return; }
      const data = JSON.parse(raw) as { sessions: Session[]; currentSessionId: string };
      this.sessions = data.sessions || [];
      this.currentSessionId = data.currentSessionId || '';
      if (this.sessions.length === 0) { this.initFirstSession(); return; }
      const current = this.sessions.find(s => s.id === this.currentSessionId) ?? this.sessions[0];
      this.currentSessionId = current.id;
      this.messages = [...current.messages];
      this.renderMessages();
    } catch { this.initFirstSession(); }
  }

  private initFirstSession(): void {
    const session: Session = {
      id: this.generateId(),
      title: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [...this.messages],
    };
    this.sessions = [session];
    this.currentSessionId = session.id;
  }

  private saveSessions(): void {
    if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(() => {
      this.saveDebounceTimer = null;
      this.flushSave();
    }, 300);
  }

  private flushSave(): void {
    const path = this.getSessionsPath();
    const dir = this.getCockpitDir();
    if (!path || !dir) return;
    const data = { sessions: this.sessions, currentSessionId: this.currentSessionId };
    const json = JSON.stringify(data, null, 2);
    const doWrite = () => window.electronAPI!.fs.writeFile(path, json).catch(() => {});
    if (this.cockpitDirEnsured) {
      doWrite();
    } else {
      window.electronAPI?.fs.mkdir(dir)
        .then(() => { this.cockpitDirEnsured = true; return doWrite(); })
        .catch(() => {});
    }
  }

  private updateCurrentSession(): void {
    if (!this.currentSessionId) return;
    this.saveSessionById(this.currentSessionId, this.messages);
  }

  private newSession(): void {
    this.updateCurrentSession();
    const session: Session = {
      id: this.generateId(),
      title: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    this.sessions.unshift(session);
    this.currentSessionId = session.id;
    this.showWelcome();
    this.renderMessages();
    this.renderSessionsList();
    this.saveSessions();
  }

  private switchSession(id: string): void {
    if (this.isLoading) return;
    if (id === this.currentSessionId) { this.sessionsPanelEl.classList.remove('is-visible'); return; }
    this.updateCurrentSession();
    this.currentSessionId = id;
    const session = this.sessions.find(s => s.id === id);
    if (!session) return;
    this.messages = [...session.messages];
    this.renderMessages();
    this.renderSessionsList();
    this.sessionsPanelEl.classList.remove('is-visible');
    this.saveSessions();
  }

  private deleteSession(id: string): void {
    this.sessions = this.sessions.filter(s => s.id !== id);
    if (this.sessions.length === 0) {
      this.initFirstSession();
      this.showWelcome();
      this.renderMessages();
    } else if (id === this.currentSessionId) {
      this.currentSessionId = this.sessions[0].id;
      this.messages = [...this.sessions[0].messages];
      this.renderMessages();
    }
    this.renderSessionsList();
    this.saveSessions();
  }

  private renderSessionsList(): void {
    if (!this.sessionsListEl) return;
    const now = Date.now();
    if (this.sessions.length === 0) {
      this.sessionsListEl.innerHTML = '<div class="ai-sessions-empty">No sessions</div>';
      return;
    }
    this.sessionsListEl.innerHTML = this.sessions.map(s => {
      const title = this.getSessionTitle(s);
      const age = this.formatAge(s.updatedAt, now);
      const active = s.id === this.currentSessionId;
      return `<div class="ai-session-item${active ? ' is-active' : ''}" data-id="${s.id}">
        <div class="ai-session-info">
          <span class="ai-session-title">${this.escapeHtml(title)}</span>
          <span class="ai-session-age">${age}</span>
        </div>
        <button class="ai-session-delete" data-id="${s.id}" title="Delete">&times;</button>
      </div>`;
    }).join('');

    this.sessionsListEl.querySelectorAll<HTMLElement>('.ai-session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.ai-session-delete')) return;
        this.switchSession(item.dataset.id!);
      });
    });
    this.sessionsListEl.querySelectorAll<HTMLButtonElement>('.ai-session-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSession(btn.dataset.id!);
      });
    });
  }

  private formatAge(ts: number, now: number): string {
    const d = now - ts;
    const mins = Math.floor(d / 60000);
    const hours = Math.floor(d / 3600000);
    const days = Math.floor(d / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  private render(): void {
    this.el.innerHTML = `
      <div class="ai-drawer-content">
        <div class="ai-drawer-header">
          <div class="ai-drawer-header-row">
            <span class="ai-drawer-title">COCKPIT AGENT</span>
            <div class="ai-header-actions">
              <button class="ai-new-session-btn" title="New session">&#x2B; New</button>
              <button class="ai-sessions-btn" aria-label="Sessions" title="Sessions">&#x25A4;</button>
              <button class="ai-drawer-settings-btn" aria-label="Settings" title="Settings">&#x2699;</button>
            </div>
          </div>
          <div class="ai-mode-bar" role="group" aria-label="Agent mode">
            <button class="ai-mode-btn is-active" data-mode="auto" title="Run all steps automatically">AUTO</button>
            <button class="ai-mode-btn" data-mode="plan" title="Write a plan first, then execute on approval">PLAN</button>
            <button class="ai-mode-btn" data-mode="step" title="Pause between each tool step">STEP</button>
          </div>
        </div>
        <div class="ai-drawer-body">
          <div class="ai-chat-messages" aria-live="polite" aria-label="Conversation"></div>
          <div class="ai-chat-loading" style="display:none">
            <span class="ai-chat-loading-dot"></span>
            <span class="ai-chat-loading-dot"></span>
            <span class="ai-chat-loading-dot"></span>
          </div>
        </div>
        <div class="ai-step-controls" role="status">
          <div class="ai-step-controls-inner">
            <span class="ai-step-label"></span>
            <div class="ai-step-btns">
              <button class="ai-step-continue-btn">&#x25B6; Continue</button>
              <button class="ai-step-stop-btn">&#x2298; Stop</button>
            </div>
          </div>
        </div>
        <div class="ai-queue-bar" style="display:none"></div>
        <div class="ai-chat-input-area">
          <textarea class="ai-chat-input" placeholder="Ask the agent to do something..." rows="3"></textarea>
          <button class="ai-chat-send-btn" aria-label="Send" title="Send">&#x27A4;</button>
          <button class="ai-chat-abort-btn" aria-label="Abort" title="Abort agent" style="display:none">&#x2298;</button>
          <button class="ai-chat-steer-btn" aria-label="Steer agent" title="Inject guidance into active run" style="display:none">&#x21B3;</button>
        </div>
      </div>
      <div class="ai-drawer-settings">
        <div class="ai-settings-content">
          <div class="ai-settings-header">
            <span>Settings</span>
            <button class="ai-settings-close" aria-label="Close settings">&times;</button>
          </div>
          <label class="ai-settings-label">
            API Endpoint
            <input class="ai-settings-input" type="text" value="${this.escapeHtml(this.endpoint)}" data-key="endpoint" placeholder="https://api.openai.com/v1">
          </label>
          <label class="ai-settings-label">
            API Key
            <input class="ai-settings-input" type="password" value="${this.escapeHtml(this.apiKey)}" data-key="apiKey" placeholder="sk-...">
          </label>
          <label class="ai-settings-label">
            Model
            <input class="ai-settings-input" type="text" value="${this.escapeHtml(this.model)}" data-key="model" placeholder="deepseek-v4-flash">
          </label>
          <button class="ai-settings-save">Save</button>
        </div>
      </div>
      <div class="ai-sessions-panel">
        <div class="ai-sessions-header">
          <span class="ai-sessions-title">Sessions</span>
          <button class="ai-sessions-close" aria-label="Close sessions">&times;</button>
        </div>
        <div class="ai-sessions-list"></div>
      </div>
    `;

    this.bodyEl = this.el.querySelector('.ai-drawer-body')!;
    this.messagesEl = this.el.querySelector('.ai-chat-messages')!;
    this.inputEl = this.el.querySelector('.ai-chat-input')!;
    this.sendBtn = this.el.querySelector('.ai-chat-send-btn')!;
    this.abortBtn = this.el.querySelector('.ai-chat-abort-btn')!;
    this.steerBtn = this.el.querySelector('.ai-chat-steer-btn')!;
    this.queueBarEl = this.el.querySelector('.ai-queue-bar')!;
    this.settingsEl = this.el.querySelector('.ai-drawer-settings')!;
    this.sessionsPanelEl = this.el.querySelector('.ai-sessions-panel')!;
    this.sessionsListEl = this.el.querySelector('.ai-sessions-list')!;
    this.loadingEl = this.el.querySelector('.ai-chat-loading')!;
    this.stepControlsEl = this.el.querySelector('.ai-step-controls')!;
    this.stepLabelEl = this.el.querySelector('.ai-step-label')!;
    this.stepContinueBtn = this.el.querySelector('.ai-step-continue-btn')!;
    this.stepStopBtn = this.el.querySelector('.ai-step-stop-btn')!;

    this.bindEvents();
    this.renderMessages();
  }

  private formatBody(content: string): string {
    return content
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_: string, lang: string, code: string) => {
        return `<pre class="ai-chat-code"><code class="${lang ? `lang-${lang}` : ''}">${this.escapeHtml(code.trim())}</code></pre>`;
      })
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  private bindEvents(): void {
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    this.steerBtn.addEventListener('click', () => this.submitSteer());

    // Mode selector
    this.el.querySelectorAll<HTMLButtonElement>('.ai-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.agentMode = btn.dataset.mode as 'auto' | 'plan' | 'step';
        this.el.querySelectorAll('.ai-mode-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
      });
    });

    // Step controls
    this.stepContinueBtn.addEventListener('click', () => {
      this.stepControlsEl.classList.remove('is-visible');
      this.continueResolve?.();
    });
    this.stepStopBtn.addEventListener('click', () => {
      this.abortRequested = true;
      this.fetchController?.abort();
      this.stepControlsEl.classList.remove('is-visible');
      this.continueResolve?.();
    });

    // Abort button
    this.abortBtn.addEventListener('click', () => {
      this.abortRequested = true;
      this.fetchController?.abort();
      this.stepControlsEl.classList.remove('is-visible');
      this.continueResolve?.();
    });

    // Sessions panel
    const sessionsBtn = this.el.querySelector('.ai-sessions-btn')!;
    sessionsBtn.addEventListener('click', () => {
      const opening = !this.sessionsPanelEl.classList.contains('is-visible');
      this.settingsEl.classList.remove('is-visible');
      this.sessionsPanelEl.classList.toggle('is-visible');
      if (opening) this.renderSessionsList();
    });
    this.el.querySelector('.ai-sessions-close')!.addEventListener('click', () => {
      this.sessionsPanelEl.classList.remove('is-visible');
    });
    this.el.querySelector('.ai-new-session-btn')!.addEventListener('click', () => {
      this.newSession();
      this.sessionsPanelEl.classList.remove('is-visible');
    });

    const settingsBtn = this.el.querySelector('.ai-drawer-settings-btn')!;
    settingsBtn.addEventListener('click', () => {
      this.sessionsPanelEl.classList.remove('is-visible');
      this.settingsEl.classList.toggle('is-visible');
    });

    const closeBtn = this.el.querySelector('.ai-settings-close')!;
    closeBtn.addEventListener('click', () => {
      this.settingsEl.classList.remove('is-visible');
    });

    const saveBtn = this.el.querySelector('.ai-settings-save')!;
    saveBtn.addEventListener('click', () => {
      const inputs = this.settingsEl.querySelectorAll<HTMLInputElement>('.ai-settings-input');
      inputs.forEach((input) => {
        const key = input.dataset.key;
        if (key === 'endpoint') this.endpoint = input.value;
        else if (key === 'apiKey') this.apiKey = input.value;
        else if (key === 'model') this.model = input.value;
      });
      this.saveSettings();
      this.settingsEl.classList.remove('is-visible');
    });
  }

  private renderMessages(): void {
    this.messagesEl.innerHTML = this.messages.map((m, i) => this.renderMessage(m, i)).join('');
    // Mark only the last message for entrance animation; previous messages render instantly
    const last = this.messagesEl.lastElementChild as HTMLElement | null;
    if (last) last.classList.add('is-new');
    this.bindMessageActions();
    // Defer scroll so browser has painted the new content and scrollHeight is final
    requestAnimationFrame(() => {
      this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
    });
  }

  private renderMessage(m: ChatMessage, index = 0): string {
    if (m.role === 'tool') {
      const name = m.toolName || '';
      const pending = m.toolResult === undefined;
      const resultHtml = pending
        ? `<div class="ai-tool-result ai-tool-result-pending">running…</div>`
        : `<pre class="ai-tool-result">${this.escapeHtml(m.toolResult!)}</pre>`;
      return `<div class="ai-chat-msg ai-chat-msg-tool"><details class="ai-tool-details"${pending ? ' open' : ''}><summary class="ai-tool-chip"><span class="ai-tool-icon">⚙</span><span class="ai-tool-name">${this.escapeHtml(name)}</span><span class="ai-tool-args">${this.escapeHtml(m.content)}</span><span class="ai-tool-toggle">▸</span></summary>${resultHtml}</details></div>`;
    }

    if (m.role === 'thinking') {
      const body = this.formatBody(m.content);
      return `<div class="ai-chat-msg ai-chat-msg-thinking"><details class="ai-thinking-details" open><summary class="ai-thinking-header"><span class="ai-thinking-icon">◈</span><span class="ai-thinking-label">Agent reasoning</span><span class="ai-thinking-toggle">▸</span></summary><div class="ai-thinking-body">${body}</div></details></div>`;
    }

    const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let body = this.formatBody(m.content);

    if (m.role === 'system') {
      return `<div class="ai-chat-msg ai-chat-msg-system"><div class="ai-chat-msg-bubble">${body}</div></div>`;
    }

    const steerBadge = m.isSteer ? '<span class="ai-steer-badge">&#x21B3; steer</span>' : '';
    return `
      <div class="ai-chat-msg ai-chat-msg-${m.role}${m.isSteer ? ' is-steer' : ''}">
        <div class="ai-chat-msg-bubble">
          ${steerBadge}
          <div class="ai-chat-msg-text">${body}</div>
          <div class="ai-chat-msg-meta">
            <span class="ai-chat-msg-time">${time}</span>
            ${m.role === 'assistant' ? `<button class="ai-chat-copy-btn" data-msg-index="${index}" title="Copy code">&#x2398;</button>` : ''}
          </div>
        </div>
      </div>`;
  }

  private bindMessageActions(): void {
    this.messagesEl.querySelectorAll<HTMLButtonElement>('.ai-chat-copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.msgIndex ?? '-1', 10);
        const msg = idx >= 0 ? this.messages[idx] : undefined;
        if (msg) {
          const codeMatch = msg.content.match(/```\w*\n([\s\S]*?)```/);
          const text = codeMatch ? codeMatch[1].trim() : msg.content;
          navigator.clipboard.writeText(text).catch(() => {});
        }
      });
    });
  }

  private submitSteer(): void {
    const text = this.inputEl.value.trim();
    if (!text || !this.isLoading) return;
    this.inputEl.value = '';
    this.steeringMessage = text;
    this.messages.push({ role: 'user', content: text, timestamp: Date.now(), isSteer: true });
    this.renderMessages();
    requestAnimationFrame(() => { this.bodyEl.scrollTop = this.bodyEl.scrollHeight; });
  }

  private queueMessage(text: string): void {
    this.promptQueue.push(text);
    this.renderQueueBar();
  }

  private processQueue(): void {
    if (this.promptQueue.length === 0 || this.isLoading) return;
    const next = this.promptQueue.shift()!;
    this.renderQueueBar();
    this.runMessage(next);
  }

  private renderQueueBar(): void {
    if (!this.queueBarEl) return;
    if (this.promptQueue.length === 0) {
      this.queueBarEl.classList.remove('is-visible');
      this.queueBarEl.innerHTML = '';
      return;
    }
    this.queueBarEl.innerHTML = `
      <div class="ai-queue-bar-inner">
        <div class="ai-queue-header">
          <span class="ai-queue-label">&#x25B8; ${this.promptQueue.length} queued</span>
          <button class="ai-queue-clear" title="Clear queue">&times; Clear all</button>
        </div>
        ${this.promptQueue.map((q, i) => `
          <div class="ai-queue-item">
            <span class="ai-queue-text">${this.escapeHtml(q.slice(0, 60))}${q.length > 60 ? '…' : ''}</span>
            <button class="ai-queue-remove" data-index="${i}">&times;</button>
          </div>
        `).join('')}
      </div>
    `;
    this.queueBarEl.classList.add('is-visible');
    this.queueBarEl.querySelector('.ai-queue-clear')!.addEventListener('click', () => {
      this.promptQueue = [];
      this.renderQueueBar();
    });
    this.queueBarEl.querySelectorAll<HTMLButtonElement>('.ai-queue-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index!);
        this.promptQueue.splice(idx, 1);
        this.renderQueueBar();
      });
    });
  }

  private async runMessage(text: string): Promise<void> {
    if (!this.apiKey) await this.loadSettings();

    const pinnedSessionId = this.currentSessionId;

    this.messages.push({ role: 'user', content: text, timestamp: Date.now() });
    this.renderMessages();

    if (!this.apiKey) {
      this.messages.push({
        role: 'assistant',
        content: '**No API key configured.** Open settings (gear icon) and add your API key.',
        timestamp: Date.now(),
      });
      this.renderMessages();
      return;
    }

    this.setLoading(true);
    try {
      const response = await this.callLLMWithTools(text);
      this.messages.push({ role: 'assistant', content: response, timestamp: Date.now() });
    } catch (err: any) {
      this.messages.push({
        role: 'assistant',
        content: `**Error:** ${this.escapeHtml(err.message || 'Unknown error')}`,
        timestamp: Date.now(),
      });
    }
    this.setLoading(false);
    this.renderMessages();
    this.saveSessionById(pinnedSessionId, this.messages);
  }

  private saveSessionById(id: string, messages: ChatMessage[]): void {
    const idx = this.sessions.findIndex(s => s.id === id);
    if (idx === -1) return;
    this.sessions[idx].messages = messages.map(m => ({ ...m }));
    this.sessions[idx].updatedAt = Date.now();
    this.saveSessions();
  }

  private async sendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text) return;

    // While loading: queue the message instead of running immediately
    if (this.isLoading) {
      this.inputEl.value = '';
      this.queueMessage(text);
      return;
    }

    this.inputEl.value = '';
    this.runMessage(text);
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.loadingEl.style.display = loading ? 'flex' : 'none';
    this.sendBtn.style.display = loading ? 'none' : 'flex';
    this.abortBtn.style.display = loading ? 'flex' : 'none';
    this.steerBtn.style.display = loading ? 'flex' : 'none';
    this.notch.classList.toggle('is-loading', loading);
    this.inputEl.placeholder = loading
      ? 'Queue next message (Enter) or steer agent (↳)…'
      : 'Ask the agent to do something…';
    if (!loading) {
      this.abortRequested = false;
      this.fetchController = null;
      this.steeringMessage = null;
      this.stepControlsEl.classList.remove('is-visible');
      this.renderQueueBar();
      this.processQueue();
    }
  }

  private waitForAction(label: string): Promise<boolean> {
    return new Promise(resolve => {
      this.stepLabelEl.textContent = label;
      this.stepControlsEl.classList.add('is-visible');
      this.continueResolve = () => {
        this.continueResolve = null;
        resolve(!this.abortRequested);
      };
    });
  }

  private async executeTool(name: string, args: Record<string, any>): Promise<string> {
    const cockpit = (window as any).__cockpit;
    try {
      switch (name) {
        case 'read_file': {
          const content = await window.electronAPI?.fs.readFile(args.path);
          if (content === null || content === undefined) return `Error: file not found or not allowed: "${args.path}"`;
          cockpit?.openFile(args.path);
          return content.length > 12000 ? content.slice(0, 12000) + '\n[truncated]' : content;
        }
        case 'write_file': {
          const ok = await window.electronAPI?.fs.writeFile(args.path, args.content);
          if (ok) cockpit?.openFile(args.path);
          return ok ? `Written: ${args.path}` : `Error: could not write "${args.path}"`;
        }
        case 'list_directory': {
          cockpit?.revealFile(args.path);
          const entries = await window.electronAPI?.fs.readDir(args.path);
          if (!entries) return `Error: cannot list "${args.path}"`;
          return (entries as { name: string; isDirectory: boolean }[])
            .map(e => `${e.isDirectory ? 'd' : 'f'} ${e.name}`)
            .join('\n');
        }
        case 'create_directory': {
          cockpit?.revealFile(args.path);
          const ok = await window.electronAPI?.fs.mkdir(args.path);
          return ok ? `Created: ${args.path}` : `Error: could not create "${args.path}"`;
        }
        case 'get_canvas_state': {
          if (!cockpit) return 'Canvas not ready';
          const state = cockpit.getCanvasState();
          return JSON.stringify({
            workspace: cockpit.getWorkspacePath(),
            zoom: state.zoom,
            cards: (state.plugins as any[]).map(p => ({
              uuid: p.uuid,
              title: p.title,
              type: p.title.startsWith('Terminal') ? 'terminal'
                : p.title === 'Explorer' ? 'explorer'
                : p.title === 'Git' ? 'git'
                : p.title === 'Markdown' ? 'markdown'
                : p.title === 'SpecsMap' ? 'specsmap' : 'unknown',
              isOpen: p.isOpen,
              x: p.x, y: p.y,
              width: p.width, height: p.height,
            })),
          }, null, 2);
        }
        case 'open_file_in_editor': {
          if (!cockpit) return 'Canvas not ready';
          await cockpit.openFile(args.path);
          return `Opened: ${args.path}`;
        }
        case 'add_plugin': {
          if (!cockpit) return 'Canvas not ready';
          cockpit.addPlugin(args.type);
          return `Added ${args.type} plugin`;
        }
        case 'focus_card': {
          if (!cockpit) return 'Canvas not ready';
          cockpit.focusCard(args.title);
          return `Focused: ${args.title}`;
        }
        case 'delete_file': {
          await cockpit?.revealFile(args.path);
          const ok = await window.electronAPI?.fs.delete(args.path);
          return ok ? `Deleted: ${args.path}` : `Error: could not delete "${args.path}"`;
        }
        case 'rename_file': {
          await cockpit?.revealFile(args.old_path);
          const ok = await window.electronAPI?.fs.rename(args.old_path, args.new_path);
          return ok ? `Renamed: ${args.old_path} → ${args.new_path}` : `Error: could not rename "${args.old_path}"`;
        }
        case 'copy_file': {
          await cockpit?.revealFile(args.src);
          const ok = await window.electronAPI?.fs.copy(args.src, args.dest);
          return ok ? `Copied: ${args.src} → ${args.dest}` : `Error: could not copy "${args.src}"`;
        }
        case 'close_card': {
          if (!cockpit) return 'Canvas not ready';
          const ok = cockpit.closeCard(args.title);
          return ok ? `Closed: ${args.title}` : `No card found: "${args.title}"`;
        }
        case 'minimize_card': {
          if (!cockpit) return 'Canvas not ready';
          const ok = cockpit.minimizeCard(args.title);
          return ok ? `Minimized: ${args.title}` : `No open card found: "${args.title}"`;
        }
        case 'move_card': {
          if (!cockpit) return 'Canvas not ready';
          cockpit.moveCard(args.title, args.x, args.y);
          return `Moved ${args.title} to (${args.x}, ${args.y})`;
        }
        case 'resize_card': {
          if (!cockpit) return 'Canvas not ready';
          const ok = cockpit.resizeCard(args.title, args.width, args.height);
          return ok ? `Resized ${args.title} to ${args.width}×${args.height}` : `No card found: "${args.title}"`;
        }
        case 'auto_arrange': {
          if (!cockpit) return 'Canvas not ready';
          cockpit.autoArrange();
          return 'Canvas arranged';
        }
        case 'write_to_terminal': {
          if (!cockpit) return 'Canvas not ready';
          cockpit.writeToTerminal(args.uuid, args.command);
          return `Sent to terminal ${args.uuid}: ${args.command}`;
        }
        case 'send_key_to_terminal': {
          if (!cockpit) return 'Canvas not ready';
          const seq = KEY_SEQUENCES[args.key];
          if (!seq) return `Unknown key: "${args.key}". Supported: ${Object.keys(KEY_SEQUENCES).join(', ')}`;
          cockpit.sendKeyToTerminal(args.uuid, seq);
          return `Sent key ${args.key} to terminal ${args.uuid}`;
        }
        case 'insert_text_in_editor': {
          if (!cockpit) return 'Canvas not ready';
          await cockpit.insertInEditor(args.text);
          return `Inserted text in editor`;
        }
        case 'read_terminal': {
          if (!cockpit) return 'Canvas not ready';
          const buf = cockpit.readTerminal(args.uuid);
          return buf || 'Terminal output is empty';
        }
        case 'read_editor': {
          if (!cockpit) return 'Canvas not ready';
          const content = await cockpit.readEditor();
          return content || 'Editor is empty or no file open';
        }
        // ── Editor ──────────────────────────────────────────────────────────
        case 'get_editor_state': {
          if (!cockpit) return 'Canvas not ready';
          const st = await cockpit.getEditorState();
          return st ? JSON.stringify(st, null, 2) : 'No explorer/editor open';
        }
        case 'get_selected_text': {
          if (!cockpit) return 'Canvas not ready';
          return (await cockpit.getSelectionText()) || '(no selection)';
        }
        case 'set_editor_content': {
          if (!cockpit) return 'Canvas not ready';
          await cockpit.setEditorContent(args.content);
          return 'Editor content replaced';
        }
        case 'go_to_line': {
          if (!cockpit) return 'Canvas not ready';
          await cockpit.goToLine(args.line, args.col);
          return `Navigated to line ${args.line}${args.col ? `:${args.col}` : ''}`;
        }
        // ── Canvas ──────────────────────────────────────────────────────────
        case 'reopen_card': {
          if (!cockpit) return 'Canvas not ready';
          const ok = cockpit.reopenCard(args.title);
          return ok ? `Reopened: ${args.title}` : `No minimized card found: "${args.title}"`;
        }
        case 'reset_view': {
          if (!cockpit) return 'Canvas not ready';
          cockpit.resetView();
          return 'View reset to 1x and centered';
        }
        case 'pan_to_card': {
          if (!cockpit) return 'Canvas not ready';
          const ok = cockpit.panToCard(args.title);
          return ok ? `Panned to card: "${args.title}"` : `No open card matching "${args.title}"`;
        }
        case 'set_view': {
          if (!cockpit) return 'Canvas not ready';
          cockpit.setView(args.panX, args.panY, args.zoom);
          return `View set: panX=${args.panX}, panY=${args.panY}${args.zoom !== undefined ? `, zoom=${args.zoom}` : ''}`;
        }
        case 'zoom_in': {
          if (!cockpit) return 'Canvas not ready';
          cockpit.zoomIn();
          return 'Zoomed in';
        }
        case 'zoom_out': {
          if (!cockpit) return 'Canvas not ready';
          cockpit.zoomOut();
          return 'Zoomed out';
        }
        case 'open_in_markdown': {
          if (!cockpit) return 'Canvas not ready';
          cockpit.openInMarkdown(args.path);
          return `Opened in Markdown: ${args.path}`;
        }
        // ── Navigation ──────────────────────────────────────────────────────
        case 'reveal_file_in_explorer': {
          if (!cockpit) return 'Canvas not ready';
          await cockpit.revealFile(args.path);
          return `Revealed: ${args.path}`;
        }
        case 'grep_workspace': {
          const dir = args.dir || cockpit?.getWorkspacePath();
          if (!dir) return 'No directory specified and no workspace loaded';
          const results = await this.grepWorkspace(dir, args.pattern, args.glob);
          if (results.length === 0) return 'No matches found';
          return results.slice(0, 100).map(r => `${r.file}:${r.line}: ${r.text}`).join('\n');
        }
        // ── Terminal ────────────────────────────────────────────────────────
        case 'kill_terminal': {
          if (!cockpit) return 'Canvas not ready';
          cockpit.killTerminal(args.uuid);
          return `Killed terminal ${args.uuid}`;
        }
        // ── Git ─────────────────────────────────────────────────────────────
        case 'git_status': {
          const repo = args.repo_path || cockpit?.getWorkspacePath();
          if (!repo) return 'No repo path';
          const [branch, staged, unstaged] = await Promise.all([
            window.electronAPI?.git.currentBranch(repo),
            window.electronAPI?.git.stagedFiles(repo),
            window.electronAPI?.git.unstagedFiles(repo),
          ]);
          return JSON.stringify({ branch, staged, unstaged }, null, 2);
        }
        case 'git_diff': {
          const repo = args.repo_path || cockpit?.getWorkspacePath();
          if (!repo) return 'No repo path';
          if (args.file_path) {
            const diff = await window.electronAPI?.git.unstagedDiff(repo, args.file_path);
            return diff || 'No diff';
          }
          const unstaged = await window.electronAPI?.git.unstagedFiles(repo);
          if (!unstaged?.length) return 'No unstaged changes';
          const diffs = await Promise.all(
            unstaged.slice(0, 5).map(f => window.electronAPI?.git.unstagedDiff(repo, f.path).then(d => `--- ${f.path} ---\n${d}`))
          );
          return diffs.filter(Boolean).join('\n\n').slice(0, 8000) || 'No diff';
        }
        case 'git_log': {
          const repo = args.repo_path || cockpit?.getWorkspacePath();
          if (!repo) return 'No repo path';
          const log = await window.electronAPI?.git.log(repo, args.max_count ?? 10);
          return log ? JSON.stringify(log, null, 2) : 'No log';
        }
        case 'git_stage': {
          const repo = args.repo_path || cockpit?.getWorkspacePath();
          if (!repo) return 'No repo path';
          const ok = await window.electronAPI?.git.stage(repo, args.file_path);
          return ok ? `Staged: ${args.file_path}` : `Failed to stage: ${args.file_path}`;
        }
        case 'git_unstage': {
          const repo = args.repo_path || cockpit?.getWorkspacePath();
          if (!repo) return 'No repo path';
          const ok = await window.electronAPI?.git.unstage(repo, args.file_path);
          return ok ? `Unstaged: ${args.file_path}` : `Failed to unstage: ${args.file_path}`;
        }
        case 'git_commit': {
          const repo = args.repo_path || cockpit?.getWorkspacePath();
          if (!repo) return 'No repo path';
          const ok = await window.electronAPI?.git.commit(repo, args.message);
          return ok ? `Committed: "${args.message}"` : 'Commit failed';
        }
        case 'git_push': {
          const repo = args.repo_path || cockpit?.getWorkspacePath();
          if (!repo) return 'No repo path';
          const ok = await window.electronAPI?.git.push(repo);
          return ok ? 'Pushed successfully' : 'Push failed';
        }
        case 'git_branches': {
          const repo = args.repo_path || cockpit?.getWorkspacePath();
          if (!repo) return 'No repo path';
          const branches = await window.electronAPI?.git.branches(repo);
          return branches ? JSON.stringify(branches, null, 2) : 'No branches';
        }
        case 'git_checkout': {
          const repo = args.repo_path || cockpit?.getWorkspacePath();
          if (!repo) return 'No repo path';
          const ok = await window.electronAPI?.git.checkout(repo, args.branch);
          return ok ? `Checked out: ${args.branch}` : `Failed to checkout: ${args.branch}`;
        }
        // ── System ──────────────────────────────────────────────────────────
        case 'open_external': {
          const ok = await window.electronAPI?.shell.openExternal(args.url);
          return ok ? `Opened: ${args.url}` : `Failed to open: ${args.url}`;
        }
        case 'get_clipboard': {
          return window.electronAPI?.clipboard.readText() || '(empty)';
        }
        case 'set_clipboard': {
          await window.electronAPI?.clipboard.writeText(args.text);
          return 'Clipboard updated';
        }
        // ── SpecsMap ────────────────────────────────────────────────────────
        case 'refresh_specsmap': {
          if (!cockpit) return 'Canvas not ready';
          cockpit.refreshSpecsMap();
          return 'SpecsMap refresh triggered';
        }
        case 'regenerate_specsmap': {
          if (!cockpit) return 'Canvas not ready';
          await cockpit.regenerateSpecs();
          return 'SpecsMap regeneration complete';
        }
        default:
          return `Unknown tool: ${name}`;
      }
    } catch (err: any) {
      return `Error in ${name}: ${err.message || String(err)}`;
    }
  }

  private async grepWorkspace(dir: string, pattern: string, glob?: string): Promise<{ file: string; line: number; text: string }[]> {
    const SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', 'coverage']);
    const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.html', '.css', '.txt', '.yaml', '.yml', '.toml', '.py', '.go', '.rs', '.sh', '.env', '.gitignore']);
    const results: { file: string; line: number; text: string }[] = [];
    const re = new RegExp(pattern, 'gi');
    const extFilter = glob?.startsWith('.') ? glob : (glob ? `.${glob}` : null);
    let fileCount = 0;

    const walk = async (path: string): Promise<void> => {
      if (results.length >= 100 || fileCount >= 500) return;
      const entries = await window.electronAPI?.fs.readDir(path);
      if (!entries) return;
      for (const entry of entries) {
        if (results.length >= 100 || fileCount >= 500) return;
        const full = `${path}/${entry.name}`.replace(/\\/g, '/');
        if (entry.isDirectory) {
          if (!SKIP.has(entry.name)) await walk(full);
        } else {
          const ext = entry.name.includes('.') ? `.${entry.name.split('.').pop()!.toLowerCase()}` : '';
          if (extFilter && ext !== extFilter) continue;
          if (!TEXT_EXT.has(ext)) continue;
          fileCount++;
          const content = await window.electronAPI?.fs.readFile(full);
          if (!content) continue;
          const lines = content.split('\n');
          lines.forEach((text, i) => {
            if (results.length < 100 && re.test(text)) {
              results.push({ file: full, line: i + 1, text: text.trim().slice(0, 200) });
            }
            re.lastIndex = 0;
          });
        }
      }
    };

    await walk(dir);
    return results;
  }

  private formatToolChip(name: string, args: Record<string, any>): string {
    const argStr = Object.entries(args)
      .map(([k, v]) => {
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        return `${k}=${s.length > 40 ? s.slice(0, 40) + '…' : s}`;
      })
      .join(' ');
    return argStr;
  }

  private async callLLMWithTools(userMessage: string): Promise<string> {
    const cockpit = (window as any).__cockpit;
    const wsPath = cockpit?.getWorkspacePath() || '';

    const systemContent = wsPath
      ? `${AGENT_SYSTEM_PROMPT}\n\nWorkspace: ${wsPath}`
      : AGENT_SYSTEM_PROMPT;

    const apiMessages: any[] = [
      { role: 'system', content: systemContent },
    ];

    const history = this.messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-12);
    for (const m of history) {
      apiMessages.push({ role: m.role, content: m.content });
    }
    const last = apiMessages[apiMessages.length - 1];
    if (!last || last.role !== 'user') {
      apiMessages.push({ role: 'user', content: userMessage });
    }

    const fetchJSON = async (body: object) => {
      this.fetchController = new AbortController();
      const res = await fetch(`${this.endpoint.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        signal: this.fetchController.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`API error ${res.status}: ${errBody.slice(0, 200)}`);
      }
      return res.json();
    };

    // PLAN mode: first get a plain text plan, then ask user to confirm before executing
    let planModeFirstIter = false;
    if (this.agentMode === 'plan') {
      const planData = await fetchJSON({
        model: this.model,
        messages: [
          ...apiMessages,
          { role: 'user', content: 'Before using any tools, write a numbered step-by-step plan of what you will do. Do NOT call any tools yet — only write the plan.' },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      });
      const planText = planData.choices?.[0]?.message?.content || 'No plan generated.';
      this.messages.push({ role: 'thinking', content: `**Plan**\n\n${planText}`, timestamp: Date.now() });
      this.renderMessages();

      const proceed = await this.waitForAction('Approve plan to execute?');
      if (!proceed || this.abortRequested) return 'Aborted.';

      planModeFirstIter = true;
      // Do NOT add plan to apiMessages — execution proceeds on original context
      // The plan was preview-only; the model will naturally call tools on the original request
    }

    let firstIter = true;
    let stepCount = 0;
    for (;;) {
      if (this.abortRequested) return 'Aborted.';

      let data: any;
      try {
        data = await fetchJSON({
          model: this.model,
          messages: apiMessages,
          tools: TOOLS,
          tool_choice: planModeFirstIter ? 'required' : 'auto',
          temperature: 0.2,
          max_tokens: 4096,
        });
        planModeFirstIter = false;
        firstIter = false;
      } catch (err: any) {
        if (err?.name === 'AbortError') return 'Aborted.';
        // If tools param rejected on first call, retry without tools (some proxies strip tool support)
        if (firstIter && err?.message?.includes('400')) {
          return this.callLLMBasic(apiMessages);
        }
        throw err;
      }

      const choice = data.choices?.[0];
      if (!choice) throw new Error('Empty response from model');

      const msg = choice.message;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return msg.content || 'No response.';
      }

      // Always show a step entry: model reasoning (if any) + which tools are being called
      const thinkingContent = msg.content?.trim();
      const toolNames = (msg.tool_calls as any[]).map(tc => tc.function.name).join(', ');
      const stepContent = thinkingContent
        ? `${thinkingContent}\n\n→ **${toolNames}**`
        : `→ **${toolNames}**`;
      this.messages.push({ role: 'thinking', content: stepContent, timestamp: Date.now() });
      this.renderMessages();

      // STEP mode: pause before executing this batch
      if (this.agentMode === 'step') {
        stepCount++;
        const proceed = await this.waitForAction(`Step ${stepCount}: run ${toolNames}?`);
        if (!proceed || this.abortRequested) return 'Aborted.';
      }

      // Add assistant turn with tool_calls
      apiMessages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });

      // Execute each tool and collect results
      for (const tc of msg.tool_calls) {
        if (this.abortRequested) return 'Aborted.';

        const toolName: string = tc.function.name;
        let toolArgs: Record<string, any> = {};
        try { toolArgs = JSON.parse(tc.function.arguments || '{}'); } catch {}

        // Show chip in UI immediately (pending state)
        this.messages.push({
          role: 'tool',
          content: this.formatToolChip(toolName, toolArgs),
          timestamp: Date.now(),
          toolName,
        });
        this.renderMessages();

        const result = await this.executeTool(toolName, toolArgs);

        // Update chip with result so it becomes collapsible
        this.messages[this.messages.length - 1].toolResult = result;
        this.renderMessages();

        apiMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Inject any steering message the user submitted mid-run
      if (this.steeringMessage) {
        const steer = this.steeringMessage;
        this.steeringMessage = null;
        apiMessages.push({ role: 'user', content: steer });
      }
    }

    return 'Aborted.';
  }

  private async callLLMBasic(apiMessages: any[]): Promise<string> {
    const msgs = apiMessages.map(m => ({ role: m.role, content: m.content || '' }));
    const res = await fetch(`${this.endpoint.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      signal: this.fetchController?.signal,
      body: JSON.stringify({
        model: this.model,
        messages: msgs,
        temperature: 0.2,
        max_tokens: 4096,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`API error ${res.status}: ${errBody.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || 'No response from model.';
  }

  resetSessions(): void {
    this.sessionsLoaded = false;
    this.cockpitDirEnsured = false;
    this.sessions = [];
    this.currentSessionId = '';
    this.promptQueue = [];
    this.steeringMessage = null;
    this.showWelcome();
    this.renderMessages();
    this.renderSessionsList();
    // If drawer is already open, load the new workspace's sessions immediately
    // rather than waiting for the user to close and reopen.
    if (this.el.classList.contains('is-open')) {
      this.loadSessions().then(() => this.renderSessionsList());
    }
  }

  async toggle(): Promise<void> {
    const isOpen = this.el.classList.contains('is-open');
    if (isOpen) {
      this.close();
    } else {
      await this.loadSessions();
      this.open();
    }
  }

  private shiftCanvasPan(delta: number): void {
    const cockpit = (window as any).__cockpit;
    if (!cockpit) return;
    const state = cockpit.getCanvasState();
    cockpit.setView(state.panX + delta, state.panY, state.zoom);
  }

  private setCanvasOverlay(left: number): void {
    (window as any).__cockpit?.setCanvasOverlay(left);
  }

  private open(): void {
    this.shiftCanvasPan(this.drawerWidth);
    this.setCanvasOverlay(this.drawerWidth);
    this.setOpenWidth(this.drawerWidth);
    this.el.classList.add('is-open');
    this.notch.classList.add('is-open');
    this.escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this.escHandler);
  }

  private close(): void {
    this.shiftCanvasPan(-this.drawerWidth);
    this.setCanvasOverlay(0);
    this.el.style.width = '0';
    this.el.classList.remove('is-open');
    this.notch.style.left = '0';
    this.notch.classList.remove('is-open');
    this.settingsEl?.classList.remove('is-visible');
    this.sessionsPanelEl?.classList.remove('is-visible');
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }
  }

  private setOpenWidth(w: number): void {
    this.el.style.width = w + 'px';
    this.resizeHandle.style.left = w + 'px';
    this.notch.style.left = w + 'px';
  }

  private bindResize(): void {
    let startX = 0;
    let startW = 420;

    this.resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.isDragging = true;
      startX = e.clientX;
      startW = this.el.offsetWidth || this.drawerWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const delta = e.clientX - startX;
      const w = Math.max(280, Math.min(800, startW + delta));
      this.drawerWidth = w;
      this.setOpenWidth(w);
      this.setCanvasOverlay(w);
    });

    document.addEventListener('mouseup', () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }
}
