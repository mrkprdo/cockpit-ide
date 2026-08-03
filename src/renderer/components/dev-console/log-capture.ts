// console.* interception into a ring buffer (refactor.md §C.2).
//
// Installed once (idempotent). Wrapped methods still call the originals so the
// DevTools console keeps working. Note: this must never be fed by
// reportFailure — the health monitor deliberately avoids console.* to prevent
// a loop with this capture.

export type LogLevel = 'debug' | 'info' | 'log' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  args: unknown[];
  at: number;
}

const MAX_ENTRIES = 500;
const LEVEL_ORDER: Record<LogLevel, number> = { error: 0, warn: 1, log: 2, info: 3, debug: 4 };

const listeners = new Set<(entry: LogEntry) => void>();
let entries: LogEntry[] = [];
let installed = false;

export function subscribeLogs(cb: (entry: LogEntry) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getRecentLogs(): LogEntry[] {
  return [...entries];
}

export function clearLogs(): void {
  entries = [];
}

export function logLevelRank(level: LogLevel): number {
  return LEVEL_ORDER[level];
}

function wrap(level: LogLevel, original: (...args: unknown[]) => void): (...args: unknown[]) => void {
  return (...args) => {
    const entry: LogEntry = { level, args, at: Date.now() };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    for (const cb of [...listeners]) {
      try { cb(entry); } catch { /* never let a subscriber break capture */ }
    }
    original(...args);
  };
}

/** Install console interception. Returns an unbind that restores originals. */
export function installConsoleCapture(): () => void {
  if (installed) return () => {};
  installed = true;
  const original = { ...console } as unknown as Record<string, (...args: unknown[]) => void>;
  const wrapLevel = (level: LogLevel) => {
    (console as unknown as Record<string, unknown>)[level] = wrap(level, original[level] ?? ((..._a: unknown[]) => {}));
  };
  wrapLevel('log');
  wrapLevel('info');
  wrapLevel('debug');
  wrapLevel('warn');
  wrapLevel('error');
  return () => {
    for (const level of ['log', 'info', 'debug', 'warn', 'error']) {
      (console as unknown as Record<string, unknown>)[level] = original[level];
    }
    installed = false;
  };
}
