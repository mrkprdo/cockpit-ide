import { contextBridge, ipcRenderer } from 'electron';

// --- IPC tracing -----------------------------------------------------------
// contextIsolation is on, so the renderer has no ipcRenderer to wrap — tracing
// happens here, in preload, around every exposed method. Not every call is
// request-response (refactor.md §C.2):
//   invoke-backed   -> Promise  -> { channel, durationMs, payloadSize, ok }
//   send-backed     -> void     -> { channel, payloadSize }
//   sendSync-backed -> T        -> { channel, durationMs, payloadSize }

export interface TraceEntry {
  channel: string;
  type: 'invoke' | 'send' | 'sendSync';
  at: number;
  payloadSize: number;
  durationMs?: number;
  ok?: boolean;
}

const MAX_TRACE = 300;
const traceBuffer: TraceEntry[] = [];
const traceListeners = new Set<(entry: TraceEntry) => void>();

function pushTrace(entry: TraceEntry): void {
  traceBuffer.push(entry);
  if (traceBuffer.length > MAX_TRACE) traceBuffer.splice(0, traceBuffer.length - MAX_TRACE);
  for (const cb of [...traceListeners]) {
    try { cb(entry); } catch { /* never let a subscriber break tracing */ }
  }
}

function payloadSize(args: unknown[]): number {
  try { return JSON.stringify(args).length; } catch { return 0; }
}

function tracedInvoke<T = unknown>(channel: string): (...args: unknown[]) => Promise<T> {
  return (...args) => {
    const at = Date.now();
    const start = performance.now();
    const size = payloadSize(args);
    const p = ipcRenderer.invoke(channel, ...args) as Promise<T>;
    p.then(() => pushTrace({ channel, type: 'invoke', at, payloadSize: size, durationMs: performance.now() - start, ok: true }))
      .catch(() => pushTrace({ channel, type: 'invoke', at, payloadSize: size, durationMs: performance.now() - start, ok: false }));
    return p;
  };
}

function tracedSend(channel: string): (...args: unknown[]) => void {
  return (...args) => {
    pushTrace({ channel, type: 'send', at: Date.now(), payloadSize: payloadSize(args) });
    ipcRenderer.send(channel, ...args);
  };
}

function tracedSendSync<T = unknown>(channel: string): (...args: unknown[]) => T {
  return (...args) => {
    const at = Date.now();
    const start = performance.now();
    const result = ipcRenderer.sendSync(channel, ...args) as T;
    pushTrace({ channel, type: 'sendSync', at, payloadSize: payloadSize(args), durationMs: performance.now() - start });
    return result;
  };
}

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
    newWindow: tracedInvoke('window:new'),
    minimize: tracedSend('window:minimize'),
    maximize: tracedSend('window:maximize'),
    close: tracedSend('window:close'),
    isMaximized: tracedInvoke('window:isMaximized'),
    reload: tracedSend('window:reload'),
  },
  clipboard: {
    readText: tracedSendSync('clipboard:readText'),
    writeText: tracedInvoke('clipboard:writeText'),
  },
  terminal: {
    create: tracedInvoke('terminal:create'),
    write: tracedSend('terminal:write'),
    resize: tracedSend('terminal:resize'),
    kill: tracedSend('terminal:kill'),
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
    select: tracedInvoke('workspace:select'),
    setPath: tracedInvoke('workspace:setPath'),
    getPath: tracedInvoke('workspace:getPath'),
    load: tracedInvoke('workspace:load'),
    save: tracedInvoke('workspace:save'),
    getRecent: tracedInvoke('workspace:getRecent'),
    addRecent: tracedInvoke('workspace:addRecent'),
    removeRecent: tracedInvoke('workspace:removeRecent'),
  },
  shell: {
    openExternal: tracedInvoke('shell:openExternal'),
    exec: tracedInvoke('shell:exec'),
  },
  prefs: {
    load: tracedInvoke('prefs:load'),
    save: tracedInvoke('prefs:save'),
  },
  memory: {
    loadGlobal: tracedInvoke('memory:loadGlobal'),
    saveGlobal: tracedInvoke('memory:saveGlobal'),
    loadWorkspace: tracedInvoke('memory:loadWorkspace'),
    saveWorkspace: tracedInvoke('memory:saveWorkspace'),
  },
  git: {
    remotes: tracedInvoke('git:remotes'),
    branches: tracedInvoke('git:branches'),
    checkout: tracedInvoke('git:checkout'),
    log: tracedInvoke('git:log'),
    showTree: tracedInvoke('git:showTree'),
    diff: tracedInvoke('git:diff'),
    currentBranch: tracedInvoke('git:currentBranch'),
    stagedFiles: tracedInvoke('git:stagedFiles'),
    unstagedFiles: tracedInvoke('git:unstagedFiles'),
    stagedDiff: tracedInvoke('git:stagedDiff'),
    unstagedDiff: tracedInvoke('git:unstagedDiff'),
    commitBody: tracedInvoke('git:commitBody'),
    stage: tracedInvoke('git:stage'),
    unstage: tracedInvoke('git:unstage'),
    commit: tracedInvoke('git:commit'),
    push: tracedInvoke('git:push'),
    checkAhead: tracedInvoke('git:checkAhead'),
  },
  fs: {
    readDir: tracedInvoke('fs:readDir'),
    readFile: tracedInvoke('fs:readFile'),
    writeFile: tracedInvoke('fs:writeFile'),
    mkdir: tracedInvoke('fs:mkdir'),
    delete: tracedInvoke('fs:delete'),
    copy: tracedInvoke('fs:copy'),
    rename: tracedInvoke('fs:rename'),
    watch: tracedInvoke('file:watch'),
    unwatch: tracedInvoke('file:unwatch'),
    onChanged: (callback: (filePath: string) => void) => {
      const handler = (_event: any, filePath: string) => callback(filePath);
      ipcRenderer.on('file:changed', handler);
      return () => ipcRenderer.removeListener('file:changed', handler);
    },
  },
  ide: {
    editorState: tracedSend('ide:editorState'),
    status: tracedInvoke('ide:status'),
    onOpenFile: (callback: (filePath: string) => void) => {
      const handler = (_event: any, filePath: string) => callback(filePath);
      ipcRenderer.on('ide:openFile', handler);
      return () => ipcRenderer.removeListener('ide:openFile', handler);
    },
  },
  diagnostics: {
    reportError: tracedSend('diagnostics:rendererError'),
  },
  health: {
    onMainFailure: (callback: (signal: { kind: string; message: string }) => void) => {
      const handler = (_event: any, signal: { kind: string; message: string }) => callback(signal);
      ipcRenderer.on('health:mainFailure', handler);
      return () => ipcRenderer.removeListener('health:mainFailure', handler);
    },
  },
  log: {
    onPush: (callback: (signal: { source: string; level: string; message: string; at: number }) => void) => {
      const handler = (_event: any, signal: { source: string; level: string; message: string; at: number }) => callback(signal);
      ipcRenderer.on('log:push', handler);
      return () => ipcRenderer.removeListener('log:push', handler);
    },
  },
  __trace: {
    subscribe: (callback: (entry: TraceEntry) => void) => {
      traceListeners.add(callback);
      return () => traceListeners.delete(callback);
    },
    getRecent: () => [...traceBuffer],
  },
});
