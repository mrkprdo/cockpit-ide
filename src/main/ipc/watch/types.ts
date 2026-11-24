// The contract between the watcher facade (file.ts) and the two backends.
//
// Both backends only ever report "this path changed"; add / change / unlink are
// collapsed on purpose. Every renderer consumer of `file:changed` reacts the
// same way to all three (re-read the file, reload the tree, refresh git), and
// the facade has always deduped them into one message per path anyway.

export type WatchBackendName = 'native' | 'chokidar';

/** A live watch over one workspace root. */
export interface WatchSession {
  /** Stop the backend and release every OS handle. */
  close(): Promise<void>;
  /**
   * Current entry counts for the runtime budget, or `null` when the backend
   * keeps no per-entry state (the native watcher holds one handle for the
   * whole tree, so there is nothing to count).
   */
  size(): { files: number; dirs: number } | null;
}

/** What a backend reports back to the facade. */
export interface WatchSink {
  /** Some path under the root was added, changed or removed. */
  changed(p: string): void;
  error(err: unknown): void;
  /** The backend finished its initial crawl (chokidar only). */
  ready?(): void;
  /**
   * The tree changes faster than a UI can follow; the backend has already
   * stopped. Used by the native watcher's rate guard on chatty volumes.
   */
  flood?(): void;
}
