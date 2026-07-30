// SpecsMap node search: the slide-down search bar, match filtering, and
// prev/next navigation. Owns its own DOM subtree (appended into the
// container passed at construction) and all search state.

import type { SpecNode } from '../../specs/layout';

export interface SearchHost {
  getNodes(): SpecNode[];
  getSpecData(id: string): Record<string, unknown> | undefined;
  getNodeEls(): Map<string, HTMLDivElement>;
  selectNode(id: string, fromSearch: boolean): void;
}

export class SearchController {
  private el: HTMLDivElement;
  private input: HTMLInputElement;
  private countEl: HTMLSpanElement;
  private query = '';
  private results: string[] = [];
  private index = -1;
  private prevNodeId: string | null = null;
  private nameTextOrigins = new Map<string, string>();
  private _open = false;

  constructor(
    container: HTMLElement,
    searchIconSvg: string,
    private host: SearchHost,
    private onOpenChange: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'sm-search-bar';
    this.el.style.cssText =
      'position:absolute;top:0;left:0;right:0;height:34px;z-index:25;' +
      'background:var(--panel);border-bottom:1px dashed var(--border);' +
      'display:flex;align-items:center;gap:6px;padding:0 10px;' +
      'transform:translateY(-100%);opacity:0;pointer-events:none;' +
      'transition:transform 0.15s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease';

    const searchIcon = document.createElement('span');
    searchIcon.innerHTML = searchIconSvg;
    searchIcon.style.cssText = 'flex-shrink:0;opacity:0.5;line-height:0;display:flex';
    this.el.appendChild(searchIcon);

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Type to search nodes…';
    this.input.style.cssText =
      'flex:1;min-width:0;background:var(--bg);border:1px solid var(--border);border-radius:5px;' +
      'padding:3px 8px;font-family:"Space Mono","Courier New",monospace;font-size:12px;' +
      'color:var(--primary);outline:none';
    this.input.setAttribute('autocomplete', 'off');
    this.input.setAttribute('spellcheck', 'false');
    this.el.appendChild(this.input);

    this.input.addEventListener('input', () => this.performSearch(this.input.value));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) this.goToPrev();
        else this.goToNext();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    this.input.addEventListener('blur', (e) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (related && this.el.contains(related)) return;
      setTimeout(() => {
        if (this._open) this.close();
      }, 150);
    });

    this.countEl = document.createElement('span');
    this.countEl.style.cssText = 'font-size:10px;color:var(--tertiary);flex-shrink:0;min-width:28px;text-align:right';
    this.countEl.textContent = '0';
    this.el.appendChild(this.countEl);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText =
      'background:none;border:none;cursor:pointer;color:var(--tertiary);font-size:16px;' +
      'line-height:1;padding:0 2px;font-family:inherit;flex-shrink:0';
    closeBtn.setAttribute('aria-label', 'Close search');
    closeBtn.addEventListener('click', () => this.close());
    this.el.appendChild(closeBtn);

    container.appendChild(this.el);
  }

  get isOpen(): boolean { return this._open; }

  toggle(): void {
    if (this._open) this.close();
    else this.open();
  }

  open(): void {
    if (this._open) return;
    this._open = true;
    this.results = [];
    this.index = -1;
    this.query = '';
    this.prevNodeId = null;
    this.input.value = '';
    this.countEl.textContent = '0';

    this.el.style.transform = 'translateY(0)';
    this.el.style.opacity = '1';
    this.el.style.pointerEvents = 'auto';

    this.onOpenChange();
    this.input.focus();
  }

  close(): void {
    if (!this._open) return;
    this._open = false;

    this.el.style.transform = 'translateY(-100%)';
    this.el.style.opacity = '0';
    this.el.style.pointerEvents = 'none';

    this.query = '';
    this.results = [];
    this.index = -1;
    this.prevNodeId = null;

    for (const [, el] of this.host.getNodeEls()) el.style.opacity = '';

    this.restoreNodeNames();
    this.nameTextOrigins.clear();

    this.onOpenChange();
  }

  private performSearch(query: string): void {
    const q = query.trim();
    this.query = q;

    if (!q) {
      for (const [, el] of this.host.getNodeEls()) el.style.opacity = '';
      this.restoreNodeNames();
      this.results = [];
      this.index = -1;
      this.prevNodeId = null;
      this.countEl.textContent = '0';
      return;
    }

    const qLower = q.toLowerCase();
    const matches: string[] = [];

    for (const node of this.host.getNodes()) {
      const raw = this.host.getSpecData(node.id);
      let found =
        node.name.toLowerCase().includes(qLower) ||
        node.specFile.toLowerCase().includes(qLower) ||
        node.sourceFile.toLowerCase().includes(qLower) ||
        node.layer.toLowerCase().includes(qLower);

      if (!found && raw) {
        if (typeof raw.description === 'string' && raw.description.toLowerCase().includes(qLower)) found = true;
        if (Array.isArray(raw.dependencies)) {
          for (const d of raw.dependencies) {
            if ((d.feature && String(d.feature).toLowerCase().includes(qLower)) ||
                (d.file && String(d.file).toLowerCase().includes(qLower)) ||
                (d.usage && String(d.usage).toLowerCase().includes(qLower))) {
              found = true; break;
            }
          }
        }
        if (Array.isArray(raw.referenced_by)) {
          for (const r of raw.referenced_by) {
            if ((r.feature && String(r.feature).toLowerCase().includes(qLower)) ||
                (r.file && String(r.file).toLowerCase().includes(qLower))) {
              found = true; break;
            }
          }
        }
        if (Array.isArray(raw.ipc)) {
          for (const ch of raw.ipc) {
            if (String(ch).toLowerCase().includes(qLower)) { found = true; break; }
          }
        }
      }

      if (found) matches.push(node.id);
    }

    this.results = matches;
    this.countEl.textContent = String(matches.length);

    for (const [nid, el] of this.host.getNodeEls()) {
      el.style.opacity = matches.includes(nid) ? '1' : '0.14';
    }

    this.restoreNodeNames();

    if (matches.length > 0) {
      this.index = 0;
      this.host.selectNode(matches[0], true);
    } else {
      this.index = -1;
      this.prevNodeId = null;
    }
  }

  private goToNext(): void {
    if (this.results.length === 0) return;
    this.index = (this.index + 1) % this.results.length;
    this.host.selectNode(this.results[this.index], true);
    this.input.focus();
  }

  private goToPrev(): void {
    if (this.results.length === 0) return;
    this.index = (this.index - 1 + this.results.length) % this.results.length;
    this.host.selectNode(this.results[this.index], true);
    this.input.focus();
  }

  private highlightInNode(nodeId: string, query: string): void {
    const el = this.host.getNodeEls().get(nodeId);
    if (!el) return;
    const nameEl = el.querySelector('.sm-name') as HTMLElement | null;
    if (!nameEl) return;

    if (!this.nameTextOrigins.has(nodeId)) {
      this.nameTextOrigins.set(nodeId, nameEl.textContent || '');
    }

    const text = this.nameTextOrigins.get(nodeId)!;
    if (!query || !text) return;

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const html = text.replace(regex, '<span class="sm-search-mark">$1</span>');
    nameEl.innerHTML = html;
  }

  private restoreNodeNames(): void {
    const nodeEls = this.host.getNodeEls();
    for (const [nodeId, original] of this.nameTextOrigins) {
      const el = nodeEls.get(nodeId);
      if (!el) continue;
      const nameEl = el.querySelector('.sm-name') as HTMLElement | null;
      if (nameEl) nameEl.textContent = original;
    }
    this.nameTextOrigins.clear();
  }

  /** Call after any node selection so the active search match stays highlighted in its name. */
  onNodeSelected(id: string): void {
    if (this._open && this.query) {
      this.restoreNodeNames();
      this.highlightInNode(id, this.query);
    }
  }
}
