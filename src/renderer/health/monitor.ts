// Health monitor — the single renderer entry point for failure signals
// (refactor.md §B.3).
//
// - `reportFailure(signal)` is the one call every split module uses instead of
//   ad-hoc console.error. It emits to local listeners (dev console Health tab)
//   and forwards to main over the existing diagnostics:rendererError channel.
// - Installs the window.onerror / unhandledrejection safety net.
// - Subscribes to health:mainFailure pushed from main so main-process failures
//   (e.g. ipc.handler-error) land in the same stream.
//
// Re-entrancy guard: nothing here calls console.* (log-capture intercepts
// console methods — logging a failure through the channel it feeds would
// loop). The whole body is best-effort: reporting a failure must never itself
// throw or cascade.

import type { FailureSignalKind } from '../../shared/health-types';
import type { FailureSignal, HealthListener } from './types';

const listeners = new Set<HealthListener>();

export function onFailure(cb: HealthListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit(signal: FailureSignal): void {
  for (const cb of [...listeners]) {
    try { cb(signal); } catch { /* a listener must never break reporting */ }
  }
}

export function reportFailure(signal: Omit<FailureSignal, 'at'>): void {
  try {
    const full: FailureSignal = { ...signal, at: Date.now() };
    emit(full);
    try {
      const msg = full.message + (full.stack ? '\n' + full.stack : '');
      window.electronAPI?.diagnostics.reportError(full.kind, msg);
    } catch { /* best effort */ }
  } catch { /* best effort */ }
}

/**
 * Wrap a top-level DOM binding so a throwing listener is caught, attributed to
 * a source module, and reported as a window.crash — instead of surfacing as an
 * uncaught exception invisible to any try/catch. Returns an unbind function;
 * facades collect these in an unbinders[] array and run them all in destroy()
 * (otherwise wrapping every binding would be a straight listener leak).
 *
 * Sync throws go through the try/catch; async rejections go through the
 * explicit `.catch` on the returned promise — a bare try/catch around a
 * fire-and-forget async call catches neither.
 */
export function bindGuarded<E extends Event>(
  el: EventTarget,
  event: string,
  handler: (e: E) => unknown,
  source: string,
  options?: AddEventListenerOptions,
): () => void {
  const wrapped = (e: Event) => {
    try {
      const r = handler(e as E);
      if (r instanceof Promise) {
        r.catch((err: unknown) => reportFailure({ kind: 'window.crash', source, message: String(err) }));
      }
    } catch (err) {
      reportFailure({ kind: 'window.crash', source, message: String(err) });
    }
  };
  el.addEventListener(event, wrapped, options);
  return () => el.removeEventListener(event, wrapped, options);
}

function installWindowHooks(): void {
  window.addEventListener('error', (e) => {
    const err = e.error as unknown;
    const message = err instanceof Error ? (err.stack || err.message) : (e.message || 'window error');
    reportFailure({ kind: 'window.crash', source: 'window', message, stack: e.error?.stack });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as unknown;
    const message = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
    reportFailure({ kind: 'window.crash', source: 'window', message, stack: reason instanceof Error ? reason.stack : undefined });
  });
}

let initialized = false;

/** Install window hooks + main-failure subscription. Idempotent. */
export function initHealthMonitor(): void {
  if (initialized) return;
  initialized = true;
  installWindowHooks();
  window.electronAPI?.health?.onMainFailure?.((sig: { kind: string; message: string }) => {
    reportFailure({ kind: sig.kind as FailureSignalKind, source: 'main', message: sig.message });
  });
}
