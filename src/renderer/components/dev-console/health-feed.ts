// Health feed — failure signals emitted by health/monitor (refactor.md §C.2).
// Passively subscribes; log only, no remediation state.

import { onFailure } from '../../health/monitor';
import type { FailureSignal } from '../../health/types';

const MAX_ENTRIES = 200;

const listeners = new Set<(signal: FailureSignal) => void>();
let entries: FailureSignal[] = [];
let installed = false;

export function subscribeHealth(cb: (signal: FailureSignal) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getRecentHealth(): FailureSignal[] {
  return [...entries];
}

export function clearHealth(): void {
  entries = [];
}

/** Subscribe to the health monitor. Idempotent; returns an unbind. */
export function installHealthFeed(): () => void {
  if (installed) return () => {};
  installed = true;
  const unsub = onFailure((signal) => {
    entries.push(signal);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    for (const cb of [...listeners]) {
      try { cb(signal); } catch { /* never let a subscriber break reporting */ }
    }
  });
  return () => {
    unsub();
    installed = false;
  };
}
