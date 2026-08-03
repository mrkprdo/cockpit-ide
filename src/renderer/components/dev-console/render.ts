// DOM rendering helpers for the dev console (refactor.md §C.2).

import type { LogEntry } from './log-capture';
import type { FailureSignal } from '../../health/types';
import type { AgentMessage } from '../../agents/types';

export function formatTime(at: number): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function formatPayload(size: number): string {
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}

export function formatLogArg(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`;
  try {
    const s = JSON.stringify(arg);
    if (s === undefined) return String(arg);
    return s;
  } catch {
    return String(arg);
  }
}

export function row(className: string, ...cells: HTMLElement[]): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  for (const c of cells) el.appendChild(c);
  return el;
}

function cell(className: string, text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  el.title = text;
  return el;
}

export function renderLogLine(entry: LogEntry): HTMLDivElement {
  const text = entry.args.map(formatLogArg).join(' ');
  const time = cell('dev-console-cell-time', formatTime(entry.at));
  const level = cell('dev-console-cell-level ' + entry.level, entry.level);
  const msg = cell('dev-console-cell-msg', text);
  return row('dev-console-line log-row level-' + entry.level, time, level, msg);
}

export function renderTraceRow(entry: IpcTraceEntry): HTMLDivElement {
  const time = cell('dev-console-cell-time', formatTime(entry.at));
  const type = cell('dev-console-cell-type', entry.type);
  const ch = cell('dev-console-cell-chan', entry.channel);
  const size = cell('dev-console-cell-size', formatPayload(entry.payloadSize));
  const cells = [time, type, ch, size];
  if (entry.type !== 'send') {
    const dur = entry.durationMs === undefined ? '—' : `${entry.durationMs.toFixed(1)}ms`;
    cells.push(cell('dev-console-cell-dur', dur));
  }
  if (entry.type === 'invoke') {
    cells.push(cell('dev-console-cell-ok ' + (entry.ok ? 'ok' : 'fail'), entry.ok ? 'ok' : 'FAIL'));
  }
  return row('dev-console-line trace', ...cells);
}

export function renderHealthRow(signal: FailureSignal): HTMLDivElement {
  const time = cell('dev-console-cell-time', formatTime(signal.at));
  const kind = cell('dev-console-cell-kind ' + kindClass(signal.kind), signal.kind);
  const src = cell('dev-console-cell-chan', signal.source);
  const msg = cell('dev-console-cell-msg', signal.message);
  return row('dev-console-line health-row health-' + kindClass(signal.kind), time, kind, src, msg);
}

function kindClass(kind: string): string {
  if (kind.startsWith('llm.')) return 'llm';
  if (kind.startsWith('terminal.')) return 'terminal';
  if (kind.startsWith('ipc.')) return 'ipc';
  if (kind.startsWith('specs.')) return 'specs';
  return 'plugin';
}

export function renderAgentRow(msg: AgentMessage): HTMLDivElement {
  const time = cell('dev-console-cell-time', formatTime(msg.ts ?? Date.now()));
  const from = cell('dev-console-cell-chan', String(msg.from ?? ''));
  const to = cell('dev-console-cell-chan', Array.isArray(msg.to) ? msg.to.join(',') : String(msg.to ?? ''));
  const kind = cell('dev-console-cell-kind', msg.type);
  const text = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload) || '';
  const msgCell = cell('dev-console-cell-msg', text);
  return row('dev-console-line agent', time, from, to, kind, msgCell);
}

/** Renders markdown-ish text as plain preformatted content (specs report). */
export function renderSpecsReport(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'dev-console-specs-report';
  el.textContent = text;
  return el;
}

export function renderEmpty(label: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'dev-console-empty';
  el.textContent = label;
  return el;
}
