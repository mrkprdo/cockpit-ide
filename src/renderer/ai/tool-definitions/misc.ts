// misc-domain AI tools: open external URL + clipboard read/write
// (refactor.md §A.4 tool-definitions split).

import type { ToolDefinition } from '../types';
import { OpenExternalArgs, GetCanvasStateArgs, SetClipboardArgs } from './schemas';

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
