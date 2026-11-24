// Native recursive watcher backend: ONE OS watch for the whole tree
// (ReadDirectoryChangesW on Windows, FSEvents on macOS, inotify on Linux).
//
// This is the difference between a large workspace being slow and being fatal.
// chokidar implements recursion itself and ends up calling `fs.watch` once per
// file and per directory; a drive root became ~78k handles inside the main
// process and Windows killed the window as "not responding". A recursive watch
// is a single handle no matter how many entries the tree holds.

import * as fs from 'fs';
import * as path from 'path';
import { logMain } from '../logging';
import type { WatchSession, WatchSink } from './types';

/**
 * Delivered events per second before the backend stands down. A drive root or a
 * build tree can churn fast enough that the explorer (which reloads on any
 * event) never settles; three consecutive seconds above this is not editing.
 */
export const NATIVE_EVENT_RATE_LIMIT = 2_000;
const NATIVE_RATE_STRIKES = 3;

/**
 * Throws when the platform cannot watch recursively (Node < 20 on Linux/macOS
 * reports ERR_FEATURE_UNAVAILABLE_ON_PLATFORM); the caller falls back to
 * chokidar and keeps its budget.
 */
export function startNativeWatch(
  dir: string,
  isIgnored: (p: string) => boolean,
  sink: WatchSink,
): WatchSession {
  const watcher = fs.watch(dir, { recursive: true, persistent: true });

  watcher.on('error', (err) => sink.error(err));

  let windowStart = Date.now();
  let windowCount = 0;
  let strikes = 0;
  let stopped = false;

  /** Count a delivered event; stand down when the rate stays unsurvivable. */
  const noteRate = (): void => {
    if (stopped) return;
    windowCount++;
    const now = Date.now();
    if (now - windowStart < 1_000) return;
    strikes = windowCount > NATIVE_EVENT_RATE_LIMIT ? strikes + 1 : 0;
    windowStart = now;
    windowCount = 0;
    if (strikes >= NATIVE_RATE_STRIKES) {
      stopped = true;
      watcher.close();
      sink.flood?.();
    }
  };

  watcher.on('change', (eventType, filename) => {
    if (stopped) return;
    if (!filename) {
      // Windows omits the name when its change buffer overflows. There is no
      // path to report, and re-walking the tree is worse than the next event.
      logMain('warn', 'file', 'native watcher: event without a path (buffer overflow?)');
      return;
    }
    const name = filename.toString();
    const full = path.isAbsolute(name) ? name : path.join(dir, name);
    if (isIgnored(full)) return;

    if (eventType === 'change') {
      noteRate();
      sink.changed(full);      // always an existing file
      return;
    }
    // 'rename' is add / remove / move, and may name a directory. Directories
    // had no consumer under chokidar either (addDir was a no-op), so drop them
    // after one cheap stat instead of triggering a tree reload per mkdir.
    fs.promises.stat(full).then(
      (st) => { if (!st.isDirectory()) { noteRate(); sink.changed(full); } },
      () => { noteRate(); sink.changed(full); },   // gone: a delete must be reported
    );
  });

  return {
    close: async () => { watcher.close(); },
    size: () => null,   // one OS handle: nothing per-entry to count
  };
}
