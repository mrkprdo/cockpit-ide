// terminal-domain AI tools: write/send-key/read/kill a terminal card
// (refactor.md §A.4 tool-definitions split).

import type { ToolDefinition } from '../types';
import {
  WriteToTerminalArgs, SendKeyToTerminalArgs, ReadTerminalArgs, KillTerminalArgs,
} from './schemas';
import { KEY_SEQUENCES } from './schemas';

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

export const readTerminalTool: ToolDefinition<typeof ReadTerminalArgs> = {
  name: 'read_terminal',
  description: 'Read the current output buffer of a terminal card (last 200 lines). Use get_canvas_state first to find the terminal uuid.',
  parameters: ReadTerminalArgs,
  execute: (args, ctx) => {
    const buf = ctx.cockpit.readTerminal(args.uuid);
    return buf || 'Terminal output is empty';
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
