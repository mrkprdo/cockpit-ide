// SpecsMap public API — the agent + UI-facing methods, extracted from the
// facade so SpecsMapPlugin.ts stays under the 700 LOC cap (refactor.md
// §A.2/§A.3.8). Pure delegation over the SpecsData controller + GraphRenderer;
// DOM side effects (refresh, validation badge, refresh button) go through the
// narrow SpecsApiHost.

import { contextMarkdown, search as graphSearch } from '../../specs/graph';
import { reconcile } from '../../specs/reconcile';
import { staleFooter, summarizeReport, validate } from '../../specs/validate';
import type { ReconcileMode } from '../../specs/types';
import type { SpecNode } from '../../specs/layout';
import { createLogger } from '../../logging/logger';
import type { SpecsData } from './data';
import type { GraphRenderer } from './render-graph';

const log = createLogger('specsmap');

export interface SpecsApiHost {
  ready: Promise<void>;
  refresh(): Promise<void>;
  showValidation(): void;
  /** Click the toolbar refresh button (legacy triggerRefresh). */
  triggerRefresh(): void;
}

export class SpecsApi {
  constructor(
    private data: SpecsData,
    private renderer: GraphRenderer,
    private wsPath: string,
    private host: SpecsApiHost,
  ) {}

  triggerRefresh(): void {
    this.host.triggerRefresh();
  }

  /** Legacy entry point — full clobber regen is gone; maps to structural reconcile. */
  async triggerRegenerate(): Promise<void> {
    await this.reconcileSpecs('structural', true);
  }

  /** Run reconcile (report | structural). Returns a human/agent-readable changelog. */
  async reconcileSpecs(mode: ReconcileMode, createSkeletons = false): Promise<string> {
    log.info('specs reconcile', mode, createSkeletons ? 'create-skeletons' : '');
    await this.host.ready;
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    const specsDir = this.data.specBaseDir || wsRoot + '/src/specs';
    const api = window.electronAPI;
    if (!api) return 'Filesystem unavailable.';
    const result = await reconcile({
      fs: api.fs, wsRoot, specsDir, mode, createSkeletons,
    });
    if (mode === 'structural') {
      await this.host.refresh();
    }
    if (this.data.graph) {
      this.data.report = validate(this.data.graph, {
        sourceFiles: result.sourceFiles,
        existingFiles: result.existingFiles,
        facts: result.facts,
      });
      this.host.showValidation();
    }
    const lines = [
      `Reconcile (${mode})${mode === 'report' ? ' — nothing written' : ''}:`,
      `- created: ${result.created.length ? result.created.join(', ') : 'none'}`,
      `- updated: ${result.updated.length ? result.updated.join(', ') : 'none'}`,
      `- unchanged: ${result.unchanged.length}`,
    ];
    if (result.failed.length) {
      lines.push(`- attention: ${result.failed.map(f => `${f.path} (${f.error})`).join(', ')}`);
    }
    if (this.data.report) lines.push(`- validation: ${summarizeReport(this.data.report)}`);
    return lines.join('\n');
  }

  /** Full validation report with source-tree evidence (markdown). */
  async validateSpecs(): Promise<string> {
    log.info('specs validate');
    await this.host.ready;
    if (!this.data.graph) return 'No spec graph loaded.';
    const wsRoot = this.wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
    const specsDir = this.data.specBaseDir || wsRoot + '/src/specs';
    const api = window.electronAPI;
    if (api) {
      const result = await reconcile({ fs: api.fs, wsRoot, specsDir, mode: 'report' });
      this.data.report = validate(this.data.graph, {
        sourceFiles: result.sourceFiles,
        existingFiles: result.existingFiles,
        facts: result.facts,
      });
    } else {
      this.data.report = validate(this.data.graph);
    }
    this.host.showValidation();
    const r = this.data.report;
    const lines = [`# Validation — ${summarizeReport(r)}`, ''];
    lines.push(`- spec files: ${r.coverage.specFiles} · source files: ${r.coverage.sourceFiles} · linked: ${r.coverage.linked}`);
    if (r.coverage.unspecced.length) {
      lines.push(`- unspecced: ${r.coverage.unspecced.join(', ')}`);
    }
    if (r.issues.length) {
      lines.push('', '## Issues');
      for (const i of r.issues) {
        lines.push(`- [${i.severity}] ${i.id}: ${i.message}${i.fixHint ? ` (fix: ${i.fixHint})` : ''}`);
      }
    } else {
      lines.push('', 'All validation rules pass.');
    }
    return lines.join('\n');
  }

  /** Reload the graph from disk (agent-facing; awaits completion). */
  async reloadSpecs(): Promise<string> {
    log.info('specs reload');
    await this.host.ready;
    await this.host.refresh();
    return `SpecsMap reloaded: ${this.data.nodes.length} node(s), ${this.data.report ? summarizeReport(this.data.report) : 'no report'}.`;
  }

  getNodes(): SpecNode[] {
    return this.data.nodes.map(n => ({ ...n }));
  }

  getNodeContext(id: string): string {
    const node = this.data.nodes.find(n => n.id === id);
    if (!node) return '';
    const raw = this.data.specRawMap.get(id) ?? {};
    const lines: string[] = [];
    lines.push(`## ${node.name}`);
    lines.push(`- **File:** \`${node.sourceFile || node.specFile}\``);
    lines.push(`- **Layer:** ${node.layer}`);
    if (raw.description) lines.push(`- **Description:** ${raw.description}`);
    if (Array.isArray(raw.dependencies) && raw.dependencies.length) {
      lines.push('### Dependencies');
      for (const d of raw.dependencies) {
        const usage = (d as any).usage ? ` — ${(d as any).usage}` : '';
        lines.push(`- **${(d as any).feature || '?'}** \`${(d as any).file || ''}\`${usage}`);
      }
    }
    if (Array.isArray(raw.referenced_by) && raw.referenced_by.length) {
      lines.push('### Referenced By');
      for (const r of raw.referenced_by) {
        lines.push(`- **${(r as any).feature || '?'}** \`${(r as any).file || ''}\``);
      }
    }
    return lines.join('\n');
  }

  /**
   * Agent-grade explore (R4): instant, dense markdown with neighborhood +
   * impact. No camera moves unless `animate` is requested by a human surface.
   */
  async explore(query: string, opts: { animate?: boolean } = {}): Promise<string> {
    await this.host.ready;
    if (this.data.nodes.length === 0) {
      return 'No specs available to explore.';
    }
    const q = query.trim();
    if (!q) {
      return 'Please provide a search query.';
    }

    if (this.data.graph) {
      const matches = graphSearch(this.data.graph, q);
      if (matches.length === 0) return `No specs matched "${query}".`;

      if (opts.animate) {
        const el = matches[0].specFile;
        if (this.renderer.nodeEls.has(el)) this.renderer.selectNode(el, true);
      }

      const shown = matches.slice(0, 8);
      const contexts = shown.map(n =>
        contextMarkdown(this.data.graph!, n.id, this.data.specDocs.get(n.specFile)));
      let out = `# Matches (${matches.length}) for "${query}"` +
        (matches.length > shown.length ? ` — showing first ${shown.length}` : '') +
        '\n\n' + contexts.join('\n\n---\n\n');
      if (this.data.driftDirty) {
        out += '\n\n⚠ Source files changed since the graph was loaded — structure may be stale. Run specs_reconcile.';
      }
      out += staleFooter(this.data.report);
      return out;
    }

    const lq = q.toLowerCase();
    const matches = this.data.nodes.filter(n =>
      n.name.toLowerCase().includes(lq) ||
      n.sourceFile.toLowerCase().includes(lq) ||
      n.specFile.toLowerCase().includes(lq) ||
      (this.data.specRawMap.get(n.id)?.description ?? '').toLowerCase().includes(lq)
    );
    if (matches.length === 0) return `No specs matched "${query}".`;
    const contexts = matches.map(n => this.getNodeContext(n.id));
    return `Found ${matches.length} spec node(s) matching "${query}":\n\n` + contexts.join('\n\n---\n\n');
  }
}
