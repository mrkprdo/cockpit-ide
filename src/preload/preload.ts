import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },
  terminal: {
    create: (cwd?: string) => ipcRenderer.invoke('terminal:create', cwd),
    write: (data: string) => ipcRenderer.send('terminal:write', data),
    resize: (cols: number, rows: number) => ipcRenderer.send('terminal:resize', cols, rows),
    kill: () => ipcRenderer.send('terminal:kill'),
    onData: (callback: (data: string) => void) => {
      const handler = (_event: any, data: string) => callback(data);
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.removeListener('terminal:data', handler);
    },
  },
  workspace: {
    select: () => ipcRenderer.invoke('workspace:select'),
    getPath: () => ipcRenderer.invoke('workspace:getPath'),
    load: () => ipcRenderer.invoke('workspace:load'),
    save: (state: any) => ipcRenderer.invoke('workspace:save', state),
  },
});
