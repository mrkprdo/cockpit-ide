interface WorkspaceState {
  plugins: { uuid: string; title: string; x: number; y: number; width: number; height: number; isOpen: boolean }[];
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
      create: (cwd?: string) => Promise<boolean>;
      write: (data: string) => void;
      resize: (cols: number, rows: number) => void;
      kill: () => void;
      onData: (callback: (data: string) => void) => () => void;
    };
    workspace: {
      select: () => Promise<string | null>;
      getPath: () => Promise<string | null>;
      load: () => Promise<WorkspaceState | null>;
      save: (state: WorkspaceState) => Promise<void>;
    };
    fs: {
      readDir: (dirPath: string) => Promise<DirEntry[] | null>;
      readFile: (filePath: string) => Promise<string | null>;
      writeFile: (filePath: string, content: string) => Promise<boolean>;
    };
  };
}
