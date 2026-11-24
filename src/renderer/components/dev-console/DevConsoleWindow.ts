// DevConsoleWindow — in-app dev console card (refactor.md §C). A single unified,
// timestamped stream of console.* capture, IPC traces, health failure signals,
// agent bus messages, and on-demand specs reports — no tab views. Filtering is
// search + minimum log level + a category checkbox dropdown. A thin facade:
// capture/feed aggregation lives in sibling modules (unified-log, log-capture,
// ipc-trace, health-feed, specs-runner); this file owns card lifecycle, the
// filter bar, and rendering orchestration only.

import { bindGuarded } from '../../health/monitor';
import {
  installUnifiedLog, subscribeUnified, getUnifiedEntries, postSpecsReport,
} from './unified-log';
import type { UnifiedEntry } from './unified-log';
import { buildFilterBar, filterMatches, ALL_CATEGORIES } from './filter-bar';
import type { ConsoleFilter } from './filter-bar';
import { renderUnifiedEntry, renderEmpty } from './render';
import { runSpecsValidation } from './specs-runner';

const ROW_CAP = 600;
const STYLE_ID = 'dev-console-styles';
/* Token-only stylesheet: the console is a parallel app and must follow the
   active palette in both modes (no literal colours here). */
const STYLES = `
.dev-console { width:100%; height:100%; min-width:0; min-height:0; display:flex; flex-direction:column;
  font-family:var(--font); font-size:var(--text-xs); color:var(--primary); }
.dev-console-filter { display:flex; align-items:center; gap:var(--space-1); padding:var(--space-1) var(--space-2); position:relative;
  background:var(--surface); border-bottom:1px dashed var(--border); }
.dev-console-filter-search { flex:1; min-width:60px; background:var(--bg); color:var(--primary);
  border:1px dashed var(--border-strong); border-radius:var(--radius-xs); padding:2px var(--space-1); font-family:inherit; font-size:var(--text-xs); }
.dev-console-filter-level { background:var(--bg); color:var(--tertiary);
  border:1px solid var(--border-strong); border-radius:var(--radius-xs); font-family:inherit; font-size:var(--text-xs); padding:1px var(--space-1); }
.dev-console-filter-toggle { background:var(--control-face); border:1px solid var(--control-border); border-radius:var(--radius-xs);
  font-family:inherit; font-size:var(--text-xs); color:var(--secondary); cursor:pointer; padding:2px var(--space-2); white-space:nowrap;
  box-shadow:var(--control-sheen); transition:background var(--dur-1), color var(--dur-1), border-color var(--dur-1); }
.dev-console-filter-toggle:hover { background:var(--control-face-hover); border-color:var(--control-border-hover); color:var(--primary); }
.dev-console-filter-panel { position:absolute; top:100%; right:var(--space-2); z-index:20; min-width:140px; margin-top:2px;
  background:var(--card-face); border:none; border-radius:var(--radius-s); padding:var(--space-1);
  display:flex; flex-direction:column; gap:2px; box-shadow:var(--shadow-menu); }
.dev-console-filter-option { display:flex; align-items:center; gap:var(--space-1); padding:2px var(--space-1); cursor:pointer;
  font-size:var(--text-xs); color:var(--secondary); }
.dev-console-filter-option:hover { background:var(--panel); }
.dev-console-filter-option input { accent-color:var(--accent); }
.dev-console-filter-clear { background:var(--control-face); border:1px solid var(--control-border); border-radius:var(--radius-xs);
  font-family:inherit; font-size:var(--text-xs); color:var(--secondary); cursor:pointer; padding:1px var(--space-1);
  box-shadow:var(--control-sheen); }
.dev-console-filter-clear:hover { background:var(--control-face-hover); border-color:var(--control-border-hover); color:var(--primary); }
.dev-console-specs-run { background:var(--primary); color:var(--bg); border:1px solid transparent; border-radius:var(--radius-xs);
  font-family:inherit; font-size:var(--text-xs); font-weight:700; padding:2px var(--space-2); cursor:pointer; white-space:nowrap; }
.dev-console-specs-run:hover { opacity:0.86; }
.dev-console-content { flex:1; overflow:auto; padding:var(--space-1) var(--space-2); }
.dev-console-line { display:grid; grid-template-columns: 88px 52px 108px minmax(110px, 240px) 120px minmax(0,1fr);
  gap:var(--space-1); padding:1px 0; border-bottom:1px dotted var(--border); align-items:start; }
.dev-console-line.level-error, .dev-console-line.is-fail { background:color-mix(in oklab, var(--danger) 10%, transparent); }
.dev-console-line.level-warn { background:color-mix(in oklab, var(--warning) 8%, transparent); }
.dev-console-cell-time { white-space:nowrap; color:var(--tertiary); }
.dev-console-cell-cat { text-transform:uppercase; font-size:var(--text-2xs); font-weight:700; letter-spacing:0.5px; align-self:center; }
.dev-console-cell-cat.cat-console { color:var(--info); }
.dev-console-cell-cat.cat-ipc { color:var(--accent2); }
.dev-console-cell-cat.cat-health { color:var(--danger); }
.dev-console-cell-cat.cat-agent { color:var(--success); }
.dev-console-cell-cat.cat-specs { color:var(--warning); }
.dev-console-cell-kind { text-transform:uppercase; font-size:var(--text-2xs); align-self:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dev-console-cell-kind.level-error { color:var(--danger); } .dev-console-cell-kind.level-warn { color:var(--warning); }
.dev-console-cell-kind.level-log { color:var(--success); } .dev-console-cell-kind.level-info { color:var(--info); }
.dev-console-cell-kind.level-debug { color:var(--tertiary); }
.dev-console-cell-kind.k-llm { color:var(--accent2); } .dev-console-cell-kind.k-terminal { color:var(--warning); }
.dev-console-cell-kind.k-ipc { color:var(--danger); } .dev-console-cell-kind.k-specs { color:var(--warning); }
.dev-console-cell-kind.k-agent { color:var(--success); } .dev-console-cell-kind.k-window { color:var(--danger); }
.dev-console-cell-chan { white-space:nowrap; color:var(--secondary); overflow:hidden; text-overflow:ellipsis; }
.dev-console-cell-meta { white-space:nowrap; color:var(--tertiary); overflow:hidden; text-overflow:ellipsis; }
.dev-console-cell-meta.is-fail { color:var(--danger); font-weight:700; }
.dev-console-cell-msg { word-break:break-all; color:var(--primary); white-space:pre-wrap; }
.dev-console-block { padding:var(--space-2); margin:2px 0; border:1px solid var(--border); border-radius:var(--radius-s);
  background:var(--panel); }
.dev-console-block-head { font-size:var(--text-xs); color:var(--tertiary); margin-bottom:var(--space-1); }
.dev-console-block-body { white-space:pre-wrap; color:var(--primary); line-height:1.5; margin:0;
  font-family:inherit; font-size:var(--text-xs); }
.dev-console-empty { padding:var(--space-3); text-align:center; color:var(--tertiary); }
`;

export class DevConsoleWindow {
  readonly element: HTMLDivElement;

  private contentEl!: HTMLDivElement;
  private filter: ConsoleFilter = { search: '', level: 'all', categories: [...ALL_CATEGORIES] };
  private unbinders: (() => void)[] = [];
  private specsRunning = false;
  /* Append-only render queue: new entries are appended one row at a time, never
     by rebuilding innerHTML. Entries arriving in the same frame are batched. */
  private pending: UnifiedEntry[] = [];
  private rafId: number | null = null;
  private renderedRows = 0;
  private emptyEl: HTMLElement | null = null;

  constructor(container: HTMLElement, private wsPath: string) {
    this.element = document.createElement('div');
    this.element.className = 'dev-console';
    container.appendChild(this.element);

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    this.buildDom();
    this.unbinders.push(installUnifiedLog());
    this.unbinders.push(subscribeUnified((entry) => this.enqueue(entry)));

    this.unbinders.push(bindGuarded(this.element, 'click', (e) => this.onClick(e), 'dev-console/DevConsoleWindow.ts'));
    this.render();
  }

  private buildDom(): void {
    const filterBar = buildFilterBar((f) => {
      this.filter = f;
      this.render();
    });

    const specsBtn = document.createElement('button');
    specsBtn.className = 'dev-console-specs-run';
    specsBtn.dataset.action = 'run-specs';
    specsBtn.textContent = 'Run specs validation';
    specsBtn.title = 'Run SPECGEN validation against the workspace and post the report';
    filterBar.el.appendChild(specsBtn);

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'dev-console-content';

    this.element.appendChild(filterBar.el);
    this.element.appendChild(this.contentEl);
  }

  private onClick(e: Event): void {
    const target = e.target as HTMLElement;
    if (target.dataset.action === 'run-specs') {
      void this.runSpecs();
    }
  }

  private async runSpecs(): Promise<void> {
    if (this.specsRunning) return;
    this.specsRunning = true;
    const btn = this.element.querySelector<HTMLButtonElement>('[data-action="run-specs"]');
    if (btn) btn.textContent = 'Running…';
    try {
      const result = await runSpecsValidation(this.wsPath);
      postSpecsReport(result);
    } catch (err) {
      postSpecsReport(`Validation failed: ${String(err)}`);
    } finally {
      this.specsRunning = false;
      if (btn) btn.textContent = 'Run specs validation';
    }
  }

  /** Append one entry immediately; cap-trimming is coalesced to one rAF. */
  private enqueue(entry: UnifiedEntry): void {
    this.pending.push(entry);
    this.flush();
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.trim();
      });
    }
  }

  /** Append every queued entry that matches the filter (never a full rebuild). */
  private flush(): void {
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    if (this.emptyEl) {
      this.emptyEl.remove();
      this.emptyEl = null;
    }
    for (const entry of batch) {
      if (!filterMatches(this.filter, entry)) continue;
      this.contentEl.appendChild(renderUnifiedEntry(entry));
      this.renderedRows++;
    }
  }

  /** Once per frame: enforce the row cap from the top, restore the empty state. */
  private trim(): void {
    while (this.renderedRows > ROW_CAP && this.contentEl.firstChild) {
      this.contentEl.removeChild(this.contentEl.firstChild);
      this.renderedRows--;
    }
    if (this.renderedRows === 0 && !this.emptyEl) {
      this.emptyEl = renderEmpty('No entries. Console logs, IPC traces, health signals, and agent bus messages appear here.');
      this.contentEl.appendChild(this.emptyEl);
    }
  }

  /** Full rebuild — filter changes only (user-driven, infrequent). */
  private render(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pending = [];
    this.contentEl.innerHTML = '';
    this.emptyEl = null;
    this.renderedRows = 0;
    const shown = getUnifiedEntries().filter((e) => filterMatches(this.filter, e)).slice(-ROW_CAP);
    if (shown.length === 0) {
      this.emptyEl = renderEmpty('No entries. Console logs, IPC traces, health signals, and agent bus messages appear here.');
      this.contentEl.appendChild(this.emptyEl);
      return;
    }
    const frag = document.createDocumentFragment();
    for (const e of shown) frag.appendChild(renderUnifiedEntry(e));
    this.contentEl.appendChild(frag);
    this.renderedRows = shown.length;
  }

  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pending = [];
    for (const unbind of this.unbinders) {
      try { unbind(); } catch { /* best effort */ }
    }
    this.unbinders = [];
    this.element.remove();
  }
}

export type { LogLevel } from './log-capture';
