// Tagged structured logger for the renderer (refactor.md §B / DevConsole).
// Every line is emitted through console.* so the dev console's log capture
// picks it up with a consistent `[source]` prefix. Logging is best-effort and
// must never break the app. Failure *signals* still go through
// health/monitor's reportFailure — this logger is for activity/operational
// lines, not the failure-signal stream.

import type { LogLevel } from '../../shared/log-types';

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const METHOD: Record<LogLevel, keyof Console> = {
  debug: 'debug', info: 'info', log: 'log', warn: 'warn', error: 'error',
};

export function createLogger(source: string): Logger {
  const emit = (level: LogLevel, args: unknown[]) => {
    const fn = console[METHOD[level]] as unknown as (...a: unknown[]) => void;
    try { fn(`[${source}]`, ...args); } catch { /* logging must never break the app */ }
  };
  return {
    debug: (...args) => emit('debug', args),
    info: (...args) => emit('info', args),
    log: (...args) => emit('log', args),
    warn: (...args) => emit('warn', args),
    error: (...args) => emit('error', args),
  };
}
