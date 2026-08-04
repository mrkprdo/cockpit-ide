// Renderer-side failure signal shape (refactor.md §B.2). Uses the shared
// cross-process kind union from src/shared/health-types.ts.

import type { FailureSignalKind } from '../../shared/health-types';

export interface FailureSignal {
  kind: FailureSignalKind;
  /** Originating module, e.g. 'git-window/changes.ts'. */
  source: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  at: number;
}

export type HealthListener = (signal: FailureSignal) => void;
