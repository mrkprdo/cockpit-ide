import type { WindowCard } from '../WindowCard';
import type { TerminalWindow } from '../TerminalWindow';
import type { ExplorerWindow } from '../ExplorerWindow';
import type { GitWindow, GitState } from '../GitWindow';
import type { SpecsMapWindow } from '../SpecsMapWindow';
import type { AgentsWindow } from '../AgentsWindow';
import type { DevConsoleWindow } from '../dev-console/DevConsoleWindow';

export type EditorState = { openFiles: string[]; activeFile: string; explorerWidth: number; cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }>; markdownOpenFiles?: string[]; markdownActiveFile?: string; markdownScrollTops?: Record<string, number> };
export type WindowEntry = { uuid: string; title: string; x: number; y: number; width: number; height: number; isOpen: boolean; editorState?: EditorState; gitState?: GitState };
export type SaveState = { windows: WindowEntry[]; zOrder: string[]; zoom: number; panX: number; panY: number; locked?: boolean; aiDrawerDetached?: boolean };

export interface CardState {
  card: WindowCard;
  worldX: number;
  worldY: number;
  isOpen: boolean;
  savedTitle: string;
  savedWidth: number;
  savedHeight: number;
  savedWX: number;
  savedWY: number;
  terminalWindow: TerminalWindow | null;
  explorerWindow: ExplorerWindow | null;
  gitWindow: GitWindow | null;
  specsmapWindow: SpecsMapWindow | null;
  agentsWindow: AgentsWindow | null;
  devConsoleWindow: DevConsoleWindow | null;
  onCardResize?: () => void;
}
