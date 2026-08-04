// SpecsMap — detail/settings side panel (refactor.md §A.4). Owns the panel
// open/close state and all panel HTML; reads corpus/graph state through the
// injected SpecsData and GraphRenderer, and drives cycle/search interactions
// through the injected CyclesController.

import { LAYER_COLORS_HEX, LAYER_COLORS_VAR, LAYER_LABELS, type SpecNode } from '../../specs/layout';
import type { ReconcileMode } from '../../specs/types';
import { summarizeReport } from '../../specs/validate';
import type { SpecsData } from './data';
import type { GraphRenderer } from './render-graph';
import { CYCLE_COLORS, type CyclesController } from './cycles';
import { esc, specFullPath, tryResolveSourcePath } from './parse';

export interface PanelHost {
  data: SpecsData;
  renderer: GraphRenderer;
  cycles: CyclesController;
  panel: HTMLDivElement;
  panelHeaderEl: HTMLDivElement;
  panelInner: HTMLDivElement;
  wsPath: string;
  onFileOpen(): ((filePath: string) => void) | null;
  runReconcile(mode: ReconcileMode, createSkeletons: boolean): Promise<string>;
  onCycleChromeChange(): void;
}

export class PanelController {
  panelOpen = false;
  panelShowingSettings = false;

  constructor(private host: PanelHost) {}

  openPanel(node: SpecNode): void {
    this.panelOpen = true;
    this.host.panel.style.transform = 'translateX(0)';
    this.host.panel.style.pointerEvents = 'auto';
    try {
      this.renderPanelContent(node);
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.host.panelHeaderEl.innerHTML = '';
      this.host.panelInner.innerHTML =
        '<div class="sm-panel-section sm-t-sm" style="color:var(--red);line-height:1.5">' +
        '<div style="font-weight:700;margin-bottom:4px">Error rendering spec</div>' +
        '<div class="sm-t-xs" style="opacity:0.85;word-break:break-all">' + esc(msg) + '</div></div>';
    }
  }

  openSettingsPanel(): void {
    if (this.panelShowingSettings) {
      this.closePanel(true);
      return;
    }
    if (this.panelOpen) {
      this.closePanel();
    }
    this.panelShowingSettings = true;
    this.panelOpen = true;
    this.host.panel.style.transform = 'translateX(0)';
    this.host.panel.style.pointerEvents = 'auto';
    this.host.onCycleChromeChange();
    try {
      this.renderSettingsContent();
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      this.host.panelHeaderEl.innerHTML = '';
      this.host.panelInner.innerHTML =
        '<div class="sm-panel-section sm-t-sm" style="color:var(--red);line-height:1.5">' +
        '<div style="font-weight:700;margin-bottom:4px">Error rendering settings</div>' +
        '<div class="sm-t-xs" style="opacity:0.85;word-break:break-all">' + esc(msg) + '</div></div>';
    }
  }

  renderSettingsContent(): void {
    const cycles = this.host.cycles;
    const isActive = cycles.cycleMode;
    const escL = (s: unknown) => esc(s);

    this.host.panelHeaderEl.innerHTML =
      `<div style="padding:14px 18px 12px;display:flex;align-items:center;gap:12px">` +
      `<span class="sm-t-base" style="font-weight:700;color:var(--primary);flex:1">Settings</span>` +
      `<button id="sm-panel-close" class="sm-t-xl" style="background:none;border:none;cursor:pointer;color:var(--tertiary);line-height:1;padding:0 0 0 4px;font-family:inherit" aria-label="Close">×</button>` +
      `</div>`;

    const toggleBg = isActive ? 'var(--red)' : 'var(--border)';
    const toggleLabel = isActive ? 'On' : 'Off';

    const levelChips = (lvl: number) =>
      `<button class="sm-cycle-level sm-t-xs" data-level="${lvl}" style="background:none;border:1px solid ${lvl === cycles.cycleLevel ? 'var(--accent)' : 'var(--border)'};color:${lvl === cycles.cycleLevel ? 'var(--accent)' : 'var(--tertiary)'};border-radius:var(--radius-xs);padding:2px 10px;font-family:inherit;font-weight:700;cursor:pointer;transition:color 0.12s,border-color 0.12s" title="Level ${lvl}: ${lvl === 1 ? 'cycle nodes only' : lvl === 2 ? '+ immediate neighbors' : '+ 2-hop neighbors'}">${lvl}</button>`;

    let cyclesSection = '';
    if (isActive) {
      cyclesSection =
        `<div class="sm-panel-section">` +
        `<div class="sm-panel-label">DEPTH</div>` +
        `<div style="display:flex;gap:6px;padding:4px 0">${[1, 2, 3].map(levelChips).join('')}</div></div>`;
      if (cycles.cycleSets.length > 0) {
        cyclesSection +=
          `<div class="sm-panel-section">` +
          `<div class="sm-panel-label">CYCLES (${cycles.cycleSets.length}) — click edge on graph to trace</div>` +
          cycles.cycleSets.map((s, i) => {
            const c = CYCLE_COLORS[i % CYCLE_COLORS.length];
            const isSel = i === cycles.selectedCycleIndex;
            return `<div class="sm-t-xs" style="color:${c};padding:4px 0;display:flex;align-items:center;gap:6px;${isSel ? `background:${c}15;border-radius:4px;padding:4px 6px;margin:0 -6px;font-weight:700` : ''}">` +
              `<span style="width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0"></span>` +
              `<span>${isSel ? '▸ ' : ''}${escL([...s].join(' → '))}</span></div>`;
          }).join('') +
          `</div>`;
      } else {
        cyclesSection +=
          `<div class="sm-panel-section">` +
          `<div class="sm-t-xs" style="color:var(--green);display:flex;align-items:center;gap:6px">` +
          `<span>✓</span><span>No cycles — graph is a valid DAG</span></div></div>`;
      }
    }

    const isolatedToggleBg = cycles.isolatedMode ? 'var(--amber)' : 'var(--border)';
    const isolatedLabel = cycles.isolatedMode ? 'On' : 'Off';

    this.host.panelInner.innerHTML =
      `<div class="sm-panel-section">` +
      `<div class="sm-panel-label">GRAPH ANALYSIS</div>` +
      `<div style="display:flex;align-items:center;gap:12px;padding:8px 0">` +
      `<label class="sm-t-sm" style="flex:1;color:var(--primary);cursor:pointer">Show cyclic dependencies</label>` +
      `<div id="sm-cycle-toggle" style="width:36px;height:20px;border-radius:var(--radius-full);background:${toggleBg};cursor:pointer;position:relative;transition:background 0.15s;flex-shrink:0" role="switch" aria-checked="${isActive}">` +
      `<div style="width:16px;height:16px;border-radius:50%;background:var(--bg);position:absolute;top:2px;left:2px;transform:${isActive ? 'translateX(16px)' : 'translateX(0)'};transition:transform 0.15s"></div>` +
      `</div>` +
      `<span class="sm-t-xs" style="color:var(--tertiary);min-width:20px;text-align:right">${toggleLabel}</span>` +
      `</div>` +
      `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-top:1px solid var(--border);margin-top:4px;padding-top:12px">` +
      `<label class="sm-t-sm" style="flex:1;color:var(--primary);cursor:pointer">Show isolated nodes</label>` +
      `<div id="sm-isolated-toggle" style="width:36px;height:20px;border-radius:var(--radius-full);background:${isolatedToggleBg};cursor:pointer;position:relative;transition:background 0.15s;flex-shrink:0" role="switch" aria-checked="${cycles.isolatedMode}">` +
      `<div style="width:16px;height:16px;border-radius:50%;background:var(--bg);position:absolute;top:2px;left:2px;transform:${cycles.isolatedMode ? 'translateX(16px)' : 'translateX(0)'};transition:transform 0.15s"></div>` +
      `</div>` +
      `<span class="sm-t-xs" style="color:var(--tertiary);min-width:20px;text-align:right">${isolatedLabel}</span>` +
      `</div></div>` +
      cyclesSection +
      this.validationSectionHtml(escL) +
      `<div class="sm-panel-section" style="border-top:1px solid var(--border)">` +
      `<div class="sm-panel-label">RECONCILE</div>` +
      `<div class="sm-t-xs" style="color:var(--tertiary);margin-bottom:8px;line-height:1.5">Syncs structural fields (exports, dependencies, referenced by, IPC) from source. Prose is never touched. Report writes nothing.</div>` +
      `<div style="display:flex;gap:6px">` +
      `<button id="sm-reconcile-report-btn" class="sm-reconcile-btn sm-t-xs" style="background:transparent;border:1px solid var(--border);border-radius:var(--radius-s);padding:8px 10px;font-family:inherit;font-weight:700;color:var(--primary);cursor:pointer;flex:1;transition:border-color 0.12s,color 0.12s">Report</button>` +
      `<button id="sm-reconcile-apply-btn" class="sm-reconcile-btn sm-t-xs" style="background:transparent;border:1px solid var(--border);border-radius:var(--radius-s);padding:8px 10px;font-family:inherit;font-weight:700;color:var(--primary);cursor:pointer;flex:1;transition:border-color 0.12s,color 0.12s">⚡ Apply structural</button>` +
      `</div>` +
      `<div id="sm-reconcile-result" class="sm-t-xs" style="color:var(--tertiary);margin-top:8px;line-height:1.5;white-space:pre-wrap;word-break:break-word"></div>` +
      `</div>`;

    this.host.panelHeaderEl.querySelector('#sm-panel-close')
      ?.addEventListener('click', () => this.closePanel(true));

    const toggle = this.host.panelInner.querySelector('#sm-cycle-toggle');
    toggle?.addEventListener('click', () => cycles.toggleCycleMode());

    for (const chip of this.host.panelInner.querySelectorAll<HTMLElement>('.sm-cycle-level')) {
      chip.addEventListener('click', () => {
        const lvl = parseInt(chip.dataset.level ?? '1', 10);
        cycles.setCycleLevel(lvl);
      });
    }

    const isolatedToggle = this.host.panelInner.querySelector('#sm-isolated-toggle');
    isolatedToggle?.addEventListener('click', () => cycles.toggleIsolatedMode());

    for (const btn of this.host.panelInner.querySelectorAll<HTMLButtonElement>('.sm-reconcile-btn')) {
      btn.addEventListener('mouseenter', () => {
        btn.style.borderColor = 'var(--accent)';
        btn.style.color = 'var(--accent)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.borderColor = ''; btn.style.color = '';
      });
    }
    this.host.panelInner.querySelector('#sm-reconcile-report-btn')
      ?.addEventListener('click', () => this.runReconcileFromPanel('report'));
    this.host.panelInner.querySelector('#sm-reconcile-apply-btn')
      ?.addEventListener('click', () => this.runReconcileFromPanel('structural'));

    for (const el of this.host.panelInner.querySelectorAll<HTMLElement>('[data-issue-goto]')) {
      el.addEventListener('click', () => {
        const specFile = el.dataset.issueGoto!;
        if (this.host.renderer.nodeEls.has(specFile)) this.host.renderer.selectNode(specFile);
      });
    }
  }

  validationSectionHtml(escF: (s: unknown) => string): string {
    const r = this.host.data.report;
    if (!r) return '';
    const sevColor: Record<string, string> = { error: 'var(--red)', warn: 'var(--amber)', info: 'var(--tertiary)' };
    const items = r.issues.slice(0, 40).map(i => {
      const specFile = i.featureId ? `${i.featureId}.spec.md` : '';
      const clickable = specFile && this.host.renderer.nodeEls.has(specFile);
      return `<div class="sm-t-xs" style="padding:3px 0;display:flex;gap:6px;align-items:baseline;border-bottom:1px solid var(--border);${clickable ? 'cursor:pointer' : ''}"` +
        (clickable ? ` data-issue-goto="${escF(specFile)}"` : '') + `>` +
        `<span style="color:${sevColor[i.severity]};font-weight:700;flex-shrink:0">${i.severity.toUpperCase()}</span>` +
        `<span style="color:var(--secondary);word-break:break-word">${escF(i.message)}</span></div>`;
    }).join('');
    return `<div class="sm-panel-section" style="border-top:1px solid var(--border)">` +
      `<div class="sm-panel-label">VALIDATION — ${escF(summarizeReport(r))}${this.host.data.driftDirty ? ' · DRIFT' : ''}</div>` +
      (r.issues.length ? items : `<div class="sm-t-xs" style="color:var(--green)">✓ All validation rules pass</div>`) +
      (r.issues.length > 40 ? `<div class="sm-t-xs" style="color:var(--tertiary);padding-top:4px">… +${r.issues.length - 40} more</div>` : '') +
      `</div>`;
  }

  async runReconcileFromPanel(mode: ReconcileMode): Promise<void> {
    const resultEl = this.host.panelInner.querySelector<HTMLElement>('#sm-reconcile-result');
    if (resultEl) resultEl.textContent = mode === 'report' ? 'Scanning…' : 'Reconciling…';
    let summary: string;
    try {
      summary = await this.host.runReconcile(mode, mode === 'structural');
    } catch (e) {
      summary = 'Reconcile failed: ' + (e instanceof Error ? e.message : String(e));
    }
    // Structural mode refreshes the graph, which closes the panel — reopen it
    // so the changelog is actually visible.
    if (!this.panelShowingSettings) this.openSettingsPanel();
    else this.renderSettingsContent();
    const el = this.host.panelInner.querySelector<HTMLElement>('#sm-reconcile-result');
    if (el) el.textContent = summary;
  }

  closePanel(resetZoom?: boolean): void {
    this.panelOpen = false;
    this.panelShowingSettings = false;
    this.host.panel.style.transform = 'translateX(100%)';
    this.host.panel.style.pointerEvents = 'none';
    this.host.onCycleChromeChange();
    if (this.host.renderer.selectedId) {
      const prev = this.host.renderer.nodeEls.get(this.host.renderer.selectedId);
      if (prev) prev.classList.remove('sm-selected');
    }
    this.host.renderer.selectedId = null;
    if (resetZoom) {
      const target = this.host.renderer.getFitTarget();
      if (target) {
        this.host.renderer.fitScale = target.scale;
        this.host.renderer.animateTo(target.panX, target.panY, target.scale, 300);
      }
    }
  }

  renderPanelContent(node: SpecNode): void {
    const data = this.host.data.specRawMap.get(node.id) ?? {};
    const colorHex = LAYER_COLORS_HEX[node.layer] ?? '#94a3b8';
    const colorVar = LAYER_COLORS_VAR[node.layer] ?? 'var(--secondary)';
    const layerLabel = LAYER_LABELS[node.layer] ?? node.layer;

    const depNodes = node.deps.map(d => this.host.data.nodes.find(n => n.id === d)).filter(Boolean) as SpecNode[];
    const refNodes = this.host.data.nodes.filter(n => n.deps.includes(node.id));
    const uiChild = node.uiChildId ? this.host.data.nodes.find(n => n.id === node.uiChildId) : undefined;
    const parentNode = node.parentId ? this.host.data.nodes.find(n => n.id === node.parentId) : undefined;

    const deps = Array.isArray(data.dependencies) ? data.dependencies as Array<{ feature?: unknown; file?: unknown; usage?: unknown }> : [];
    const refs = Array.isArray(data.referenced_by) ? data.referenced_by as Array<{ feature?: unknown; file?: unknown }> : [];
    const ipc = Array.isArray(data.ipc) ? data.ipc as unknown[] : [];

    // Safe: coerces any value to escaped string
    const escF = (s: unknown) => esc(s);

    // Fixed header (inside panelHeaderEl, never scrolls)
    const isEntry = node.isEntry;
    const headerIcon = isEntry ? '⚙' : '';
    this.host.panelHeaderEl.innerHTML =
      `<div style="padding:14px 18px 12px;display:flex;align-items:center;gap:12px">` +
      `<span style="width:12px;height:12px;border-radius:50%;background:${colorHex};flex-shrink:0;display:inline-block"></span>` +
      (isEntry ? `<span class="sm-t-base" style="line-height:1;opacity:0.6;flex-shrink:0" title="Entry file">⚙</span>` : '') +
      `<span class="sm-t-base" style="font-weight:700;color:var(--primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escF(node.name)}</span>` +
      `<span class="sm-t-xs" style="font-weight:700;letter-spacing:0.8px;color:${colorVar};flex-shrink:0">${layerLabel.toUpperCase()}</span>` +
      `<button id="sm-panel-close" class="sm-t-xl" style="background:none;border:none;cursor:pointer;color:var(--tertiary);line-height:1;padding:0 0 0 4px;font-family:inherit" aria-label="Close">×</button>` +
      `</div>`;

    // Scrollable body
    const fullPath = specFullPath(this.host.wsPath, this.host.data.specBaseDir, node.specFile);
    const sourceFullPath = node.sourceFile ? tryResolveSourcePath(this.host.wsPath, data) : '';
    const fileLabel = isEntry ? 'ENTRY FILE' : 'SOURCE FILE';
    const identity =
      `<div class="sm-panel-section">` +
      `<div class="sm-panel-label">SPEC FILE</div>` +
      `<div class="sm-panel-row" style="cursor:pointer;color:var(--accent)" data-open-file="${escF(fullPath)}">${escF(node.specFile)}</div>` +
      (sourceFullPath ? `<div class="sm-panel-label" style="margin-top:8px">${fileLabel}</div><div class="sm-panel-row" style="cursor:pointer;color:var(--accent)" data-open-file="${escF(sourceFullPath)}">${escF(node.sourceFile)}</div>` : '') +
      (parentNode ? `<div class="sm-panel-label" style="margin-top:8px">UI SPEC FOR</div><div class="sm-panel-row sm-t-sm" style="cursor:pointer;color:${colorVar}" data-goto="${escF(parentNode.id)}">${escF(parentNode.name)}</div>` : '') +
      (uiChild ? `<div class="sm-panel-label" style="margin-top:8px">UI SPEC</div><div class="sm-panel-row sm-t-sm" style="cursor:pointer;color:${colorVar}" data-goto="${escF(uiChild.id)}">${escF(uiChild.name)}</div>` : '') +
      `</div>`;

    const desc = data.description
      ? `<div class="sm-panel-section"><div class="sm-panel-label">DESCRIPTION</div><div class="sm-t-sm" style="color:var(--secondary);line-height:1.6;word-break:break-word">${escF(data.description)}</div></div>`
      : '';

    const depsSection = deps.length
      ? `<div class="sm-panel-section"><div class="sm-panel-label">DEPENDS ON (${deps.length})</div>` +
        deps.map(d => {
          const raw = String(d.file ?? '');
          const dBasename = raw.split('/').pop() || raw;
          const linked = dBasename ? depNodes.find(n => n.sourceFile === dBasename) : undefined;
          return `<div class="sm-dep-item"><div>` +
            `<div class="sm-dep-name" ${linked ? `style="cursor:pointer;color:${colorVar}" data-goto="${escF(linked.id)}"` : ''}>${escF(d.feature)}</div>` +
            `<div class="sm-dep-file">${escF(dBasename)}</div>` +
            (d.usage ? `<div class="sm-dep-usage">${escF(d.usage)}</div>` : '') +
            `</div></div>`;
        }).join('') +
        `</div>`
      : '';

    const refsSection = refs.length
      ? `<div class="sm-panel-section"><div class="sm-panel-label">REFERENCED BY (${refs.length})</div>` +
        refs.map(r => {
          const raw = String(r.file ?? '');
          const rBasename = raw.split('/').pop() || raw;
          const linked = rBasename ? refNodes.find(n => n.sourceFile === rBasename) : undefined;
          return `<div class="sm-dep-item"><div>` +
            `<div class="sm-dep-name" ${linked ? `style="cursor:pointer;color:${colorVar}" data-goto="${escF(linked.id)}"` : ''}>${escF(r.feature)}</div>` +
            `<div class="sm-dep-file">${escF(rBasename)}</div>` +
            `</div></div>`;
        }).join('') +
        `</div>`
      : '';

    const ipcSection = ipc.length
      ? `<div class="sm-panel-section"><div class="sm-panel-label">IPC CHANNELS (${ipc.length})</div>` +
        ipc.map(ch => `<div class="sm-t-sm" style="color:var(--tertiary);padding:3px 0">${escF(ch)}</div>`).join('') +
        `</div>`
      : '';

    // Entry-specific sections
    const scripts = isEntry && data.scripts && typeof data.scripts === 'object' ? data.scripts as Record<string, string> : null;
    const buildDef = isEntry && data.build && typeof data.build === 'object' ? data.build as Record<string, string> : null;
    const declaredDeps = isEntry && data.dependencies && typeof data.dependencies === 'object' && !Array.isArray(data.dependencies)
      ? data.dependencies as Record<string, string> : null;

    const scriptsSection = scripts
      ? `<div class="sm-panel-section"><div class="sm-panel-label">SCRIPTS (${Object.keys(scripts).length})</div>` +
        Object.entries(scripts).map(([k, v]) =>
          `<div class="sm-t-xs" style="padding:3px 0;display:flex;gap:8px;border-bottom:1px solid var(--border)">` +
          `<span style="font-weight:700;color:var(--primary);flex-shrink:0">${escF(k)}</span>` +
          `<span style="color:var(--tertiary);word-break:break-all">${escF(v)}</span></div>`
        ).join('') +
        `</div>`
      : '';

    const buildSection = buildDef
      ? `<div class="sm-panel-section"><div class="sm-panel-label">BUILD</div>` +
        Object.entries(buildDef).map(([k, v]) =>
          `<div class="sm-t-xs" style="padding:3px 0;display:flex;gap:8px">` +
          `<span style="font-weight:700;color:var(--primary);flex-shrink:0">${escF(k)}</span>` +
          `<span style="color:var(--tertiary);word-break:break-all">${escF(v)}</span></div>`
        ).join('') +
        `</div>`
      : '';

    const declaredDepsSection = declaredDeps
      ? `<div class="sm-panel-section"><div class="sm-panel-label">DECLARED DEPS (${Object.keys(declaredDeps).length})</div>` +
        Object.entries(declaredDeps).map(([k, v]) =>
          `<div class="sm-t-xs" style="padding:2px 0;display:flex;gap:8px">` +
          `<span style="color:var(--primary);font-weight:700;flex-shrink:0">${escF(k)}</span>` +
          `<span class="sm-t-xs" style="color:var(--tertiary);word-break:break-all">${escF(v)}</span></div>`
        ).join('') +
        `</div>`
      : '';

    this.host.panelInner.innerHTML = identity + desc + depsSection + refsSection + ipcSection + scriptsSection + buildSection + declaredDepsSection;

    this.host.panelHeaderEl.querySelector('#sm-panel-close')
      ?.addEventListener('click', () => this.closePanel(true));

    for (const el of this.host.panelInner.querySelectorAll<HTMLElement>('[data-goto]')) {
      el.addEventListener('click', () => this.host.renderer.selectNode(el.dataset.goto!));
    }
    for (const el of this.host.panelHeaderEl.querySelectorAll<HTMLElement>('[data-goto]')) {
      el.addEventListener('click', () => this.host.renderer.selectNode(el.dataset.goto!));
    }
    for (const el of this.host.panelInner.querySelectorAll<HTMLElement>('[data-open-file]')) {
      el.addEventListener('click', () => { const fp = el.dataset.openFile!; this.host.onFileOpen()?.(fp); });
    }
  }
}
