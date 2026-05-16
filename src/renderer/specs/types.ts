// SPECGEN runtime — shared domain types (no DOM).

export interface DepItem {
  feature: string;
  file: string;
  usage?: string;
}

export interface RefItem {
  feature: string;
  file: string;
}

export interface FeatureNode {
  id: string;              // kebab-case feature id (spec filename stem)
  name: string;
  layer: string;
  type: string;
  singleton?: boolean;
  specFile: string;        // e.g. canvas-area.spec.md
  sourceFile?: string;     // from file:
  entryPath?: string;      // from entry:
  uiSpecFile?: string;
  parentId?: string;       // UI sub-spec → parent feature id
  exports: string[];
  deps: DepItem[];         // declared Dependencies (may be unresolved)
  refs: RefItem[];         // declared Referenced By
  ipc: string[];
  description: string;
}

export type SpecEdgeKind = 'depends' | 'ui-of';

export interface SpecEdge {
  kind: SpecEdgeKind;
  from: string;            // feature id
  to: string;              // feature id
}

export interface MainFeatureRow {
  id: string;
  name: string;
  file: string;
  spec: string;
  ui: string;
}

export interface MainIndex {
  name: string;
  title: string;
  version: string;
  features: Record<string, MainFeatureRow[]>;  // layer → rows
}

export interface SpecGraph {
  main: MainIndex | null;
  nodes: Map<string, FeatureNode>;
  edges: SpecEdge[];
  byFile: Map<string, string>;   // source path (repo-relative) → feature id
  byBasename: Map<string, string>; // source basename → feature id (fallback resolution)
}

export type Severity = 'error' | 'warn' | 'info';

export interface ValidationIssue {
  id: string;              // rule id
  severity: Severity;
  featureId?: string;
  message: string;
  fixHint?: string;
}

export interface ValidationReport {
  ok: boolean;             // no error-severity issues
  counts: Record<Severity, number>;
  issues: ValidationIssue[];
  coverage: {
    sourceFiles: number;
    specFiles: number;
    linked: number;
    unspecced: string[];
  };
}

// Split evidence sets: sourceFiles = TS/JS features reconcile manages;
// existingFiles = everything on disk under the roots (html/css/config too) —
// existence rules must use the latter or non-TS specs false-positive.
export interface SourceFacts {
  relativePath: string;
  exports: string[];
  importPaths: string[];     // resolved repo-relative
  ipcChannels: string[];
  externalPackages: string[];
  testPath?: string;
  singleton: boolean;
  suggestedType: string;
  suggestedLayer: string;
}

export type ReconcileMode = 'report' | 'structural';

export interface ReconcileChangelog {
  mode: ReconcileMode;
  created: string[];
  updated: string[];
  unchanged: string[];
  failed: Array<{ path: string; error: string }>;
}

// Minimal FS surface the runtime needs — matches window.electronAPI.fs.
export interface SpecsFs {
  readDir(dirPath: string): Promise<Array<{ name: string; isDirectory: boolean }> | null>;
  readFile(filePath: string): Promise<string | null>;
  writeFile(filePath: string, content: string): Promise<boolean>;
}
