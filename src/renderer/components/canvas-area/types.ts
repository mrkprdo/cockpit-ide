import type { PluginCard } from '../PluginCard';
import type { TerminalPlugin } from '../TerminalPlugin';
import type { ExplorerPlugin } from '../ExplorerPlugin';
import type { GitPlugin, GitState } from '../GitPlugin';
import type { SpecsMapPlugin } from '../SpecsMapPlugin';
import type { AgentsPlugin } from '../AgentsPlugin';
import type { DevConsolePlugin } from '../dev-console/DevConsolePlugin';

export type EditorState = { openFiles: string[]; activeFile: string; explorerWidth: number; cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }>; markdownOpenFiles?: string[]; markdownActiveFile?: string; markdownScrollTops?: Record<string, number> };
export type PluginEntry = { uuid: string; title: string; x: number; y: number; width: number; height: number; isOpen: boolean; editorState?: EditorState; gitState?: GitState };
export type SaveState = { plugins: PluginEntry[]; zOrder: string[]; zoom: number; panX: number; panY: number; locked?: boolean; aiDrawerDetached?: boolean };

export interface CardState {
  card: PluginCard;
  worldX: number;
  worldY: number;
  isOpen: boolean;
  savedTitle: string;
  savedWidth: number;
  savedHeight: number;
  savedWX: number;
  savedWY: number;
  terminalPlugin: TerminalPlugin | null;
  explorerPlugin: ExplorerPlugin | null;
  gitPlugin: GitPlugin | null;
  specsmapPlugin: SpecsMapPlugin | null;
  agentsPlugin: AgentsPlugin | null;
  devConsolePlugin: DevConsolePlugin | null;
  onCardResize?: () => void;
}
