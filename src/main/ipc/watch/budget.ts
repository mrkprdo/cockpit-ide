// Shared watch-set arithmetic. chokidar registers a handle per entry, so it is
// the backend with a budget — but the counting rules live here so the startup
// scan, the runtime guard and the tests all agree.

/** Largest watch set a per-entry watcher may carry. */
export const WATCH_FILE_LIMIT = 15_000;
export const WATCH_DIR_LIMIT = 2_000;
/** Recursion cap, passed to chokidar and mirrored by the budget scan. */
export const WATCH_MAX_DEPTH = 20;

/**
 * Count what chokidar is watching, from its `getWatched()` map (dir → child
 * names). Every child directory appears in its parent's list *and* as a key of
 * its own — except the watched root, which has no parent entry — so the file
 * count is `entries - dirs + 1`. Exported for tests.
 */
export function watchSetSize(map: Record<string, string[]>): { files: number; dirs: number } {
  const dirs = Object.keys(map).length;
  let entries = 0;
  for (const names of Object.values(map)) entries += names.length;
  return { files: Math.max(0, entries - dirs + (dirs > 0 ? 1 : 0)), dirs };
}
