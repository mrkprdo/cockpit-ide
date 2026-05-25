import { contextBridge, ipcRenderer } from 'electron';

const appVersion: string = ipcRenderer.sendSync('app:version');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    app: appVersion,
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
    save: (state: any, wsPath?: string) => ipcRenderer.invoke('workspace:save', state, wsPath),
    getRecent: () => ipcRenderer.invoke('workspace:getRecent'),
    addRecent: (p: string) => ipcRenderer.invoke('workspace:addRecent', p),
    removeRecent: (p: string) => ipcRenderer.invoke('workspace:removeRecent', p),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
  prefs: {
    load: () => ipcRenderer.invoke('prefs:load'),
    save: (prefs: any) => ipcRenderer.invoke('prefs:save', prefs),
  },
  git: {
    remotes: (repoPath: string) => ipcRenderer.invoke('git:remotes', repoPath),
    branches: (repoPath: string) => ipcRenderer.invoke('git:branches', repoPath),
    checkout: (repoPath: string, branch: string) => ipcRenderer.invoke('git:checkout', repoPath, branch),
    log: (repoPath: string, maxCount?: number) => ipcRenderer.invoke('git:log', repoPath, maxCount),
    showTree: (repoPath: string, commit: string) => ipcRenderer.invoke('git:showTree', repoPath, commit),
    diff: (repoPath: string, commit: string, filePath?: string) => ipcRenderer.invoke('git:diff', repoPath, commit, filePath),
    currentBranch: (repoPath: string) => ipcRenderer.invoke('git:currentBranch', repoPath),
    stagedFiles: (repoPath: string) => ipcRenderer.invoke('git:stagedFiles', repoPath),
    unstagedFiles: (repoPath: string) => ipcRenderer.invoke('git:unstagedFiles', repoPath),
    stagedDiff: (repoPath: string, filePath: string) => ipcRenderer.invoke('git:stagedDiff', repoPath, filePath),
    unstagedDiff: (repoPath: string, filePath: string) => ipcRenderer.invoke('git:unstagedDiff', repoPath, filePath),
    commitBody: (repoPath: string, commit: string) => ipcRenderer.invoke('git:commitBody', repoPath, commit),
    stage: (repoPath: string, filePath: string) => ipcRenderer.invoke('git:stage', repoPath, filePath),
    unstage: (repoPath: string, filePath: string) => ipcRenderer.invoke('git:unstage', repoPath, filePath),
    commit: (repoPath: string, message: string) => ipcRenderer.invoke('git:commit', repoPath, message),
    push: (repoPath: string) => ipcRenderer.invoke('git:push', repoPath),
    checkAhead: (repoPath: string) => ipcRenderer.invoke('git:checkAhead', repoPath),
  },
  fs: {
    readDir: (dirPath: string) => ipcRenderer.invoke('fs:readDir', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    mkdir: (dirPath: string) => ipcRenderer.invoke('fs:mkdir', dirPath),
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
