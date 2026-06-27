---
name: SpecsMap Plugin UI
parent: specsmap-plugin
---

# SpecsMap Plugin UI

Interactive dependency graph with SVG edges, positionable nodes, search, and detail panel.

## DOM Structure

```html
<div class="specsmap">
  <!-- Tab bar for multiple spec collections -->
  <div class="specsmap-tab-bar"></div>
  <!-- Search bar (toggled) -->
  <div class="specsmap-search" style="display:none">
    <input class="specsmap-search-input" placeholder="Search specs...">
    <span class="specsmap-search-count"></span>
  </div>
  <!-- Toolbar -->
  <div class="specsmap-toolbar">
    <button class="specsmap-refresh-btn">Refresh</button>
    <span class="specsmap-validation-badge"></span>
    <button class="specsmap-fit-btn">Fit All</button>
    <button class="specsmap-cycle-btn">Cycles</button>
    <button class="specsmap-search-btn">Search</button>
  </div>
  <!-- Graph viewport -->
  <div class="specsmap-viewport">
    <div class="specsmap-graph" style="transform: scale(1) translate(0,0)">
      <svg class="specsmap-edges"><!-- bezier curves connecting nodes --></svg>
      <div class="specsmap-nodes">
        <div class="specsmap-node" style="left:X;top:Y;width:W;height:H;border-color:var(--green)">
          <div class="specsmap-node-name">Feature Name</div>
          <div class="specsmap-node-file">src/file.ts</div>
          <div class="specsmap-node-layer">foundation</div>
        </div>
        <!-- more nodes -->
      </div>
    </div>
  </div>
  <!-- Detail panel (slide-in) -->
  <div class="specsmap-panel" style="display:none">
    <div class="specsmap-panel-header"></div>
    <div class="specsmap-panel-inner"><!-- parsed spec data --></div>
  </div>
</div>
```

## Interactions

### Zoom
- **trigger:** `wheel` on graph viewport
- Scale transform up/down, centered on mouse position.

### Pan
- **trigger:** `mousedown` + `mousemove` on viewport background
- Update `panX`/`panY`, schedule transform.

### Node Click
- **trigger:** `click` on `.specsmap-node`
- Select node, highlight it, show detail panel with full spec frontmatter, dependencies, referenced-by.

### Search
- **trigger:** `click` search button or `Ctrl+F`
- Show search bar. Type filters nodes by name. ArrowUp/Down cycle through results. Enter opens selected node.

### Cycle Detection
- **trigger:** `click` cycle button
- Compute strongly connected components. Toggle cycle highlighting. Show cycle sets in panel.

### Fit All
- **trigger:** `click` fit button
- Compute bounding box of all nodes, set scale and pan to fit all nodes in viewport.

## States

### Node Selected
- Selected node gets a highlighted border. Detail panel opens on the right showing the node's spec data.

### Search Active
- Search bar visible. Matching nodes highlighted, non-matching dimmed. Count shows "N results".

### Cycle Mode
- Nodes in cycles highlighted. Panel shows cycle sets with toggle buttons.

### Empty State
- No spec files found: shows empty state message with path to specs directory.
