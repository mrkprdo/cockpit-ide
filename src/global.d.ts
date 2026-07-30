declare module '*.md' {
  const content: string;
  export default content;
}

interface EditorState {
  openFiles: string[];
  activeFile: string;
  explorerWidth: number;
  cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }>;
  markdownOpenFiles?: string[];
  markdownActiveFile?: string;
  markdownScrollTops?: Record<string, number>;
}

interface WorkspaceState {
  plugins: { uuid: string; title: string; x: number; y: number; width: number; height: number; isOpen: boolean; editorState?: EditorState; gitState?: any }[];
  zOrder: string[];
  zoom: number;
  panX: number;
  panY: number;
  locked?: boolean;
  aiDrawerDetached?: boolean;
}

interface DirEntry { name: string; isDirectory: boolean; }

interface EditorSelectionState {
  filePath: string | null;
  text: string | null;
  selection: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  } | null;
}

interface MemoryEntry {
  id: string;
  key: string;
  tags: string[];
  body: string;
  updatedAt: string;
}

interface MemoryFile {
  version: number;
  updatedAt: string;
  entries: MemoryEntry[];
}

interface Window {
  electronAPI: {
    platform: string;
    versions: { node: string; chrome: string; electron: string; app: string };
    window: {
      newWindow: () => Promise<boolean>;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
    };
    terminal: {
      create: (uuid: string, cwd?: string) => Promise<boolean>;
      write: (uuid: string, data: string) => void;
      resize: (uuid: string, cols: number, rows: number) => void;
      kill: (uuid: string) => void;
      onData: (callback: (uuid: string, data: string) => void) => () => void;
      onExit: (callback: (uuid: string) => void) => () => void;
    };
    workspace: {
      select: () => Promise<string | null>;
      setPath: (p: string) => Promise<boolean>;
      getPath: () => Promise<string | null>;
      load: (wsPath?: string) => Promise<WorkspaceState | null>;
      save: (state: WorkspaceState, wsPath?: string) => Promise<void>;
      getRecent: () => Promise<string[]>;
      addRecent: (p: string) => Promise<void>;
      removeRecent: (p: string) => Promise<void>;
    };
    shell: {
      openExternal: (url: string) => Promise<boolean>;
    };
    prefs: {
      load: () => Promise<any>;
      save: (prefs: any) => Promise<boolean>;
    };
    memory: {
      loadGlobal: () => Promise<MemoryFile>;
      saveGlobal: (data: MemoryFile) => Promise<boolean>;
      loadWorkspace: (wsPath: string) => Promise<MemoryFile>;
      saveWorkspace: (wsPath: string, data: MemoryFile) => Promise<boolean>;
    };
    git: {
      remotes: (repoPath: string) => Promise<{ name: string; url: string }[]>;
      branches: (repoPath: string) => Promise<{ name: string; current: boolean; isRemote: boolean }[]>;
      checkout: (repoPath: string, branch: string) => Promise<boolean | { ok: boolean; error?: string }>;
      log: (repoPath: string, maxCount?: number) => Promise<{ hash: string; author: string; date: string; message: string }[]>;
      showTree: (repoPath: string, commit: string) => Promise<{ status: string; path: string }[]>;
      diff: (repoPath: string, commit: string, filePath?: string) => Promise<string>;
      currentBranch: (repoPath: string) => Promise<string>;
      stagedFiles: (repoPath: string) => Promise<{ status: string; path: string }[]>;
      unstagedFiles: (repoPath: string) => Promise<{ status: string; path: string }[]>;
      stagedDiff: (repoPath: string, filePath: string) => Promise<string>;
      unstagedDiff: (repoPath: string, filePath: string) => Promise<string>;
      commitBody: (repoPath: string, commit: string) => Promise<string>;
      stage: (repoPath: string, filePath: string) => Promise<boolean>;
      unstage: (repoPath: string, filePath: string) => Promise<boolean>;
      commit: (repoPath: string, message: string) => Promise<boolean | { ok: boolean; error?: string }>;
      push: (repoPath: string) => Promise<boolean | { ok: boolean; error?: string }>;
      checkAhead: (repoPath: string) => Promise<number | boolean>;
    };
    clipboard: {
      readText: () => string;
      writeText: (text: string) => Promise<void>;
    };
    fs: {
      readDir: (dirPath: string) => Promise<DirEntry[] | null>;
      readFile: (filePath: string) => Promise<string | null>;
      writeFile: (filePath: string, content: string) => Promise<boolean>;
      mkdir: (dirPath: string) => Promise<boolean>;
      delete: (targetPath: string) => Promise<boolean>;
      copy: (src: string, dest: string) => Promise<boolean>;
      rename: (oldPath: string, newPath: string) => Promise<boolean>;
      watch: (dir: string) => Promise<boolean>;
      unwatch: () => Promise<boolean>;
      onChanged: (callback: (filePath: string) => void) => () => void;
    };
    ide: {
      editorState: (state: EditorSelectionState) => void;
      status: () => Promise<{ running: boolean; port: number; workspace: string | null; lockPaths: string[] }>;
      onOpenFile: (callback: (filePath: string) => void) => () => void;
    };
  };
}
