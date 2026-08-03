// Shared mutable process state that no single IPC namespace owns (refactor.md
// §A.4). Pure holders only — no fs, no electron runtime calls. Namespace
// modules reach state through the `state` object; main.ts keeps lifecycle refs
// via the same accessors. state.ts deliberately imports nothing.

import type { BrowserWindow } from 'electron';

let defaultWorkspacePath: string | null = null;
let mainWindow: BrowserWindow | null = null;

export const state = {
  ptyProcesses: new Map<string, any>(),
  terminalSenders: new Map<string, any>(),
  windowWorkspaces: new Map<number, string | null>(),
  get defaultWorkspacePath(): string | null { return defaultWorkspacePath; },
  set defaultWorkspacePath(p: string | null) { defaultWorkspacePath = p; },
  get mainWindow(): BrowserWindow | null { return mainWindow; },
  set mainWindow(w: BrowserWindow | null) { mainWindow = w; },
};
