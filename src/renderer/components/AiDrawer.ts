interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
  toolResult?: string;
}

const AGENT_SYSTEM_PROMPT = `You are Cockpit Agent, an AI assistant embedded in Cockpit IDE — a spatial, canvas-based IDE where plugin cards (Explorer, Terminal, Git, Markdown, SpecsMap) float on an infinite canvas.

You have tools to read/write/list files in the workspace and to inspect and control the canvas. Use them to actually perform tasks. When editing files, read first to understand current content. Prefer multiple small focused reads over reading entire large files.

To run a command in a terminal: call get_canvas_state to get terminal uuids, then write_to_terminal with the target uuid and command.
To type into the editor: call insert_text_in_editor with the text to insert at the current cursor.

Be concise. After completing a task, give a one-sentence summary of what you did.`;

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
];

export class AiDrawer {
  private el: HTMLDivElement;
  private wrapper: HTMLDivElement;
  private notch: HTMLDivElement;
  private resizeHandle: HTMLDivElement;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;
  private isDragging = false;
  private drawerWidth = 420;

  private messages: ChatMessage[] = [];
  private isLoading = false;
  private apiKey = '';
  private model = 'deepseek-v4-flash';
  private endpoint = 'https://opencode.ai/zen/go/v1';

  private bodyEl!: HTMLDivElement;
  private messagesEl!: HTMLDivElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private settingsEl!: HTMLDivElement;
  private loadingEl!: HTMLDivElement;

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

  private render(): void {
    this.el.innerHTML = `
      <div class="ai-drawer-content">
        <div class="ai-drawer-header">
          <span class="ai-drawer-title">COCKPIT AGENT</span>
          <button class="ai-drawer-settings-btn" aria-label="Settings" title="Settings">&#x2699;</button>
        </div>
        <div class="ai-drawer-body">
          <div class="ai-chat-messages"></div>
          <div class="ai-chat-loading" style="display:none">
            <span class="ai-chat-loading-dot"></span>
            <span class="ai-chat-loading-dot"></span>
            <span class="ai-chat-loading-dot"></span>
          </div>
        </div>
        <div class="ai-chat-input-area">
          <textarea class="ai-chat-input" placeholder="Ask the agent to do something..." rows="3"></textarea>
          <button class="ai-chat-send-btn" aria-label="Send" title="Send">&#x27A4;</button>
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
    `;

    this.bodyEl = this.el.querySelector('.ai-drawer-body')!;
    this.messagesEl = this.el.querySelector('.ai-chat-messages')!;
    this.inputEl = this.el.querySelector('.ai-chat-input')!;
    this.sendBtn = this.el.querySelector('.ai-chat-send-btn')!;
    this.settingsEl = this.el.querySelector('.ai-drawer-settings')!;
    this.loadingEl = this.el.querySelector('.ai-chat-loading')!;

    this.bindEvents();
    this.renderMessages();
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

    const settingsBtn = this.el.querySelector('.ai-drawer-settings-btn')!;
    settingsBtn.addEventListener('click', () => {
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
    this.messagesEl.innerHTML = this.messages.map((m) => this.renderMessage(m)).join('');
    // Mark only the last message for entrance animation; previous messages render instantly
    const last = this.messagesEl.lastElementChild as HTMLElement | null;
    if (last) last.classList.add('is-new');
    this.bindMessageActions();
    // Defer scroll so browser has painted the new content and scrollHeight is final
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }

  private renderMessage(m: ChatMessage): string {
    if (m.role === 'tool') {
      const name = m.toolName || '';
      const pending = m.toolResult === undefined;
      const resultHtml = pending
        ? `<div class="ai-tool-result ai-tool-result-pending">running…</div>`
        : `<pre class="ai-tool-result">${this.escapeHtml(m.toolResult!)}</pre>`;
      return `<div class="ai-chat-msg ai-chat-msg-tool"><details class="ai-tool-details"${pending ? ' open' : ''}><summary class="ai-tool-chip"><span class="ai-tool-icon">⚙</span><span class="ai-tool-name">${this.escapeHtml(name)}</span><span class="ai-tool-args">${this.escapeHtml(m.content)}</span><span class="ai-tool-toggle">▸</span></summary>${resultHtml}</details></div>`;
    }

    const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let body = m.content
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_: string, lang: string, code: string) => {
        return `<pre class="ai-chat-code"><code class="${lang ? `lang-${lang}` : ''}">${this.escapeHtml(code.trim())}</code></pre>`;
      })
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    if (m.role === 'system') {
      return `<div class="ai-chat-msg ai-chat-msg-system"><div class="ai-chat-msg-bubble">${body}</div></div>`;
    }

    return `
      <div class="ai-chat-msg ai-chat-msg-${m.role}">
        <div class="ai-chat-msg-bubble">
          <div class="ai-chat-msg-text">${body}</div>
          <div class="ai-chat-msg-meta">
            <span class="ai-chat-msg-time">${time}</span>
            ${m.role === 'assistant' ? '<button class="ai-chat-copy-btn" title="Copy code">&#x2398;</button>' : ''}
          </div>
        </div>
      </div>`;
  }

  private bindMessageActions(): void {
    this.messagesEl.querySelectorAll('.ai-chat-copy-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const assistantMsgs = this.messages.filter((m) => m.role === 'assistant');
        const msg = assistantMsgs[i];
        if (msg) {
          const codeMatch = msg.content.match(/```\w*\n([\s\S]*?)```/);
          const text = codeMatch ? codeMatch[1].trim() : msg.content;
          navigator.clipboard.writeText(text).catch(() => {});
        }
      });
    });
  }

  private async sendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.isLoading) return;

    if (!this.apiKey) {
      await this.loadSettings();
    }

    this.inputEl.value = '';
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
      this.messages.push({
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      this.messages.push({
        role: 'assistant',
        content: `**Error:** ${this.escapeHtml(err.message || 'Unknown error')}`,
        timestamp: Date.now(),
      });
    }

    this.setLoading(false);
    this.renderMessages();
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.loadingEl.style.display = loading ? 'flex' : 'none';
    this.sendBtn.disabled = loading;
    this.inputEl.disabled = loading;
  }

  private async executeTool(name: string, args: Record<string, any>): Promise<string> {
    const cockpit = (window as any).__cockpit;
    try {
      switch (name) {
        case 'read_file': {
          const content = await window.electronAPI?.fs.readFile(args.path);
          if (content === null || content === undefined) return `Error: file not found or not allowed: "${args.path}"`;
          return content.length > 12000 ? content.slice(0, 12000) + '\n[truncated]' : content;
        }
        case 'write_file': {
          const ok = await window.electronAPI?.fs.writeFile(args.path, args.content);
          return ok ? `Written: ${args.path}` : `Error: could not write "${args.path}"`;
        }
        case 'list_directory': {
          const entries = await window.electronAPI?.fs.readDir(args.path);
          if (!entries) return `Error: cannot list "${args.path}"`;
          return (entries as { name: string; isDirectory: boolean }[])
            .map(e => `${e.isDirectory ? 'd' : 'f'} ${e.name}`)
            .join('\n');
        }
        case 'create_directory': {
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
          cockpit.openFile(args.path);
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
          const ok = await window.electronAPI?.fs.delete(args.path);
          return ok ? `Deleted: ${args.path}` : `Error: could not delete "${args.path}"`;
        }
        case 'rename_file': {
          const ok = await window.electronAPI?.fs.rename(args.old_path, args.new_path);
          return ok ? `Renamed: ${args.old_path} → ${args.new_path}` : `Error: could not rename "${args.old_path}"`;
        }
        case 'copy_file': {
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
        case 'insert_text_in_editor': {
          if (!cockpit) return 'Canvas not ready';
          cockpit.insertInEditor(args.text);
          return `Inserted text in editor`;
        }
        default:
          return `Unknown tool: ${name}`;
      }
    } catch (err: any) {
      return `Error in ${name}: ${err.message || String(err)}`;
    }
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

    const MAX_ITER = 10;

    for (let iter = 0; iter < MAX_ITER; iter++) {
      const res = await fetch(`${this.endpoint.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: apiMessages,
          tools: TOOLS,
          tool_choice: 'auto',
          temperature: 0.2,
          max_tokens: 4096,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        // If tools param rejected, retry without it (some proxies strip tool support)
        if (res.status === 400 && iter === 0) {
          return this.callLLMBasic(apiMessages);
        }
        throw new Error(`API error ${res.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await res.json();
      const choice = data.choices?.[0];
      if (!choice) throw new Error('Empty response from model');

      const msg = choice.message;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return msg.content || 'No response.';
      }

      // Add assistant turn with tool_calls
      apiMessages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });

      // Execute each tool and collect results
      for (const tc of msg.tool_calls) {
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
    }

    return 'Maximum tool iterations reached.';
  }

  private async callLLMBasic(apiMessages: any[]): Promise<string> {
    const msgs = apiMessages.map(m => ({ role: m.role, content: m.content || '' }));
    const res = await fetch(`${this.endpoint.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
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

  toggle(): void {
    const isOpen = this.el.classList.contains('is-open');
    if (isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private open(): void {
    this.setOpenWidth(this.drawerWidth);
    this.el.classList.add('is-open');
    this.notch.classList.add('is-open');
    this.escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this.escHandler);
  }

  private close(): void {
    this.el.style.width = '0';
    this.el.classList.remove('is-open');
    this.notch.style.left = '0';
    this.notch.classList.remove('is-open');
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }
  }

  private setOpenWidth(w: number): void {
    this.el.style.width = w + 'px';
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
    });

    document.addEventListener('mouseup', () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }
}
