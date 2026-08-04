// SPECGEN runtime — pure in-memory graph over parsed spec docs (no DOM, no IO).

import type { SpecDoc } from './format';
import {
  fmGet, fmGetParsed, getDescription, getSection,
  parseDeps, parseFeaturesTables, parseIpc, parseRefs,
} from './format';
import type { FeatureNode, MainIndex, SpecEdge, SpecGraph } from './types';

export const LAYER_ORDER = ['foundation', 'core', 'widget', 'modal', 'overlay', 'window', 'service', 'utility'];

export function specIdFromFilename(specFile: string): string {
  return specFile.replace(/\.spec\.md$/, '');
}

export function buildMainIndex(mainDoc: SpecDoc): MainIndex {
  return {
    name: fmGet(mainDoc, 'name') ?? '',
    title: fmGet(mainDoc, 'title') ?? fmGet(mainDoc, 'name') ?? '',
    version: fmGet(mainDoc, 'version') ?? '',
    features: parseFeaturesTables(mainDoc),
  };
}

/**
 * Build the graph from parsed docs. `specs` maps spec filename → doc
 * (main.spec.md excluded). Layer resolution: main index row wins, then the
 * spec's own frontmatter, then 'window'.
 */
export function buildGraph(main: MainIndex | null, specs: Map<string, SpecDoc>): SpecGraph {
  const nodes = new Map<string, FeatureNode>();
  const byFile = new Map<string, string>();
  const byBasename = new Map<string, string>();
  const bySpecFile = new Map<string, string>();

  const rowLayer = new Map<string, string>();   // spec filename → layer
  const uiToParent = new Map<string, string>(); // ui spec filename → parent spec filename
  const parentToUi = new Map<string, string>();
  if (main) {
    for (const [layer, rows] of Object.entries(main.features)) {
      for (const r of rows) {
        if (r.spec) rowLayer.set(r.spec, layer);
        if (r.ui) {
          rowLayer.set(r.ui, layer);
          uiToParent.set(r.ui, r.spec);
          parentToUi.set(r.spec, r.ui);
        }
      }
    }
  }

  for (const [specFile, doc] of specs) {
    const id = specIdFromFilename(specFile);
    const parentSpec = uiToParent.get(specFile) ?? (fmGet(doc, 'parent') ? `${fmGet(doc, 'parent')}.spec.md` : undefined);
    const sourceFile = fmGet(doc, 'file');
    const entryPath = fmGet(doc, 'entry');
    const exportsVal = fmGetParsed(doc, 'exports');
    const node: FeatureNode = {
      id,
      name: fmGet(doc, 'name') ?? id,
      layer: rowLayer.get(specFile) ?? fmGet(doc, 'layer') ?? 'window',
      type: fmGet(doc, 'type') ?? '',
      singleton: fmGetParsed(doc, 'singleton') === true,
      specFile,
      sourceFile,
      entryPath,
      uiSpecFile: parentToUi.get(specFile),
      parentId: parentSpec ? specIdFromFilename(parentSpec) : undefined,
      exports: Array.isArray(exportsVal) ? exportsVal : [],
      deps: parseDeps(doc),
      refs: parseRefs(doc),
      ipc: parseIpc(doc),
      description: getDescription(doc),
    };
    nodes.set(id, node);
    bySpecFile.set(specFile, id);
    if (sourceFile) {
      byFile.set(sourceFile, id);
      const base = sourceFile.split('/').pop()!;
      byBasename.set(base, id);
      const stem = base.replace(/\.[^.]+$/, '');
      if (stem !== base && !byBasename.has(stem)) byBasename.set(stem, id);
    }
    if (entryPath) {
      if (!byFile.has(entryPath)) byFile.set(entryPath, id);
      const base = entryPath.split('/').pop()!;
      if (!byBasename.has(base)) byBasename.set(base, id);
    }
  }

  const edges: SpecEdge[] = [];
  for (const node of nodes.values()) {
    for (const dep of node.deps) {
      const target = resolveFeature(byFile, byBasename, dep.file);
      if (target && target !== node.id) edges.push({ kind: 'depends', from: node.id, to: target });
    }
    if (node.parentId && nodes.has(node.parentId)) {
      edges.push({ kind: 'ui-of', from: node.id, to: node.parentId });
    }
  }

  return { main, nodes, edges, byFile, byBasename };
}

export function resolveFeature(
  byFile: Map<string, string>,
  byBasename: Map<string, string>,
  filePath: string,
): string | undefined {
  const normalized = filePath.replace(/\\/g, '/');
  if (byFile.has(normalized)) return byFile.get(normalized);
  const base = normalized.split('/').pop()!;
  return byBasename.get(base);
}

// ── Queries ─────────────────────────────────────────────────────────────────

export function search(graph: SpecGraph, query: string): FeatureNode[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const out: FeatureNode[] = [];
  for (const n of graph.nodes.values()) {
    if (
      n.id.toLowerCase().includes(q) ||
      n.name.toLowerCase().includes(q) ||
      (n.sourceFile ?? '').toLowerCase().includes(q) ||
      n.specFile.toLowerCase().includes(q) ||
      n.layer.toLowerCase().includes(q) ||
      n.description.toLowerCase().includes(q) ||
      n.ipc.some(ch => ch.toLowerCase().includes(q)) ||
      n.exports.some(e => e.toLowerCase().includes(q))
    ) out.push(n);
  }
  // Exact/prefix id matches first, then name matches, then the rest
  out.sort((a, b) => rank(a, q) - rank(b, q));
  return out;
}

function rank(n: FeatureNode, q: string): number {
  if (n.id.toLowerCase() === q) return 0;
  if (n.id.toLowerCase().startsWith(q)) return 1;
  if (n.name.toLowerCase().includes(q)) return 2;
  return 3;
}

function dependsAdjacency(graph: SpecGraph): { out: Map<string, string[]>; inn: Map<string, string[]> } {
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.kind !== 'depends') continue;
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e.to);
    (inn.get(e.to) ?? inn.set(e.to, []).get(e.to)!).push(e.from);
  }
  return { out, inn };
}

function walk(start: string, adj: Map<string, string[]>, depth: number): Set<string> {
  const seen = new Set<string>();
  let frontier = [start];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (nb !== start && !seen.has(nb)) { seen.add(nb); next.push(nb); }
      }
    }
    frontier = next;
  }
  return seen;
}

export function neighbors(
  graph: SpecGraph,
  id: string,
  opts: { direction?: 'upstream' | 'downstream' | 'both'; depth?: number } = {},
): { upstream: FeatureNode[]; downstream: FeatureNode[] } {
  const { direction = 'both', depth = 1 } = opts;
  const { out, inn } = dependsAdjacency(graph);
  const get = (ids: Set<string>) => [...ids].map(i => graph.nodes.get(i)).filter(Boolean) as FeatureNode[];
  return {
    // upstream = what this feature depends on; downstream = what depends on it
    upstream: direction === 'downstream' ? [] : get(walk(id, out, depth)),
    downstream: direction === 'upstream' ? [] : get(walk(id, inn, depth)),
  };
}

export function impact(graph: SpecGraph, id: string, depth = 3): { upstream: string[]; downstream: string[] } {
  const { out, inn } = dependsAdjacency(graph);
  return { upstream: [...walk(id, out, depth)], downstream: [...walk(id, inn, depth)] };
}

/** Tarjan SCC — returns only components with 2+ members (real cycles). */
export function findCycles(graph: SpecGraph): string[][] {
  const { out } = dependsAdjacency(graph);
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let idx = 0;
  const sccs: string[][] = [];

  const strongconnect = (v: string) => {
    index.set(v, idx); lowlink.set(v, idx); idx++;
    stack.push(v); onStack.add(v);
    for (const w of out.get(v) ?? []) {
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

// ── Agent context ───────────────────────────────────────────────────────────

export interface ContextOptions {
  includeInterface?: boolean;
  neighborhoodDepth?: number; // 0 disables
  impactDepth?: number;       // 0 disables
}

/** Dense markdown context for one feature — the agent-grade explore payload. */
export function contextMarkdown(
  graph: SpecGraph,
  id: string,
  doc?: SpecDoc,
  opts: ContextOptions = {},
): string {
  const { includeInterface = true, neighborhoodDepth = 1, impactDepth = 3 } = opts;
  const n = graph.nodes.get(id);
  if (!n) return '';
  const lines: string[] = [];
  lines.push(`## ${n.id}`);
  lines.push(`- **name:** ${n.name}`);
  if (n.sourceFile) lines.push(`- **file:** \`${n.sourceFile}\``);
  if (n.entryPath) lines.push(`- **entry:** \`${n.entryPath}\``);
  lines.push(`- **layer / type:** ${n.layer}${n.type ? ` / ${n.type}` : ''}`);
  lines.push(`- **spec:** \`${n.specFile}\``);
  if (n.uiSpecFile) lines.push(`- **ui:** \`${n.uiSpecFile}\``);
  if (n.exports.length) lines.push(`- **exports:** ${n.exports.join(', ')}`);

  if (n.description) lines.push('', '### Description', n.description);

  if (n.deps.length) {
    lines.push('', '### Dependencies');
    for (const d of n.deps) lines.push(`- **${d.feature}** \`${d.file}\`${d.usage ? ` — ${d.usage}` : ''}`);
  }
  if (n.refs.length) {
    lines.push('', '### Referenced By');
    for (const r of n.refs) lines.push(`- **${r.feature}** \`${r.file}\``);
  }
  if (n.ipc.length) {
    lines.push('', '### IPC');
    for (const ch of n.ipc) lines.push(`- \`${ch}\``);
  }

  if (includeInterface && doc) {
    const iface = getSection(doc, 'Interface');
    if (iface) {
      const body = iface.body.join('\n').trim();
      if (body) lines.push('', '### Interface', body);
    }
  }

  if (neighborhoodDepth > 0) {
    const nb = neighbors(graph, id, { depth: neighborhoodDepth });
    if (nb.upstream.length || nb.downstream.length) {
      lines.push('', `### Neighborhood (depth ${neighborhoodDepth})`);
      if (nb.upstream.length) lines.push(`- upstream: ${nb.upstream.map(x => x.id).join(', ')}`);
      if (nb.downstream.length) lines.push(`- downstream: ${nb.downstream.map(x => x.id).join(', ')}`);
    }
  }

  if (impactDepth > 0) {
    const im = impact(graph, id, impactDepth);
    if (im.downstream.length) {
      lines.push('', `### Impact (depth ${impactDepth})`, `- ${im.downstream.length} feature(s) downstream may be affected: ${im.downstream.join(', ')}`);
    }
  }

  return lines.join('\n');
}
