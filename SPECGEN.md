# SPECGEN — Specs Graph Generator

## Purpose Test

SPECGEN defines the specification format and methodology for Cockpit IDE's source
audit system. It produces a machine-readable **specs graph** — a DAG of JSON
files where each node is a feature spec, edges are dependency/reference links,
and leaf UI specs capture DOM structure and interaction behavior.

The specs graph supports three workflows:

1. **Audit** — scan `src/` and generate specs that mirror the actual implementation
2. **Design** — define new features by writing specs first, then implementing to spec
3. **Test** — generate test cases from `interactions`, `states`, and `interface` blocks

## File Structure

```
src/specs/
├── main.spec.json          # Root: project manifest, feature index, IPC catalog, dep graph
├── <feature>.spec.json     # Feature spec: one per non-test source file in src/
└── <feature>-ui.spec.json  # UI sub-spec: one per feature with complex DOM/interactions
```

### Naming Convention

| Pattern | Example | Purpose |
|---------|---------|---------|
| `main.spec.json` | Root index only | Project-level manifest |
| `<feature>.spec.json` | `plugin-card.spec.json` | Feature definition (matches kebab-cased source file name) |
| `<feature>-ui.spec.json` | `welcome-modal-ui.spec.json` | UI interaction spec for a UI-type feature |

---

## Tier 1 — `main.spec.json` (Root)

The root index catalogs the entire project. It is the entry point for all tools
traversing the specs graph.

### Schema

```jsonc
{
  // ─── Project identity ───
  "name": "string",             // Project display name
  "version": "string",          // Semver from package.json

  "description": "string",      // One-paragraph elevator pitch

  // ─── Technical stack ───
  "stack": {
    "runtime": "string",        // e.g. "Electron 42"
    "language": "string",       // e.g. "TypeScript 5.8"
    "build": {                  // Build toolchain per target
      "renderer": "string",
      "main_preload": "string",
      "dev": "string"
    },
    "key_deps": {               // Major third-party libraries
      "<label>": "string"
    },
    "testing": "string"         // Test framework + env
  },

  // ─── Architecture overview ───
  "architecture": {
    "process_model": "string",  // Electron process layout
    "ipc_pattern": "string",    // How IPC flows (invoke, send, push events)
    "canvas_model": "string",   // Coordinate transform formula
    "card_model": "string",     // Card plugin containment pattern
    "state_persistence": "string" // Serialization format and path
  },

  // ─── Feature index (by layer) ───
  "features": {
    // Each layer is a key → array of feature entries.
    // Layers are ordered: foundation → core → widgets → modals_and_overlays → plugins
    "<layer>": [
      {
        "id": "string",          // Unique feature ID (kebab-case, matches file stem)
        "name": "string",        // Human-readable display name
        "file": "string",        // Source file name (no path, for cross-reference)
        "spec": "string",        // Feature spec filename
        "ui": "string"           // UI sub-spec filename (only if type=ui + complex DOM)
      }
    ]
  },

  // ─── Dependency graph (edges only, for quick graph construction) ───
  "dependency_graph": {
    "description": "string",
    "edges": {
      // "file.ts" → ["dep1.ts", "dep2.ts", ...]
      // Only internal src/ imports, not external packages
      "<file>": ["<dependency_file>"]
    }
  },

  // ─── IPC channel catalog ───
  "ipc_channels": {
    // Namespace → array of channel names
    "<namespace>": ["channel:action"]
  },

  // ─── Global keyboard shortcuts ───
  "keyboard_shortcuts": [
    {
      "key": "string",           // Key combo (e.g. "Ctrl+Shift+N")
      "scope": "string",         // "app" | "canvas" | "editor" | "terminal" | "modal" | "palette"
      "action": "string"         // What happens
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

One per non-test TypeScript source file under `src/`. Every file is a feature.

### Type Taxonomy

| `type` | Meaning | Example files |
|--------|---------|---------------|
| `model` | Ambient type declarations, interfaces, contracts | `global.d.ts` |
| `process` | Electron main or preload process code | `main.ts`, `preload.ts` |
| `ui` | DOM-manipulating component with visual output | `App.ts`, `PluginCard.ts`, modals |
| `logic` | Pure logic with no DOM (utility singletons) | `theme.ts` |
| `utility` | Stateless helper functions or classes | `canvas-grid.ts`, `TextRenderer.ts` |

### Layer Taxonomy

| `layer` | Meaning | Example features |
|---------|---------|-----------------|
| `foundation` | No src/ imports, consumes only platform APIs | `type-model`, `main-process`, `preload-bridge`, `ide-server` |
| `core` | Imported by orchestrator, imports widgets | `renderer-entry`, `app-shell`, `canvas-engine`, `theme` |
| `widget` | Reusable UI building blocks | `plugin-card`, `context-menu`, `topbar` |
| `modal` | Promise-returning overlay dialogs | `welcome-modal`, `confirm-modal` |
| `overlay` | Floating non-modal UI (palette, tutorial) | `command-palette`, `tutorial` |
| `plugin` | Card-contained feature plugin | `terminal-plugin`, `monaco-editor-plugin`, `specsmap-plugin` |

### Schema

```jsonc
{
  // ─── Identity ───
  "name": "string",              // Human-readable feature name
  "file": "string",              // Relative path from src/ (e.g. "src/renderer/components/PluginCard.ts")

  "description": "string",       // What it does, how it works, key behaviors

  "type": "ui | data | logic | process | utility | model",   // Kind category
  "layer": "foundation | core | widget | plugin | modal | overlay | utility",  // Architectural layer

  "singleton": "boolean",        // true if only one instance exists in the app

  // ─── Public surface ───
  "exports": ["ClassName", "InterfaceName"],  // Top-level exports

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

  // ─── IPC channels (if any) ───
  "ipc": ["channel:action"],     // Channels this feature invokes or listens to

  // ─── Class/function interface ───
  "interface": {
    "constructor": "string",     // Constructor signature (if a class)
    "methods": [
      {
        "name": "string",
        "signature": "string",   // TypeScript-style signature
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
    "schema": "string",          // Type name
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
  "external_deps": ["package-name"],  // Third-party npm packages used

  // ─── Test file ───
  "test": "string"               // Relative test file path from src/
}
```

### Feature-type-specific extensions

**For process-layer features** (`main-process`, `preload-bridge`):

```jsonc
{
  "ipc_handlers": {
    "<namespace>": ["channel:action (invoke|send)"],
    "events": ["channel:data (push to renderer)"]
  },
  "security": {
    "<mechanism>": "string"
  },
  "bridge": {
    "<namespace>": "string"      // How API shape is exposed
  }
}
```

**For plugin features** (`terminal-plugin`, `monaco-editor-plugin`, etc.):

```jsonc
{
  "features": {
    "<capability>": "string"     // Detailed feature descriptions
  }
}
```

**For canvas features** (`canvas-engine`):

```jsonc
{
  "transforms": {
    "<name>": "formula/description"
  },
  "interactions": [              // Canvas-level interactions (distinct from UI sub-spec)
    {
      "name": "string",
      "trigger": "string",
      "behavior": "string"
    }
  ],
  "callbacks": {
    "<name>": "signature — description"
  },
  "plugins": {
    "<plugin_type>": {
      "default_size": { "w": "number", "h": "number" },
      "singleton": "boolean"
    }
  }
}
```

**For modal features** (`welcome-modal`, `confirm-modal`, etc.):

```jsonc
{
  "interface": {
    "constructor": "new ModalName()",
    "methods": [
      { "name": "open", "signature": "() => Promise<T>", "description": "string" }
    ]
  }
}
```

---

## Tier 3 — `<feature>-ui.spec.json` (UI Sub-Spec)

Created for features with `type: "ui"` that have complex DOM structure and
interactions warranting a separate spec. Criteria: the feature creates/manipulates
DOM elements beyond a single wrapper div, has user interactions, or has distinct
visual states.

### Criteria for creating a UI sub-spec

| Has UI sub-spec | Does NOT have UI sub-spec |
|----------------|--------------------------|
| Creates multiple DOM elements with structured layout | Single wrapper div for third-party embed (terminal, monaco) |
| Has user interactions (click, drag, hover, keyboard) | Purely delegates to child components |
| Has distinct visual states (open/closed, active/inactive, etc.) | State is fully described in parent feature spec |
| Is a modal, overlay, menu, card, or plugin with complex DOM | Is a process handler, utility, or plugin glue |

### Schema

```jsonc
{
  // ─── Identity ───
  "name": "string",              // e.g. "Welcome Modal UI"
  "parent": "string",            // Feature ID this UI spec belongs to

  "description": "string",       // Scope of this UI spec

  // ─── DOM structure ───
  "dom": {
    // Root element description: selector + CSS inline styles
    "root": "string",            // e.g. ".card" or ".modal-overlay"
    "style": "string",           // Key CSS properties inline
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

  // ─── Content/Props (optional, for configurable modals) ───
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
- **Callback fire**: `Fire onDragEnd(worldX, worldY), snap to 28px grid final position`
- **Multi-action chains**: Use `→` separator — `Remove all existing menus → create new .ctx-menu → append to body`

---

## Generation Methodology

### Phase 1: File Discovery

Walk `src/` recursively, collecting every `.ts` file that is not a test file
(`*.test.ts`) and not test infrastructure (`src/test/setup.ts`).

### Phase 2: Classification

For each file, determine:

1. **Type** — Read the file's imports and exports:
   - Imports only from `electron` → `process`
   - Imports DOM APIs (`document.createElement`, `innerHTML`, `appendChild`) → `ui`
   - Exports only types/interfaces, no runtime code → `model`
   - Exports a singleton with state + CSS property setters but no DOM creation → `logic`
   - Exports pure functions with no side effects → `utility`

2. **Layer** — Map dependency depth to layer:
   - `foundation` — imports nothing from `src/`
   - `core` — imports only from foundation or same-layer
   - `widget` — imported by core, imports utilities
   - `modal` / `overlay` — creates a fixed-position overlay, returns a Promise
   - `plugin` — instantiated inside a `PluginCard` body

3. **Singleton** — `true` if the class is instantiated exactly once (check all call sites) or uses a singleton pattern.

### Phase 3: Dependency Edge Extraction

Parse each file's `import` statements. For every import from `src/` (not `node_modules`),
record an edge:

```
<current_file> → <imported_file>
```

Edges go in both directions in the spec:
- `dependencies` — forward edges (what this file imports)
- `referenced_by` — reverse edges (what imports this file)

### Phase 4: Interface Extraction

For each exported class or function:

- **Classes**: Extract `constructor` signature, public method names/signatures, public property names/types
- **Functions**: Extract parameter types and return type
- **Types**: Extract interface/type alias definitions and their fields
- **Events**: Extract callback property patterns (`onXxx: (() => void) | null`)

### Phase 5: State Schema Extraction

Search for serialization patterns:
- `JSON.stringify` calls on typed objects → that type is a state schema
- Functions named `getState()`, `getSaveState()`, `toJSON()` → return type is a state schema
- Files that `fs.writeFileSync` or IPC `workspace:save` → track what they write

### Phase 6: IPC Cataloging

Search for:
- In main process: `ipcMain.handle('channel:name', ...)` and `ipcMain.on('channel:name', ...)`
- In preload: `ipcRenderer.invoke('channel:name', ...)` and `ipcRenderer.send('channel:name', ...)`
- In renderer: `window.electronAPI?.namespace.methodName()`
- Push events: `webContents.send('channel:name', ...)` in main, `ipcRenderer.on('channel:name', ...)` in preload/renderer

Map each IPC channel to the feature that produces it (main) and the features that consume it (renderer).

### Phase 7: UI Sub-Spec Generation

For each `type: "ui"` feature, evaluate UI sub-spec criteria:

1. Does it create 2+ DOM elements with meaningful structure?
2. Does it have 2+ distinct user interactions?
3. Does it have 2+ visual states?
4. Is it a modal, overlay, menu, card, or plugin with complex DOM?

If **3+ criteria are met**, generate a UI sub-spec. Otherwise, inline UI details in the feature spec.

The UI sub-spec is generated by:
1. Reading `innerHTML` assignments and `createElement` + `appendChild` chains to reconstruct DOM
2. Reading event listener registrations (`addEventListener`) to catalog interactions
3. Reading `style.display = 'none'` / `style.display = 'flex'` patterns to identify states

### Phase 8: Root Index Assembly

`main.spec.json` is built by aggregating:
- Project identity from `package.json`
- Feature index from all generated feature specs (grouped by layer)
- Dependency graph as a flat edge map for quick traversal
- IPC catalog from all `ipc` arrays across features
- Keyboard shortcuts from `App.ts` keyboard handler + editor + terminal
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
| `ipc` | Mock IPC channels, verify correct payloads |
| `security` | Test that security constraints hold |
| `lifecycle` | Test create/destroy cycle, verify cleanup |

### Example test flow for `welcome-modal`:

```
Spec → Test

interface.methods[open]     → test: open() returns Promise<string|null>
interactions[open_workspace] → test: click #welcome-open calls IPC workspace:select
interactions[recent_click]   → test: click recent item resolves with correct path
states[empty_recent]         → test: no recent workspaces → #welcome-recent is hidden
states[missing_recent]       → test: deleted workspace path shown with .welcome-recent-item-missing
```

---

## File Count Summary

| Tier | Count | Description |
|------|-------|-------------|
| `main.spec.json` | 1 | Root project index |
| `<feature>.spec.json` | 26 | One per non-test source file |
| `<feature>-ui.spec.json` | 11 | UI sub-specs for qualifying features |
| **Total** | **38** | |

### Feature specs (26)

| Layer | Count | Features |
|-------|-------|----------|
| foundation | 4 | type-model, main-process, preload-bridge, ide-server |
| core | 6 | renderer-entry, app-shell, canvas-engine, theme, canvas-grid, canvas-statusbar |
| widget | 4 | plugin-card, text-renderer, context-menu, topbar |
| modal | 3 | welcome-modal, about-modal, confirm-modal |
| overlay | 2 | tutorial, command-palette |
| plugin | 7 | terminal-plugin, monaco-editor-plugin, file-explorer-plugin, explorer-plugin, markdown-plugin, git-plugin, specsmap-plugin |

### UI sub-specs (11)

| Parent feature | UI spec file |
|---------------|-------------|
| app-shell | `app-shell-ui.spec.json` |
| canvas-engine | `canvas-engine-ui.spec.json` |
| plugin-card | `plugin-card-ui.spec.json` |
| topbar | `topbar-ui.spec.json` |
| context-menu | `context-menu-ui.spec.json` |
| welcome-modal | `welcome-modal-ui.spec.json` |
| about-modal | `about-modal-ui.spec.json` |
| confirm-modal | `confirm-modal-ui.spec.json` |
| tutorial | `tutorial-ui.spec.json` |
| command-palette | `command-palette-ui.spec.json` |
| specsmap-plugin | `specsmap-plugin-ui.spec.json` |
