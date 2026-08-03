// DOM rendering for the unified dev-console stream (refactor.md §C). Every
// entry renders as one aligned grid row — time · category · kind · title ·
// meta · message — with category/level/kind color coding; specs reports render
// as full-width blocks.

import type { UnifiedEntry } from './unified-log';

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

function cell(className: string, text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  el.title = text;
  return el;
}

function kindSlug(kind: string): string {
  if (kind.startsWith('llm.')) return 'llm';
  if (kind.startsWith('terminal.')) return 'terminal';
  if (kind.startsWith('ipc.')) return 'ipc';
  if (kind.startsWith('specs.')) return 'specs';
  if (kind === 'invoke' || kind === 'send' || kind === 'sendSync') return 'ipc';
  if (kind === 'dispatch' || kind === 'respond' || kind === 'request' ||
      kind === 'broadcast' || kind === 'status' || kind === 'kill') return 'agent';
  return 'plugin';
}

export function renderUnifiedEntry(e: UnifiedEntry): HTMLElement {
  if (e.block) {
    const el = document.createElement('div');
    el.className = 'dev-console-block u-' + e.category;
    const head = document.createElement('div');
    head.className = 'dev-console-block-head';
    head.textContent = `${formatTime(e.at)} · ${e.title}`;
    const body = document.createElement('pre');
    body.className = 'dev-console-block-body';
    body.textContent = e.message;
    el.append(head, body);
    return el;
  }

  const el = document.createElement('div');
  el.className = 'dev-console-line u-' + e.category +
    (e.level ? ' level-' + e.level : '') +
    (e.ok === false ? ' is-fail' : '');

  const time = cell('dev-console-cell-time', formatTime(e.at));
  const cat = cell('dev-console-cell-cat cat-' + e.category, e.category);

  const kindText = e.kind || e.level || '';
  const kindClass = e.kind
    ? 'dev-console-cell-kind k-' + kindSlug(e.kind)
    : e.level
      ? 'dev-console-cell-kind level-' + e.level
      : 'dev-console-cell-kind';
  const kind = cell(kindClass, kindText);

  const title = cell('dev-console-cell-chan', e.title);
  const meta = cell('dev-console-cell-meta' + (e.ok === false ? ' is-fail' : ''), e.meta || '');
  const msg = cell('dev-console-cell-msg', e.message);

  el.append(time, cat, kind, title, meta, msg);
  return el;
}

export function renderEmpty(label: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'dev-console-empty';
  el.textContent = label;
  return el;
}
