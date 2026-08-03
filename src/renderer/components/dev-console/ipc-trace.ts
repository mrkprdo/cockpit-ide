// IPC trace feed (refactor.md §C.2). Reads from the __trace subscription that
// preload exposes (preload wraps every electronAPI method — the renderer has
// no ipcRenderer of its own under contextIsolation). IpcTraceEntry is the
// ambient global type declared in src/global.d.ts.

const MAX_ENTRIES = 300;

const listeners = new Set<(entry: IpcTraceEntry) => void>();
let entries: IpcTraceEntry[] = [];
let installed = false;

export function subscribeIpcTrace(cb: (entry: IpcTraceEntry) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getRecentIpcTrace(): IpcTraceEntry[] {
  return [...entries];
}

export function clearIpcTrace(): void {
  entries = [];
}

/** Subscribe to the preload trace feed. Idempotent; returns an unbind. */
export function installIpcTrace(): () => void {
  if (installed) return () => {};
  installed = true;
  const unsub = window.electronAPI?.__trace.subscribe((entry) => {
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    for (const cb of [...listeners]) {
      try { cb(entry); } catch { /* never let a subscriber break tracing */ }
    }
  });
  return () => {
    unsub?.();
    installed = false;
  };
}
