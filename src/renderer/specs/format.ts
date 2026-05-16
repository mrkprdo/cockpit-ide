// SPECGEN runtime — round-trip-safe parse/serialize of *.spec.md files.
//
// The doc model stores raw lines per region so serialize(parse(x)) === x for
// any input. Structural mutations (frontmatter keys, named sections) rewrite
// only their own region; everything else — including unknown ## sections —
// is preserved byte-for-byte (R1: contract prose is sacred).

import type { DepItem, MainFeatureRow, RefItem } from './types';

export interface SpecSection {
  name: string;          // heading text after '## '
  headingLine: string;   // exact heading line
  body: string[];        // exact lines until next '## ' (or EOF)
}

export interface SpecDoc {
  fmLines: string[];     // raw lines between the --- markers (exclusive)
  hasFrontmatter: boolean;
  preTitle: string[];    // raw lines between frontmatter and title
  titleLine: string | null;
  description: string[]; // raw lines between title and first ## section
  sections: SpecSection[];
}

export function parseSpecDoc(raw: string): SpecDoc {
  const lines = raw.split('\n');
  const doc: SpecDoc = {
    fmLines: [], hasFrontmatter: false,
    preTitle: [], titleLine: null, description: [], sections: [],
  };

  let i = 0;
  if (lines[0] === '---') {
    doc.hasFrontmatter = true;
    i = 1;
    while (i < lines.length && lines[i] !== '---') {
      doc.fmLines.push(lines[i]);
      i++;
    }
    i++; // skip closing ---
  }

  // preTitle until '# ' title or '## ' section
  while (i < lines.length && !lines[i].startsWith('## ') &&
         !(lines[i].startsWith('# ') && !lines[i].startsWith('## '))) {
    doc.preTitle.push(lines[i]);
    i++;
  }

  if (i < lines.length && lines[i].startsWith('# ') && !lines[i].startsWith('## ')) {
    doc.titleLine = lines[i];
    i++;
    while (i < lines.length && !lines[i].startsWith('## ')) {
      doc.description.push(lines[i]);
      i++;
    }
  }

  while (i < lines.length) {
    const headingLine = lines[i];
    const name = headingLine.slice(3).trim();
    i++;
    const body: string[] = [];
    while (i < lines.length && !lines[i].startsWith('## ')) {
      body.push(lines[i]);
      i++;
    }
    doc.sections.push({ name, headingLine, body });
  }

  return doc;
}

export function serializeSpecDoc(doc: SpecDoc): string {
  const out: string[] = [];
  if (doc.hasFrontmatter) {
    out.push('---', ...doc.fmLines, '---');
  }
  out.push(...doc.preTitle);
  if (doc.titleLine !== null) {
    out.push(doc.titleLine, ...doc.description);
  }
  for (const s of doc.sections) {
    out.push(s.headingLine, ...s.body);
  }
  return out.join('\n');
}

// ── Frontmatter access ───────────────────────────────────────────────────────

const FM_RE = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/;

export function fmGet(doc: SpecDoc, key: string): string | undefined {
  for (const line of doc.fmLines) {
    const m = line.match(FM_RE);
    if (m && m[1] === key) return m[2].trim();
  }
  return undefined;
}

export function fmGetParsed(doc: SpecDoc, key: string): string | boolean | string[] | undefined {
  const val = fmGet(doc, key);
  if (val === undefined) return undefined;
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (/^\[.*\]$/.test(val)) {
    const inner = val.slice(1, -1).trim();
    return inner ? inner.split(',').map(s => s.trim()).filter(Boolean) : [];
  }
  return val;
}

export function fmSet(doc: SpecDoc, key: string, value: string | boolean | string[]): void {
  const rendered = Array.isArray(value) ? `[${value.join(', ')}]` : String(value);
  const line = `${key}: ${rendered}`;
  for (let i = 0; i < doc.fmLines.length; i++) {
    const m = doc.fmLines[i].match(FM_RE);
    if (m && m[1] === key) {
      doc.fmLines[i] = line;
      return;
    }
  }
  doc.fmLines.push(line);
  doc.hasFrontmatter = true;
}

// ── Section access ───────────────────────────────────────────────────────────

export function getSection(doc: SpecDoc, name: string): SpecSection | undefined {
  return doc.sections.find(s => s.name === name);
}

/** Replace (or append) a named section's body. Body lines get a trailing blank line. */
export function setSection(doc: SpecDoc, name: string, bodyLines: string[]): void {
  const body = ['', ...bodyLines, ''];
  const existing = getSection(doc, name);
  if (existing) {
    existing.body = body;
    return;
  }
  // Trim trailing blank lines on the previous region so spacing stays canonical
  const last = doc.sections[doc.sections.length - 1];
  if (last) {
    while (last.body.length > 1 && last.body[last.body.length - 1] === '') last.body.pop();
    last.body.push('');
  } else if (doc.titleLine !== null) {
    while (doc.description.length > 1 && doc.description[doc.description.length - 1] === '') doc.description.pop();
    doc.description.push('');
  }
  doc.sections.push({ name, headingLine: `## ${name}`, body });
}

export function removeSection(doc: SpecDoc, name: string): void {
  doc.sections = doc.sections.filter(s => s.name !== name);
}

export function getDescription(doc: SpecDoc): string {
  return doc.description.join('\n').trim();
}

export function setDescription(doc: SpecDoc, text: string): void {
  doc.description = ['', text, ''];
}

// ── Structured reads (accept both plain and wiki-link forms) ────────────────

const DEP_RE = /^-\s+(?:\[\[[^\]|]*\|([^\]]+)\]\]|\*\*([^*]+)\*\*)\s+`([^`]+)`(?:\s+[—–-]\s+(.+))?/;
const REF_RE = /^-\s+(?:\[\[[^\]|]*\|([^\]]+)\]\]|\*\*([^*]+)\*\*)\s+`([^`]+)`/;

export function parseDeps(doc: SpecDoc): DepItem[] {
  const out: DepItem[] = [];
  for (const line of getSection(doc, 'Dependencies')?.body ?? []) {
    const m = line.match(DEP_RE);
    if (m) out.push({ feature: (m[1] ?? m[2] ?? '').trim(), file: m[3].trim(), ...(m[4] ? { usage: m[4].trim() } : {}) });
  }
  return out;
}

export function parseRefs(doc: SpecDoc): RefItem[] {
  const out: RefItem[] = [];
  for (const line of getSection(doc, 'Referenced By')?.body ?? []) {
    const m = line.match(REF_RE);
    if (m) out.push({ feature: (m[1] ?? m[2] ?? '').trim(), file: m[3].trim() });
  }
  return out;
}

export function parseIpc(doc: SpecDoc): string[] {
  const out: string[] = [];
  for (const line of getSection(doc, 'IPC Channels')?.body ?? []) {
    const m = line.match(/^-\s+`([^`]+)`/);
    if (m) out.push(m[1]);
  }
  return out;
}

export function parseExternalDeps(doc: SpecDoc): string[] {
  const out: string[] = [];
  for (const line of getSection(doc, 'External Dependencies')?.body ?? []) {
    const m = line.match(/^-\s+`([^`]+)`/);
    if (m) out.push(m[1]);
  }
  return out;
}

export function parseTest(doc: SpecDoc): string | undefined {
  for (const line of getSection(doc, 'Test')?.body ?? []) {
    const m = line.match(/`([^`]+)`/);
    if (m) return m[1];
  }
  return undefined;
}

// ── Canonical formatters (D5: plain form only) ──────────────────────────────

export function formatDeps(items: DepItem[]): string[] {
  if (!items.length) return ['None.'];
  return items.map(d => `- **${d.feature}** \`${d.file}\`${d.usage ? ` — ${d.usage}` : ''}`);
}

export function formatRefs(items: RefItem[]): string[] {
  if (!items.length) return ['None.'];
  return items.map(r => `- **${r.feature}** \`${r.file}\``);
}

export function formatBacktickList(items: string[]): string[] {
  if (!items.length) return ['None.'];
  return items.map(x => `- \`${x}\``);
}

// ── main.spec.md Features tables ────────────────────────────────────────────

export function parseFeaturesTables(doc: SpecDoc): Record<string, MainFeatureRow[]> {
  const section = getSection(doc, 'Features');
  const features: Record<string, MainFeatureRow[]> = {};
  if (!section) return features;

  let currentLayer: string | null = null;
  let headers: string[] = [];
  let inTable = false;

  for (const line of section.body) {
    if (line.startsWith('### ')) {
      currentLayer = line.slice(4).trim();
      features[currentLayer] = [];
      inTable = false;
      headers = [];
      continue;
    }
    if (currentLayer && line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(s => s.trim());
      if (cells.every(c => /^[-:\s]+$/.test(c))) continue;
      if (!inTable) { headers = cells; inTable = true; continue; }
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = (cells[idx] ?? '').replace(/^\[\[(.+)\]\]$/, '$1'); });
      features[currentLayer].push({
        id: row.id ?? '', name: row.name ?? '', file: row.file ?? '',
        spec: row.spec ?? '', ui: row.ui ?? '',
      });
    } else if (line.startsWith('## ')) {
      break;
    }
  }
  return features;
}

export function formatFeaturesTables(
  features: Record<string, MainFeatureRow[]>,
  layerOrder: string[],
): string[] {
  const layers = [
    ...layerOrder.filter(l => l in features),
    ...Object.keys(features).filter(l => !layerOrder.includes(l)).sort(),
  ];
  const out: string[] = [];
  for (const layer of layers) {
    const rows = features[layer];
    if (!rows?.length) continue;
    out.push(`### ${layer}`, '', '| id | name | file | spec | ui |', '|----|------|------|------|----|');
    for (const r of rows) {
      out.push(`| ${r.id} | ${r.name} | ${r.file} | ${r.spec} | ${r.ui} |`);
    }
    out.push('');
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}
