# SPECGEN — Specs Graph Standard

## Purpose

SPECGEN defines a **language- and framework-agnostic specification format** for source code audit, design, and testing. It produces a machine-readable **specs graph** — a DAG of Markdown files where each node is a feature spec, edges are dependency/reference links, and leaf UI specs capture DOM structure and interaction behavior (when applicable).

The specs graph supports three workflows:

1. **Audit** — scan source and generate specs that mirror the actual implementation
2. **Design** — define new features by writing specs first, then implement to spec
3. **Test** — generate test cases from `## Interactions`, `## States`, and `## Interface` sections

### Applicability

This format works for any project — CLI tool, web app, library, desktop app, microservice, mobile app — written in any language. The terms are intentionally abstract:

| Concept | In a web app | In a CLI tool | In a library | In a backend service |
|---------|-------------|---------------|-------------|---------------------|
| `process` layer | Main/preload process | Entry point daemon | N/A | Server entry / worker |
| `IPC channel` | Electron IPC / postMessage | N/A | N/A | HTTP endpoint / RPC / message queue |
| `UI sub-spec` | DOM components | TUI / CLI output | N/A | N/A |
| `plugin` | Card-contained UI plugin | Subcommand plugin | Extension module | Plugin middleware |
| `canvas` model | 2D bounded canvas | N/A | N/A | N/A |

---

## File Structure

```
<specs_dir>/
├── main.spec.md           # Root: project manifest, feature index, IPC/API catalog
├── <feature>.spec.md      # Feature spec: one per non-test source file
└── <feature>-ui.spec.md   # UI sub-spec: one per feature with complex DOM/interactions
```

`<specs_dir>` defaults to `src/specs/` but is configurable per project.

### Naming Convention

| Pattern | Example | Purpose |
|---------|---------|---------|
| `main.spec.md` | Root index only | Project-level manifest |
| `<feature>.spec.md` | `plugin-card.spec.md` | Feature definition (matches kebab-cased source file stem) |
| `<feature>-ui.spec.md` | `welcome-modal-ui.spec.md` | UI interaction spec for a UI-type feature |

---

## Format Overview

Each spec file uses **YAML frontmatter** for structured metadata followed by **Markdown sections** for prose and lists. This layout is optimized for RAG and data crawlers: frontmatter is machine-parseable, sections are human-readable and embeddable.

```
---
<key>: <value>
---

# <Feature Name>

<description paragraph>

## <Section Name>

<section content>
```

**Frontmatter** holds flat scalar fields and simple inline arrays (`[item1, item2]`). Nested objects belong in body sections.

**Sections** use `##` headings. Structured items use `- **key** \`value\`` or Markdown tables.

---

## Tier 1 — `main.spec.md` (Root)

The root index catalogs the entire project. It is the entry point for all tools traversing the specs graph.

### Frontmatter

```yaml
---
name: string          # Project display name
title: string         # Short tab label for multi-spec UIs (optional; falls back to name)
version: string       # Semver from package manifest
---
```

### Sections

**`# <Name>`** — One-paragraph description of the project.

**`## Stack`** — Runtime, language, build toolchain, key dependencies. Each as `- **key:** value`.

**`## Architecture`** — Process model, IPC/API pattern, state persistence, concurrency model. Each as `- **key:** value`.

**`## Features`** — Feature index grouped by architectural layer. Each layer is a `### <layer>` subsection with a Markdown table:

```markdown
## Features

### foundation

| id | name | file | spec | ui |
|----|------|------|------|----|
| main-process | Main Process | src/main/main.ts | main-process.spec.md | |
| theme | Theme System | src/renderer/theme.ts | theme.spec.md | |

### core

| id | name | file | spec | ui |
|----|------|------|------|----|
| app | App Orchestrator | src/renderer/components/App.ts | app.spec.md | |
```

Table columns:
- `id` — Unique feature ID (kebab-case, matches file stem)
- `name` — Human-readable display name
- `file` — Source file path from repo root
- `spec` — Feature spec filename
- `ui` — UI sub-spec filename (leave empty if none)

**`## IPC Channels`** — Cross-boundary communication catalog grouped by `### <namespace>` subsections, each with `- \`channel:action\`` items.

**`## Keyboard Shortcuts`** — Table: `| key | scope | action |`

**`## Test Coverage`** — Bullet list: `- **total_test_files:** N`, `- **total_tests:** N`, `- **framework:** ...`

### Layer order

Layers are ordered: `foundation` → `core` → `widget` → `modal` → `overlay` → `plugin` → `utility`.

---

## Tier 2 — `<feature>.spec.md` (Feature Spec)

One per non-test source file under the project's source directory. Every file is a feature.

### Type Taxonomy

| `type` | Meaning | Examples |
|--------|---------|----------|
| `entry` | Project entry point or config file (package.json, Makefile, Dockerfile) | `package.json`, `Makefile`, `docker-compose.yml`, `pyproject.toml` |
| `model` | Type/interface declarations, contracts | `types.d.ts`, `api.ts` (interfaces only) |
| `process` | Entry-point or daemon process code | `main.ts`, `server.ts`, `cli.ts` |
| `ui` | DOM or TUI component with visual output | `Button.tsx`, `Panel.vue`, `Dialog.svelte` |
| `logic` | Stateful logic with no direct I/O (singletons) | `theme.ts`, `store.ts`, `state.rs` |
| `utility` | Stateless helper functions or classes | `format.ts`, `math.ts`, `string-utils.rs` |
| `data` | Data access, I/O, storage, or network layer | `repository.ts`, `api-client.py`, `db.rs` |
| `config` | Configuration, constants, environment | `constants.ts`, `settings.rs`, `config.py` |

### Layer Taxonomy

| `layer` | Meaning | Examples |
|---------|---------|----------|
| `foundation` | No internal project imports, consumes only platform/external APIs | Type definitions, platform bindings, entry points |
| `core` | Imported by orchestrator, imports from foundation or same layer | App shell, orchestrator, event bus, main loop |
| `widget` | Reusable UI or TUI building blocks | Buttons, cards, menus, prompts, panels |
| `modal` | Overlay dialog (typically Promise-returning) | Confirm dialog, file picker, settings modal |
| `overlay` | Floating non-modal UI (palette, tutorial, tooltip) | Command palette, tour overlay, dropdown |
| `plugin` | Plugin/module loaded dynamically into a host | Editor plugins, middleware, CLI subcommands |
| `service` | Long-lived service or data layer | Database service, API client, file watcher |
| `utility` | Pure utility with no project imports | Math helpers, string formatters, validators |

### Frontmatter

```yaml
---
name: string          # Human-readable feature name
file: string          # Relative path from project root (source code file)
entry: string         # Entry/config file path (e.g. "package.json", "Makefile") — optional
type: string          # Type from taxonomy above
layer: string         # Layer from taxonomy above
singleton: boolean    # true if only one instance exists at runtime
exports: [Name, ...]  # Top-level exports as inline array
---
```

At least one of `file` or `entry` must be present. When `entry` is set, the feature represents a project entry/config point — its `## Scripts` and `## Build` sections describe commands and dependencies rather than module imports.

### Sections

**`# <Name>`** — One-paragraph description: what it does, how it works, key behaviors. Be specific — no generic phrases like "manages state" or "handles events".

**`## Dependencies`** — Forward edges (what this feature imports). Each item:
```
- **<feature-id>** `<file-path>` — <usage description>
```

**`## Referenced By`** — Reverse edges (what imports this feature). Each item:
```
- **<feature-id>** `<file-path>`
```

**`## IPC Channels`** — Channels this feature invokes or listens to. Each item: `- \`namespace:action\``

**`## Interface`** — Public surface. Use `### Methods`, `### Properties`, `### Events`, `### Functions` sub-sections. Each item:
```
- **methodName** `(param: Type): ReturnType` — description
```

**`## State`** — If this feature serializes state: describe the schema, when it's saved/loaded, and field list.

**`## Lifecycle`** — Items:
```
- **created_by:** <who instantiates this>
- **destroyed_by:** <when/how destroyed>
```

**`## External Dependencies`** — Third-party packages. Each item: `- \`package-name\``

**`## Test`** — `\`path/to/test-file\``

#### Entry-type feature extensions

When `entry:` is set (e.g. `package.json`, `Makefile`):

**`## Scripts`** — Scripts/commands defined in this entry file. Each item: `- **name**: \`command\``

**`## Build`** — Build toolchain commands. Each item: `- **target**: \`command\``

---

## Tier 3 — `<feature>-ui.spec.md` (UI Sub-Spec)

Created for features with `type: "ui"` that have complex DOM structure and interactions warranting a separate spec.

### Criteria for creating a UI sub-spec

| Has UI sub-spec | Does NOT have UI sub-spec |
|----------------|--------------------------|
| Creates multiple DOM elements with structured layout | Single wrapper div for third-party embed |
| Has user interactions (click, drag, hover, keyboard) | Purely delegates to child components |
| Has distinct visual states (open/closed, active/inactive, etc.) | State is fully described in parent feature spec |
| Is a modal, overlay, menu, card, or plugin with complex DOM | Is a process handler, utility, or plugin glue |

### Frontmatter

```yaml
---
name: string      # e.g. "Welcome Modal UI"
parent: string    # Feature ID this UI spec belongs to
---
```

### Sections

**`# <Name>`** — Scope of this UI spec.

**`## DOM Structure`** — Root element, key child elements, layout. Use a JSON or prose block describing the element hierarchy.

**`## Interactions`** — Each interaction as a `### <name>` subsection with:
- `**trigger:**` — event/condition (e.g. `mousedown on .card-header`)
- `**gesture:**` — sequence of events (optional, for multi-step interactions)
- Description of what happens — DOM changes, IPC calls, callbacks
- `**result:**` — end state (optional)

**`## States`** — Each visual state as `### <state-name>` with description.

**`## Rendering`** — Optional: how specific elements are rendered (font, color, DPR, etc.).

**`## Accessibility`** — Optional: keyboard shortcuts and ARIA attributes.

### Interaction documentation conventions

Prose style for interaction descriptions:

- **Direct DOM**: `Set overlay display:flex, store onClose callback`
- **Formula**: `screenX = snap(worldRawX) * scale + panX`
- **IPC call**: `IPC workspace:select (native directory picker)`
- **Callback fire**: `Fire onDragEnd(worldX, worldY), snap to 28px grid final position`
- **Multi-action chains**: Use `→` separator — `Remove all existing menus → create new .ctx-menu → append to body`

---

## Generation Methodology

### Phase 1: File Discovery

Walk the project source directory recursively, collecting every source file that is not a test file (by naming convention, e.g. `*.test.*`, `*_test.*`, `*_spec.*`, `*.spec.*`) and not test infrastructure files.

**Entry files** (`package.json`, `Makefile`, `docker-compose.yml`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `build.gradle`, `pom.xml`, `CMakeLists.txt`, `Dockerfile`, `.github/workflows/*.yml`) are always collected regardless of location. Each entry file becomes a feature spec with `type: "entry"`.

### Phase 2: Classification

For each file, determine:

 1. **Type** — Read the file's imports, exports, and content:
    - Entry or config file from root (`package.json`, `Makefile`, `Dockerfile`, `docker-compose.yml`, CI configs) → `entry`
    - Entry-point or daemon process code (run directly) → `process`
    - Imports or uses DOM/TUI APIs → `ui`
    - Exports only types/interfaces, no runtime code → `model`
    - Exports a singleton with state but no direct I/O → `logic`
    - Exports pure functions with no side effects → `utility`
    - Contains I/O, storage, or network calls → `data`
    - Contains only configuration/constants → `config`

2. **Layer** — Map dependency depth to layer:
   - `foundation` — imports nothing from the project's own source
   - `core` — imports only from foundation or same-layer
   - `widget` — imported by core, imports utilities
   - `modal` / `overlay` — creates a fixed-position overlay or modal dialog, often Promise-returning
   - `plugin` — instantiated dynamically inside a host
   - `service` — long-lived service with its own lifecycle

3. **Singleton** — `true` if the class/object is instantiated exactly once or uses a singleton pattern.

### Phase 3: Dependency Edge Extraction

Parse each file's import/use/include statements. For every import from the project's own source (not external packages or standard library), record edges in both directions:

- `## Dependencies` — forward edges (what this file imports)
- `## Referenced By` — reverse edges (what imports this file)

Dependency list item format:
```
- **<feature-id>** `<file-path>` — <how it is used>
```

### Phase 4: Interface Extraction

For each exported class, function, or type, populate `## Interface`:

- **Classes**: constructor signature, public method names/signatures, public property names/types
- **Functions**: parameter types and return type
- **Types**: interface/type alias definitions and their fields
- **Events**: callback property patterns (`onXxx: callback signature`)

### Phase 5: IPC / API Cataloging

Search for cross-boundary communication:

- **IPC (desktop apps)**: `ipcMain.handle('channel')`, `ipcRenderer.invoke('channel')`, `webContents.send('channel')`
- **HTTP API (web/services)**: Route handlers, controller methods, endpoint registrations
- **Event bus**: Publish/subscribe patterns, event emitter usage
- **CLI commands**: Command/subcommand registrations, argument parsers

### Phase 6: UI Sub-Spec Generation

For each `type: "ui"` feature, evaluate UI sub-spec criteria:

1. Does it create 2+ DOM elements with meaningful structure?
2. Does it have 2+ distinct user interactions?
3. Does it have 2+ visual states?
4. Is it a modal, overlay, menu, card, or plugin with complex DOM?

If **3+ criteria are met**, generate a `<feature>-ui.spec.md`. The `ui` column in `main.spec.md`'s Features table should reference this file.

### Phase 7: Root Index Assembly

`main.spec.md` is built by aggregating:
- Project identity from the project manifest (frontmatter: `name`, `title`, `version`)
- Feature index from all generated feature specs (grouped by layer in `## Features`)
- IPC/API catalog from all `## IPC Channels` sections across features
- Keyboard shortcuts from UI components
- Test coverage statistics

---

## Using the Specs Graph

### Traversal

Start at `main.spec.md`, read a feature's `spec` column value, then follow:

- `## Dependencies` items → find the feature that owns that file → read its spec
- `## Referenced By` items → find callers to understand impact of changes
- `ui` column in the Features table → read the UI sub-spec for DOM/interaction details

### Feature Design

To design a new feature:

1. Define the feature spec first (frontmatter: name, file, type, layer)
2. Populate `## Interface` with expected public surface
3. Populate `## Dependencies` with features it will import
4. Populate existing features' `## Referenced By` with the new feature
5. If `type: "ui"` and meets criteria, create a UI sub-spec with `## Interactions` and `## States`
6. Implement against the spec
7. Verify that all `## Interface` methods exist, all `## Interactions` work, all `## States` are reachable

### Test Generation

Each spec provides test scaffolding:

| Spec section | Test that should be written |
|-------------|---------------------------|
| `## Interface` methods | Unit test each method's behavior |
| `## Interface` properties | Unit test property accessors |
| `## Interactions` | Integration test each interaction path |
| `## States` | Test each state transition, verify visual properties |
| `## Dependencies` | Verify that mocked dependencies behave correctly |
| `## IPC Channels` | Mock channels, verify correct payloads |
| `## Lifecycle` | Test create/destroy cycle, verify cleanup |

---

## Adoption Guide

To adopt SPECGEN for your project:

1. **Choose your specs directory** (default: `src/specs/`, but any path works)
2. **Create `main.spec.md`** — fill in project identity, stack, architecture
3. **Classify source files** — assign each file a `type` and `layer`
4. **Generate feature specs** — one per non-test source file
5. **Generate UI sub-specs** — for qualifying UI features
6. **Wire up the dependency graph** — extract imports and build `## Dependencies` / `## Referenced By` sections
7. **Catalog IPC/API channels** — document all cross-boundary communication

### Minimal starting template

```markdown
---
name: <project>
version: 0.1.0
---

# <Project>

<One-paragraph description>

## Stack

- **runtime:** <runtime and version>
- **language:** <language and version>
- **testing:** <framework>

## Features

### foundation

| id | name | file | spec | ui |
|----|------|------|------|----|

### core

| id | name | file | spec | ui |
|----|------|------|------|----|
```

### Minimal feature spec template

```markdown
---
name: <Feature Name>
file: <src/path/to/file.ts>
type: <type>
layer: <layer>
singleton: false
exports: [ClassName]
---

# <Feature Name>

<What it does, how it works, key behaviors — be specific.>

## Dependencies

- **<dep-id>** `<src/path/to/dep.ts>` — <how this feature uses it>

## Referenced By

- **<caller-id>** `<src/path/to/caller.ts>`
```
