# SpecsMap Plan — Living Architecture Graph

**Status:** Implemented (P0–P7 landed 2026-07-28; runtime in `src/renderer/specs/`, tools `specs_*`)  
**Scope:** Design and phased roadmap for a robust SpecsMap  
**Related:** `SPECGEN.md`, `src/specs/specsmap-plugin.spec.md`, `src/renderer/components/SpecsMapPlugin.ts`  
**Date:** 2026-07-28  

---

## 1. Purpose

SpecsMap is Cockpit IDE’s **architecture system**: a SPECGEN-native feature graph that humans explore as a spatial map and agents query as structured context.

This plan defines how to evolve SpecsMap from a monolithic visual plugin with fragile regenerate into a **clean-room, combined derivative**:

| Keep (SpecsMap DNA) | Add (problem-space outcomes) |
|---------------------|------------------------------|
| Feature contracts, layers, UI sub-specs | Always-honest structural edges |
| Human visual map on the canvas | Agent-grade query without file thrash |
| Specs-first change protocol | Freshness and drift awareness |
| Markdown corpus as source of truth | Validated, queryable graph runtime |
| Design + audit + test workflows | Merge-safe reconcile (structure ≠ prose) |

**Not a clone** of any external code-intelligence product. **Not** an embed of a third-party graph engine. Inspiration is limited to *outcomes* (agents stop thrashing; the map stays trustworthy). Formats, node model, tools, storage, and code remain original Cockpit/SPECGEN work.

---

## 2. North star

> **SpecsMap is Cockpit’s clean-room architecture system: a SPECGEN-native feature graph that humans see as a map and agents query as context — contracts written by people, structure kept honest by reconcile, quality proven by validation — without copying any external code-intelligence stack.**

### 2.1 One-sentence product definition

**Living architecture graph** — nodes are SPECGEN features; edges are declared and verified relationships; prose is the contract; structure is continuously reconciled with the source tree; one corpus serves the canvas card and the agent.

### 2.2 Success criteria

| Metric | Today (approx.) | Target |
|--------|-----------------|--------|
| Round-trip existing Cockpit specs | Untested / risky | 100% preserve contract sections |
| `referenced_by` closed after sync | Uneven / empty on regen | 0 asymmetric edges after reconcile |
| Agent explore usefulness | Thin match + short MD | Enough context to skip 2–3 blind `read_file` calls |
| Prose loss on regen | High risk (full rewrite) | Impossible in structural mode |
| Stale graph after spec edit | Until manual refresh | Auto reload ≤ ~1s |
| Validation signal | Spec-count badge | Actionable multi-rule report |
| Plugin responsibility | Parse + graph + UI + regen | UI shell + wiring only |

### 2.3 Non-goals (explicit)

- Symbol-level call graphs as the primary model  
- Polyglot AST kernel / foreign indexer embed  
- SQLite (or other) replacement of `*.spec.md` as source of truth  
- MCP server product surface  
- Framework route tables, cross-language bridge resolution  
- “Affected unit tests via callgraph” as a v1 deliverable  
- Compatible IDs, tool names, or on-disk layouts from third-party tools  

Multi-language structural facts and deeper extractors may appear later **as Cockpit-owned features**, still at feature grain, still SPECGEN-native.

---

## 3. Clean-room policy

### 3.1 Do

- Invent Cockpit tool names and response shapes  
- Keep `.spec.md` + `main.spec.md` as the canonical store  
- Feature-level nodes + contract sections  
- Original parser, graph, validate, reconcile modules  
- Learn that freshness, merge-safety, and agent context density matter  
- Document design in SPECGEN / Cockpit voice  

### 3.2 Don’t

- Copy third-party tool names, explore payloads, or CLI surfaces  
- Adopt foreign project index directories or DB schemas as the model  
- Port resolver/kernel/watch pipelines from other codebases  
- Claim “compatible with X” or share identity schemes  
- Treat this plan as a license to paste external source  

If both codebases were grepped side by side, reviewers should see **different architecture** solving a related class of problem for an IDE that already owns specs.

---

## 4. Problem statement (current state)

### 4.1 What works

- Layered interactive graph (foundation → plugin), pan/zoom, search, cycles, isolate  
- SPECGEN markdown corpus with real hand-authored contracts in Cockpit  
- Detail panel, multi-collection tabs, SPECGEN integrity hash on bootstrap  
- Agent hooks: `explore_specs_map`, `refresh_specsmap`, `regenerate_specsmap`  
- Specs-first protocol in agent prompts and `AGENTS.md`  

### 4.2 What is fragile

| Issue | Why it hurts |
|-------|----------------|
| ~3k-line monolith (`SpecsMapPlugin`) | UI, parse, layout, regen, and agent API entangled |
| Full-file regenerate | Overwrites prose with stub descriptions; empty `referenced_by` |
| Regex-only structural extract | Incomplete edges; Cockpit-hardcoded `classifyFile` paths |
| Snapshot as silent authority | Cache can diverge; weak invalidation |
| Weak explore | Substring match; no multi-hop; no full sections; 600ms×N animation for agents |
| Validation = counts | No edge/drift/stub/orphan rules |
| Manual freshness | Spec edits and source drift invisible until refresh |
| Dual truth | AI prompt path vs regen path produce different quality without shared merge rules |

### 4.3 Design tension (hold it; do not collapse it)

| Pull A | Pull B | Resolution |
|--------|--------|------------|
| Rich human prose | Accurate live edges | Field ownership (contract vs structural) |
| Visual map | Agent token budget | Shared engine, different presenters |
| Intentional architecture | Code as evidence | Validate + reconcile; never auto-author meaning |
| SPECGEN as durable standard | Fast project bootstrap | Skeletons OK; stub descriptions flagged |

External pure-indexers resolve the tension by ignoring contracts.  
Legacy SpecsMap resolved it by under-weighting live structure.  
**This plan keeps both, with explicit authority rules.**

---

## 5. Target architecture

### 5.1 Three layers

```
┌─────────────────────────────────────────────────────────┐
│  L3  Surfaces                                           │
│  · Graph UI (SpecsMap card)                             │
│  · Agent tools (explore / validate / reconcile / reload)│
│  · Empty-state bootstrap (SPECGEN prompt copy)          │
└──────────────────────▲──────────────────────────────────┘
                       │ queries + commands
┌──────────────────────┴──────────────────────────────────┐
│  L2  Spec Graph Runtime                                 │
│  · Load/parse MD → in-memory graph                      │
│  · Validate → report                                    │
│  · Query (search, neighbors, feature-impact)            │
│  · Reconcile (structural merge)                         │
│  · Snapshot + staleness                                 │
└──────────────────────▲──────────────────────────────────┘
                       │ authoritative artifacts
┌──────────────────────┴──────────────────────────────────┐
│  L1  Spec Corpus                                        │
│  · src/specs/*.spec.md, *-ui.spec.md, main.spec.md      │
│  · SPECGEN.md (format + methodology)                    │
│  · Hand-authored prose is sacred                        │
│  · Structural fields may be machine-maintained          │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Data flow

```
  human / agent prose edit              structural reconcile
            │                                    │
            ▼                                    ▼
      *.spec.md  ◄──── merge (R1) ────  source fact extractor
            │
            ▼
       load + parse
            │
            ▼
        SpecGraph ──► validate ──► ValidationReport
            │
     ┌──────┴──────┐
     ▼             ▼
  Graph UI     Agent tools
```

### 5.3 Module map (clean-room layout)

Proposed ownership (paths indicative; final placement during implementation):

```
src/renderer/specs/          # pure logic preferred here; heavy IO may move to main later
  types.ts                   # FeatureNode, edges, reports, snapshot v2
  format.ts                  # parse / serialize SPECGEN MD (round-trip safe)
  graph.ts                   # build, layout inputs, search, neighbors, impact, cycles
  validate.ts                # rules → ValidationReport
  reconcile.ts               # source facts → structural merge + changelog
  extract-ts.ts              # TS/JS source facts (Cockpit-owned heuristics → later TS API)
  snapshot.ts                # corpus hash, load/save cache

src/renderer/components/
  SpecsMapPlugin.ts          # DOM, pan/zoom, panel, toolbar, wire-up only
```

**Rule:** no DOM in L2. L2 is unit-testable without jsdom where possible.

### 5.4 Process boundary (open, default recommendation)

| Concern | Default | Rationale |
|---------|---------|-----------|
| Parse / graph / validate / query | Renderer (or shared module bundled there) | Same process as UI; specs dirs are small |
| Walk + read many source files (reconcile) | Prefer **main** via IPC later | CPU/FS isolation; matches other workspace ops |
| File watch | Existing workspace watcher in main | Already debounced; notify renderer |

v1 may keep reconcile in renderer for speed of delivery; plan migration seam in IPC types.

---

## 6. Hard design rules

### R1 — Two field classes

| Class | Examples | Who writes |
|-------|----------|------------|
| **Structural** | `file`, `entry`, `exports`, Dependencies, Referenced By, detected IPC list, external deps, test path, main Features table rows | Reconciler / bootstrap skeleton |
| **Contract** | description, Interface, State, Lifecycle prose, UI DOM/Interactions/States, main Stack/Architecture | Human or agent only — **never** structural reconcile |

Unknown `##` sections are **contract-adjacent**: preserve opaquely on any rewrite.

### R2 — Authority order

1. On-disk `*.spec.md` is canonical  
2. In-memory `SpecGraph` is a projection  
3. Snapshot is a **cache only** (versioned, hash-invalidated)  
4. Source tree is **evidence** for structure and drift — not a second corpus  

### R3 — Feature grain

- Node = SPECGEN feature (≈ one primary source file / entry), not symbol  
- “Impact” = transitive feature depends ∪ referenced_by at depth N  
- Symbol/call granularity is out of scope unless a future epic redefines product grain  

### R4 — Agent path ≠ human path

| | Human | Agent |
|--|-------|-------|
| Explore | Optional animate, select, panel | Instant; dense markdown; no sleep loops |
| Reconcile | Button + progress + changelog UI | Structured changelog + validation summary |
| Validation | Badge + drawer | Full report MD/JSON |

### R5 — Drift is first-class

Specs can lag code; code can lag intentional specs. Surface uncertainty. Never silently prefer one side for **contract** fields.

### R6 — Reconcile modes

| Mode | Behavior |
|------|----------|
| `report` | Compute proposed structural diff; write nothing |
| `structural` | Patch structural fields only; create skeletons if configured |
| `full` | Dangerous; explicit confirm only; still must not drop unknown sections; prefer refusing to clobber non-stub descriptions |

Default for tools and UI: `structural` or `report` (product choice in P0 — see §14).

---

## 7. Domain model

### 7.1 Feature node

```ts
interface FeatureNode {
  id: string;              // kebab-case feature id (main table / filename stem)
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
  deps: string[];          // feature ids or unresolved keys
  // projection only:
  issues?: ValidationIssue[];
  drift?: DriftFlag[];
}
```

### 7.2 Edge kinds

| Kind | Meaning |
|------|---------|
| `depends` | A lists B in Dependencies (resolved) |
| `ui-of` | UI sub-spec node → parent feature |
| `ipc-shares` | Optional derived: same channel string in two features |
| `tests` | Optional anchor feature → test path (may not be a node) |

### 7.3 Graph runtime API (conceptual)

```ts
interface SpecGraph {
  main: MainIndex;
  nodes: Map<string, FeatureNode>;
  edges: SpecEdge[];
  byFile: Map<string, string>;     // source path → feature id
}

// pure functions
buildGraph(main, specs): SpecGraph
search(graph, query): FeatureNode[]
neighbors(graph, id, { direction, depth }): FeatureNode[]
impact(graph, id, depth): { upstream, downstream }
findCycles(graph): string[][]
contextMarkdown(graph, id, sections): string
```

### 7.4 Source facts (extractor output — not stored as corpus)

```ts
interface SourceFacts {
  relativePath: string;
  exports: string[];
  importPaths: string[];     // resolved repo-relative
  ipcChannels: string[];     // heuristic
  externalPackages: string[];
  testPath?: string;
  // classification hints only — existing spec layer wins when present
  suggestedType?: string;
  suggestedLayer?: string;
}
```

---

## 8. Format robustness (L1)

### 8.1 Parse / serialize requirements

- YAML frontmatter + known `##` sections per SPECGEN  
- **Unknown sections preserved** byte-meaningfully (or as opaque blocks) on serialize  
- Canonical on-disk link form decided once (wiki-link `[[spec]]` vs plain path) and documented in SPECGEN  
- Round-trip test: every file under `src/specs/**/*.spec.md`  

### 8.2 main.spec.md ownership

| Section | Owner |
|---------|--------|
| Frontmatter identity, `#` blurb, Stack, Architecture | Human / agent |
| Features tables | Reconciler may rewrite rows; preserve layer set policy |
| IPC Channels catalog | Reconciler may refresh from feature specs; optional |
| Keyboard Shortcuts, Test Coverage | Human / agent unless later automated |

### 8.3 Snapshot v2 (cache only)

```json
{
  "v": 2,
  "specgenVersion": "…",
  "collectionId": "src/specs",
  "corpusHash": "sha256 over sorted path+content of all specs in collection",
  "builtAt": "ISO-8601",
  "nodes": [ /* layout-ready projection; no authority over MD */ ]
}
```

Invalidate when `corpusHash` or `specgenVersion` mismatches.

---

## 9. Validation engine

### 9.1 Report schema

```ts
type Severity = 'error' | 'warn' | 'info';

interface ValidationIssue {
  id: string;              // rule id
  severity: Severity;
  featureId?: string;
  message: string;
  fixHint?: string;
}

interface ValidationReport {
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
```

### 9.2 Rule catalog (v1)

| Rule ID | Severity | Check |
|---------|----------|-------|
| `main.missing-feature` | error | Tracked source file has no Features row |
| `main.orphan-row` | warn | Features row but file missing on disk |
| `spec.missing-file` | error | `file:` / `entry:` path missing |
| `edge.unresolved` | error | Dependency path/id does not resolve to a feature |
| `edge.asymmetric` | warn | A→B depends but B lacks A in Referenced By |
| `layer.cycle` | warn | Cycle in depends graph |
| `layer.inversion` | warn | Policy-based illegal layer edge (see §14) |
| `exports.drift` | warn | Source exports not reflected in frontmatter (structural) |
| `description.stub` | info | Description matches bootstrap stub patterns |
| `ui.missing` | info | `type: ui` meets complexity heuristics but no `-ui.spec` |
| `corpus.drift` | warn | Source mtime/hash evidence newer than spec structural stamp (optional) |
| `ipc.unlisted` | info | Heuristic channel in source not listed in any spec |

### 9.3 Surfaces

- **Badge:** worst severity + counts  
- **Drawer / panel:** full list; click focuses node  
- **Agent:** `specs_validate` returns the report  

---

## 10. Reconcile (structural sync)

### 10.1 Pipeline

```
configure roots + ignores
  → walk source files
  → extract SourceFacts (TS/JS v1)
  → resolve imports → feature ids via byFile / path maps
  → propose structural patch per feature
  → merge into existing MD (R1)
  → recompute all referenced_by globally from depends
  → update main Features rows (preserve human sections)
  → validate → reload graph → changelog
```

### 10.2 Per-file merge

1. **No spec** → create skeleton (if mode allows): structural fields + stub description (`TODO: describe this feature`) + empty contract sections as needed  
2. **Spec exists** → update structural frontmatter keys and Dependencies / Referenced By / exports / ipc / external / test only  
3. **Never delete** `-ui.spec.md` automatically  
4. **Never replace** non-stub description, Interface, State, Lifecycle, or UI bodies  

### 10.3 Changelog

```ts
interface ReconcileChangelog {
  mode: 'report' | 'structural' | 'full';
  created: string[];
  updated: string[];
  unchanged: string[];
  failed: Array<{ path: string; error: string }>;
  validation: ValidationReport;
}
```

### 10.4 Extractor quality ladder (Cockpit-owned)

| Step | Method | When |
|------|--------|------|
| A | Improved regex + path resolve (evolution of current regen) | Immediate |
| B | TypeScript compiler API or equivalent in main | When A’s false edges hurt |
| C | Additional language fact extractors | When non-TS workspaces matter |

No dependency on external graph products at any step.

### 10.5 Classification

Stop hardcoding individual Cockpit filenames as the long-term layer oracle.

**Priority:**

1. Existing spec `layer` / `type` if present  
2. SPECGEN methodology (e.g. foundation ≈ no internal project imports)  
3. Optional project overrides file (future: `specgen.json` or workspace setting)  
4. Weak path heuristics only as last resort for **new** skeletons  

---

## 11. Freshness

### 11.1 Triggers (use existing workspace watcher)

| Event | Action |
|-------|--------|
| Change under specs dir | Debounced graph reload (~200–500ms) |
| Change to SPECGEN.md | Integrity / version badge update |
| Change to source file with linked feature | Mark drift (and/or queue report-only reconcile) — **not** silent full rewrite |
| Agent/tool reconcile | Explicit structural write + reload |

### 11.2 Agent honesty

When drift or validation errors exist, tool responses include a short footer, e.g.:

```text
⚠ 3 features may be structurally stale; 2 validation errors. Run specs_validate / specs_reconcile.
```

No requirement to copy any third-party banner wording or UX.

---

## 12. Agent surface

### 12.1 Tools (illustrative names — final names at implement time)

| Tool | Role |
|------|------|
| `specs_explore` | Search + context + optional neighborhood / impact |
| `specs_validate` | Full validation report |
| `specs_reconcile` | `report` \| `structural` (+ changelog) |
| `specs_reload` | Reread corpus into graph / UI |

Deprecate conceptual role of today’s `regenerate_specsmap` as full clobber; map it to `specs_reconcile` with explicit mode.

### 12.2 Explore response (target shape)

```markdown
# Matches (N) for "<query>"

## <feature-id>
- **name:** …
- **file:** `…`
- **layer / type:** …
- **spec:** `src/specs/….spec.md`
- **ui:** `…` (if any)

### Description
…

### Dependencies
…

### Referenced By
…

### IPC
…

### Interface
… (if present and requested)

### Neighborhood (depth 1)
- upstream: …
- downstream: …

### Impact (depth N)
- N features downstream may be affected
```

**Defaults:** `animate: false` for agent; human UI may animate on demand.

### 12.3 Prompt protocol (rewrite target)

1. Orient via `specs_explore` / main index — not raw grep of all specs  
2. Pull neighbors from explore before editing peers  
3. Read full UI spec only if not inlined or if editing interactions  
4. After code change: update **contract** sections as needed; run `specs_reconcile` for structure  
5. `specs_validate` before considering the task done when architecture touched  

---

## 13. UI plan (L3)

### 13.1 Keep

- Layer colors, pan/zoom, fit, search, cycle mode, isolate mode  
- Detail panel, multi-collection tabs  
- Empty-state SPECGEN bootstrap + integrity badge  
- Open source / open spec from node  

### 13.2 Add

- Validation drawer (issue list)  
- Drift markers on nodes  
- Filters: stubs / errors / unspecced  
- Reconcile control: Report | Apply structural  
- Settings: specs root, source roots, ignore globs, auto-reload specs  
- Agent explore must not steal camera unless animate requested  

### 13.3 Performance

Feature graphs are small (tens–low hundreds of nodes). Prefer simplicity over virtualization until measured pain (>~200–300 nodes).

---

## 14. Open decisions (resolve in Phase 0)

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| D1 | Layer inversion policy | off / warn / error | warn |
| D2 | Default reconcile mode | report / structural | structural for explicit user action; report for watch-triggered suggestions |
| D3 | Unspecced new files | report only / auto-skeleton | report by default; skeleton with flag or UI confirm |
| D4 | main IPC catalog | human only / reconcile refresh | reconcile may refresh catalog from features |
| D5 | Canonical link syntax | wiki-link / plain | pick one; migrate docs |
| D6 | Extractor process | renderer / main | renderer OK for v1; IPC seam for main |
| D7 | Engine public name | “SpecsMap” only / “SPECGEN runtime” | SpecsMap product; SPECGEN runtime in code module names |
| D8 | Drift signal | mtime / content hash of imports region | start mtime; hash later |

Record resolutions in this doc’s §18 changelog when decided.

---

## 15. Phased roadmap

### Phase 0 — Contracts (docs only)

**Exit:** SPECGEN amended; this plan’s open decisions resolved; no code required.

- Field ownership table in `SPECGEN.md`  
- Reconcile modes documented  
- Validation rule catalog accepted  
- Agent context schema accepted  
- Snapshot v2 described  

### Phase 1 — Format round-trip

**Exit:** parse/serialize preserves all current Cockpit specs’ contract sections.

- `format.ts` + fixtures from `src/specs/**`  
- Canonical link form migration if needed  
- SpecsMap still may use old path internally until Phase 2  

### Phase 2 — Pure graph runtime

**Exit:** build/search/neighbors/impact/cycles tested without UI.

- `graph.ts` + `types.ts`  
- Port layout/cycle logic out of plugin as pure functions  
- Plugin can still own DOM temporarily  

### Phase 3 — Validation

**Exit:** badge + report API; agent-visible issues.

- `validate.ts`  
- UI badge wired to report  
- Minimal validation drawer  

### Phase 4 — Reconcile

**Exit:** structural sync replaces clobber regen as default.

- `extract-ts.ts` + `reconcile.ts`  
- Changelog UI + tool  
- Global `referenced_by` recompute  
- Preserve prose under tests  

### Phase 5 — Freshness

**Exit:** specs-dir auto-reload; drift signals; snapshot v2.

- Watch integration  
- corpusHash snapshot  
- Tool footers when dirty  

### Phase 6 — Agent tools + prompts

**Exit:** new tools live; prompts/AGENTS updated; old clobber path removed or hard-gated.

- `specs_*` tools  
- Explore density  
- Remove 600ms agent animation default  

### Phase 7 — UI polish

**Exit:** drift markers, filters, settings, reconcile UX complete.

### Phase ordering dependency

```
P0 ──► P1 ──► P2 ──► P3 ──► P4 ──► P5
                      │      │
                      └──────┴──► P6 ──► P7
```

**MVP “robust SpecsMap”:** P0–P4 + P6 (minimal tools).  
**“Always honest” feel:** add P5.  
**Delight:** P7.

---

## 16. Testing strategy

| Layer | Tests |
|-------|--------|
| format | Round-trip all repo specs; golden files for edge frontmatter |
| graph | Synthetic graphs: search, depth-2 impact, SCC cycles, ui-of edges |
| validate | One fixture corpus per rule id |
| reconcile | Merge preserves Interface; fills referenced_by; dry-run vs apply |
| plugin | Smoke: load, select, badge, reconcile button wiring |
| agent | Tool registry shapes; explore returns sections; no mandatory delay |
| workflows | Edit source import → reconcile → validate clean asymmetry |

Do not delete existing SpecsMapPlugin tests until behavior is ported; migrate assertions to pure modules where possible.

---

## 17. Documentation updates (when implementing)

| Doc | Update |
|-----|--------|
| `SPECGEN.md` | Field ownership, reconcile, validation |
| `AGENTS.md` | Specs-first protocol → engine tools |
| `src/specs/specsmap-plugin.spec.md` | Public API, tools, non-goals |
| `src/specs/specsmap-plugin-ui.spec.md` | Drawer, drift, reconcile controls |
| `src/specs/main.spec.md` | New modules under Features if split |
| Agent `prompts.ts` | Tool list + protocol |
| `README.md` | SpecsMap description (living graph) |

Update specs **with** code per project change protocol — not after as an afterthought.

---

## 18. Decision log

| Date | Decision | Notes |
|------|----------|-------|
| 2026-07-28 | Clean-room combined derivative | No third-party embed; SPECGEN-native feature grain |
| 2026-07-28 | Plan doc created | `specsmap_plan.md` — implementation not started |
| 2026-07-28 | D1 resolved: layer inversion = **warn** | `layer.inversion` rule, warn severity |
| 2026-07-28 | D2 resolved: reconcile default = **structural** for explicit action, **report** for watch-triggered | Full mode gated behind explicit confirm |
| 2026-07-28 | D3 resolved: unspecced files = **report** by default; skeleton via explicit flag | `createSkeletons` option on structural mode |
| 2026-07-28 | D4 resolved: reconcile refreshes **Features rows** only; IPC catalog stays human for v1 | Catalog refresh deferred |
| 2026-07-28 | D5 resolved: canonical link = **plain `**name** \`file\`** form** | Wiki-links accepted on parse, never emitted |
| 2026-07-28 | D6 resolved: extractor runs in **renderer** | IPC seam deferred until measured pain |
| 2026-07-28 | D7 resolved: product name **SpecsMap**; code modules under `src/renderer/specs/` | format/graph/validate/reconcile/extract-ts/snapshot |
| 2026-07-28 | D8 resolved: freshness via **corpus content hash** (FNV-1a), no mtime | Snapshot v2 `corpusHash` |
| 2026-07-28 | Phase 0 exit checked; implementation started (P1–P7) | SPECGEN.md amended with ownership/reconcile/validation/snapshot |

---

## 19. References (internal only)

- `SPECGEN.md` — format, taxonomy, generation methodology  
- `DESIGN.md` — visual system for UI work  
- `AGENTS.md` — change protocol and project map  
- `src/renderer/components/SpecsMapPlugin.ts` — current implementation  
- `src/renderer/ai/tool-definitions.ts` — current agent tools  
- `src/renderer/ai/prompts.ts` — specs-first agent instructions  

External products may inform *problem framing* only; they are not normative references for APIs or storage.

---

## 20. Immediate next step

1. Resolve §14 open decisions (D1–D8) in a short design pass.  
2. Draft SPECGEN amendments for field ownership + reconcile + validation (Phase 0).  
3. Only then open implementation PRs starting at Phase 1 (format round-trip).  

**Nothing in this document authorizes implementation until Phase 0 exits are checked off.**
