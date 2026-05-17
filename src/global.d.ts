interface EditorState {
  openFiles: string[];
  activeFile: string;
  explorerWidth: number;
  cursors: Record<string, { lineNumber: number; column: number; scrollTop: number }>;
}

interface WorkspaceState {
  plugins: { uuid: string; title: string; x: number; y: number; width: number; height: number; isOpen: boolean; editorState?: EditorState }[];
  zOrder: string[];
  zoom: number;
  panX: number;
  panY: number;
}

interface DirEntry { name: string; isDirectory: boolean; }

interface Window {
  electronAPI: {
    platform: string;
    versions: { node: string; chrome: string; electron: string };
    window: {
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
    };
    workspace: {
      select: () => Promise<string | null>;
      getPath: () => Promise<string | null>;
      load: () => Promise<WorkspaceState | null>;
      save: (state: WorkspaceState) => Promise<void>;
      getRecent: () => Promise<string[]>;
      addRecent: (p: string) => Promise<void>;
    };
    shell: {
      openExternal: (url: string) => Promise<boolean>;
    };
    fs: {
      readDir: (dirPath: string) => Promise<DirEntry[] | null>;
      readFile: (filePath: string) => Promise<string | null>;
      writeFile: (filePath: string, content: string) => Promise<boolean>;
      delete: (targetPath: string) => Promise<boolean>;
      copy: (src: string, dest: string) => Promise<boolean>;
      rename: (oldPath: string, newPath: string) => Promise<boolean>;
      watch: (dir: string) => Promise<boolean>;
      unwatch: () => Promise<boolean>;
      onChanged: (callback: (filePath: string) => void) => () => void;
    };
  };
}
