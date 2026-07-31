import { z } from 'zod/v3';
import { ToolRegistry } from './tool-registry';
import { getAgentExecutor } from '../agents/executor';
import type { ToolDefinition, ToolContext } from './types.ts';
import { memoryStore, type MemoryScope } from './memory-store.ts';
import { AGENT_TOOLS } from '../agents/agent-tools';

/** Symbolic key names mapped to terminal escape sequences. */
export const KEY_SEQUENCES: Record<string, string> = {
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

const READABLE_LENGTH = 100000;
const MAX_FILE_CHARS = 100000;
const DIFF_LENGTH = 8000;
const MAX_GREP_RESULTS = 100;
const MAX_GREP_FILES = 500;

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.html', '.css', '.txt',
  '.yaml', '.yml', '.toml', '.py', '.go', '.rs', '.sh', '.env', '.gitignore',
]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', 'coverage']);

// ── Argument schemas ─────────────────────────────────────────────────────────

const PathArg = z.object({ path: z.string().describe('Absolute path') });
const TitleArg = z.object({ title: z.string().describe('Card title') });
const UuidArg = z.object({ uuid: z.string().describe('Terminal card uuid') });

const ReadFileArgs = z.object({
  path: z.string().describe('Absolute path'),
  offset: z.number().int().min(0).optional().describe('Character offset to start reading from (0-based). Use with limit to paginate through large files. If omitted, reads from the start.'),
  limit: z.number().int().min(1).max(MAX_FILE_CHARS).optional().describe(`Maximum characters to return (default ${MAX_FILE_CHARS}, max ${MAX_FILE_CHARS}). Use with offset for pagination.`),
});
const WriteFileArgs = z.object({
  path: z.string().describe('Absolute path to the file'),
  content: z.string().describe('Full file content to write'),
});
const ListDirectoryArgs = PathArg;
const CreateDirectoryArgs = PathArg;
const GetCanvasStateArgs = z.object({});
const OpenFileInEditorArgs = PathArg;
const AddPluginArgs = z.object({
  type: z.enum(['terminal', 'explorer', 'git', 'markdown', 'specsmap', 'agents']).describe('Plugin type to add'),
});
const DeleteFileArgs = PathArg;
const RenameFileArgs = z.object({
  old_path: z.string().describe('Current absolute path'),
  new_path: z.string().describe('New absolute path'),
});
const CopyFileArgs = z.object({
  src: z.string().describe('Source absolute path'),
  dest: z.string().describe('Destination absolute path'),
});
const MoveCardArgs = z.object({
  title: z.string(),
  x: z.number().describe('World X position (pixels)'),
  y: z.number().describe('World Y position (pixels)'),
});
const ResizeCardArgs = z.object({
  title: z.string(),
  width: z.number(),
  height: z.number(),
});
const WriteToTerminalArgs = z.object({
  uuid: z.string().describe('Terminal card uuid from get_canvas_state'),
  command: z.string().describe('Command to run (Enter is appended automatically)'),
});
const SendKeyToTerminalArgs = z.object({
  uuid: z.string().describe('Terminal card uuid from get_canvas_state'),
  key: z.string().describe('Key name, e.g. "Tab", "Escape", "ArrowUp", "Ctrl+c"'),
});
const InsertTextInEditorArgs = z.object({ text: z.string().describe('Text to insert at the cursor') });
const ReadTerminalArgs = UuidArg;
const SetEditorContentArgs = z.object({ content: z.string().describe('New full content for the active file') });
const GoToLineArgs = z.object({
  line: z.number().describe('Line number (1-based)'),
  col: z.number().default(1).describe('Column number (1-based, default 1)'),
});
const SetViewArgs = z.object({
  panX: z.number().describe('Horizontal pan offset in pixels'),
  panY: z.number().describe('Vertical pan offset in pixels'),
  zoom: z.number().optional().describe('Zoom scale factor (0.1–5.0). Omit to keep current zoom.'),
});
const OpenInMarkdownArgs = PathArg;
const RevealFileArgs = PathArg;
const GrepWorkspaceArgs = z.object({
  pattern: z.string().describe('Regular expression to search for'),
  dir: z.string().optional().describe('Directory to search in (defaults to workspace root)'),
  glob: z.string().optional().describe('File extension filter e.g. ".ts" or ".json" (optional)'),
});
const KillTerminalArgs = UuidArg;
const GitRepoArgs = z.object({
  repo_path: z.string().optional().describe('Repo path (defaults to workspace root)'),
});
const GitFileArgs = z.object({
  file_path: z.string().describe('Absolute path to the file'),
  repo_path: z.string().optional(),
});
const GitDiffArgs = z.object({
  file_path: z.string().optional().describe('Specific file path (optional, omit for full diff)'),
  repo_path: z.string().optional(),
});
const GitLogArgs = z.object({
  max_count: z.number().optional().describe('Max commits to return (default 10)'),
  repo_path: z.string().optional(),
});
const GitCommitArgs = z.object({
  message: z.string().describe('Commit message'),
  repo_path: z.string().optional(),
});
const GitCheckoutArgs = z.object({
  branch: z.string().describe('Branch name to checkout'),
  repo_path: z.string().optional(),
});
const OpenExternalArgs = z.object({ url: z.string().describe('URL to open') });
const SetClipboardArgs = z.object({ text: z.string().describe('Text to copy to clipboard') });
const ExploreSpecsMapArgs = z.object({
  query: z.string().describe('Topic or feature name to search for in the spec graph'),
});
const SpecsReconcileArgs = z.object({
  mode: z.enum(['report', 'structural']).describe(
    'report: compute the structural diff, write nothing. structural: patch structural fields only (exports, dependencies, referenced by, IPC) — prose is never touched.'),
  create_skeletons: z.boolean().optional().describe(
    'In structural mode, create skeleton specs (stub description) for unspecced source files. Default false.'),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function readFileResult(content: string, offset = 0, limit = READABLE_LENGTH): string {
  const total = content.length;
  if (offset === 0 && total <= limit) return content;
  const end = Math.min(offset + limit, total);
  const sliced = content.slice(offset, end);
  if (end >= total) return sliced;
  return sliced + `\n---[truncated: showed chars ${offset}–${end} of ${total}. Use offset=${end}&limit=${limit} to continue]---`;
}

function pluginTypeFromTitle(title: string): string {
  if (title.startsWith('Terminal')) return 'terminal';
  if (title === 'Explorer') return 'explorer';
  if (title === 'Git') return 'git';
  if (title === 'Markdown') return 'markdown';
  if (title === 'SpecsMap') return 'specsmap';
  if (title === 'Agents') return 'agents';
  return 'unknown';
}

function getRepoPath(ctx: ToolContext, repoPath?: string | null): string {
  return repoPath || ctx.cockpit.getWorkspacePath() || '';
}

async function grepWorkspace(
  ctx: ToolContext,
  dir: string,
  pattern: string,
  glob?: string,
): Promise<{ file: string; line: number; text: string }[]> {
  const results: { file: string; line: number; text: string }[] = [];
  if (!pattern || pattern.length > 200) return results;
  let re: RegExp;
  try { re = new RegExp(pattern, 'gi'); } catch { return results; }
  const extFilter = glob?.startsWith('.') ? glob : (glob ? `.${glob}` : null);
  let fileCount = 0;

  const walk = async (path: string): Promise<void> => {
    if (results.length >= MAX_GREP_RESULTS || fileCount >= MAX_GREP_FILES) return;
    const entries = await ctx.electronAPI.fs.readDir(path);
    if (!entries) return;
    for (const entry of entries) {
      if (results.length >= MAX_GREP_RESULTS || fileCount >= MAX_GREP_FILES) return;
      const full = `${path}/${entry.name}`.replace(/\\/g, '/');
      if (entry.isDirectory) {
        if (!SKIP_DIRS.has(entry.name)) await walk(full);
      } else {
        const ext = entry.name.includes('.') ? `.${entry.name.split('.').pop()!.toLowerCase()}` : '';
        if (extFilter && ext !== extFilter) continue;
        if (!TEXT_EXT.has(ext)) continue;
        fileCount++;
        const content = await ctx.electronAPI.fs.readFile(full);
        if (!content) continue;
        const lines = content.split('\n');
        lines.forEach((text, i) => {
          if (results.length < MAX_GREP_RESULTS && re.test(text)) {
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

// ── Tool definitions ─────────────────────────────────────────────────────────

export const readFileTool: ToolDefinition<typeof ReadFileArgs> = {
  name: 'read_file',
  description: `Read file contents. Returns up to ${MAX_FILE_CHARS} chars by default. Use offset/limit to paginate through large files (e.g. offset=0 reads from start).`,
  parameters: ReadFileArgs,
  execute: async (args, ctx) => {
    const content = await ctx.electronAPI.fs.readFile(args.path);
    if (content === null || content === undefined) {
      return `Error: file not found or not allowed: "${args.path}"`;
    }
    ctx.cockpit.openFile(args.path);
    return readFileResult(content, args.offset, args.limit);
  },
};

export const writeFileTool: ToolDefinition<typeof WriteFileArgs> = {
  name: 'write_file',
  description: 'Write content to a file (creates or overwrites). Always use absolute paths.',
  parameters: WriteFileArgs,
  execute: async (args, ctx) => {
    const ok = await ctx.electronAPI.fs.writeFile(args.path, args.content);
    if (ok) ctx.cockpit.openFile(args.path);
    return ok ? `Written: ${args.path}` : `Error: could not write "${args.path}"`;
  },
};

export const listDirectoryTool: ToolDefinition<typeof ListDirectoryArgs> = {
  name: 'list_directory',
  description: 'List files and subdirectories at a path.',
  parameters: ListDirectoryArgs,
  execute: async (args, ctx) => {
    ctx.cockpit.revealFile(args.path);
    const entries = await ctx.electronAPI.fs.readDir(args.path);
    if (!entries) return `Error: cannot list "${args.path}"`;
    return entries.map(e => `${e.isDirectory ? 'd' : 'f'} ${e.name}`).join('\n');
  },
};

export const createDirectoryTool: ToolDefinition<typeof CreateDirectoryArgs> = {
  name: 'create_directory',
  description: 'Create a directory (and any missing parents).',
  parameters: CreateDirectoryArgs,
  execute: async (args, ctx) => {
    ctx.cockpit.revealFile(args.path);
    const ok = await ctx.electronAPI.fs.mkdir(args.path);
    return ok ? `Created: ${args.path}` : `Error: could not create "${args.path}"`;
  },
};

export const getCanvasStateTool: ToolDefinition<typeof GetCanvasStateArgs> = {
  name: 'get_canvas_state',
  description: 'Return the current IDE canvas state: open cards, types, positions, workspace path.',
  parameters: GetCanvasStateArgs,
  execute: (_args, ctx) => {
    const state = ctx.cockpit.getCanvasState();
    return JSON.stringify({
      workspace: ctx.cockpit.getWorkspacePath(),
      zoom: state.zoom,
      cards: state.plugins.map(p => ({
        uuid: p.uuid,
        title: p.title,
        type: pluginTypeFromTitle(p.title),
        isOpen: p.isOpen,
        x: p.x, y: p.y,
        width: p.width, height: p.height,
      })),
    }, null, 2);
  },
};

export const openFileInEditorTool: ToolDefinition<typeof OpenFileInEditorArgs> = {
  name: 'open_file_in_editor',
  description: 'Open a file in the Explorer/Editor card.',
  parameters: OpenFileInEditorArgs,
  execute: async (args, ctx) => {
    await ctx.cockpit.openFile(args.path);
    return `Opened: ${args.path}`;
  },
};

export const addPluginTool: ToolDefinition<typeof AddPluginArgs> = {
  name: 'add_plugin',
  description: 'Add a plugin card to the canvas.',
  parameters: AddPluginArgs,
  execute: (args, ctx) => {
    ctx.cockpit.addPlugin(args.type);
    return `Added ${args.type} plugin`;
  },
};

export const focusCardTool: ToolDefinition<typeof TitleArg> = {
  name: 'focus_card',
  description: 'Bring a canvas card to the front and pan to it.',
  parameters: TitleArg,
  execute: (args, ctx) => {
    ctx.cockpit.focusCard(args.title);
    return `Focused: ${args.title}`;
  },
};

export const deleteFileTool: ToolDefinition<typeof DeleteFileArgs> = {
  name: 'delete_file',
  description: 'Delete a file or directory from the workspace.',
  parameters: DeleteFileArgs,
  execute: async (args, ctx) => {
    await ctx.cockpit.revealFile(args.path);
    const ok = await ctx.electronAPI.fs.delete(args.path);
    return ok ? `Deleted: ${args.path}` : `Error: could not delete "${args.path}"`;
  },
};

export const renameFileTool: ToolDefinition<typeof RenameFileArgs> = {
  name: 'rename_file',
  description: 'Rename or move a file within the workspace.',
  parameters: RenameFileArgs,
  execute: async (args, ctx) => {
    await ctx.cockpit.revealFile(args.old_path);
    const ok = await ctx.electronAPI.fs.rename(args.old_path, args.new_path);
    return ok ? `Renamed: ${args.old_path} → ${args.new_path}` : `Error: could not rename "${args.old_path}"`;
  },
};

export const copyFileTool: ToolDefinition<typeof CopyFileArgs> = {
  name: 'copy_file',
  description: 'Copy a file or directory within the workspace.',
  parameters: CopyFileArgs,
  execute: async (args, ctx) => {
    await ctx.cockpit.revealFile(args.src);
    const ok = await ctx.electronAPI.fs.copy(args.src, args.dest);
    return ok ? `Copied: ${args.src} → ${args.dest}` : `Error: could not copy "${args.src}"`;
  },
};

export const closeCardTool: ToolDefinition<typeof TitleArg> = {
  name: 'close_card',
  description: 'Close and remove a canvas card entirely.',
  parameters: TitleArg,
  execute: (args, ctx) => {
    const ok = ctx.cockpit.closeCard(args.title);
    return ok ? `Closed: ${args.title}` : `No card found: "${args.title}"`;
  },
};

export const minimizeCardTool: ToolDefinition<typeof TitleArg> = {
  name: 'minimize_card',
  description: 'Minimize (hide) a canvas card without removing it.',
  parameters: TitleArg,
  execute: (args, ctx) => {
    const ok = ctx.cockpit.minimizeCard(args.title);
    return ok ? `Minimized: ${args.title}` : `No open card found: "${args.title}"`;
  },
};

export const moveCardTool: ToolDefinition<typeof MoveCardArgs> = {
  name: 'move_card',
  description: 'Move a canvas card to world coordinates (x, y).',
  parameters: MoveCardArgs,
  execute: (args, ctx) => {
    ctx.cockpit.moveCard(args.title, args.x, args.y);
    return `Moved ${args.title} to (${args.x}, ${args.y})`;
  },
};

export const resizeCardTool: ToolDefinition<typeof ResizeCardArgs> = {
  name: 'resize_card',
  description: 'Resize a canvas card to the given width and height.',
  parameters: ResizeCardArgs,
  execute: (args, ctx) => {
    const ok = ctx.cockpit.resizeCard(args.title, args.width, args.height);
    return ok ? `Resized ${args.title} to ${args.width}×${args.height}` : `No card found: "${args.title}"`;
  },
};

export const autoArrangeTool: ToolDefinition<typeof GetCanvasStateArgs> = {
  name: 'auto_arrange',
  description: 'Auto-arrange all open canvas cards in a grid.',
  parameters: GetCanvasStateArgs,
  execute: (_args, ctx) => {
    ctx.cockpit.autoArrange();
    return 'Canvas arranged';
  },
};

export const fitCardToViewportTool: ToolDefinition<typeof TitleArg> = {
  name: 'fit_card_to_viewport',
  description: 'Resize and reposition a card to fill the entire visible viewport at 100% zoom, then bring it to front. Works for any card type.',
  parameters: TitleArg,
  execute: (args, ctx) => {
    const ok = ctx.cockpit.fitCardToViewport(args.title);
    return ok ? `Fit to viewport: ${args.title}` : `No open card found: "${args.title}"`;
  },
};

export const writeToTerminalTool: ToolDefinition<typeof WriteToTerminalArgs> = {
  name: 'write_to_terminal',
  description: 'Send a command to a terminal card and execute it. Call get_canvas_state first to find the terminal uuid.',
  parameters: WriteToTerminalArgs,
  execute: (args, ctx) => {
    ctx.cockpit.writeToTerminal(args.uuid, args.command);
    return `Sent to terminal ${args.uuid}: ${args.command}`;
  },
};

export const sendKeyToTerminalTool: ToolDefinition<typeof SendKeyToTerminalArgs> = {
  name: 'send_key_to_terminal',
  description: 'Send a special key or control sequence to a terminal. Use this instead of embedding escape chars in write_to_terminal. Supported keys: Tab, Enter, Escape, Backspace, Delete, Home, End, PageUp, PageDown, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, F1–F12, Ctrl+a/b/c/d/e/f/k/l/r/u/w/z.',
  parameters: SendKeyToTerminalArgs,
  execute: (args, ctx) => {
    const seq = KEY_SEQUENCES[args.key];
    if (!seq) return `Unknown key: "${args.key}". Supported: ${Object.keys(KEY_SEQUENCES).join(', ')}`;
    ctx.cockpit.sendKeyToTerminal(args.uuid, seq);
    return `Sent key ${args.key} to terminal ${args.uuid}`;
  },
};

export const insertTextInEditorTool: ToolDefinition<typeof InsertTextInEditorArgs> = {
  name: 'insert_text_in_editor',
  description: 'Insert text at the current cursor position in the active editor tab.',
  parameters: InsertTextInEditorArgs,
  execute: async (args, ctx) => {
    await ctx.cockpit.insertInEditor(args.text);
    return 'Inserted text in editor';
  },
};

export const readTerminalTool: ToolDefinition<typeof ReadTerminalArgs> = {
  name: 'read_terminal',
  description: 'Read the current output buffer of a terminal card (last 200 lines). Use get_canvas_state first to find the terminal uuid.',
  parameters: ReadTerminalArgs,
  execute: (args, ctx) => {
    const buf = ctx.cockpit.readTerminal(args.uuid);
    return buf || 'Terminal output is empty';
  },
};

export const readEditorTool: ToolDefinition<typeof GetCanvasStateArgs> = {
  name: 'read_editor',
  description: 'Read the full content of the currently active editor tab.',
  parameters: GetCanvasStateArgs,
  execute: async (_args, ctx) => {
    const content = await ctx.cockpit.readEditor();
    return content || 'Editor is empty or no file open';
  },
};

export const getEditorStateTool: ToolDefinition<typeof GetCanvasStateArgs> = {
  name: 'get_editor_state',
  description: 'Get the active editor state: open files, active file path, cursor position, and any selected text.',
  parameters: GetCanvasStateArgs,
  execute: async (_args, ctx) => {
    const st = await ctx.cockpit.getEditorState();
    return st ? JSON.stringify(st, null, 2) : 'No explorer/editor open';
  },
};

export const getSelectedTextTool: ToolDefinition<typeof GetCanvasStateArgs> = {
  name: 'get_selected_text',
  description: 'Get the text currently selected (highlighted) in the editor.',
  parameters: GetCanvasStateArgs,
  execute: async (_args, ctx) => {
    return (await ctx.cockpit.getSelectionText()) || '(no selection)';
  },
};

export const setEditorContentTool: ToolDefinition<typeof SetEditorContentArgs> = {
  name: 'set_editor_content',
  description: 'Replace the entire content of the active editor buffer. Triggers auto-save.',
  parameters: SetEditorContentArgs,
  execute: async (args, ctx) => {
    await ctx.cockpit.setEditorContent(args.content);
    return 'Editor content replaced';
  },
};

export const goToLineTool: ToolDefinition<typeof GoToLineArgs> = {
  name: 'go_to_line',
  description: 'Move the editor cursor to a specific line (and optional column) and reveal it.',
  parameters: GoToLineArgs,
  execute: async (args, ctx) => {
    await ctx.cockpit.goToLine(args.line, args.col);
    return `Navigated to line ${args.line}${args.col ? `:${args.col}` : ''}`;
  },
};

export const reopenCardTool: ToolDefinition<typeof TitleArg> = {
  name: 'reopen_card',
  description: 'Restore a minimized card back to the canvas.',
  parameters: TitleArg,
  execute: (args, ctx) => {
    const ok = ctx.cockpit.reopenCard(args.title);
    return ok ? `Reopened: ${args.title}` : `No minimized card found: "${args.title}"`;
  },
};

export const resetViewTool: ToolDefinition<typeof GetCanvasStateArgs> = {
  name: 'reset_view',
  description: 'Reset canvas zoom to 1x and re-center the view.',
  parameters: GetCanvasStateArgs,
  execute: (_args, ctx) => {
    ctx.cockpit.resetView();
    return 'View reset to 1x and centered';
  },
};

export const panToCardTool: ToolDefinition<typeof TitleArg> = {
  name: 'pan_to_card',
  description: 'Pan and zoom the canvas to focus on a specific card by title (partial match ok). Also brings the card to front.',
  parameters: TitleArg,
  execute: (args, ctx) => {
    const ok = ctx.cockpit.panToCard(args.title);
    return ok ? `Panned to card: "${args.title}"` : `No open card matching "${args.title}"`;
  },
};

export const setViewTool: ToolDefinition<typeof SetViewArgs> = {
  name: 'set_view',
  description: 'Set canvas pan position and optional zoom level directly. panX/panY are screen-space pixel offsets (the world origin position on screen). zoom is a scale factor (1.0 = 100%).',
  parameters: SetViewArgs,
  execute: (args, ctx) => {
    ctx.cockpit.setView(args.panX, args.panY, args.zoom);
    return `View set: panX=${args.panX}, panY=${args.panY}${args.zoom !== undefined ? `, zoom=${args.zoom}` : ''}`;
  },
};

export const zoomInTool: ToolDefinition<typeof GetCanvasStateArgs> = {
  name: 'zoom_in',
  description: 'Zoom in the canvas view by one step (~30%).',
  parameters: GetCanvasStateArgs,
  execute: (_args, ctx) => {
    ctx.cockpit.zoomIn();
    return 'Zoomed in';
  },
};

export const zoomOutTool: ToolDefinition<typeof GetCanvasStateArgs> = {
  name: 'zoom_out',
  description: 'Zoom out the canvas view by one step (~30%).',
  parameters: GetCanvasStateArgs,
  execute: (_args, ctx) => {
    ctx.cockpit.zoomOut();
    return 'Zoomed out';
  },
};

export const openInMarkdownTool: ToolDefinition<typeof OpenInMarkdownArgs> = {
  name: 'open_in_markdown',
  description: 'Open a Markdown file in the Explorer\'s integrated markdown preview (right pane).',
  parameters: OpenInMarkdownArgs,
  execute: (args, ctx) => {
    ctx.cockpit.openInMarkdown(args.path);
    return `Opened in Markdown: ${args.path}`;
  },
};

export const revealFileInExplorerTool: ToolDefinition<typeof RevealFileArgs> = {
  name: 'reveal_file_in_explorer',
  description: 'Select and highlight a file in the Explorer file tree.',
  parameters: RevealFileArgs,
  execute: async (args, ctx) => {
    await ctx.cockpit.revealFile(args.path);
    return `Revealed: ${args.path}`;
  },
};

export const grepWorkspaceTool: ToolDefinition<typeof GrepWorkspaceArgs> = {
  name: 'grep_workspace',
  description: 'Search for a regex pattern across all files in a directory. Returns file path, line number, and matching line text.',
  parameters: GrepWorkspaceArgs,
  execute: async (args, ctx) => {
    const dir = args.dir || ctx.cockpit.getWorkspacePath();
    if (!dir) return 'No directory specified and no workspace loaded';
    const results = await grepWorkspace(ctx, dir, args.pattern, args.glob);
    if (results.length === 0) return 'No matches found';
    return results.map(r => `${r.file}:${r.line}: ${r.text}`).join('\n');
  },
};

export const killTerminalTool: ToolDefinition<typeof KillTerminalArgs> = {
  name: 'kill_terminal',
  description: 'Kill a terminal PTY process by uuid.',
  parameters: KillTerminalArgs,
  execute: (args, ctx) => {
    ctx.cockpit.killTerminal(args.uuid);
    return `Killed terminal ${args.uuid}`;
  },
};

export const gitStatusTool: ToolDefinition<typeof GitRepoArgs> = {
  name: 'git_status',
  description: 'Get current git status: branch, staged files, unstaged files.',
  parameters: GitRepoArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const [branch, staged, unstaged] = await Promise.all([
      ctx.electronAPI.git.currentBranch(repo),
      ctx.electronAPI.git.stagedFiles(repo),
      ctx.electronAPI.git.unstagedFiles(repo),
    ]);
    return JSON.stringify({ branch, staged, unstaged }, null, 2);
  },
};

export const gitDiffTool: ToolDefinition<typeof GitDiffArgs> = {
  name: 'git_diff',
  description: 'Get unstaged diff for the repo or a specific file.',
  parameters: GitDiffArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    if (args.file_path) {
      const diff = await ctx.electronAPI.git.unstagedDiff(repo, args.file_path);
      return diff || 'No diff';
    }
    const unstaged = await ctx.electronAPI.git.unstagedFiles(repo);
    if (!unstaged?.length) return 'No unstaged changes';
    const diffs = await Promise.all(
      unstaged.slice(0, 5).map(f =>
        ctx.electronAPI.git.unstagedDiff(repo, f.path).then(d => `--- ${f.path} ---\n${d}`)
      )
    );
    return diffs.filter(Boolean).join('\n\n').slice(0, DIFF_LENGTH) || 'No diff';
  },
};

export const gitLogTool: ToolDefinition<typeof GitLogArgs> = {
  name: 'git_log',
  description: 'Get recent git commit history.',
  parameters: GitLogArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const log = await ctx.electronAPI.git.log(repo, args.max_count ?? 10);
    return log ? JSON.stringify(log, null, 2) : 'No log';
  },
};

export const gitStageTool: ToolDefinition<typeof GitFileArgs> = {
  name: 'git_stage',
  description: 'Stage a file for commit.',
  parameters: GitFileArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const ok = await ctx.electronAPI.git.stage(repo, args.file_path);
    return ok ? `Staged: ${args.file_path}` : `Failed to stage: ${args.file_path}`;
  },
};

export const gitUnstageTool: ToolDefinition<typeof GitFileArgs> = {
  name: 'git_unstage',
  description: 'Unstage a file (remove from staging area).',
  parameters: GitFileArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const ok = await ctx.electronAPI.git.unstage(repo, args.file_path);
    return ok ? `Unstaged: ${args.file_path}` : `Failed to unstage: ${args.file_path}`;
  },
};

export const gitCommitTool: ToolDefinition<typeof GitCommitArgs> = {
  name: 'git_commit',
  description: 'Commit staged changes with a message.',
  parameters: GitCommitArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const ok = await ctx.electronAPI.git.commit(repo, args.message);
    return ok ? `Committed: "${args.message}"` : 'Commit failed';
  },
};

export const gitPushTool: ToolDefinition<typeof GitRepoArgs> = {
  name: 'git_push',
  description: 'Push committed changes to the remote.',
  parameters: GitRepoArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const ok = await ctx.electronAPI.git.push(repo);
    return ok ? 'Pushed successfully' : 'Push failed';
  },
};

export const gitBranchesTool: ToolDefinition<typeof GitRepoArgs> = {
  name: 'git_branches',
  description: 'List all git branches (local and remote).',
  parameters: GitRepoArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const branches = await ctx.electronAPI.git.branches(repo);
    return branches ? JSON.stringify(branches, null, 2) : 'No branches';
  },
};

export const gitCheckoutTool: ToolDefinition<typeof GitCheckoutArgs> = {
  name: 'git_checkout',
  description: 'Switch to a git branch.',
  parameters: GitCheckoutArgs,
  execute: async (args, ctx) => {
    const repo = getRepoPath(ctx, args.repo_path);
    if (!repo) return 'No repo path';
    const ok = await ctx.electronAPI.git.checkout(repo, args.branch);
    return ok ? `Checked out: ${args.branch}` : `Failed to checkout: ${args.branch}`;
  },
};

export const openExternalTool: ToolDefinition<typeof OpenExternalArgs> = {
  name: 'open_external',
  description: 'Open a URL in the default system browser.',
  parameters: OpenExternalArgs,
  execute: async (args, ctx) => {
    const ok = await ctx.electronAPI.shell.openExternal(args.url);
    return ok ? `Opened: ${args.url}` : `Failed to open: ${args.url}`;
  },
};

export const getClipboardTool: ToolDefinition<typeof GetCanvasStateArgs> = {
  name: 'get_clipboard',
  description: 'Read the current clipboard text content.',
  parameters: GetCanvasStateArgs,
  execute: (_args, ctx) => {
    return ctx.electronAPI.clipboard.readText() || '(empty)';
  },
};

export const setClipboardTool: ToolDefinition<typeof SetClipboardArgs> = {
  name: 'set_clipboard',
  description: 'Write text to the clipboard.',
  parameters: SetClipboardArgs,
  execute: async (args, ctx) => {
    await ctx.electronAPI.clipboard.writeText(args.text);
    return 'Clipboard updated';
  },
};

export const specsExploreTool: ToolDefinition<typeof ExploreSpecsMapArgs> = {
  name: 'specs_explore',
  description: 'Search the SPECGEN feature graph and return dense context per match: description, dependencies, referenced by, IPC, interface, depth-1 neighborhood, and downstream impact. Instant (no UI animation). Use this to orient before any code change instead of grepping specs.',
  parameters: ExploreSpecsMapArgs,
  execute: async (args, ctx) => {
    return await ctx.cockpit.exploreSpecsMap(args.query);
  },
};

export const specsValidateTool: ToolDefinition<typeof GetCanvasStateArgs> = {
  name: 'specs_validate',
  description: 'Run the full SPECGEN validation rule catalog (unresolved/asymmetric edges, cycles, layer inversions, missing files, stub descriptions, export/IPC drift) against the spec graph and source tree. Returns a markdown report.',
  parameters: GetCanvasStateArgs,
  execute: async (_args, ctx) => {
    return await ctx.cockpit.validateSpecsMap();
  },
};

export const specsReconcileTool: ToolDefinition<typeof SpecsReconcileArgs> = {
  name: 'specs_reconcile',
  description: 'Sync structural spec fields from source code. Structural fields only — hand-written descriptions, Interface, State, Lifecycle, UI specs, and unknown sections are never modified. Recomputes all Referenced By sections globally. Replaces the old full-file regenerate.',
  parameters: SpecsReconcileArgs,
  execute: async (args, ctx) => {
    return await ctx.cockpit.reconcileSpecsMap(args.mode, args.create_skeletons ?? false);
  },
};

export const specsReloadTool: ToolDefinition<typeof GetCanvasStateArgs> = {
  name: 'specs_reload',
  description: 'Reread the spec corpus from disk into the SpecsMap graph. Use after editing *.spec.md files directly.',
  parameters: GetCanvasStateArgs,
  execute: async (_args, ctx) => {
    return await ctx.cockpit.reloadSpecsMap();
  },
};

const MemoryScopeArg = z.enum(['global', 'workspace']).describe('global = all workspaces (AppData); workspace = current project .cockpit/memory.json');
const MemoryListArgs = z.object({
  scope: MemoryScopeArg.optional().describe('If omitted, list both scopes'),
});
const MemoryGetArgs = z.object({
  scope: MemoryScopeArg,
  key: z.string().describe('Entry key or id'),
});
const MemorySearchArgs = z.object({
  query: z.string().describe('Search text matched against key, tags, and body'),
  scope: MemoryScopeArg.optional().describe('If omitted, search both scopes'),
});
const MemorySetArgs = z.object({
  scope: MemoryScopeArg,
  key: z.string().describe('Stable short key, e.g. preferred-stack'),
  body: z.string().describe('Durable fact to remember'),
  tags: z.array(z.string()).optional().describe('Optional tags for filtering'),
});
const MemoryDeleteArgs = z.object({
  scope: MemoryScopeArg,
  key: z.string().describe('Entry key or id to delete'),
});

export const memoryListTool: ToolDefinition<typeof MemoryListArgs> = {
  name: 'memory_list',
  description: 'List memory entry keys/tags (no bodies). Prefer this or memory_search before memory_get. Scopes: global | workspace.',
  parameters: MemoryListArgs,
  execute: (args) => memoryStore.list(args.scope as MemoryScope | undefined),
};

export const memoryGetTool: ToolDefinition<typeof MemoryGetArgs> = {
  name: 'memory_get',
  description: 'Read one memory entry body by key or id. Use after memory_list/memory_search — do not dump all memory.',
  parameters: MemoryGetArgs,
  execute: (args) => memoryStore.get(args.scope as MemoryScope, args.key),
};

export const memorySearchTool: ToolDefinition<typeof MemorySearchArgs> = {
  name: 'memory_search',
  description: 'Search memory by key/tags/body substring. Returns ranked previews; use memory_get for full body.',
  parameters: MemorySearchArgs,
  execute: (args) => memoryStore.search(args.query, args.scope as MemoryScope | undefined),
};

export const memorySetTool: ToolDefinition<typeof MemorySetArgs> = {
  name: 'memory_set',
  description: 'Create or update a durable memory entry. Only lasting prefs, decisions, and project conventions — not chat fluff.',
  parameters: MemorySetArgs,
  execute: async (args) => memoryStore.set(args.scope as MemoryScope, args.key, args.body, args.tags),
};

export const memoryDeleteTool: ToolDefinition<typeof MemoryDeleteArgs> = {
  name: 'memory_delete',
  description: 'Delete a memory entry by key or id.',
  parameters: MemoryDeleteArgs,
  execute: async (args) => memoryStore.delete(args.scope as MemoryScope, args.key),
};

// Tools that mutate the filesystem, run a shell command, or change git/branch
// state. Catalog of mutating tools — informational only, not used for
// auto/plan gating (the AI Drawer only pauses for confirmation in step mode).
export const DESTRUCTIVE_TOOL_NAMES = new Set<string>([
  'write_file',
  'delete_file',
  'rename_file',
  'copy_file',
  'create_directory',
  'write_to_terminal',
  'specs_reconcile',
  'git_commit',
  'git_push',
  'git_checkout',
  'memory_set',
  'memory_delete',
]);

export const ALL_TOOLS: ToolDefinition<any>[] = [
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  createDirectoryTool,
  getCanvasStateTool,
  openFileInEditorTool,
  addPluginTool,
  focusCardTool,
  deleteFileTool,
  renameFileTool,
  copyFileTool,
  closeCardTool,
  minimizeCardTool,
  moveCardTool,
  resizeCardTool,
  autoArrangeTool,
  fitCardToViewportTool,
  writeToTerminalTool,
  sendKeyToTerminalTool,
  insertTextInEditorTool,
  readTerminalTool,
  readEditorTool,
  getEditorStateTool,
  getSelectedTextTool,
  setEditorContentTool,
  goToLineTool,
  reopenCardTool,
  resetViewTool,
  panToCardTool,
  setViewTool,
  zoomInTool,
  zoomOutTool,
  openInMarkdownTool,
  revealFileInExplorerTool,
  grepWorkspaceTool,
  killTerminalTool,
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  gitStageTool,
  gitUnstageTool,
  gitCommitTool,
  gitPushTool,
  gitBranchesTool,
  gitCheckoutTool,
  openExternalTool,
  getClipboardTool,
  setClipboardTool,
  specsExploreTool,
  specsValidateTool,
  specsReconcileTool,
  specsReloadTool,
  memoryListTool,
  memoryGetTool,
  memorySearchTool,
  memorySetTool,
  memoryDeleteTool,
  ...AGENT_TOOLS,
];

// Register the shared registry on the fleet executor (breaks the import cycle:
// executor never imports ALL_TOOLS — tool-definitions injects it here).
getAgentExecutor().setRegistry(new ToolRegistry(ALL_TOOLS));
