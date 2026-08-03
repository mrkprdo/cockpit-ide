// Cross-process failure vocabulary. Importable from both src/main and
// src/renderer — types only, no runtime code.
//
// `FailureSignalKind` is a closed string-union: it grows only when a real,
// observed failure mode shows up during the split (refactor.md §B.2), never
// speculatively.

export type FailureSignalKind =
  | 'terminal.pty-exit'
  | 'plugin.crash'
  | 'llm.stream-error'
  | 'ipc.handler-error'
  | 'specs.corrupt-cache';
