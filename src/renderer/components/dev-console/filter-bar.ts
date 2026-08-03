// Console filter bar — search + level filter for the dev console (refactor.md §C.2).

import type { LogLevel } from './log-capture';
import { logLevelRank } from './log-capture';

export interface ConsoleFilter {
  search: string;
  /** Minimum log level rank (error=0 … debug=4). 0 = show everything. */
  minLevel: number;
}

export interface FilterBarHandle {
  el: HTMLDivElement;
  getFilter(): ConsoleFilter;
  setMinLevel(rank: number): void;
}

const LEVEL_LABELS: { level: LogLevel; rank: number }[] = [
  { level: 'error', rank: 0 },
  { level: 'warn', rank: 1 },
  { level: 'log', rank: 2 },
  { level: 'info', rank: 3 },
  { level: 'debug', rank: 4 },
];

export function buildFilterBar(onChange: (f: ConsoleFilter) => void): FilterBarHandle {
  const bar = document.createElement('div');
  bar.className = 'dev-console-filter';

  const input = document.createElement('input');
  input.className = 'dev-console-filter-search';
  input.placeholder = 'Filter…';
  input.setAttribute('aria-label', 'Filter console');
  input.addEventListener('input', () => onChange({ search: input.value.trim(), minLevel: state.minLevel }));

  const levelWrap = document.createElement('div');
  levelWrap.className = 'dev-console-filter-levels';

  const state = { search: '', minLevel: 0 };

  const buttons = new Map<number, HTMLButtonElement>();
  for (const { level, rank } of LEVEL_LABELS) {
    const btn = document.createElement('button');
    btn.className = 'dev-console-filter-level' + (rank === state.minLevel ? ' is-active' : '');
    btn.textContent = level;
    btn.addEventListener('click', () => {
      state.minLevel = state.minLevel === rank ? 0 : rank;
      for (const [r, b] of buttons) b.classList.toggle('is-active', r === state.minLevel);
      onChange({ search: state.search, minLevel: state.minLevel });
    });
    buttons.set(rank, btn);
    levelWrap.appendChild(btn);
  }

  const clearBtn = document.createElement('button');
  clearBtn.className = 'dev-console-filter-clear';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', () => {
    input.value = '';
    state.search = '';
    state.minLevel = 0;
    for (const [r, b] of buttons) b.classList.toggle('is-active', r === 0);
    onChange({ search: '', minLevel: 0 });
  });

  bar.appendChild(input);
  bar.appendChild(levelWrap);
  bar.appendChild(clearBtn);

  const handle: FilterBarHandle = {
    el: bar,
    getFilter: () => ({ search: state.search, minLevel: state.minLevel }),
    setMinLevel: (rank: number) => {
      state.minLevel = rank;
      for (const [r, b] of buttons) b.classList.toggle('is-active', r === rank);
    },
  };
  return handle;
}

/** A helper to filter log entries by the current console filter. */
export function filterMatches(filter: ConsoleFilter, level: LogLevel, text: string): boolean {
  if (filter.minLevel > 0 && logLevelRank(level) > filter.minLevel) return false;
  if (filter.search && !text.toLowerCase().includes(filter.search.toLowerCase())) return false;
  return true;
}
