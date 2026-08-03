// Unified dev-console log — one timestamped stream combining console.* capture,
// IPC traces, health failure signals, agent bus messages, and on-demand specs
// reports (refactor.md §C). Replaces the per-tab buffers: every feed pushes a
// normalized entry into a single ring buffer that the DevConsole renders.

import { getDefaultBus } from '../../agents/bus';
import type { AgentMessage } from '../../agents/types';
import type { FailureSignal } from '../../health/types';
import { installConsoleCapture, subscribeLogs } from './log-capture';
import type { LogEntry, LogLevel } from './log-capture';
import { installIpcTrace, subscribeIpcTrace } from './ipc-trace';
import { installHealthFeed, subscribeHealth } from './health-feed';

export type UnifiedCategory = 'console' | 'ipc' | 'health' | 'agent' | 'specs';

export interface UnifiedEntry {
  seq: number;
  at: number;
  category: UnifiedCategory;
  /** console severity; other categories leave unset. */
  level?: LogLevel;
  /** ipc transport type / health failure kind / agent message type. */
  kind?: string;
  /** ipc channel / health source / agent from→to. */
  title: string;
  /** ipc: size · duration · ok — the fixed columns. */
  meta?: string;
  message: string;
  ok?: boolean;
  /** Full-width report (specs validation output). */
  block?: boolean;
}

const MAX_ENTRIES = 600;
const listeners = new Set<(e: UnifiedEntry) => void>();
let entries: UnifiedEntry[] = [];
let seq = 0;
let installed = false;

function argToText(a: unknown): string {
  if (a === null) return 'null';
  if (a === undefined) return 'undefined';
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`;
  try {
    const s = JSON.stringify(a);
    return s === undefined ? String(a) : s;
  } catch {
    return String(a);
  }
}

function payloadLabel(size: number): string {
  return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
}

function push(e: Omit<UnifiedEntry, 'seq' | 'at'>): void {
  const full: UnifiedEntry = { ...e, seq: ++seq, at: Date.now() };
  entries.push(full);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  for (const cb of [...listeners]) {
    try { cb(full); } catch { /* never let a subscriber break the stream */ }
  }
}

export function subscribeUnified(cb: (e: UnifiedEntry) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getUnifiedEntries(): UnifiedEntry[] {
  return [...entries];
}

export function clearUnified(): void {
  entries = [];
}

/** Post a specs validation report as a full-width block entry. */
export function postSpecsReport(message: string): void {
  push({ category: 'specs', title: 'specs', message, block: true });
}

/** Wire all feeds into the unified stream. Idempotent; returns an unbind. */
export function installUnifiedLog(): () => void {
  if (installed) return () => {};
  installed = true;
  const unbinds: (() => void)[] = [];
  installConsoleCapture();
  unbinds.push(installIpcTrace(), installHealthFeed());

  unbinds.push(subscribeLogs((entry: LogEntry) => {
    push({ category: 'console', level: entry.level, title: '', message: entry.args.map(argToText).join(' ') });
  }));

  unbinds.push(subscribeIpcTrace((entry: IpcTraceEntry) => {
    const meta: string[] = [payloadLabel(entry.payloadSize)];
    if (entry.type !== 'send') meta.push(entry.durationMs === undefined ? '—' : `${entry.durationMs.toFixed(1)}ms`);
    if (entry.type === 'invoke') meta.push(entry.ok ? 'ok' : 'FAIL');
    push({ category: 'ipc', kind: entry.type, title: entry.channel, meta: meta.join(' · '), ok: entry.ok, message: '' });
  }));

  unbinds.push(subscribeHealth((signal: FailureSignal) => {
    push({ category: 'health', kind: signal.kind, title: signal.source, message: signal.message });
  }));

  const bus = getDefaultBus();
  unbinds.push(bus.subscribe('*', (msg: AgentMessage) => {
    const to = Array.isArray(msg.to) ? msg.to.join(',') : String(msg.to ?? '');
    const text = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload) || '';
    push({ category: 'agent', kind: msg.type, title: `${String(msg.from ?? '')} → ${to}`, message: text });
  }));

  return () => {
    for (const u of unbinds) {
      try { u(); } catch { /* best effort */ }
    }
    installed = false;
  };
}
