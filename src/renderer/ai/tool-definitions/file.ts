// file-domain AI tools: read/write/list/create/delete/rename/copy + grep
// (refactor.md §A.4 tool-definitions split).

import type { ToolDefinition } from '../types';
import {
  ReadFileArgs, WriteFileArgs, ListDirectoryArgs, CreateDirectoryArgs,
  DeleteFileArgs, RenameFileArgs, CopyFileArgs, GrepWorkspaceArgs, MAX_FILE_CHARS,
} from './schemas';
import { grepWorkspace, readFileResult } from './helpers';

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
