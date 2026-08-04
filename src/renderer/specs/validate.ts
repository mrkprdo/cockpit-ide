// SPECGEN runtime — validation rules → ValidationReport (pure, no IO).
//
// Rule catalog per SPECGEN.md "Validation Rules". Filesystem-dependent rules
// (main.orphan-row, spec.missing-file, main.missing-feature, exports.drift,
// ipc.unlisted) only fire when the caller passes the relevant evidence.

import { resolveFeature } from './graph';
import type { SourceFacts, SpecGraph, Severity, ValidationIssue, ValidationReport } from './types';

export const STUB_DESCRIPTION_RE = /^(TODO: describe|Auto-generated spec for)/i;

export interface ValidateOptions {
  /** Repo-relative TS/JS feature files (enables coverage / missing-feature rules). */
  sourceFiles?: Set<string>;
  /** Every walked file on disk, any type (enables existence rules; falls back to sourceFiles). */
  existingFiles?: Set<string>;
  /** Extracted facts per repo-relative source path (enables drift rules). */
  facts?: Map<string, SourceFacts>;
}

export function validate(graph: SpecGraph, opts: ValidateOptions = {}): ValidationReport {
  const issues: ValidationIssue[] = [];
  const { sourceFiles, facts } = opts;
  const existingFiles = opts.existingFiles ?? sourceFiles;

  const trackedFiles = new Set<string>();
  for (const n of graph.nodes.values()) {
    if (n.sourceFile) trackedFiles.add(n.sourceFile);
  }

  // main.orphan-row + main.missing-feature
  if (graph.main) {
    const rowFiles = new Set<string>();
    for (const [, rows] of Object.entries(graph.main.features)) {
      for (const r of rows) {
        if (r.file) rowFiles.add(r.file);
        if (existingFiles && r.file && !existingFiles.has(r.file)) {
          issues.push({
            id: 'main.orphan-row', severity: 'warn', featureId: r.id,
            message: `Features row "${r.id}" points to missing file ${r.file}`,
            fixHint: 'Remove the row or fix the file path',
          });
        }
      }
    }
    if (sourceFiles) {
      for (const f of sourceFiles) {
        if (!rowFiles.has(f)) {
          issues.push({
            id: 'main.missing-feature', severity: 'error',
            message: `Source file ${f} has no Features row in main.spec.md`,
            fixHint: 'Run reconcile to add a row (and optionally a skeleton spec)',
          });
        }
      }
    }
  }

  // spec.missing-file
  if (existingFiles) {
    for (const n of graph.nodes.values()) {
      const p = n.sourceFile ?? n.entryPath;
      if (n.sourceFile && !existingFiles.has(n.sourceFile)) {
        issues.push({
          id: 'spec.missing-file', severity: 'error', featureId: n.id,
          message: `${n.specFile} frontmatter file: ${p} does not exist`,
          fixHint: 'Fix the file: path or delete the stale spec',
        });
      }
    }
  }

  // edge.unresolved + edge.asymmetric
  for (const n of graph.nodes.values()) {
    for (const d of n.deps) {
      const target = resolveFeature(graph.byFile, graph.byBasename, d.file);
      if (!target) {
        issues.push({
          id: 'edge.unresolved', severity: 'error', featureId: n.id,
          message: `${n.id} depends on unresolvable ${d.file}`,
          fixHint: 'Fix the dependency path or add the missing spec',
        });
      } else if (target !== n.id) {
        const targetNode = graph.nodes.get(target)!;
        const hasBackRef = targetNode.refs.some(r =>
          resolveFeature(graph.byFile, graph.byBasename, r.file) === n.id);
        if (!hasBackRef) {
          issues.push({
            id: 'edge.asymmetric', severity: 'warn', featureId: target,
            message: `${n.id} → ${target} depends, but ${target} lacks ${n.id} in Referenced By`,
            fixHint: 'Run reconcile to recompute Referenced By globally',
          });
        }
      }
    }
  }

  // layer.cycle
  for (const cycle of findDependsCycles(graph)) {
    issues.push({
      id: 'layer.cycle', severity: 'warn',
      message: `Dependency cycle: ${cycle.join(' → ')}`,
      fixHint: 'Break the cycle by extracting shared code downward',
    });
  }

  // layer.inversion — violations of the layer *definitions*, not of ordering.
  // An orchestrator (core) importing widgets/modals/windows is normal; the
  // real inversions are: foundation with any internal dependency (foundation
  // is defined as importing nothing internal) and utility depending on
  // stateful/UI layers.
  for (const e of graph.edges) {
    if (e.kind !== 'depends') continue;
    const from = graph.nodes.get(e.from);
    const to = graph.nodes.get(e.to);
    if (!from || !to) continue;
    const foundationViolation = from.layer === 'foundation' &&
      to.layer !== 'foundation' && to.layer !== 'utility';
    const utilityViolation = from.layer === 'utility' &&
      to.layer !== 'utility' && to.layer !== 'foundation';
    if (foundationViolation || utilityViolation) {
      issues.push({
        id: 'layer.inversion', severity: 'warn', featureId: from.id,
        message: `${from.id} (${from.layer}) depends on ${to.id} (${to.layer}) — ${from.layer} must not depend on ${to.layer}`,
        fixHint: from.layer === 'foundation'
          ? 'Foundation features import nothing internal — reclassify the layer or move the dependency'
          : 'Utilities stay pure — reclassify or extract the shared part',
      });
    }
  }

  // description.stub
  for (const n of graph.nodes.values()) {
    if (!n.description || STUB_DESCRIPTION_RE.test(n.description)) {
      issues.push({
        id: 'description.stub', severity: 'info', featureId: n.id,
        message: `${n.specFile} has ${n.description ? 'a stub' : 'no'} description`,
        fixHint: 'Write a specific description of what this feature does',
      });
    }
  }

  // exports.drift + ipc.unlisted (needs facts)
  if (facts) {
    for (const n of graph.nodes.values()) {
      if (!n.sourceFile) continue;
      const f = facts.get(n.sourceFile);
      if (!f) continue;
      const specExports = new Set(n.exports);
      const missing = f.exports.filter(e => !specExports.has(e));
      if (missing.length) {
        issues.push({
          id: 'exports.drift', severity: 'warn', featureId: n.id,
          message: `${n.id}: source exports not in frontmatter: ${missing.join(', ')}`,
          fixHint: 'Run reconcile to refresh structural exports',
        });
      }
      const listed = new Set(n.ipc);
      const unlisted = f.ipcChannels.filter(ch => !listed.has(ch));
      if (unlisted.length) {
        issues.push({
          id: 'ipc.unlisted', severity: 'info', featureId: n.id,
          message: `${n.id}: channels in source not listed in spec: ${unlisted.join(', ')}`,
          fixHint: 'Run reconcile to refresh IPC Channels',
        });
      }
    }
  }

  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;

  const linked = sourceFiles
    ? [...trackedFiles].filter(f => sourceFiles.has(f)).length
    : trackedFiles.size;
  const unspecced = sourceFiles ? [...sourceFiles].filter(f => !trackedFiles.has(f)) : [];

  return {
    ok: counts.error === 0,
    counts,
    issues,
    coverage: {
      sourceFiles: sourceFiles?.size ?? trackedFiles.size,
      specFiles: graph.nodes.size,
      linked,
      unspecced,
    },
  };
}

function findDependsCycles(graph: SpecGraph): string[][] {
  // Local import avoided to keep validate pure over the same edge set
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.kind !== 'depends') continue;
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
  }
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let idx = 0;
  const sccs: string[][] = [];
  const strongconnect = (v: string) => {
    index.set(v, idx); lowlink.set(v, idx); idx++;
    stack.push(v); onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!index.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
      }
    }
    if (lowlink.get(v) === index.get(v)) {
      const scc: string[] = [];
      let w: string;
      do { w = stack.pop()!; onStack.delete(w); scc.push(w); } while (w !== v);
      if (scc.length > 1) sccs.push(scc);
    }
  };
  for (const v of graph.nodes.keys()) if (!index.has(v)) strongconnect(v);
  return sccs;
}

export function summarizeReport(report: ValidationReport): string {
  const { error, warn, info } = report.counts;
  if (!error && !warn && !info) return '✓ valid';
  const parts: string[] = [];
  if (error) parts.push(`${error} error${error > 1 ? 's' : ''}`);
  if (warn) parts.push(`${warn} warn`);
  if (info) parts.push(`${info} info`);
  return `${error ? '✕' : '⚠'} ${parts.join(' · ')}`;
}

/** Footer appended to agent tool responses when the graph is unhealthy (R5). */
export function staleFooter(report: ValidationReport | null): string {
  if (!report) return '';
  const { error, warn } = report.counts;
  if (!error && !warn) return '';
  return `\n\n⚠ ${error} validation error(s), ${warn} warning(s). Run specs_validate / specs_reconcile.`;
}
