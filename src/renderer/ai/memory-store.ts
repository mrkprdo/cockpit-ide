export type MemoryScope = 'global' | 'workspace';

export interface MemoryEntry {
  id: string;
  key: string;
  tags: string[];
  body: string;
  updatedAt: string;
}

export interface MemoryFile {
  version: number;
  updatedAt: string;
  entries: MemoryEntry[];
}

export function emptyMemory(): MemoryFile {
  return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
}

function normalizeEntry(raw: any): MemoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const key = typeof raw.key === 'string' ? raw.key.trim() : '';
  if (!key) return null;
  const body = typeof raw.body === 'string' ? raw.body : '';
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t: unknown) => typeof t === 'string').map((t: string) => t.trim()).filter(Boolean)
    : [];
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    key,
    tags,
    body,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

export function normalizeMemory(raw: any): MemoryFile {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) return emptyMemory();
  const entries: MemoryEntry[] = [];
  for (const item of raw.entries) {
    const e = normalizeEntry(item);
    if (e) entries.push(e);
  }
  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    entries,
  };
}

function formatIndexLine(entries: MemoryEntry[]): string {
  if (entries.length === 0) return '(empty)';
  return entries
    .map(e => {
      const tagStr = e.tags.length ? ` [${e.tags.join(', ')}]` : '';
      return `${e.key}${tagStr}`;
    })
    .join(', ');
}

/** Renderer-side cache of global + workspace agent memory. Bodies stay out of the system prompt. */
export class MemoryStore {
  private globalMem: MemoryFile = emptyMemory();
  private workspaceMem: MemoryFile = emptyMemory();
  private wsPath: string | null = null;

  get global(): MemoryFile {
    return this.globalMem;
  }

  get workspace(): MemoryFile {
    return this.workspaceMem;
  }

  get workspacePath(): string | null {
    return this.wsPath;
  }

  async loadGlobal(): Promise<void> {
    try {
      const data = await window.electronAPI?.memory.loadGlobal();
      this.globalMem = normalizeMemory(data);
    } catch {
      this.globalMem = emptyMemory();
    }
  }

  async loadWorkspace(wsPath: string): Promise<void> {
    this.wsPath = wsPath || null;
    if (!wsPath) {
      this.workspaceMem = emptyMemory();
      return;
    }
    try {
      const data = await window.electronAPI?.memory.loadWorkspace(wsPath);
      this.workspaceMem = normalizeMemory(data);
    } catch {
      this.workspaceMem = emptyMemory();
    }
  }

  clearWorkspace(): void {
    this.wsPath = null;
    this.workspaceMem = emptyMemory();
  }

  /** Compact key/tag index for system prompt injection — never includes bodies. */
  buildIndexPrompt(): string {
    const g = formatIndexLine(this.globalMem.entries);
    const w = this.wsPath ? formatIndexLine(this.workspaceMem.entries) : '(no workspace)';
    const empty =
      this.globalMem.entries.length === 0 &&
      (!this.wsPath || this.workspaceMem.entries.length === 0);
    if (empty) {
      return [
        '## Memory',
        'No memory yet. Use memory_set when the user states lasting prefs or project facts.',
        'Scopes: global (all workspaces) | workspace (current project). Prefer memory_search / memory_get over guessing.',
      ].join('\n');
    }
    return [
      '## Memory',
      `Global: ${g}`,
      `Workspace: ${w}`,
      'Use memory_search / memory_get before assuming preferences. Use memory_set for durable facts only (not chat fluff).',
    ].join('\n');
  }

  private fileFor(scope: MemoryScope): MemoryFile {
    return scope === 'global' ? this.globalMem : this.workspaceMem;
  }

  list(scope?: MemoryScope): string {
    const scopes: MemoryScope[] = scope ? [scope] : ['global', 'workspace'];
    const lines: string[] = [];
    for (const s of scopes) {
      if (s === 'workspace' && !this.wsPath) {
        lines.push('workspace: (no workspace loaded)');
        continue;
      }
      const file = this.fileFor(s);
      if (file.entries.length === 0) {
        lines.push(`${s}: (empty)`);
        continue;
      }
      lines.push(`${s}:`);
      for (const e of file.entries) {
        const tags = e.tags.length ? ` tags=[${e.tags.join(', ')}]` : '';
        lines.push(`  - ${e.key} (id=${e.id})${tags} updated=${e.updatedAt}`);
      }
    }
    return lines.join('\n');
  }

  get(scope: MemoryScope, keyOrId: string): string {
    if (scope === 'workspace' && !this.wsPath) return 'No workspace loaded';
    const file = this.fileFor(scope);
    const needle = keyOrId.trim();
    const entry = file.entries.find(e => e.key === needle || e.id === needle);
    if (!entry) return `Not found in ${scope}: ${needle}`;
    const tags = entry.tags.length ? entry.tags.join(', ') : '(none)';
    return [
      `scope: ${scope}`,
      `key: ${entry.key}`,
      `id: ${entry.id}`,
      `tags: ${tags}`,
      `updatedAt: ${entry.updatedAt}`,
      '',
      entry.body,
    ].join('\n');
  }

  search(query: string, scope?: MemoryScope): string {
    const q = query.trim().toLowerCase();
    if (!q) return 'Empty query';
    const scopes: MemoryScope[] = scope ? [scope] : ['global', 'workspace'];
    const hits: { scope: MemoryScope; entry: MemoryEntry; score: number }[] = [];
    for (const s of scopes) {
      if (s === 'workspace' && !this.wsPath) continue;
      for (const e of this.fileFor(s).entries) {
        let score = 0;
        if (e.key.toLowerCase() === q) score += 100;
        else if (e.key.toLowerCase().includes(q)) score += 50;
        for (const t of e.tags) {
          if (t.toLowerCase() === q) score += 40;
          else if (t.toLowerCase().includes(q)) score += 20;
        }
        if (e.body.toLowerCase().includes(q)) score += 10;
        if (score > 0) hits.push({ scope: s, entry: e, score });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    if (hits.length === 0) return `No matches for: ${query}`;
    return hits
      .slice(0, 20)
      .map(({ scope: s, entry: e, score }) => {
        const tags = e.tags.length ? ` [${e.tags.join(', ')}]` : '';
        const preview = e.body.length > 120 ? e.body.slice(0, 120) + '…' : e.body;
        return `${s}/${e.key}${tags} (score=${score})\n  ${preview}`;
      })
      .join('\n\n');
  }

  async set(scope: MemoryScope, key: string, body: string, tags?: string[]): Promise<string> {
    const k = key.trim();
    if (!k) return 'key is required';
    if (scope === 'workspace' && !this.wsPath) return 'No workspace loaded';

    const file = this.fileFor(scope);
    const now = new Date().toISOString();
    const existing = file.entries.find(e => e.key === k);
    const nextTags = tags
      ? tags.map(t => t.trim()).filter(Boolean)
      : existing?.tags ?? [];

    if (existing) {
      existing.body = body;
      existing.tags = nextTags;
      existing.updatedAt = now;
    } else {
      file.entries.push({
        id: crypto.randomUUID(),
        key: k,
        tags: nextTags,
        body,
        updatedAt: now,
      });
    }
    file.updatedAt = now;
    const ok = await this.persist(scope);
    if (!ok) return `Failed to save ${scope} memory`;
    return existing ? `Updated ${scope}/${k}` : `Created ${scope}/${k}`;
  }

  async delete(scope: MemoryScope, keyOrId: string): Promise<string> {
    if (scope === 'workspace' && !this.wsPath) return 'No workspace loaded';
    const file = this.fileFor(scope);
    const needle = keyOrId.trim();
    const idx = file.entries.findIndex(e => e.key === needle || e.id === needle);
    if (idx === -1) return `Not found in ${scope}: ${needle}`;
    const removed = file.entries.splice(idx, 1)[0];
    file.updatedAt = new Date().toISOString();
    const ok = await this.persist(scope);
    if (!ok) return `Failed to save ${scope} memory after delete`;
    return `Deleted ${scope}/${removed.key}`;
  }

  private async persist(scope: MemoryScope): Promise<boolean> {
    const api = window.electronAPI?.memory;
    if (!api) return false;
    try {
      if (scope === 'global') {
        return !!(await api.saveGlobal(this.globalMem));
      }
      if (!this.wsPath) return false;
      return !!(await api.saveWorkspace(this.wsPath, this.workspaceMem));
    } catch {
      return false;
    }
  }
}

export const memoryStore = new MemoryStore();
