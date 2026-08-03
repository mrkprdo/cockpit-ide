// Cross-process structured logging vocabulary (types only, no runtime code).
// Importable from both src/main and src/renderer.

export type LogLevel = 'debug' | 'info' | 'log' | 'warn' | 'error';

/** A single structured log line pushed from main to the renderer (log:push). */
export interface LogSignal {
  source: string;
  level: LogLevel;
  message: string;
  at: number;
}
