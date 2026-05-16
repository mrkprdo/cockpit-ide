interface WorkspaceState {
  plugins: { title: string; x: number; y: number; width: number; height: number }[];
  zoom: number;
  panX: number;
  panY: number;
}

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
      create: () => Promise<boolean>;
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
  };
}
