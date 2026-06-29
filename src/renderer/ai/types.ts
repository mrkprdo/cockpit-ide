import type { z } from 'zod/v3';

/**
 * Typed shape of the global `window.__cockpit` object injected by App.ts.
 * The AI harness consumes this to manipulate the IDE on the agent's behalf.
 */
export interface CockpitGlobal {
  getCanvasState: () => WorkspaceStateLike;
  getWorkspacePath: () => string | null | undefined;
  openFile: (path: string) => Promise<void> | void;
  addPlugin: (type: string) => void;
  focusCard: (title: string) => void;
  closeCard: (title: string) => boolean;
  minimizeCard: (title: string) => boolean;
  moveCard: (title: string, x: number, y: number) => void;
  resizeCard: (title: string, width: number, height: number) => boolean;
  autoArrange: () => void;
  fitCardToViewport: (title: string) => boolean;
  writeToTerminal: (uuid: string, command: string) => void;
  sendKeyToTerminal: (uuid: string, sequence: string) => void;
  insertInEditor: (text: string) => Promise<void> | void;
  readTerminal: (uuid: string) => string;
  readEditor: () => Promise<string> | string;
  getEditorState: () => Promise<EditorStateLike | null> | EditorStateLike | null;
  getSelectionText: () => Promise<string> | string;
  setEditorContent: (content: string) => Promise<void> | void;
  goToLine: (line: number, col?: number) => Promise<void> | void;
  reopenCard: (title: string) => boolean;
  resetView: () => void;
  panToCard: (title: string) => boolean;
  setView: (panX: number, panY: number, zoom?: number) => void;
  setCanvasOverlay: (left: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  openInMarkdown: (filePath: string) => void;
  revealFile: (filePath: string) => Promise<void> | void;
  killTerminal: (uuid: string) => void;
  refreshSpecsMap: () => void;
  regenerateSpecs: () => Promise<void> | void;
}

export interface WorkspaceStateLike {
  zoom: number;
  panX: number;
  panY: number;
  plugins: PluginStateLike[];
}

export interface PluginStateLike {
  uuid: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isOpen: boolean;
}

export interface EditorStateLike {
  openFiles?: string[];
  activeFile?: string | null;
  cursors?: Record<string, { lineNumber: number; column: number }>;
  selection?: { text?: string | null } | null;
}

/** Everything a tool needs to read from or write to the IDE. */
export interface ToolContext {
  electronAPI: Window['electronAPI'];
  cockpit: CockpitGlobal;
}

/** A single tool definition: schema, metadata, and executor. */
export interface ToolDefinition<Args extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  parameters: Args;
  execute: (args: z.infer<Args>, ctx: ToolContext) => Promise<string> | string;
}

/** OpenAI-compatible function schema generated from a tool definition. */
export interface OpenAIFunctionSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** OpenAI-compatible chat message shapes used by the LLM client. */
export type LLMMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMMessage {
  role: LLMMessageRole;
  content?: string | null;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMChoice {
  message: LLMMessage;
  finish_reason: string;
}

export interface LLMResponse {
  choices: LLMChoice[];
}

export interface LLMConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface LLMCompletionOptions {
  messages: LLMMessage[];
  tools?: OpenAIFunctionSchema[];
  tool_choice?: string | { type: string; function?: { name: string } };
  temperature?: number;
  max_tokens?: number;
  signal?: AbortSignal;
}
