---
name: SpecsMap Plugin UI
parent: specsmap-plugin
---

# SpecsMap Plugin UI

DOM structure, graph visualization, spec generation, and snapshot interactions for the SpecsMap plugin.

## DOM Structure

```
.card-body (PluginCard body container)
└── .specsmap-layout | display: flex; flex-direction: column; height: 100%
    ├── .specsmap-toolbar | flex row
    │   ├── button.specsmap-load (load specs from workspace)
    │   ├── button.specsmap-generate (generate/regenerate specs)
    │   ├── button.specsmap-snapshot (save snapshot)
    │   ├── button.specsmap-restore (restore from snapshot)
    │   ├── button.specsmap-verify (verify integrity)
    │   └── button.specsmap-prompt (copy AI prompt)
    ├── .specsmap-graph | flex: 1; position: relative
    │   └── svg.specsmap-svg (force-directed graph)
    │       ├── circle.specsmap-node[] (feature nodes, colored by type/layer)
    │       ├── text.specsmap-label[] (feature name labels)
    │       └── line.specsmap-edge[] (dependency arrows, arrowhead markers)
    └── .specsmap-status (status bar: file count, generation date, hash)
```

## Interactions

### Load Specs

- **trigger:** Click "Load Specs" button or on mount
- `fs:readDir` → list `src/specs/*.spec.md` files
- `fs:readFile` each spec → parse YAML frontmatter + markdown sections
- Build dependency graph (nodes = features, edges = dependencies/referenced-by)
- Render force-directed graph via SVG
- **result:** Visual graph displayed, node count shown in status bar

### Generate Specs

- **trigger:** Click "Generate Specs" button
- Confirm dialog: "Regenerate all spec files from source code audit?"
- On confirm:
  - `fs:readDir` workspace for all source files (non-test)
  - `fs:readFile` each source file → classify type/layer, extract imports/exports
  - For each source file: generate feature spec with frontmatter + sections
  - For qualifying UI components: generate UI sub-spec
  - `fs:writeFile` each spec to `src/specs/`
  - Generate `main.spec.md` index
  - `fs:writeFile` main.spec.md
- **result:** All spec files regenerated from current source code

### Save Snapshot

- **trigger:** Click "Save Snapshot" button
- `fs:mkdir` `.cockpit/` directory if needed
- Read all current spec files + source hash
- `fs:writeFile` snapshot to `.cockpit/specs-snapshot.json`
- **result:** Current spec state saved for later comparison/restore

### Restore Snapshot

- **trigger:** Click "Restore Snapshot" button
- `fs:readFile` from `.cockpit/specs-snapshot.json`
- Confirm dialog: "Restore all spec files from snapshot?"
- `fs:writeFile` each spec from snapshot data
- **result:** Spec files restored to snapshotted state

### Verify Integrity

- **trigger:** Click "Verify Integrity" button
- Read `SPECGEN_HASH` from `specgen-hash.ts`
- Compare with workspace's SPECGEN.md content hash
- Read all spec files, validate format (required frontmatter fields, required sections)
- Check: every `## Dependencies` entry matches an actual `file:` frontmatter field in another spec
- Report: "All checks passed ✓" or list of integrity violations
- **result:** Validation report displayed in status area

### Copy AI Prompt

- **trigger:** Click "Copy Prompt" button
- Build generation prompt from SPECGEN.md template + workspace context
- `clipboard:writeText` IPC with prompt
- "Prompt copied!" toast notification
- **result:** AI-ready spec generation prompt in clipboard

### Graph Pan/Zoom

- **trigger:** Mouse wheel over SVG, or drag on `.specsmap-graph`
- Standard SVG transform (translate + scale) for pan/zoom
- Node labels scale inversely to remain readable at all zoom levels
- **result:** Graph navigable

### Node Click

- **trigger:** Click on `.specsmap-node` circle
- Highlight node, highlight connected edges, dim unrelated nodes
- Show tooltip with feature details: type, layer, exports, dependency count
- **result:** Feature detail inspection

## States

### Empty (No Specs)

"0 spec files found. Click Generate to create specs from source code."

### Loaded

Graph rendered, node count displayed, toolbar buttons all enabled.

### Generating

Progress indicator: "Scanning files...", "Classifying...", "Writing specs..." with file count.

### Generation Complete

"Generated N spec files" status, graph auto-reloaded with new data.

### Integrity Pass

Green checkmark + "All checks passed. N features, M dependencies valid."

### Integrity Fail

Red × + "N issues found: [list]" with clickable issue details.

### Snapshot Restored

"Restored N spec files from snapshot [date]" status message.

## Accessibility

- **Tab:** Navigate toolbar buttons
- **Arrow keys:** Pan graph view
- **+/-:** Zoom graph
- **Enter:** Activate focused button
