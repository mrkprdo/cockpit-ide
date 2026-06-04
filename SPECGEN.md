# SPECGEN — Specs Graph Standard

## Purpose

SPECGEN defines a **language- and framework-agnostic specification format** for source code audit, design, and testing. It produces a machine-readable **specs graph** — a DAG of JSON files where each node is a feature spec, edges are dependency/reference links, and leaf UI specs capture DOM structure and interaction behavior (when applicable).

The specs graph supports three workflows:

1. **Audit** — scan source and generate specs that mirror the actual implementation
2. **Design** — define new features by writing specs first, then implement to spec
3. **Test** — generate test cases from `interactions`, `states`, and `interface` blocks

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
├── main.spec.json           # Root: project manifest, feature index, IPC/API catalog, dep graph
├── <feature>.spec.json      # Feature spec: one per non-test source file
└── <feature>-ui.spec.json   # UI sub-spec: one per feature with complex DOM/interactions
```

`<specs_dir>` defaults to `src/specs/` but is configurable per project.

### Naming Convention

| Pattern | Example | Purpose |
|---------|---------|---------|
| `main.spec.json` | Root index only | Project-level manifest |
| `<feature>.spec.json` | `plugin-card.spec.json` | Feature definition (matches kebab-cased source file stem) |
| `<feature>-ui.spec.json` | `welcome-modal-ui.spec.json` | UI interaction spec for a UI-type feature |

---

## Tier 1 — `main.spec.json` (Root)

The root index catalogs the entire project. It is the entry point for all tools traversing the specs graph.

### Schema

```jsonc
{
  // ─── Project identity ───
  "name": "string",             // Project display name
  "title": "string",            // Short tab label for multi-spec UIs (optional; falls back to name)
  "version": "string",          // Semver from package manifest

  "description": "string",      // One-paragraph elevator pitch

  // ─── Technical stack ───
  "stack": {
    "runtime": "string",        // Runtime environment (e.g. "Node 22", "Deno 2", "Python 3.12")
    "language": "string",       // Primary language (e.g. "TypeScript 5.8", "Rust 1.85")
    "build": {                   // Build toolchain per target
      "<target>": "string"      // e.g. { "main": "tsc", "renderer": "esbuild", "dev": "tsx --watch" }
    },
    "key_deps": {                // Major third-party dependencies
      "<label>": "string"
    },
    "testing": "string"         // Test framework + environment
  },

  // ─── Architecture overview ───
  "architecture": {
    "process_model": "string",  // Process/deployment layout
    "ipc_or_api_pattern": "string", // How cross-boundary communication flows
    "state_persistence": "string", // Serialization format and storage
    "concurrency_model": "string", // Threading/async/worker model (optional)
    // Project-specific architecture fields can be added here
    "<custom_key>": "string"
  },

  // ─── Feature index (by layer) ───
  "features": {
    // Each layer is a key → array of feature entries.
    // Layers are ordered: foundation → core → widgets → modals_and_overlays → plugins
    "<layer>": [
      {
        "id": "string",          // Unique feature ID (kebab-case, matches file stem)
        "name": "string",        // Human-readable display name
        "file": "string",        // Source file name (no path, for cross-reference); OR
        "entry": "string",       // Entry/config file path from repo root (e.g. "package.json", "Makefile")
        "spec": "string",        // Feature spec filename
        "ui": "string"           // UI sub-spec filename (only if type=ui + complex DOM)
      }
    ]
  },

  // ─── Dependency graph (edges only, for quick graph construction) ───
  "dependency_graph": {
    "description": "string",
    "edges": {
      // "file.ext" → ["dep1.ext", "dep2.ext", ...]
      // Only internal project imports, not external packages
      "<file>": ["<dependency_file>"]
    }
  },

  // ─── IPC/API channel catalog ───
  "ipc_channels": {
    // For desktop apps: namespace → array of IPC channel names.
    // For web apps: namespace → array of event names or API endpoints.
    // For services: service → array of RPC/endpoint names.
    "<namespace>": ["channel:action"]
  },

  // ─── Global keyboard shortcuts (UI projects only) ───
  "keyboard_shortcuts": [
    {
      "key": "string",           // Key combo (e.g. "Ctrl+Shift+N")
      "scope": "string",         // Applicable scope (e.g. "app" | "canvas" | "editor" | "modal")
      "action": "string"         // What happens
    }
  ],

  // ─── API endpoints (server/CLI projects) ───
  "api_endpoints": [
    {
      "method": "string",        // HTTP method or verb
      "path": "string",          // Route or command path
      "description": "string",
      "handler_feature": "string" // Feature ID that handles this endpoint
    }
  ],

  // ─── Test coverage summary ───
  "test_coverage": {
    "total_test_files": "number",
    "total_tests": "string",     // e.g. "500+"
    "run_time": "string",        // e.g. "~3s"
    "framework": "string",
    "specs_with_direct_tests": "number",
    "specs_with_indirect_tests": "number",
    "specs_without_tests": "number"
  }
}
```

---

## Tier 2 — `<feature>.spec.json` (Feature Spec)

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

### Schema

```jsonc
{
  // ─── Identity ───
  "name": "string",              // Human-readable feature name
  "file": "string",              // Relative path from project root or src/ (source code file); OR
  "entry": "string",             // Entry/config file path from repo root (e.g. "package.json", "Makefile")
                                 // When set, the feature represents a project entry/config point describing
                                 // scripts, build commands, dependencies, and project setup — not a source module.
                                 // At least one of file / entry must be present. Both may be set.

  "description": "string",       // What it does, how it works, key behaviors

  "type": "entry | ui | data | logic | process | utility | model | config",   // Kind category
  "layer": "foundation | core | widget | plugin | modal | overlay | service | utility",  // Architectural layer

  "singleton": "boolean",        // true if only one instance exists at runtime

  // ─── Public surface ───
  "exports": ["ClassName", "InterfaceName", "functionName"],  // Top-level exports

  // ─── Dependency edges (what this feature imports) ───
  "dependencies": [
    {
      "feature": "string",       // ID of the depended-upon feature
      "file": "string",          // File name for cross-reference (no path)
      "usage": "string"          // How this feature uses the dependency
    }
  ],

  // ─── Reverse edges (what imports this feature) ───
  "referenced_by": [
    {
      "feature": "string",       // ID of the caller feature
      "file": "string"           // Caller file name
    }
  ],

  // ─── IPC / API channels (if any) ───
  "ipc": ["channel:action"],     // Channels this feature invokes or listens to
  "api": ["endpoint or route"],  // API routes this feature handles

  // ─── Class/function interface ───
  "interface": {
    "constructor": "string",     // Constructor signature (if a class)
    "methods": [
      {
        "name": "string",
        "signature": "string",   // Language-appropriate signature
        "description": "string"
      }
    ],
    "properties": [
      {
        "name": "string",
        "type": "string",
        "description": "string"
      }
    ],
    "events": [
      {
        "name": "string",
        "description": "string"
      }
    ]
    // For utility/type features, "functions" or "types" arrays replace methods/properties
  },

  // ─── State shape (if this feature serializes state) ───
  "state": {
    "schema": "string",          // Type name or schema reference
    "description": "string",     // When/how state is saved/loaded
    "fields": [
      {
        "name": "string",
        "type": "string",
        "description": "string"
      }
    ]
  },

  // ─── UI sub-spec pointer (only if type=ui and has complex DOM/interactions) ───
  "ui": {
    "spec": "string"             // Filename of the UI sub-spec
  },

  // ─── Lifecycle ───
  "lifecycle": {
    "created_by": "string",      // Who instantiates this
    "destroyed_by": "string",    // When/how it is destroyed
    "singleton": "boolean"       // One-instance enforcement
  },

  // ─── Platform contracts ───
  "external_deps": ["package-name"],  // Third-party packages used

  // ─── Test file ───
  "test": "string"               // Relative test file path
}
```

### Feature-type-specific extensions

**For entry-type features** (project config files, manifest files, build definitions):

```jsonc
{
  "scripts": {
    "<name>": "string"           // Scripts/commands defined in this entry file
  },
  "build": {
    "<target>": "string"         // Build toolchain commands
  },
  "dependencies": {
    "<name>": "string"           // External dependencies declared in this entry
  }
}
```

**For process-layer features** (entry points, server processes, daemons):

```jsonc
{
  "handlers": {
    "<namespace>": ["action or endpoint (protocol)"],
    "events": ["event name (direction)"]
  },
  "security": {
    "<mechanism>": "string"
  },
  "bridge": {
    "<namespace>": "string"      // How API shape is exposed to consumers
  }
}
```

**For plugin features** (loadable modules, extensions):

```jsonc
{
  "features": {
    "<capability>": "string"     // Detailed feature descriptions
  },
  "activation": "string"         // How the plugin is activated (lazy, eager, on-demand)
}
```

**For service/data features** (database, API, storage):

```jsonc
{
  "api": {
    "<endpoint>": "method path — description"
  },
  "storage": {
    "backend": "string",         // Storage backend (filesystem, SQLite, S3, etc.)
    "serialization": "string"    // Serialization format
  }
}
```

**For modal features**:

```jsonc
{
  "interface": {
    "constructor": "constructor signature",
    "methods": [
      { "name": "open", "signature": "() => Promise<T>", "description": "Opens the modal, resolves with result" }
    ]
  }
}
```

---

## Tier 3 — `<feature>-ui.spec.json` (UI Sub-Spec)

Created for features with `type: "ui"` that have complex DOM structure and interactions warranting a separate spec. Criteria: the feature creates/manipulates DOM elements beyond a single wrapper div, has user interactions, or has distinct visual states.

### Criteria for creating a UI sub-spec

| Has UI sub-spec | Does NOT have UI sub-spec |
|----------------|--------------------------|
| Creates multiple DOM elements with structured layout | Single wrapper div for third-party embed |
| Has user interactions (click, drag, hover, keyboard) | Purely delegates to child components |
| Has distinct visual states (open/closed, active/inactive, etc.) | State is fully described in parent feature spec |
| Is a modal, overlay, menu, card, or plugin with complex DOM | Is a process handler, utility, or plugin glue |

For non-DOM UI (TUI, CLI, terminal UI), adapt `dom` to describe the rendered output structure (e.g. lines, columns, widgets).

### Schema

```jsonc
{
  // ─── Identity ───
  "name": "string",              // e.g. "Welcome Modal UI"
  "parent": "string",            // Feature ID this UI spec belongs to

  "description": "string",       // Scope of this UI spec

  // ─── DOM / rendered structure ───
  "dom": {
    // Root element description: selector + CSS inline styles (or TUI coordinates)
    "root": "string",            // e.g. ".card" or ".modal-overlay" or "screen:rows 10-20"
    "style": "string",           // Key CSS properties inline (or layout properties)
    "container": "string",       // Parent element selector (if relevant)

    // Child element catalog
    "children": [
      "selector (inline CSS)"
    ],
    // OR grouped structured elements:
    "elements": {
      "<name>": "selector + description"
    },
    // OR section-by-section:
    "<section>": [
      "selector (description)"
    ]
  },

  // ─── Interaction catalog ───
  "interactions": [
    {
      "name": "string",          // Unique interaction name (e.g. "drag_start")
      "trigger": "string",       // Event/condition that initiates (e.g. "mousedown on .card-header")
      "gesture": "string",       // Sequence of events (optional, for multi-step interactions)
      "action": "string",        // What happens — can include formulas, IPC calls, DOM changes
      "propagation": "string",   // Event propagation behavior (optional)
      "timing": "string",        // Debounce/throttle/animation timing (optional)
      "result": "string",        // End state (optional)
      "cursor": "string",        // Cursor style change (optional, for drag interactions)
      "examples": {              // Concrete examples (optional, for menus)
        "<action>": "callback name"
      }
    }
  ],

  // ─── Visual state machine ───
  "states": {
    "<state_name>": "string"     // Description of the state and its visual properties
  },

  // ─── Rendering notes (optional) ───
  "rendering": {
    "<element>": "string"        // How a specific element is rendered (font, color, DPR, etc.)
  },

  // ─── Accessibility (optional) ───
  "accessibility": {
    "keyboard": ["key name"],
    "aria": ["attribute with value"]
  },

  // ─── Security notes (optional) ───
  "security": {
    "<mechanism>": "string"
  },

  // ─── Content/Props (optional, for configurable modals/components) ───
  "props": {
    "<prop>": "type — description"
  },

  // ─── Dynamic content (optional, for menus) ───
  "dynamic_content": {
    "<section>": "string"        // How dynamic items are rendered
  }
}
```

### Interaction documentation conventions

Interactions follow a consistent prose style for the `action` field:

- **Direct DOM**: `Set overlay display:flex, store onClose callback`
- **Formula**: `screenX = snap(worldRawX) * scale + panX`
- **IPC call**: `IPC workspace:select (native directory picker)`
- **API call**: `POST /api/workspace/select` or `RPC workspace.select()`
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

3. **Singleton** — `true` if the class/object is instantiated exactly once (check all call sites) or uses a singleton pattern.

### Phase 3: Dependency Edge Extraction

Parse each file's import/use/include statements. For every import from the project's own source (not external packages or standard library), record an edge:

```
<current_file> → <imported_file>
```

Edges go in both directions in the spec:
- `dependencies` — forward edges (what this file imports)
- `referenced_by` — reverse edges (what imports this file)

### Phase 4: Interface Extraction

For each exported class, function, or type:

- **Classes**: Extract constructor signature, public method names/signatures, public property names/types
- **Functions**: Extract parameter types and return type
- **Types**: Extract interface/type alias definitions and their fields
- **Events**: Extract callback property patterns (`onXxx: callback signature`)

### Phase 5: State Schema Extraction

Search for serialization patterns:
- `JSON.stringify` / `JSON.parse` calls on typed objects → that type is a state schema
- Functions named `getState()`, `getSaveState()`, `toJSON()`, `serialize()` → return type is a state schema
- Files that write to persistent storage (filesystem, database, localStorage) → track what they write

### Phase 6: IPC / API Cataloging

Search for cross-boundary communication:

- **IPC (desktop apps)**: `ipcMain.handle('channel')`, `ipcRenderer.invoke('channel')`, `webContents.send('channel')`
- **HTTP API (web/services)**: Route handlers, controller methods, endpoint registrations
- **RPC / Message queue**: Service method calls, event bus subscriptions, message handlers
- **Event bus**: Publish/subscribe patterns, event emitter usage
- **CLI commands**: Command/subcommand registrations, argument parsers

Map each channel/endpoint to the feature that produces it and the features that consume it.

### Phase 7: UI Sub-Spec Generation

For each `type: "ui"` feature, evaluate UI sub-spec criteria:

1. Does it create 2+ DOM elements with meaningful structure?
2. Does it have 2+ distinct user interactions?
3. Does it have 2+ visual states?
4. Is it a modal, overlay, menu, card, or plugin with complex DOM?

If **3+ criteria are met**, generate a UI sub-spec. Otherwise, inline UI details in the feature spec.

The UI sub-spec is generated by:
1. Reading DOM construction code (`innerHTML`, `createElement`, template literals, JSX) to reconstruct DOM
2. Reading event listener registrations to catalog interactions
3. Reading visibility/style toggles (`display: none`, `classList.toggle`, conditional rendering) to identify states

### Phase 8: Root Index Assembly

`main.spec.json` is built by aggregating:
- Project identity from the project manifest
- Feature index from all generated feature specs (grouped by layer)
- Dependency graph as a flat edge map for quick traversal
- IPC/API catalog from all `ipc` and `api` arrays across features
- Keyboard shortcuts from UI components
- Test coverage from file naming conventions

---

## Using the Specs Graph

### Traversal

Start at `main.spec.json`, read a feature's `spec` file, then follow:

- `dependencies[].file` → find the feature that owns that file → read its spec
- `referenced_by[].file` → find callers to understand impact of changes
- `ui.spec` → read the UI sub-spec for DOM/interaction details

### Feature Design

To design a new feature:

1. Define the feature spec first (name, description, type, layer)
2. Populate `interface` with expected public surface
3. Populate `dependencies` with features it will import
4. Populate existing features' `referenced_by` with the new feature
5. If `type: "ui"` and meets criteria, create a UI sub-spec with interactions and states
6. Implement against the spec
7. Verify that all `interface.methods` exist, all `interactions` work, all `states` are reachable

### Test Generation

Each spec provides test scaffolding:

| Spec field | Test that should be written |
|-----------|---------------------------|
| `interface.methods` | Unit test each method's behavior |
| `interface.properties` | Unit test property accessors |
| `interactions` | Integration test each interaction path |
| `states` | Test each state transition, verify visual properties |
| `dependencies` | Verify that mocked dependencies behave correctly |
| `ipc` / `api` | Mock channels, verify correct payloads |
| `security` | Test that security constraints hold |
| `lifecycle` | Test create/destroy cycle, verify cleanup |

---

## Adoption Guide

To adopt SPECGEN for your project:

1. **Choose your specs directory** (default: `src/specs/`, but any path works)
2. **Create `main.spec.json`** — fill in project identity, stack, architecture
3. **Classify source files** — assign each file a `type` and `layer`
4. **Generate feature specs** — one per non-test source file
5. **Generate UI sub-specs** — for qualifying UI features
6. **Wire up the dependency graph** — extract imports and build edge lists
7. **Catalog IPC/API channels** — document all cross-boundary communication
8. **Track test coverage** — link each spec to its test file

### Minimal starting template

```jsonc
// main.spec.json — start here
{
  "name": "<project>",
  "version": "0.1.0",
  "description": "<summary>",
  "stack": {
    "runtime": "<runtime and version>",
    "language": "<language and version>",
    "build": { "<target>": "<toolchain>" },
    "key_deps": {},
    "testing": "<framework>"
  },
  "architecture": {
    "process_model": "<description>",
    "ipc_or_api_pattern": "<description>",
    "state_persistence": "<description>"
  },
  "features": {},
  "dependency_graph": { "description": "", "edges": {} },
  "test_coverage": {
    "total_test_files": 0,
    "total_tests": "0",
    "run_time": "N/A",
    "framework": "<framework>",
    "specs_with_direct_tests": 0,
    "specs_with_indirect_tests": 0,
    "specs_without_tests": 0
  }
}
```
