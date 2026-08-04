// canvas/card AI tools: canvas state, cards (focus/close/minimize/move/resize/
// reopen), view controls, editor access (refactor.md §A.4 tool-definitions split).

import type { ToolDefinition } from '../types';
import {
  GetCanvasStateArgs, OpenFileInEditorArgs, AddWindowArgs, TitleArg, MoveCardArgs,
  ResizeCardArgs, InsertTextInEditorArgs, SetEditorContentArgs, GoToLineArgs,
  SetViewArgs, OpenInMarkdownArgs, RevealFileArgs,
} from './schemas';
import { windowTypeFromTitle } from './helpers';

export const getCanvasStateTool: ToolDefinition<typeof GetCanvasStateArgs> = {
  name: 'get_canvas_state',
  description: 'Return the current IDE canvas state: open cards, types, positions, workspace path.',
  parameters: GetCanvasStateArgs,
  execute: (_args, ctx) => {
    const state = ctx.cockpit.getCanvasState();
    return JSON.stringify({
      workspace: ctx.cockpit.getWorkspacePath(),
      zoom: state.zoom,
      cards: state.windows.map(p => ({
        uuid: p.uuid,
        title: p.title,
        type: windowTypeFromTitle(p.title),
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

export const addWindowTool: ToolDefinition<typeof AddWindowArgs> = {
  name: 'add_window',
  description: 'Add a window card to the canvas.',
  parameters: AddWindowArgs,
  execute: (args, ctx) => {
    ctx.cockpit.addWindow(args.type);
    return `Added ${args.type} window`;
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

export const insertTextInEditorTool: ToolDefinition<typeof InsertTextInEditorArgs> = {
  name: 'insert_text_in_editor',
  description: 'Insert text at the current cursor position in the active editor tab.',
  parameters: InsertTextInEditorArgs,
  execute: async (args, ctx) => {
    await ctx.cockpit.insertInEditor(args.text);
    return 'Inserted text in editor';
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
