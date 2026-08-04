// AI tool definitions, split by domain (refactor.md §A.4). This barrel keeps
// the original `ai/tool-definitions` import path — consumers import from
// `../ai/tool-definitions` and get everything re-exported here.

import { getAgentExecutor } from '../../agents/executor';
import { AGENT_TOOLS } from '../../agents/agent-tools';
import { ToolRegistry } from '../tool-registry';
import type { ToolDefinition } from '../types';
import {
  readFileTool, writeFileTool, listDirectoryTool, createDirectoryTool,
  deleteFileTool, renameFileTool, copyFileTool, grepWorkspaceTool,
} from './file';
import {
  getCanvasStateTool, openFileInEditorTool, addWindowTool, focusCardTool,
  closeCardTool, minimizeCardTool, moveCardTool, resizeCardTool, autoArrangeTool,
  fitCardToViewportTool, insertTextInEditorTool, readEditorTool,
  getEditorStateTool, getSelectedTextTool, setEditorContentTool, goToLineTool,
  reopenCardTool, resetViewTool, panToCardTool, setViewTool, zoomInTool,
  zoomOutTool, openInMarkdownTool, revealFileInExplorerTool,
} from './canvas';
import { writeToTerminalTool, sendKeyToTerminalTool, readTerminalTool, killTerminalTool, runCommandTool } from './terminal';
import {
  gitStatusTool, gitDiffTool, gitLogTool, gitStageTool, gitUnstageTool,
  gitCommitTool, gitPushTool, gitBranchesTool, gitCheckoutTool,
} from './git';
import { specsExploreTool, specsValidateTool, specsReconcileTool, specsReloadTool } from './specs';
import { memoryListTool, memoryGetTool, memorySearchTool, memorySetTool, memoryDeleteTool } from './memory';
import { openExternalTool, getClipboardTool, setClipboardTool } from './misc';

export { KEY_SEQUENCES } from './schemas';
export * from './schemas';
export * from './helpers';
export * from './file';
export * from './canvas';
export * from './terminal';
export * from './git';
export * from './specs';
export * from './memory';
export * from './misc';

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
  'run_command',
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
  addWindowTool,
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
  runCommandTool,
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
