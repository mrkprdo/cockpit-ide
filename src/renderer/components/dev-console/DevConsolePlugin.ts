// DevConsolePlugin — in-app dev console card (refactor.md §C). Shows:
//   Logs    — intercepted console.* (ring buffer, level filter)
//   IPC     — trace of every electronAPI call (wrapped in preload)
//   Health  — FailureSignal events from health/monitor
//   Agents  — passive bus message listener
//   Specs   — on-demand validation of the workspace spec corpus
// A thin facade: capture/feed logic lives in sibling modules; this file owns
// card lifecycle, tab chrome, and rendering orchestration only.

import { getDefaultBus } from '../../agents/bus';
import type { AgentMessage } from '../../agents/types';
import { bindGuarded } from '../../health/monitor';
import {
  installConsoleCapture, subscribeLogs, getRecentLogs,
} from './log-capture';
import type { LogEntry, LogLevel } from './log-capture';
import { installIpcTrace, subscribeIpcTrace, getRecentIpcTrace } from './ipc-trace';
import { installHealthFeed, subscribeHealth, getRecentHealth } from './health-feed';
import { buildFilterBar, filterMatches } from './filter-bar';
import type { ConsoleFilter } from './filter-bar';
import {
  renderLogLine, renderTraceRow, renderHealthRow, renderAgentRow,
  renderSpecsReport, renderEmpty,
} from './render';
import { runSpecsValidation } from './specs-runner';
import type { FailureSignal } from '../../health/types';

type TabId = 'logs' | 'ipc' | 'health' | 'agents' | 'specs';

const TABS: { id: TabId; label: string }[] = [
  { id: 'logs', label: 'Logs' },
  { id: 'ipc', label: 'IPC' },
  { id: 'health', label: 'Health' },
  { id: 'agents', label: 'Agents' },
  { id: 'specs', label: 'Specs' },
];

const ROW_CAP = 400;
const STYLE_ID = 'dev-console-styles';
const STYLES = `
.dev-console { width:100%; height:100%; min-width:0; min-height:0; display:flex; flex-direction:column;
  font-family:"Space Mono","Courier New",monospace; font-size:11px; color:var(--primary,#C8D6E5); }
.dev-console-tabs { display:flex; gap:2px; padding:4px 6px 0; background:var(--card-header-bg,rgba(0,0,0,0.25)); }
.dev-console-tab { background:none; border:none; border-bottom:2px solid transparent; padding:4px 12px;
  font-family:inherit; font-size:11px; color:var(--tertiary,#8A97A8); cursor:pointer; }
.dev-console-tab.is-active { border-bottom-color:var(--accent,#00E5FF); color:var(--accent,#00E5FF); font-weight:700; }
.dev-console-filter { display:flex; align-items:center; gap:6px; padding:4px 6px;
  background:var(--card-header-bg,rgba(0,0,0,0.25)); border-bottom:1px dashed var(--border,#2A3442); }
.dev-console-filter-search { flex:1; min-width:60px; background:var(--card-bg,#0F141A); color:var(--primary,#C8D6E5);
  border:1px dashed var(--border,#2A3442); border-radius:4px; padding:2px 6px; font-family:inherit; font-size:11px; }
.dev-console-filter-levels { display:flex; gap:2px; }
.dev-console-filter-level { background:none; border:1px solid var(--border,#2A3442); border-radius:4px;
  font-family:inherit; font-size:9px; text-transform:uppercase; color:var(--tertiary,#8A97A8); cursor:pointer; padding:1px 5px; }
.dev-console-filter-level.is-active { border-color:var(--accent,#00E5FF); color:var(--accent,#00E5FF); }
.dev-console-filter-clear { background:none; border:1px solid var(--border,#2A3442); border-radius:4px;
  font-family:inherit; font-size:10px; color:var(--tertiary,#8A97A8); cursor:pointer; padding:1px 6px; }
.dev-console-content { flex:1; overflow:auto; padding:4px 6px; }
.dev-console-line { display:grid; gap:6px; padding:1px 0; border-bottom:1px dotted var(--border,#2A3442); align-items:start; }
.dev-console-line.log-row { grid-template-columns: 88px 44px minmax(0,1fr); }
.dev-console-line.trace { grid-template-columns: 88px 56px minmax(0,1fr) 62px 62px 40px; }
.dev-console-line.health-row { grid-template-columns: 88px 108px minmax(0,1fr) minmax(0,1fr); }
.dev-console-line.agent { grid-template-columns: 88px 88px 88px 62px minmax(0,1fr); }
.dev-console-line.level-error, .dev-console-line.health-plugin, .dev-console-line.health-ipc { background:rgba(255,80,80,0.08); }
.dev-console-line.level-warn { background:rgba(255,170,60,0.06); }
.dev-console-cell-time { white-space:nowrap; color:var(--tertiary,#8A97A8); }
.dev-console-cell-chan { white-space:nowrap; color:var(--secondary,#B0C4DE); overflow:hidden; text-overflow:ellipsis; }
.dev-console-cell-msg { word-break:break-all; color:var(--primary,#C8D6E5); white-space:pre-wrap; }
.dev-console-cell-level { text-transform:uppercase; font-size:9px; align-self:center; }
.dev-console-cell-level.error { color:#FF5555; } .dev-console-cell-level.warn { color:#FFAA3C; }
.dev-console-cell-level.log { color:#50FA7B; } .dev-console-cell-level.info { color:#00E5FF; }
.dev-console-cell-level.debug { color:var(--tertiary,#8A97A8); }
.dev-console-cell-type { font-size:9px; color:var(--tertiary,#8A97A8); text-transform:uppercase; }
.dev-console-cell-size { white-space:nowrap; color:var(--tertiary,#8A97A8); }
.dev-console-cell-dur { white-space:nowrap; color:var(--tertiary,#8A97A8); }
.dev-console-cell-ok.ok { color:#50FA7B; } .dev-console-cell-ok.fail { color:#FF5555; font-weight:700; }
.dev-console-cell-kind { white-space:nowrap; }
.dev-console-cell-kind.terminal { color:#FFAA3C; } .dev-console-cell-kind.llm { color:#C792EA; }
.dev-console-cell-kind.ipc { color:#FF5555; } .dev-console-cell-kind.specs { color:#FF9E64; }
.dev-console-cell-kind.plugin { color:#FF5555; }
.dev-console-empty { padding:12px; text-align:center; color:var(--tertiary,#8A97A8); }
.dev-console-specs { display:flex; flex-direction:column; gap:6px; padding:6px; }
.dev-console-specs-run { align-self:flex-start; background:var(--accent,#00E5FF); color:#06121A; border:none;
  border-radius:4px; font-family:inherit; font-size:11px; font-weight:700; padding:4px 10px; cursor:pointer; }
.dev-console-specs-report { white-space:pre-wrap; color:var(--primary,#C8D6E5); line-height:1.5; }
`;

export class DevConsolePlugin {
  readonly element: HTMLDivElement;

  private tabEls = new Map<TabId, HTMLButtonElement>();
  private contentEl!: HTMLDivElement;
  private activeTab: TabId = 'logs';
  private filter: ConsoleFilter = { search: '', minLevel: 0 };
  private unbinders: (() => void)[] = [];
  private agents: AgentMessage[] = [];
  private specsResult = '';
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
    this.installFeeds();

    this.unbinders.push(bindGuarded(this.element, 'click', (e) => this.onClick(e), 'dev-console/DevConsolePlugin.ts'));
    this.render();
  }

  private buildDom(): void {
    const tabs = document.createElement('div');
    tabs.className = 'dev-console-tabs';
    for (const { id, label } of TABS) {
      const btn = document.createElement('button');
      btn.className = 'dev-console-tab' + (id === this.activeTab ? ' is-active' : '');
      btn.dataset.tab = id;
      btn.textContent = label;
      tabs.appendChild(btn);
      this.tabEls.set(id, btn);
    }

    const filterBar = buildFilterBar((f) => {
      this.filter = f;
      if (this.activeTab === 'logs') this.render();
    });

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'dev-console-content';

    this.element.appendChild(tabs);
    this.element.appendChild(filterBar.el);
    this.element.appendChild(this.contentEl);
  }

  private installFeeds(): void {
    installConsoleCapture();
    this.unbinders.push(installIpcTrace(), installHealthFeed());

    this.unbinders.push(subscribeLogs(() => {
      if (this.activeTab === 'logs') this.render();
    }));
    this.unbinders.push(subscribeIpcTrace(() => {
      if (this.activeTab === 'ipc') this.render();
    }));
    this.unbinders.push(subscribeHealth(() => {
      if (this.activeTab === 'health') this.render();
    }));

    const bus = getDefaultBus();
    this.unbinders.push(bus.subscribe('*', (msg) => {
      this.agents.push(msg);
      if (this.agents.length > 300) this.agents.splice(0, this.agents.length - 300);
      if (this.activeTab === 'agents') this.render();
    }));
  }

  private onClick(e: Event): void {
    const target = e.target as HTMLElement;
    const tabBtn = target.closest<HTMLButtonElement>('[data-tab]');
    if (tabBtn?.dataset.tab) {
      const tab = tabBtn.dataset.tab as TabId;
      if (tab === this.activeTab) return;
      this.activeTab = tab;
      for (const [id, b] of this.tabEls) b.classList.toggle('is-active', id === tab);
      this.render();
      return;
    }
    if (target.dataset.action === 'run-specs') {
      void this.runSpecs();
      return;
    }
  }

  private async runSpecs(): Promise<void> {
    if (this.specsRunning) return;
    this.specsRunning = true;
    this.specsResult = 'Running validation…';
    this.render();
    try {
      this.specsResult = await runSpecsValidation(this.wsPath);
    } catch (err) {
      this.specsResult = `Validation failed: ${String(err)}`;
    } finally {
      this.specsRunning = false;
      this.render();
    }
  }

  private render(): void {
    this.contentEl.innerHTML = '';
    switch (this.activeTab) {
      case 'logs':
        this.renderLogs();
        break;
      case 'ipc':
        this.renderIpc();
        break;
      case 'health':
        this.renderHealth();
        break;
      case 'agents':
        this.renderAgents();
        break;
      case 'specs':
        this.renderSpecs();
        break;
    }
  }

  private renderLogs(): void {
    const entries = getRecentLogs();
    const shown = entries.filter((e: LogEntry) => {
      const text = e.args.map(a => (a === null || a === undefined) ? String(a) : String(a)).join(' ');
      return filterMatches(this.filter, e.level, text);
    }).slice(-ROW_CAP);

    if (shown.length === 0) {
      this.contentEl.appendChild(renderEmpty('No log entries.'));
      return;
    }
    for (const e of shown) this.contentEl.appendChild(renderLogLine(e));
  }

  private renderIpc(): void {
    const entries = getRecentIpcTrace().slice(-ROW_CAP);
    if (entries.length === 0) {
      this.contentEl.appendChild(renderEmpty('No IPC calls traced yet.'));
      return;
    }
    for (const e of entries) this.contentEl.appendChild(renderTraceRow(e));
  }

  private renderHealth(): void {
    const signals = getRecentHealth().slice(-ROW_CAP);
    if (signals.length === 0) {
      this.contentEl.appendChild(renderEmpty('No failure signals.'));
      return;
    }
    for (const s of signals) this.contentEl.appendChild(renderHealthRow(s));
  }

  private renderAgents(): void {
    if (this.agents.length === 0) {
      this.contentEl.appendChild(renderEmpty('No agent bus messages yet.'));
      return;
    }
    for (const m of this.agents.slice(-ROW_CAP)) this.contentEl.appendChild(renderAgentRow(m));
  }

  private renderSpecs(): void {
    const wrap = document.createElement('div');
    wrap.className = 'dev-console-specs';
    const runBtn = document.createElement('button');
    runBtn.className = 'dev-console-specs-run';
    runBtn.dataset.action = 'run-specs';
    runBtn.textContent = this.specsRunning ? 'Running…' : 'Run validation';
    wrap.appendChild(runBtn);
    if (this.specsResult) {
      wrap.appendChild(renderSpecsReport(this.specsResult));
    }
    this.contentEl.appendChild(wrap);
  }

  destroy(): void {
    for (const unbind of this.unbinders) {
      try { unbind(); } catch { /* best effort */ }
    }
    this.unbinders = [];
    this.element.remove();
  }
}

export type { LogLevel };
