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
  };
}
