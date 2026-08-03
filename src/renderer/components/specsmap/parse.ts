// SpecsMap — stateless spec-file parsing + path utilities (refactor.md §A.4).
// No class, no DOM, no private state; everything is derived from params.

export interface SpecData {
  name?: string;
  file?: string;
  entry?: string;
  title?: string;
  parent?: string;
  layer?: string;
  dependencies?: Array<{ feature: string; file: string; usage?: string }>;
  referenced_by?: Array<{ feature: string; file: string }>;
  ui?: { spec: string };
  ipc?: string[];
  description?: string;
  scripts?: Record<string, string>;
  build?: Record<string, string>;
  [key: string]: unknown;
}

export interface SpecCollection {
  title: string;
  specsDir: string;
  mainData: Record<string, unknown> | null;
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function parseSpecMd(raw: string): SpecData {
  const data: SpecData = {};
  const lines = raw.split('\n');
  let i = 0;

  if (lines[0] === '---') {
    i = 1;
    while (i < lines.length && lines[i] !== '---') {
      const kv = lines[i].match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (kv) {
        const key = kv[1], val = kv[2].trim();
        if (val === 'true') (data as any)[key] = true;
        else if (val === 'false') (data as any)[key] = false;
        else if (/^\[.*\]$/.test(val)) {
          const inner = val.slice(1, -1).trim();
          (data as any)[key] = inner ? inner.split(',').map(s => s.trim()).filter(Boolean) : [];
        } else (data as any)[key] = val;
      }
      i++;
    }
    i++;
  }

  const sections = new Map<string, string[]>();
  let currentSection: string | null = null;
  let currentLines: string[] = [];
  let descLines: string[] = [];
  let inDesc = false;

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!inDesc && line.startsWith('# ') && !line.startsWith('## ')) { inDesc = true; continue; }
    if (line.startsWith('## ')) {
      if (currentSection !== null) sections.set(currentSection, currentLines);
      else if (inDesc) data.description = descLines.join('\n').trim() || undefined;
      currentSection = line.slice(3).trim();
      currentLines = [];
      inDesc = false;
    } else if (inDesc) {
      descLines.push(line);
    } else if (currentSection !== null) {
      currentLines.push(line);
    }
  }
  if (currentSection !== null) sections.set(currentSection, currentLines);
  else if (inDesc && descLines.length) data.description = descLines.join('\n').trim() || undefined;

  const deps: Array<{feature: string; file: string; usage?: string}> = [];
  for (const line of sections.get('Dependencies') ?? []) {
    // Handles: [[spec.md|name]] `file` — usage  OR  **name** `file` — usage
    const m = line.match(/^-\s+(?:\[\[[^\]|]*\|([^\]]+)\]\]|\*\*([^*]+)\*\*)\s+`([^`]+)`(?:\s+[—–-]\s+(.+))?/);
    if (m) deps.push({ feature: (m[1] ?? m[2] ?? '').trim(), file: m[3].trim(), ...(m[4] ? { usage: m[4].trim() } : {}) });
  }
  if (deps.length) data.dependencies = deps;

  const refs: Array<{feature: string; file: string}> = [];
  for (const line of sections.get('Referenced By') ?? []) {
    // Handles: [[spec.md|name]] `file`  OR  **name** `file`
    const m = line.match(/^-\s+(?:\[\[[^\]|]*\|([^\]]+)\]\]|\*\*([^*]+)\*\*)\s+`([^`]+)`/);
    if (m) refs.push({ feature: (m[1] ?? m[2] ?? '').trim(), file: m[3].trim() });
  }
  if (refs.length) data.referenced_by = refs;

  const ipc: string[] = [];
  for (const line of sections.get('IPC Channels') ?? []) {
    const m = line.match(/^-\s+`([^`]+)`/);
    if (m) ipc.push(m[1]);
  }
  if (ipc.length) data.ipc = ipc;

  const scripts: Record<string, string> = {};
  for (const line of sections.get('Scripts') ?? []) {
    const m = line.match(/^-\s+\*\*([^*]+)\*\*:\s+`([^`]+)`/);
    if (m) scripts[m[1]] = m[2];
  }
  if (Object.keys(scripts).length) data.scripts = scripts;

  const build: Record<string, string> = {};
  for (const line of sections.get('Build') ?? []) {
    const m = line.match(/^-\s+\*\*([^*]+)\*\*:\s+`([^`]+)`/);
    if (m) build[m[1]] = m[2];
  }
  if (Object.keys(build).length) data.build = build;

  return data;
}

export function parseMainSpecMd(raw: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const lines = raw.split('\n');
  let i = 0;

  if (lines[0] === '---') {
    i = 1;
    while (i < lines.length && lines[i] !== '---') {
      const kv = lines[i].match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (kv) data[kv[1]] = kv[2].trim();
      i++;
    }
    i++;
  }

  let inFeatures = false;
  let currentLayer: string | null = null;
  let inTable = false;
  let tableHeaders: string[] = [];
  const features: Record<string, Record<string, string>[]> = {};

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === '## Features') { inFeatures = true; continue; }
    if (inFeatures && line.startsWith('## ') && line !== '## Features') break;
    if (!inFeatures) continue;
    if (line.startsWith('### ')) {
      currentLayer = line.slice(4).trim();
      inTable = false; tableHeaders = [];
      features[currentLayer] = [];
      continue;
    }
    if (currentLayer && line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(s => s.trim());
      if (cells.every(c => /^[-:\s]+$/.test(c))) continue;
      if (!inTable) { tableHeaders = cells; inTable = true; continue; }
      const row: Record<string, string> = {};
      // Strip [[...]] wiki-link brackets from cell values (Obsidian links → plain filenames)
      tableHeaders.forEach((h, idx) => { row[h] = (cells[idx] ?? '').replace(/^\[\[(.+)\]\]$/, '$1'); });
      features[currentLayer].push(row);
    }
  }

  if (Object.keys(features).length) data.features = features;
  return data;
}

export function specFullPath(wsPath: string, specBaseDir: string, filename: string): string {
  const base = specBaseDir || (wsPath.replace(/\\/g, '/').replace(/\/?$/, '') + '/src/specs');
  return base + '/' + filename;
}

export function tryResolveSourcePath(wsPath: string, rawData: Record<string, unknown>): string {
  const filePath = (rawData as any).file;
  const entryPath = (rawData as any).entry;
  const wsRoot = wsPath.replace(/\\/g, '/').replace(/\/?$/, '');
  if (filePath && typeof filePath === 'string') return wsRoot + '/' + filePath;
  if (entryPath && typeof entryPath === 'string') return wsRoot + '/' + entryPath;
  return '';
}
