// chokidar backend: the original per-entry watcher, kept as a selectable option
// (and as the fallback where a recursive OS watch is unavailable). It registers
// a watch handle per file and per directory, so it is the backend that needs
// the startup budget and the runtime growth guard.

import { WATCH_MAX_DEPTH, watchSetSize } from './budget';
import type { WatchSession, WatchSink } from './types';

export function startChokidarWatch(
  dir: string,
  isIgnored: (p: string) => boolean,
  sink: WatchSink,
): WatchSession {
  const chokidar = require('chokidar');
  const watcher = chokidar.watch(dir, {
    ignored: isIgnored,
    persistent: true,
    ignoreInitial: true,
    // Without a listener, a failed `fs.watch` (EBUSY on a locked file, EMFILE
    // once the handle table fills) surfaces as an unhandledRejection and each
    // one does a synchronous crash.log write from the main process.
    ignorePermissionErrors: true,
    depth: WATCH_MAX_DEPTH,
  });

  watcher.on('error', (err: unknown) => sink.error(err));
  watcher.on('add', (p: string) => sink.changed(p));
  watcher.on('change', (p: string) => sink.changed(p));
  watcher.on('unlink', (p: string) => sink.changed(p));
  watcher.on('ready', () => sink.ready?.());

  return {
    close: async () => { await watcher.close(); },
    size: () => watchSetSize(watcher.getWatched?.() ?? {}),
  };
}
