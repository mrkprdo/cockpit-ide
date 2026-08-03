// Dev-console filter bar — search + minimum log level + a category checkbox
// dropdown (refactor.md §C). Applies to the unified stream: which categories
// show, which console severities qualify, and a text search over message/title.

import type { LogLevel } from './log-capture';
import { logLevelRank } from './log-capture';
import type { UnifiedCategory, UnifiedEntry } from './unified-log';

export interface ConsoleFilter {
  search: string;
  /** Minimum console severity to show ('all' = every console line). */
  level: 'all' | LogLevel;
  /** Enabled stream categories (unchecked categories are hidden). */
  categories: UnifiedCategory[];
}

export const ALL_CATEGORIES: UnifiedCategory[] = ['console', 'ipc', 'health', 'agent', 'specs'];

export const CATEGORY_LABELS: Record<UnifiedCategory, string> = {
  console: 'Console',
  ipc: 'IPC',
  health: 'Health',
  agent: 'Agents',
  specs: 'Specs',
};

export interface FilterBarHandle {
  el: HTMLDivElement;
  getFilter(): ConsoleFilter;
}

const LEVEL_OPTIONS: Array<'all' | LogLevel> = ['all', 'error', 'warn', 'log', 'info', 'debug'];

export function buildFilterBar(onChange: (f: ConsoleFilter) => void): FilterBarHandle {
  const bar = document.createElement('div');
  bar.className = 'dev-console-filter';

  const state: ConsoleFilter = { search: '', level: 'all', categories: [...ALL_CATEGORIES] };

  const input = document.createElement('input');
  input.className = 'dev-console-filter-search';
  input.placeholder = 'Filter log…';
  input.setAttribute('aria-label', 'Filter dev console');
  input.addEventListener('input', () => {
    state.search = input.value.trim();
    onChange({ ...state });
  });

  const levelSelect = document.createElement('select');
  levelSelect.className = 'dev-console-filter-level';
  levelSelect.setAttribute('aria-label', 'Minimum log level');
  for (const opt of LEVEL_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt === 'all' ? 'All levels' : `${opt}+`;
    levelSelect.appendChild(o);
  }
  levelSelect.addEventListener('change', () => {
    state.level = levelSelect.value as ConsoleFilter['level'];
    onChange({ ...state });
  });

  // Category checkbox dropdown
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'dev-console-filter-toggle';
  toggleBtn.type = 'button';

  const panel = document.createElement('div');
  panel.className = 'dev-console-filter-panel';
  panel.style.display = 'none';

  const renderToggleLabel = () => {
    toggleBtn.textContent = `Filters (${state.categories.length}/${ALL_CATEGORIES.length}) ▾`;
  };
  renderToggleLabel();

  const categoryChecks = new Map<UnifiedCategory, HTMLInputElement>();
  for (const cat of ALL_CATEGORIES) {
    const label = document.createElement('label');
    label.className = 'dev-console-filter-option';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.cat = cat;
    const span = document.createElement('span');
    span.textContent = CATEGORY_LABELS[cat];
    label.appendChild(cb);
    label.appendChild(span);
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (!state.categories.includes(cat)) state.categories.push(cat);
      } else {
        state.categories = state.categories.filter(c => c !== cat);
      }
      renderToggleLabel();
      onChange({ ...state });
    });
    categoryChecks.set(cat, cb);
    panel.appendChild(label);
  }

  const closePanel = () => { panel.style.display = 'none'; };
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
  });
  document.addEventListener('click', (e) => {
    if (!bar.contains(e.target as Node)) closePanel();
  });

  const clearBtn = document.createElement('button');
  clearBtn.className = 'dev-console-filter-clear';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', () => {
    input.value = '';
    levelSelect.value = 'all';
    for (const cb of categoryChecks.values()) cb.checked = true;
    state.search = '';
    state.level = 'all';
    state.categories = [...ALL_CATEGORIES];
    renderToggleLabel();
    onChange({ ...state });
  });

  bar.append(input, levelSelect, toggleBtn, panel, clearBtn);

  return {
    el: bar,
    getFilter: () => ({ ...state }),
  };
}

/** Does the current filter keep this unified entry? */
export function filterMatches(filter: ConsoleFilter, e: UnifiedEntry): boolean {
  if (!filter.categories.includes(e.category)) return false;
  if (e.category === 'console' && filter.level !== 'all' && e.level &&
      logLevelRank(e.level) > logLevelRank(filter.level)) return false;
  if (filter.search) {
    const hay = `${e.message} ${e.title} ${e.kind ?? ''}`.toLowerCase();
    if (!hay.includes(filter.search.toLowerCase())) return false;
  }
  return true;
}
