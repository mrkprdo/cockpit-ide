import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  window: {
    newWindow: () => ipcRenderer.invoke('window:new'),
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },
  clipboard: {
    readText: () => ipcRenderer.invoke('clipboard:readText'),
  },
  terminal: {
    create: (uuid: string, cwd?: string) => ipcRenderer.invoke('terminal:create', uuid, cwd),
    write: (uuid: string, data: string) => ipcRenderer.send('terminal:write', uuid, data),
    resize: (uuid: string, cols: number, rows: number) => ipcRenderer.send('terminal:resize', uuid, cols, rows),
    kill: (uuid: string) => ipcRenderer.send('terminal:kill', uuid),
    onData: (callback: (uuid: string, data: string) => void) => {
      const handler = (_event: any, uuid: string, data: string) => callback(uuid, data);
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.removeListener('terminal:data', handler);
    },
    onExit: (callback: (uuid: string) => void) => {
      const handler = (_event: any, uuid: string) => callback(uuid);
      ipcRenderer.on('terminal:exit', handler);
      return () => ipcRenderer.removeListener('terminal:exit', handler);
    },
  },
  workspace: {
    select: () => ipcRenderer.invoke('workspace:select'),
    getPath: () => ipcRenderer.invoke('workspace:getPath'),
    load: (wsPath?: string) => ipcRenderer.invoke('workspace:load', wsPath),
    save: (state: any) => ipcRenderer.invoke('workspace:save', state),
    getRecent: () => ipcRenderer.invoke('workspace:getRecent'),
    addRecent: (p: string) => ipcRenderer.invoke('workspace:addRecent', p),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
  prefs: {
    load: () => ipcRenderer.invoke('prefs:load'),
    save: (prefs: any) => ipcRenderer.invoke('prefs:save', prefs),
  },
  fs: {
    readDir: (dirPath: string) => ipcRenderer.invoke('fs:readDir', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    delete: (targetPath: string) => ipcRenderer.invoke('fs:delete', targetPath),
    copy: (src: string, dest: string) => ipcRenderer.invoke('fs:copy', src, dest),
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    watch: (dir: string) => ipcRenderer.invoke('file:watch', dir),
    unwatch: () => ipcRenderer.invoke('file:unwatch'),
    onChanged: (callback: (filePath: string) => void) => {
      const handler = (_event: any, filePath: string) => callback(filePath);
      ipcRenderer.on('file:changed', handler);
      return () => ipcRenderer.removeListener('file:changed', handler);
    },
  },
});
