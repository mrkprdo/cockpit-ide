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
import { buildFilterBar, filterMatches, ALL_CATEGORIES } from './filter-bar';
import type { ConsoleFilter } from './filter-bar';
import { renderUnifiedEntry, renderEmpty } from './render';
import { runSpecsValidation } from './specs-runner';

const ROW_CAP = 600;
const STYLE_ID = 'dev-console-styles';
const STYLES = `
.dev-console { width:100%; height:100%; min-width:0; min-height:0; display:flex; flex-direction:column;
  font-family:"Space Mono","Courier New",monospace; font-size:11px; color:var(--primary,#C8D6E5); }
.dev-console-filter { display:flex; align-items:center; gap:6px; padding:4px 6px; position:relative;
  background:var(--card-header-bg,rgba(0,0,0,0.25)); border-bottom:1px dashed var(--border,#2A3442); }
.dev-console-filter-search { flex:1; min-width:60px; background:var(--card-bg,#0F141A); color:var(--primary,#C8D6E5);
  border:1px dashed var(--border,#2A3442); border-radius:4px; padding:2px 6px; font-family:inherit; font-size:11px; }
.dev-console-filter-level { background:var(--card-bg,#0F141A); color:var(--tertiary,#8A97A8);
  border:1px solid var(--border,#2A3442); border-radius:4px; font-family:inherit; font-size:10px; padding:1px 4px; }
.dev-console-filter-toggle { background:none; border:1px solid var(--border,#2A3442); border-radius:4px;
  font-family:inherit; font-size:10px; color:var(--tertiary,#8A97A8); cursor:pointer; padding:2px 8px; white-space:nowrap; }
.dev-console-filter-panel { position:absolute; top:100%; right:6px; z-index:20; min-width:140px; margin-top:2px;
  background:var(--card-bg,#0F141A); border:1px solid var(--border,#2A3442); border-radius:6px; padding:4px;
  display:flex; flex-direction:column; gap:2px; box-shadow:0 6px 20px rgba(0,0,0,0.4); }
.dev-console-filter-option { display:flex; align-items:center; gap:6px; padding:2px 4px; cursor:pointer;
  font-size:11px; color:var(--secondary,#B0C4DE); }
.dev-console-filter-option:hover { background:var(--panel,#1A2430); }
.dev-console-filter-option input { accent-color:var(--accent,#00E5FF); }
.dev-console-filter-clear { background:none; border:1px solid var(--border,#2A3442); border-radius:4px;
  font-family:inherit; font-size:10px; color:var(--tertiary,#8A97A8); cursor:pointer; padding:1px 6px; }
.dev-console-specs-run { background:var(--accent,#00E5FF); color:#06121A; border:none; border-radius:4px;
  font-family:inherit; font-size:10px; font-weight:700; padding:2px 8px; cursor:pointer; white-space:nowrap; }
.dev-console-content { flex:1; overflow:auto; padding:4px 6px; }
.dev-console-line { display:grid; grid-template-columns: 88px 52px 108px minmax(110px, 240px) 120px minmax(0,1fr);
  gap:6px; padding:1px 0; border-bottom:1px dotted var(--border,#2A3442); align-items:start; }
.dev-console-line.level-error, .dev-console-line.is-fail { background:rgba(255,80,80,0.08); }
.dev-console-line.level-warn { background:rgba(255,170,60,0.06); }
.dev-console-cell-time { white-space:nowrap; color:var(--tertiary,#8A97A8); }
.dev-console-cell-cat { text-transform:uppercase; font-size:9px; font-weight:700; letter-spacing:0.5px; align-self:center; }
.dev-console-cell-cat.cat-console { color:var(--accent,#00E5FF); }
.dev-console-cell-cat.cat-ipc { color:var(--accent2,#B388FF); }
.dev-console-cell-cat.cat-health { color:#FF5555; }
.dev-console-cell-cat.cat-agent { color:#50FA7B; }
.dev-console-cell-cat.cat-specs { color:#FF9E64; }
.dev-console-cell-kind { text-transform:uppercase; font-size:9px; align-self:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dev-console-cell-kind.level-error { color:#FF5555; } .dev-console-cell-kind.level-warn { color:#FFAA3C; }
.dev-console-cell-kind.level-log { color:#50FA7B; } .dev-console-cell-kind.level-info { color:#00E5FF; }
.dev-console-cell-kind.level-debug { color:var(--tertiary,#8A97A8); }
.dev-console-cell-kind.k-llm { color:#C792EA; } .dev-console-cell-kind.k-terminal { color:#FFAA3C; }
.dev-console-cell-kind.k-ipc { color:#FF5555; } .dev-console-cell-kind.k-specs { color:#FF9E64; }
.dev-console-cell-kind.k-agent { color:#50FA7B; } .dev-console-cell-kind.k-window { color:#FF5555; }
.dev-console-cell-chan { white-space:nowrap; color:var(--secondary,#B0C4DE); overflow:hidden; text-overflow:ellipsis; }
.dev-console-cell-meta { white-space:nowrap; color:var(--tertiary,#8A97A8); overflow:hidden; text-overflow:ellipsis; }
.dev-console-cell-meta.is-fail { color:#FF5555; font-weight:700; }
.dev-console-cell-msg { word-break:break-all; color:var(--primary,#C8D6E5); white-space:pre-wrap; }
.dev-console-block { padding:6px 8px; margin:2px 0; border:1px solid var(--border,#2A3442); border-radius:6px;
  background:var(--panel,#1A2430); }
.dev-console-block-head { font-size:10px; color:var(--tertiary,#8A97A8); margin-bottom:4px; }
.dev-console-block-body { white-space:pre-wrap; color:var(--primary,#C8D6E5); line-height:1.5; margin:0;
  font-family:inherit; font-size:11px; }
.dev-console-empty { padding:12px; text-align:center; color:var(--tertiary,#8A97A8); }
`;

export class DevConsoleWindow {
  readonly element: HTMLDivElement;

  private contentEl!: HTMLDivElement;
  private filter: ConsoleFilter = { search: '', level: 'all', categories: [...ALL_CATEGORIES] };
  private unbinders: (() => void)[] = [];
  private specsRunning = false;

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
    this.unbinders.push(subscribeUnified(() => this.render()));

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

  private render(): void {
    this.contentEl.innerHTML = '';
    const shown = getUnifiedEntries().filter((e) => filterMatches(this.filter, e)).slice(-ROW_CAP);
    if (shown.length === 0) {
      this.contentEl.appendChild(renderEmpty('No entries. Console logs, IPC traces, health signals, and agent bus messages appear here.'));
      return;
    }
    for (const e of shown) this.contentEl.appendChild(renderUnifiedEntry(e));
  }

  destroy(): void {
    for (const unbind of this.unbinders) {
      try { unbind(); } catch { /* best effort */ }
    }
    this.unbinders = [];
    this.element.remove();
  }
}

export type { LogLevel } from './log-capture';
