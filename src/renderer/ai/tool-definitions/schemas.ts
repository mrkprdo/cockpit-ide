// Shared argument schemas + constants for the AI tool definitions
// (refactor.md §A.4 tool-definitions split). Plain zod schemas and data only.

import { z } from 'zod/v3';

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

export const READABLE_LENGTH = 100000;
export const MAX_FILE_CHARS = 100000;
export const DIFF_LENGTH = 8000;
export const MAX_GREP_RESULTS = 100;
export const MAX_GREP_FILES = 500;

export const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.html', '.css', '.txt',
  '.yaml', '.yml', '.toml', '.py', '.go', '.rs', '.sh', '.env', '.gitignore',
]);
export const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', 'coverage']);

export const PathArg = z.object({ path: z.string().describe('Absolute path') });
export const TitleArg = z.object({ title: z.string().describe('Card title') });
export const UuidArg = z.object({ uuid: z.string().describe('Terminal card uuid') });

export const ReadFileArgs = z.object({
  path: z.string().describe('Absolute path'),
  offset: z.number().int().min(0).optional().describe('Character offset to start reading from (0-based). Use with limit to paginate through large files. If omitted, reads from the start.'),
  limit: z.number().int().min(1).max(MAX_FILE_CHARS).optional().describe(`Maximum characters to return (default ${MAX_FILE_CHARS}, max ${MAX_FILE_CHARS}). Use with offset for pagination.`),
});
export const WriteFileArgs = z.object({
  path: z.string().describe('Absolute path to the file'),
  content: z.string().describe('Full file content to write'),
});
export const ListDirectoryArgs = PathArg;
export const CreateDirectoryArgs = PathArg;
export const GetCanvasStateArgs = z.object({});
export const OpenFileInEditorArgs = PathArg;
export const AddWindowArgs = z.object({
  type: z.enum(['terminal', 'explorer', 'git', 'markdown', 'specsmap']).describe('Window type to add'),
});
export const DeleteFileArgs = PathArg;
export const RenameFileArgs = z.object({
  old_path: z.string().describe('Current absolute path'),
  new_path: z.string().describe('New absolute path'),
});
export const CopyFileArgs = z.object({
  src: z.string().describe('Source absolute path'),
  dest: z.string().describe('Destination absolute path'),
});
export const MoveCardArgs = z.object({
  title: z.string(),
  x: z.number().describe('World X position (pixels)'),
  y: z.number().describe('World Y position (pixels)'),
});
export const ResizeCardArgs = z.object({
  title: z.string(),
  width: z.number(),
  height: z.number(),
});
export const WriteToTerminalArgs = z.object({
  uuid: z.string().describe('Terminal card uuid from get_canvas_state'),
  command: z.string().describe('Command to run (Enter is appended automatically)'),
});
export const SendKeyToTerminalArgs = z.object({
  uuid: z.string().describe('Terminal card uuid from get_canvas_state'),
  key: z.string().describe('Key name, e.g. "Tab", "Escape", "ArrowUp", "Ctrl+c"'),
});
export const RunCommandArgs = z.object({
  uuid: z.string().describe('Terminal card uuid from get_canvas_state'),
  command: z.string().describe('Command to run (Enter is appended automatically)'),
  timeout_seconds: z.number().int().min(1).max(60).optional().describe('Max seconds to wait for the output to stabilize (default 15, max 60). Returns partial output on timeout — the command may still be running.'),
});
export const InsertTextInEditorArgs = z.object({ text: z.string().describe('Text to insert at the cursor') });
export const ReadTerminalArgs = UuidArg;
export const SetEditorContentArgs = z.object({ content: z.string().describe('New full content for the active file') });
export const GoToLineArgs = z.object({
  line: z.number().describe('Line number (1-based)'),
  col: z.number().default(1).describe('Column number (1-based, default 1)'),
});
export const SetViewArgs = z.object({
  panX: z.number().describe('Horizontal pan offset in pixels'),
  panY: z.number().describe('Vertical pan offset in pixels'),
  zoom: z.number().optional().describe('Zoom scale factor (0.1–5.0). Omit to keep current zoom.'),
});
export const OpenInMarkdownArgs = PathArg;
export const RevealFileArgs = PathArg;
export const GrepWorkspaceArgs = z.object({
  pattern: z.string().describe('Regular expression to search for'),
  dir: z.string().optional().describe('Directory to search in (defaults to workspace root)'),
  glob: z.string().optional().describe('File extension filter e.g. ".ts" or ".json" (optional)'),
});
export const KillTerminalArgs = UuidArg;
export const GitRepoArgs = z.object({
  repo_path: z.string().optional().describe('Repo path (defaults to workspace root)'),
});
export const GitFileArgs = z.object({
  file_path: z.string().describe('Absolute path to the file'),
  repo_path: z.string().optional(),
});
export const GitDiffArgs = z.object({
  file_path: z.string().optional().describe('Specific file path (optional, omit for full diff)'),
  repo_path: z.string().optional(),
});
export const GitLogArgs = z.object({
  max_count: z.number().optional().describe('Max commits to return (default 10)'),
  repo_path: z.string().optional(),
});
export const GitCommitArgs = z.object({
  message: z.string().describe('Commit message'),
  repo_path: z.string().optional(),
});
export const GitCheckoutArgs = z.object({
  branch: z.string().describe('Branch name to checkout'),
  repo_path: z.string().optional(),
});
export const OpenExternalArgs = z.object({ url: z.string().describe('URL to open') });
export const SetClipboardArgs = z.object({ text: z.string().describe('Text to copy to clipboard') });
export const ExploreSpecsMapArgs = z.object({
  query: z.string().describe('Topic or feature name to search for in the spec graph'),
});
export const SpecsReconcileArgs = z.object({
  mode: z.enum(['report', 'structural']).describe(
    'report: compute the structural diff, write nothing. structural: patch structural fields only (exports, dependencies, referenced by, IPC) — prose is never touched.'),
  create_skeletons: z.boolean().optional().describe(
    'In structural mode, create skeleton specs (stub description) for unspecced source files. Default false.'),
});

export const MemoryScopeArg = z.enum(['global', 'workspace']).describe('global = all workspaces (AppData); workspace = current project .cockpit/memory.json');
export const MemoryListArgs = z.object({
  scope: MemoryScopeArg.optional().describe('If omitted, list both scopes'),
});
export const MemoryGetArgs = z.object({
  scope: MemoryScopeArg,
  key: z.string().describe('Entry key or id'),
});
export const MemorySearchArgs = z.object({
  query: z.string().describe('Search text matched against key, tags, and body'),
  scope: MemoryScopeArg.optional().describe('If omitted, search both scopes'),
});
export const MemorySetArgs = z.object({
  scope: MemoryScopeArg,
  key: z.string().describe('Stable short key, e.g. preferred-stack'),
  body: z.string().describe('Durable fact to remember'),
  tags: z.array(z.string()).optional().describe('Optional tags for filtering'),
});
export const MemoryDeleteArgs = z.object({
  scope: MemoryScopeArg,
  key: z.string().describe('Entry key or id to delete'),
});
