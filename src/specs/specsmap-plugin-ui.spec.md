---
name: SpecsMap Plugin UI
file: src/renderer/components/SpecsMapPlugin.ts
type: ui
layer: plugin
singleton: false
exports: []
---

# SpecsMap Plugin UI

UI sub-spec for the SpecsMap dependency graph visualizer: SVG edge rendering, node layout by layer, search/filter, detail panel, cycle analysis, and settings panel.

## DOM Structure

```json
{
  "root": ".sm-container (flex column)",
  "structure": {
    "header": {
      "elements": [
        ".sm-header-sub (instruction text)",
        ".sm-header-path (specs dir path)",
        ".sm-validation-badge (validation status)",
        ".sm-search-btn (search toggle)",
        ".sm-cycle-btn (settings gear icon)",
        ".sm-fit-btn (eye icon - reset view)",
        ".sm-refresh-btn (refresh icon)"
      ]
    },
    "search_bar": ".sm-search-bar (conditionally visible): input + results count",
    "viewport": {
      "type": "overflow:hidden container",
      "children": [
        "svg.sm-edges-layer (SVG path elements for dependency edges)",
        ".sm-nodes-layer (positioned div nodes)"
      ]
    },
    "node": {
      "structure": ".sm-node with header (layer-colored bar), name, source file, layer badge",
      "sizes": "280x100 for feature nodes, 230x62 for UI sub-spec nodes",
      "colors": {
        "foundation": "var(--green)",
        "core": "var(--accent)",
        "widget": "var(--accent2)",
        "modal": "var(--amber)",
        "overlay": "var(--red)",
        "plugin": "var(--secondary)"
      }
    },
    "detail_panel": ".sm-panel (slide-in from right, 320px wide): shows full spec JSON"
  }
}
```

## Interactions

### hover on .sm-node

Highlights the node and its dependency edges; dims unrelated nodes

### click on .sm-node

Opens detail panel with full spec data; shows source file link

### mouse drag on viewport background

Pans the graph viewport

### wheel on viewport

Zooms in/out centered on mouse position

### click on .sm-search-btn

Toggles search bar; focuses input

### input in search bar

Filters nodes by name; highlights matching results with keyboard navigation

### Enter in search bar

Focuses on the first/next search result node

### click on .sm-refresh-btn

Reloads all spec files from disk and rebuilds graph

### click on .sm-fit-btn

Fits all nodes into visible viewport

### click on .sm-cycle-btn

Opens settings panel with layer visibility toggles

## States

### empty

No spec files found; shows empty state message

### graph-loaded

All nodes and edges rendered; interaction enabled

### detail-open

Detail panel visible showing selected node spec data

### search-active

Search bar open with filter results highlighted

### cycle-mode

Cycle analysis active showing dependency layers with colored highlights

### isolated-mode

Only the selected node and its direct dependencies/dependents visible

### validation-error

Validation badge shows count of broken references (dependencies with no matching spec)

