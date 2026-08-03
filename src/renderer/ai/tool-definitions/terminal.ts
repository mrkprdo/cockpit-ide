// terminal-domain AI tools: write/send-key/read/kill a terminal card
// (refactor.md §A.4 tool-definitions split).

import type { ToolDefinition } from '../types';
import {
  WriteToTerminalArgs, SendKeyToTerminalArgs, ReadTerminalArgs, KillTerminalArgs, RunCommandArgs,
} from './schemas';
import { KEY_SEQUENCES } from './schemas';

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

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

export const runCommandTool: ToolDefinition<typeof RunCommandArgs> = {
  name: 'run_command',
  description: 'Run a command in a terminal and capture the output it produces. Writes the command, polls until the output stabilizes (or the timeout), and returns the NEW output since the command was written. Unlike write_to_terminal (which returns nothing), this returns command output synchronously — prefer it for anything you need to read. Timeouts return partial output with a notice; the command may still be running. Params: uuid, command, timeout_seconds? (default 15, max 60).',
  parameters: RunCommandArgs,
  execute: async (args, ctx) => {
    const uuid = args.uuid;
    const timeoutSeconds = args.timeout_seconds ?? 15;
    const timeoutMs = Math.min(timeoutSeconds, 60) * 1000;
    const before = ctx.cockpit.readTerminal(uuid) || '';
    if (before === 'Terminal not found') return `Terminal not found: ${uuid}. Use get_canvas_state to find a valid terminal uuid.`;
    ctx.cockpit.writeToTerminal(uuid, args.command);

    const deadline = Date.now() + timeoutMs;
    let last = before;
    let stableFor = 0;
    let current = before;
    while (Date.now() < deadline) {
      await sleep(300);
      current = ctx.cockpit.readTerminal(uuid) || '';
      if (current === last) {
        stableFor += 300;
        if (stableFor >= 900) break;
      } else {
        stableFor = 0;
        last = current;
      }
    }
    const timedOut = Date.now() >= deadline;

    let delta = '';
    if (current.startsWith(before) && current.length > before.length) {
      delta = current.slice(before.length);
    } else if (current !== before) {
      delta = current;
    }
    delta = delta.trim();
    if (!delta) {
      return timedOut
        ? `Command sent to ${uuid}; no output captured within ${timeoutSeconds}s (still running or produced none). Poll with read_terminal(${uuid}).`
        : `Command produced no output.`;
    }
    const tailNote = !current.startsWith(before) ? '\n[terminal scrolled — showing the last 200 lines of the buffer]' : '';
    return timedOut
      ? `${delta}${tailNote}\n---[run_command timed out after ${timeoutSeconds}s; the command may still be running — poll with read_terminal(${uuid})]---`
      : `${delta}${tailNote}`;
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
