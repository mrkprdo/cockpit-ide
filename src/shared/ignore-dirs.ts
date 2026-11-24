// Directory names that never need watching, walking or indexing: VCS metadata,
// dependency trees, build output and tool caches.
//
// Shared by the main-process file watcher and the renderer workspace walkers
// (Ctrl+P, cross-file search, agent grep, specs reconcile). A Rust `target/`
// or JS `node_modules/` can hold thousands of files; registering a native
// watcher for every one of them (chokidar watches files, not just dirs) is the
// difference between a ~400-file watch set and a ~9k-file one — and the latter
// pegs the main process for minutes on Windows at startup.

export const IGNORED_DIRS: ReadonlySet<string> = new Set([
  // VCS metadata
  '.git', '.hg', '.svn',
  // Dependencies + the app's own local state (sessions/memory/layout writes)
  'node_modules', '.cockpit',
  // Build output
  'target', 'dist', 'build', 'out', 'release', 'coverage',
  // Framework / tool caches
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', '.parcel-cache',
  '.gradle', '.idea', '.worktrees', '.impeccable', '.codegraph',
  // Python
  '__pycache__', '.venv', 'venv', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  // Apple tooling
  'Pods', 'DerivedData',
  // Drive-root system folders — present whenever the "workspace" is a whole
  // volume, and never anything a user edits.
  '$RECYCLE.BIN', 'System Volume Information', 'lost+found',
  // Content-addressed package stores
  '.pnpm-store',
]);
