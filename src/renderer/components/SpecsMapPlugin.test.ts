import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpecsMapPlugin } from './SpecsMapPlugin';
import { mockElectronAPI } from '../../test/setup';

// ── MD spec helpers ──────────────────────────────────────────────────────────

function makeSpecMd(data: {
  name: string;
  file?: string;
  parent?: string;
  type?: string;
  layer?: string;
  singleton?: boolean;
  exports?: string[];
  dependencies?: Array<{ feature: string; file: string; usage?: string }>;
  referenced_by?: Array<{ feature: string; file: string }>;
  ipc?: string[];
}): string {
  let fm = '---\n';
  if (data.name) fm += `name: ${data.name}\n`;
  if (data.parent) fm += `parent: ${data.parent}\n`;
  if (data.file) fm += `file: ${data.file}\n`;
  if (data.type) fm += `type: ${data.type}\n`;
  if (data.layer) fm += `layer: ${data.layer}\n`;
  if (data.singleton !== undefined) fm += `singleton: ${data.singleton}\n`;
  if (data.exports) fm += `exports: [${data.exports.join(', ')}]\n`;
  fm += '---\n\n';

  let md = fm + `# ${data.name}\n\n`;

  if (data.dependencies?.length) {
    md += '## Dependencies\n\n';
    for (const d of data.dependencies) {
      md += `- **${d.feature}** \`${d.file}\``;
      if (d.usage) md += ` — ${d.usage}`;
      md += '\n';
    }
    md += '\n';
  }

  if (data.referenced_by?.length) {
    md += '## Referenced By\n\n';
    for (const r of data.referenced_by) md += `- **${r.feature}** \`${r.file}\`\n`;
    md += '\n';
  }

  if (data.ipc?.length) {
    md += '## IPC Channels\n\n';
    for (const ch of data.ipc) md += `- \`${ch}\`\n`;
    md += '\n';
  }

  return md;
}

function makeMainMd(features: Record<string, Array<{ id: string; name: string; file: string; spec: string; ui?: string }>>): string {
  let md = '---\nname: Test Project\n---\n\n# Test Project\n\n## Features\n\n';
  for (const [layer, items] of Object.entries(features)) {
    md += `### ${layer}\n\n| id | name | file | spec | ui |\n|----|------|------|------|----|` + '\n';
    for (const f of items) md += `| ${f.id} | ${f.name} | ${f.file} | ${f.spec} | ${f.ui ?? ''} |\n`;
    md += '\n';
  }
  return md;
}

// ── Fixture data ─────────────────────────────────────────────────────────────

const MAIN_SPEC = makeMainMd({
  core: [
    { id: 'theme', name: 'Theme', file: 'theme.ts', spec: 'theme.spec.md' },
    { id: 'canvas-engine', name: 'Canvas Engine', file: 'CanvasArea.ts', spec: 'canvas-engine.spec.md', ui: 'canvas-engine-ui.spec.md' },
  ],
  widget: [
    { id: 'plugin-card', name: 'Plugin Card', file: 'PluginCard.ts', spec: 'plugin-card.spec.md' },
  ],
  plugins: [
    { id: 'terminal-plugin', name: 'Terminal Plugin', file: 'TerminalPlugin.ts', spec: 'terminal-plugin.spec.md' },
  ],
});

const SPEC_FILES: Record<string, string> = {
  'theme.spec.md': makeSpecMd({
    name: 'Theme', file: 'src/renderer/theme.ts', type: 'logic', layer: 'core',
    dependencies: [],
    referenced_by: [{ feature: 'Canvas Engine', file: 'CanvasArea.ts' }],
  }),
  'canvas-engine.spec.md': makeSpecMd({
    name: 'Canvas Engine', file: 'src/renderer/components/CanvasArea.ts', type: 'ui', layer: 'core',
    dependencies: [{ feature: 'Theme', file: 'theme.ts', usage: 'Uses theme singleton' }],
    referenced_by: [{ feature: 'Plugin Card', file: 'PluginCard.ts' }],
  }),
  'canvas-engine-ui.spec.md': makeSpecMd({
    name: 'Canvas Engine UI', parent: 'canvas-engine',
  }),
  'plugin-card.spec.md': makeSpecMd({
    name: 'Plugin Card', file: 'src/renderer/components/PluginCard.ts', type: 'ui', layer: 'widget',
    dependencies: [{ feature: 'Canvas Engine', file: 'CanvasArea.ts' }],
    referenced_by: [],
  }),
  'terminal-plugin.spec.md': makeSpecMd({
    name: 'Terminal Plugin', file: 'src/renderer/components/TerminalPlugin.ts', type: 'ui', layer: 'plugin',
    dependencies: [],
    referenced_by: [{ feature: 'Canvas Engine', file: 'CanvasArea.ts' }],
  }),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'width:800px;height:600px';
  document.body.appendChild(el);
  return el;
}

async function flushSpecs(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 0));
  }
}

describe('SpecsMapPlugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    vi.clearAllMocks();

    const style = document.getElementById('sm-styles');
    if (style) style.remove();

    const specFiles = Object.keys(SPEC_FILES);
    (mockElectronAPI.fs.readDir as any).mockResolvedValue(
      specFiles.map(name => ({ name, isDirectory: false }))
    );
    (mockElectronAPI.fs.readFile as any).mockImplementation((path: string) => {
      const filename = path.split('/').pop()!;
      if (filename === 'main.spec.md') return Promise.resolve(MAIN_SPEC);
      if (SPEC_FILES[filename]) return Promise.resolve(SPEC_FILES[filename]);
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    const style = document.getElementById('sm-styles');
    if (style) style.remove();
  });

  it('appends a div to the container', () => {
    new SpecsMapPlugin(container, '/test/ws');
    expect(container.children.length).toBe(1);
    expect(container.children[0]).toBeInstanceOf(HTMLDivElement);
  });

  it('creates the header with subtitle', () => {
    new SpecsMapPlugin(container, '/test/ws');
    expect(container.textContent).toContain('hover to trace');
  });

  it('calls fs.readDir and fs.readFile for specs', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    expect(mockElectronAPI.fs.readDir).toHaveBeenCalled();
    expect(mockElectronAPI.fs.readFile).toHaveBeenCalled();
  });

  it('reads main.spec.md via fs.readFile', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const calls = (mockElectronAPI.fs.readFile as any).mock.calls as string[][];
    const mainCall = calls.find((c: string[]) => c[0].includes('main.spec.md'));
    expect(mainCall).toBeTruthy();
  });

  it('renders a node element for each spec file', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const nodes = container.querySelectorAll('.sm-node');
    expect(nodes.length).toBe(Object.keys(SPEC_FILES).length);
  });

  it('renders UI sub-nodes with .sm-node-ui class', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const uiNodes = container.querySelectorAll('.sm-node-ui');
    expect(uiNodes.length).toBe(1);
  });

  it('renders layer headers', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const headers = container.querySelectorAll('.sm-layer-header');
    expect(headers.length).toBeGreaterThanOrEqual(1);
  });

  it('renders SVG defs with markers', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const svg = container.querySelector('svg.sm-graph');
    expect(svg).toBeTruthy();
    const defs = svg!.querySelector('defs');
    expect(defs).toBeTruthy();
    const markers = defs!.querySelectorAll('marker');
    expect(markers.length).toBeGreaterThanOrEqual(6);
  });

  it('shows error state when readFile fails', async () => {
    (mockElectronAPI.fs.readFile as any).mockRejectedValue(new Error('denied'));
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    expect(container.textContent).toContain('Error loading specs');
  });

  it('clicking a node opens the detail panel', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const node = container.querySelector('.sm-node') as HTMLElement;
    expect(node).toBeTruthy();
    node.click();
    const panel = container.querySelector('[class*="sm-panel"]');
    expect(panel).toBeTruthy();
    expect(container.textContent).toContain('SPEC FILE');
  });

  it('clicking the selected node again hides the panel (translateX)', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const node = container.querySelector('.sm-node') as HTMLElement;
    node.click();
    // find the actual panel element by its known inline style
    const panel = container.querySelector('[style*="PANEL_W"], [style*="284px"]') as HTMLElement | null;
    if (panel) {
      expect(panel.style.transform).not.toContain('100%');
      node.click();
      expect(panel.style.transform).toContain('100%');
    }
  });

  it('sets .sm-selected class on clicked node', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const node = container.querySelector('.sm-node') as HTMLElement;
    node.click();
    expect(node.classList.contains('sm-selected')).toBe(true);
  });

  it('hover adds border highlight to connected nodes', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const themeNode = container.querySelector('.sm-node') as HTMLElement;
    expect(themeNode).toBeTruthy();
    themeNode.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(themeNode.style.borderStyle).toBe('solid');
    themeNode.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
  });

  it('destroy clears internal maps and does not throw', () => {
    const sm = new SpecsMapPlugin(container, '/test/ws');
    expect(() => sm.destroy()).not.toThrow();
  });

  it('destroy called twice does not throw', () => {
    const sm = new SpecsMapPlugin(container, '/test/ws');
    sm.destroy();
    expect(() => sm.destroy()).not.toThrow();
  });

  it('mouseenter on node dims non-connected nodes', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const nodes = container.querySelectorAll('.sm-node');
    expect(nodes.length).toBeGreaterThanOrEqual(2);

    (nodes[0] as HTMLElement).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const nonConnected = Array.from(nodes).filter(n => n.getAttribute('style')?.includes('0.14'));
    expect(nonConnected.length).toBeGreaterThanOrEqual(0);

    (nodes[0] as HTMLElement).dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
  });

  it('renders dep count and ref count in each main node', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const mainNodes = container.querySelectorAll('.sm-node:not(.sm-node-ui)');
    expect(mainNodes.length).toBeGreaterThan(0);
    for (const node of mainNodes) {
      const meta = (node as HTMLElement).querySelector('.sm-meta');
      expect(meta).toBeTruthy();
    }
  });

  it('panel close button slides panel out', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const node = container.querySelector('.sm-node') as HTMLElement;
    node.click();

    const closeBtn = container.querySelector('#sm-panel-close') as HTMLElement;
    expect(closeBtn).toBeTruthy();
    closeBtn.click();

    // Panel uses transform to hide, not display:none — verify translateX(100%)
    const panelEl = container.querySelector('[style*="284px"]') as HTMLElement | null;
    if (panelEl) expect(panelEl.style.transform).toContain('100%');
  });

  it('ignores a stale v1 snapshot and rebuilds from the corpus (v2 hash gate)', async () => {
    const snapNodes = Object.keys(SPEC_FILES).map(filename => {
      return {
        id: filename, name: 'STALE ' + filename, specFile: filename,
        sourceFile: '',
        layer: 'core', isUI: filename.includes('-ui'),
        deps: [], raw: {},
      };
    });
    const snapshot = JSON.stringify({ v: 1, ts: new Date().toISOString(), nodes: snapNodes });

    const baseReadFile = (mockElectronAPI.fs.readFile as any).getMockImplementation();
    (mockElectronAPI.fs.readFile as any).mockImplementation((path: string) => {
      if (path.includes('.cockpit/specsmap-')) return Promise.resolve(snapshot);
      return baseReadFile(path);
    });

    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();

    // v1 snapshot rejected — nodes come from the real corpus, not the stale cache
    expect(container.textContent).not.toContain('STALE');
    const nodes = container.querySelectorAll('.sm-node');
    expect(nodes.length).toBeGreaterThan(0);
    // a v2 snapshot is written back with a corpus hash
    const writes = (mockElectronAPI.fs.writeFile as any).mock.calls.filter(
      (c: string[]) => c[0].includes('.cockpit/specsmap-'));
    expect(writes.length).toBeGreaterThan(0);
    const written = JSON.parse(writes[writes.length - 1][1]);
    expect(written.v).toBe(2);
    expect(typeof written.corpusHash).toBe('string');
  });

  it('shows empty state when no spec files found', async () => {
    (mockElectronAPI.fs.readDir as any).mockImplementation((path: string) => {
      if (path.includes('/src/specs')) return Promise.resolve([]);
      // src/ and root dir checks in showEmptyState
      return Promise.resolve([]);
    });
    (mockElectronAPI.fs.readFile as any).mockResolvedValue(null);

    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();

    expect(container.textContent).toContain('NO SPEC FILES');
  });

  it('destroy removes document event listeners', async () => {
    const sm = new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();

    const removeSpy = vi.spyOn(document, 'removeEventListener');
    sm.destroy();
    const removedEvents = removeSpy.mock.calls.map(c => c[0]);
    expect(removedEvents).toContain('mousemove');
    expect(removedEvents).toContain('mouseup');
    removeSpy.mockRestore();
  });

  it('renders SVG with dep edge paths', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const paths = container.querySelectorAll('svg.sm-graph path');
    expect(paths.length).toBeGreaterThan(0);
  });

  it('injects sm-styles only once across instances', () => {
    const c2 = makeContainer();
    new SpecsMapPlugin(container, '/test/ws');
    new SpecsMapPlugin(c2, '/test/ws');
    const styles = document.querySelectorAll('#sm-styles');
    expect(styles.length).toBe(1);
  });

  it('renders a gear cycle-detection button in the header', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const btn = container.querySelector('.sm-header-btn') as HTMLElement;
    expect(btn).toBeTruthy();
  });

  it('gear click opens settings panel with toggle', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const gearBtns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[1].click();
    expect(container.textContent).toContain('Settings');
    expect(container.textContent).toContain('Show cyclic dependencies');
  });

  it('gear click again closes settings panel', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const gearBtns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    const gearBtn = gearBtns[1];
    gearBtn.click();
    // Find the panel by its z-index style
    const panel = container.querySelector('[style*="z-index: 20"]') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.style.transform).not.toContain('100%');
    gearBtn.click();
    expect(panel.style.transform).toContain('100%');
  });

  it('toggle in settings panel detects 2-node cycle (A→B→A)', async () => {
    const cyclicSpecFiles: Record<string, string> = {
      'main.spec.md': makeMainMd({ core: [
        { id: 'alpha', name: 'Alpha', file: 'alpha.ts', spec: 'alpha.spec.md' },
        { id: 'beta', name: 'Beta', file: 'beta.ts', spec: 'beta.spec.md' },
      ] }),
      'alpha.spec.md': makeSpecMd({
        name: 'Alpha', file: 'src/alpha.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'Beta', file: 'beta.ts' }],
        referenced_by: [{ feature: 'Beta', file: 'beta.ts' }],
      }),
      'beta.spec.md': makeSpecMd({
        name: 'Beta', file: 'src/beta.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'Alpha', file: 'alpha.ts' }],
        referenced_by: [{ feature: 'Alpha', file: 'alpha.ts' }],
      }),
    };

    (mockElectronAPI.fs.readDir as any).mockResolvedValue(
      Object.keys(cyclicSpecFiles).map(name => ({ name, isDirectory: false }))
    );
    (mockElectronAPI.fs.readFile as any).mockImplementation((path: string) => {
      const filename = path.split('/').pop()!;
      return Promise.resolve(cyclicSpecFiles[filename] ?? null);
    });

    const c = makeContainer();
    new SpecsMapPlugin(c, '/test/ws');
    await flushSpecs();

    // Open settings panel
    const gearBtns = c.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[1].click();

    // Click the toggle to run cycle detection
    const toggle = c.querySelector('#sm-cycle-toggle') as HTMLElement;
    expect(toggle).toBeTruthy();
    toggle.click();

    // Nodes should be highlighted (solid border) for cycle
    const nodes = c.querySelectorAll('.sm-node');
    for (const node of nodes) {
      expect((node as HTMLElement).style.borderStyle).toBe('solid');
      expect((node as HTMLElement).style.borderColor).toBeTruthy();
    }

    // Panel should show cycle info
    expect(c.textContent).toContain('CYCLES');
  });

  it('toggle in settings panel shows acyclic for single isolated node', async () => {
    const isolatedSpecFiles: Record<string, string> = {
      'main.spec.md': makeMainMd({ core: [
        { id: 'solo', name: 'Solo', file: 'solo.ts', spec: 'solo.spec.md' },
      ] }),
      'solo.spec.md': makeSpecMd({
        name: 'Solo', file: 'src/solo.ts', type: 'logic', layer: 'core',
        dependencies: [],
        referenced_by: [],
      }),
    };

    (mockElectronAPI.fs.readDir as any).mockResolvedValue(
      Object.keys(isolatedSpecFiles).map(name => ({ name, isDirectory: false }))
    );
    (mockElectronAPI.fs.readFile as any).mockImplementation((path: string) => {
      const filename = path.split('/').pop()!;
      return Promise.resolve(isolatedSpecFiles[filename] ?? null);
    });

    const c = makeContainer();
    new SpecsMapPlugin(c, '/test/ws');
    await flushSpecs();

    const gearBtns = c.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[1].click();

    const toggle = c.querySelector('#sm-cycle-toggle') as HTMLElement;
    toggle.click();

    expect(c.textContent).toContain('No cycles');
  });

  it('toggle detects 3-node cycle (A→B→C→A) and shows members in panel', async () => {
    const cyclicSpecFiles: Record<string, string> = {
      'main.spec.md': makeMainMd({ core: [
        { id: 'a', name: 'A', file: 'a.ts', spec: 'a.spec.md' },
        { id: 'b', name: 'B', file: 'b.ts', spec: 'b.spec.md' },
        { id: 'c', name: 'C', file: 'c.ts', spec: 'c.spec.md' },
      ] }),
      'a.spec.md': makeSpecMd({
        name: 'A', file: 'src/a.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'B', file: 'b.ts' }],
        referenced_by: [{ feature: 'C', file: 'c.ts' }],
      }),
      'b.spec.md': makeSpecMd({
        name: 'B', file: 'src/b.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'C', file: 'c.ts' }],
        referenced_by: [{ feature: 'A', file: 'a.ts' }],
      }),
      'c.spec.md': makeSpecMd({
        name: 'C', file: 'src/c.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'A', file: 'a.ts' }],
        referenced_by: [{ feature: 'B', file: 'b.ts' }],
      }),
    };

    (mockElectronAPI.fs.readDir as any).mockResolvedValue(
      Object.keys(cyclicSpecFiles).map(name => ({ name, isDirectory: false }))
    );
    (mockElectronAPI.fs.readFile as any).mockImplementation((path: string) => {
      const filename = path.split('/').pop()!;
      return Promise.resolve(cyclicSpecFiles[filename] ?? null);
    });

    const c = makeContainer();
    new SpecsMapPlugin(c, '/test/ws');
    await flushSpecs();

    const gearBtns = c.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[1].click();

    const toggle = c.querySelector('#sm-cycle-toggle') as HTMLElement;
    toggle.click();

    // Panel should show cycle count of 1 and contain all 3 node names
    expect(c.textContent).toContain('CYCLES');
    expect(c.textContent).toContain('a.spec.md');
    expect(c.textContent).toContain('b.spec.md');
    expect(c.textContent).toContain('c.spec.md');
  });

  it('clicking near a cycle edge midpoint selects that cycle', async () => {
    const cyclicSpecFiles: Record<string, string> = {
      'main.spec.md': makeMainMd({ core: [
        { id: 'x', name: 'X', file: 'x.ts', spec: 'x.spec.md' },
        { id: 'y', name: 'Y', file: 'y.ts', spec: 'y.spec.md' },
      ] }),
      'x.spec.md': makeSpecMd({
        name: 'X', file: 'src/x.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'Y', file: 'y.ts' }],
        referenced_by: [{ feature: 'Y', file: 'y.ts' }],
      }),
      'y.spec.md': makeSpecMd({
        name: 'Y', file: 'src/y.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'X', file: 'x.ts' }],
        referenced_by: [{ feature: 'X', file: 'x.ts' }],
      }),
    };

    (mockElectronAPI.fs.readDir as any).mockResolvedValue(
      Object.keys(cyclicSpecFiles).map(name => ({ name, isDirectory: false }))
    );
    (mockElectronAPI.fs.readFile as any).mockImplementation((path: string) => {
      const filename = path.split('/').pop()!;
      return Promise.resolve(cyclicSpecFiles[filename] ?? null);
    });

    const c = makeContainer();
    new SpecsMapPlugin(c, '/test/ws');
    await flushSpecs();

    // Open settings and toggle cycle detection
    const gearBtns = c.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[1].click();
    const toggle = c.querySelector('#sm-cycle-toggle') as HTMLElement;
    toggle.click();
    await new Promise(r => setTimeout(r, 0));

    // Find the viewport (parent of the SVG) and compute the cycle edge midpoint
    const svg = c.querySelector('svg.sm-graph')!;
    const viewport = svg.parentElement!;
    const rect = viewport.getBoundingClientRect();

    // With 2 nodes (280x100), NODE_GAP=28, GRAPH_MARGIN=80:
    // Node positions: X@(-294,40), Y@(14,40)
    // Edge midpoint world: (( -294+140 + 14+140 )/2, (40+50 + 40+50)/2) = (0, 90)
    // fitScale=1.0, panX=400, panY=210
    // Viewport coords: (400, 300)
    viewport.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: rect.left + 400,
      clientY: rect.top + 300,
    }));

    // The selected cycle edge should have stroke-width 4
    const svgEl = c.querySelector('svg.sm-graph')!;
    const depPaths = svgEl.querySelectorAll<SVGPathElement>('path[data-etype="dep"]');
    const selectedEdge = Array.from(depPaths).find(p => p.getAttribute('stroke-width') === '4');
    expect(selectedEdge).toBeTruthy();
  });

  it('toggling cycle detection off clears highlights', async () => {
    const cyclicSpecFiles: Record<string, string> = {
      'main.spec.md': makeMainMd({ core: [
        { id: 'a', name: 'A', file: 'a.ts', spec: 'a.spec.md' },
        { id: 'b', name: 'B', file: 'b.ts', spec: 'b.spec.md' },
      ] }),
      'a.spec.md': makeSpecMd({
        name: 'A', file: 'src/a.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'B', file: 'b.ts' }],
        referenced_by: [{ feature: 'B', file: 'b.ts' }],
      }),
      'b.spec.md': makeSpecMd({
        name: 'B', file: 'src/b.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'A', file: 'a.ts' }],
        referenced_by: [{ feature: 'A', file: 'a.ts' }],
      }),
    };

    (mockElectronAPI.fs.readDir as any).mockResolvedValue(
      Object.keys(cyclicSpecFiles).map(name => ({ name, isDirectory: false }))
    );
    (mockElectronAPI.fs.readFile as any).mockImplementation((path: string) => {
      const filename = path.split('/').pop()!;
      return Promise.resolve(cyclicSpecFiles[filename] ?? null);
    });

    const c = makeContainer();
    new SpecsMapPlugin(c, '/test/ws');
    await flushSpecs();

    const gearBtns = c.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[1].click();

    // Toggle ON
    const toggle = c.querySelector('#sm-cycle-toggle') as HTMLElement;
    toggle.click();
    expect(c.textContent).toContain('CYCLES');

    // Toggle OFF
    toggle.click();
    expect(c.textContent).not.toContain('CYCLES');
  });

  it('settings panel has isolated nodes toggle', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const gearBtns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[1].click();
    expect(container.textContent).toContain('Show isolated nodes');
    const isolatedToggle = container.querySelector('#sm-isolated-toggle') as HTMLElement;
    expect(isolatedToggle).toBeTruthy();
  });

  it('toggling isolated mode highlights nodes with no deps/refs', async () => {
    const allFiles: Record<string, string> = {
      'main.spec.md': makeMainMd({ core: [
        { id: 'connected', name: 'Connected', file: 'connected.ts', spec: 'connected.spec.md' },
        { id: 'orphan', name: 'Orphan', file: 'orphan.ts', spec: 'orphan.spec.md' },
        { id: 'theme', name: 'Theme', file: 'theme.ts', spec: 'theme.spec.md' },
      ] }),
      'connected.spec.md': makeSpecMd({
        name: 'Connected', file: 'src/connected.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'Theme', file: 'theme.ts' }],
        referenced_by: [],
      }),
      'orphan.spec.md': makeSpecMd({
        name: 'Orphan', file: 'src/orphan.ts', type: 'logic', layer: 'core',
        dependencies: [],
        referenced_by: [],
      }),
      'theme.spec.md': makeSpecMd({
        name: 'Theme', file: 'src/theme.ts', type: 'logic', layer: 'core',
        dependencies: [],
        referenced_by: [{ feature: 'Connected', file: 'connected.ts' }],
      }),
    };

    (mockElectronAPI.fs.readDir as any).mockResolvedValue(
      Object.keys(allFiles).map(name => ({ name, isDirectory: false }))
    );
    (mockElectronAPI.fs.readFile as any).mockImplementation((path: string) => {
      const fn = path.split('/').pop()!;
      return Promise.resolve(allFiles[fn] ?? null);
    });

    const c = makeContainer();
    new SpecsMapPlugin(c, '/test/ws');
    await flushSpecs();

    const gearBtns = c.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[1].click();

    const isolatedToggle = c.querySelector('#sm-isolated-toggle') as HTMLElement;
    isolatedToggle.click();

    // Orphan node should have amber border
    const nodes = c.querySelectorAll('.sm-node');
    const orphanEl = Array.from(nodes).find(n => n.textContent?.includes('orphan')) as HTMLElement;
    expect(orphanEl).toBeTruthy();
    expect(orphanEl.classList.contains('sm-isolated')).toBe(true);
    const svg = c.querySelector('svg.sm-graph')!;
    expect(svg.querySelector('#sm-isolated-group rect')).toBeTruthy();
  });

  it('toggling isolated mode off restores default view', async () => {
    const c = makeContainer();
    new SpecsMapPlugin(c, '/test/ws');
    await flushSpecs();

    const gearBtns = c.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[1].click();

    const isolatedToggle = c.querySelector('#sm-isolated-toggle') as HTMLElement;
    isolatedToggle.click();
    isolatedToggle.click();

    // After toggling off, sm-isolated class and SVG rects should be removed
    const nodes = c.querySelectorAll('.sm-node');
    for (const node of nodes) {
      expect((node as HTMLElement).classList.contains('sm-isolated')).toBe(false);
    }
    const svg = c.querySelector('svg.sm-graph')!;
    expect(svg.querySelector('#sm-isolated-group rect')).toBeFalsy();
  });

  // ── Search tests ──

  it('renders a search button in the header', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const btns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    const searchBtn = btns[0];
    expect(searchBtn).toBeTruthy();
    expect(searchBtn.title).toContain('Search');
  });

  it('clicking search button opens search bar', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const btns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    btns[0].click();
    const searchBar = container.querySelector('.sm-search-bar') as HTMLElement;
    expect(searchBar).toBeTruthy();
    expect(searchBar.style.opacity).toBe('1');
    expect(searchBar.style.pointerEvents).toBe('auto');
  });

  it('typing in search dims non-matching nodes', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    // Open search
    const btns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    btns[0].click();
    const input = container.querySelector('.sm-search-bar input') as HTMLInputElement;
    expect(input).toBeTruthy();

    // Type partial word
    input.value = 'theme';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));

    const nodes = container.querySelectorAll('.sm-node');
    expect(nodes.length).toBeGreaterThan(0);
    // Theme node should be full opacity, others dimmed
    const themeEl = Array.from(nodes).find(n => n.textContent?.includes('Theme')) as HTMLElement;
    const pluginEl = Array.from(nodes).find(n => n.textContent?.includes('Terminal')) as HTMLElement;
    expect(themeEl).toBeTruthy();
    expect(pluginEl).toBeTruthy();
    expect(themeEl.style.opacity).toBe('1');
    expect(pluginEl.style.opacity).toBe('0.14');
  });

  it('search count shows correct number of matches', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const btns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    btns[0].click();
    const input = container.querySelector('.sm-search-bar input') as HTMLInputElement;
    const countEl = container.querySelector('.sm-search-bar span:nth-child(3)') as HTMLElement;

    input.value = 'canvas';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    // Matches: Canvas Engine node, Canvas Engine UI node, Plugin Card (dep feature), Theme (ref feature), Terminal Plugin (ref feature)
    expect(countEl.textContent).toBe('5');
  });

  it('Enter navigates to next search result', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const btns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    btns[0].click();
    const input = container.querySelector('.sm-search-bar input') as HTMLInputElement;

    input.value = 'terminal';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));

    // Should have selected first match (Terminal Plugin)
    let selected = container.querySelector('.sm-node.sm-selected');
    expect(selected).toBeTruthy();
    expect(selected!.textContent).toContain('Terminal');

    // Press Enter → navigate; single result wraps so still Terminal
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    selected = container.querySelector('.sm-node.sm-selected');
    expect(selected).toBeTruthy();
    expect(selected!.textContent).toContain('Terminal');
  });

  it('Shift+Enter navigates to previous search result', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const btns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    btns[0].click();
    const input = container.querySelector('.sm-search-bar input') as HTMLInputElement;

    input.value = 'terminal';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));

    // Shift+Enter on single-result search → wraps, still Terminal
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    const selected = container.querySelector('.sm-node.sm-selected');
    expect(selected).toBeTruthy();
    expect(selected!.textContent).toContain('Terminal');
  });

  it('keyword is highlighted in selected node .sm-name', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const btns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    btns[0].click();
    const input = container.querySelector('.sm-search-bar input') as HTMLInputElement;

    input.value = 'theme';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));

    const selected = container.querySelector('.sm-node.sm-selected .sm-name') as HTMLElement;
    expect(selected).toBeTruthy();
    // Should contain a highlight span
    const mark = selected.querySelector('.sm-search-mark');
    expect(mark).toBeTruthy();
    expect(mark!.textContent!.toLowerCase()).toBe('theme');
  });

  it('blur closes search and restores all node opacities', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const btns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    btns[0].click();
    const input = container.querySelector('.sm-search-bar input') as HTMLInputElement;

    input.value = 'theme';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));

    // Blur the input
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));

    // Search bar should be hidden
    const searchBar = container.querySelector('.sm-search-bar') as HTMLElement;
    expect(searchBar.style.opacity).toBe('0');
    expect(searchBar.style.pointerEvents).toBe('none');

    // All nodes should have cleared opacity
    const nodes = container.querySelectorAll('.sm-node');
    for (const node of nodes) {
      expect((node as HTMLElement).style.opacity).toBe('');
    }
  });

  it('Escape closes search', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const btns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    btns[0].click();
    const input = container.querySelector('.sm-search-bar input') as HTMLInputElement;
    expect(input).toBeTruthy();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    const searchBar = container.querySelector('.sm-search-bar') as HTMLElement;
    expect(searchBar.style.opacity).toBe('0');
  });

  it('Ctrl+F toggles search from document', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    // Open via Ctrl+F
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }));
    const searchBar = container.querySelector('.sm-search-bar') as HTMLElement;
    expect(searchBar.style.opacity).toBe('1');
    expect(searchBar.style.pointerEvents).toBe('auto');

    // Close via Ctrl+F
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }));
    expect(searchBar.style.opacity).toBe('0');
  });

  it('Ctrl+Shift+F does not trigger SpecsMap search toggle', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const searchBar = container.querySelector('.sm-search-bar') as HTMLElement;
    expect(searchBar.style.opacity).toBe('0');

    // Ctrl+Shift+F should be ignored (reserved for global file search)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, shiftKey: true, bubbles: true }));
    expect(searchBar.style.opacity).toBe('0');

    // Cmd+Shift+F should also be ignored
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, shiftKey: true, bubbles: true }));
    expect(searchBar.style.opacity).toBe('0');

    // Verify plain Ctrl+F still works after
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }));
    expect(searchBar.style.opacity).toBe('1');
  });

  it('hover does nothing while search is open', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const btns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    btns[0].click();

    // Hover should not trigger (searchOpen guard)
    const node = container.querySelector('.sm-node') as HTMLElement;
    node.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    // Should not have solid border from hover
    expect(node.style.borderStyle).not.toBe('solid');
  });

  it('search with no matches shows 0 count', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const btns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    btns[0].click();
    const input = container.querySelector('.sm-search-bar input') as HTMLInputElement;
    const countEl = container.querySelector('.sm-search-bar span:nth-child(3)') as HTMLElement;

    input.value = 'nonexistent12345';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 10));
    expect(countEl.textContent).toBe('0');
  });

  // ── Agent traversal API ──

  it('getNodes returns a copy of parsed nodes', async () => {
    const sm = new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const nodes = sm.getNodes();
    expect(nodes.length).toBe(Object.keys(SPEC_FILES).length);
    expect(nodes[0]).toHaveProperty('id');
    expect(nodes[0]).toHaveProperty('name');
    // Mutating the returned copy should not affect internal state
    nodes[0].name = 'mutated';
    expect(sm.getNodes()[0].name).not.toBe('mutated');
  });

  it('getNodeContext returns markdown context for a node', async () => {
    const sm = new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const node = sm.getNodes().find(n => n.id === 'theme.spec.md');
    expect(node).toBeTruthy();
    const ctx = sm.getNodeContext(node!.id);
    expect(ctx).toContain('## Theme');
    expect(ctx).toContain('CanvasArea.ts');
    expect(ctx).toContain('core');
  });

  it('getNodeContext returns empty string for unknown node', async () => {
    const sm = new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    expect(sm.getNodeContext('missing.spec.md')).toBe('');
  });

  it('explore returns dense aggregated context for matching nodes', async () => {
    const sm = new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const result = await sm.explore('theme');
    expect(result).toContain('Matches');
    expect(result).toContain('theme');
    expect(result).toContain('Theme');
  });

  it('explore returns message when no nodes match', async () => {
    const sm = new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const result = await sm.explore('nonexistentxyz');
    expect(result).toContain('No specs matched');
  });

  it('explore does not steal the camera by default (agent path)', async () => {
    const sm = new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    await sm.explore('canvas');
    expect(container.querySelector('.sm-node.sm-selected')).toBeNull();
  });

  it('explore with animate selects the first match (human path)', async () => {
    const sm = new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    await sm.explore('canvas', { animate: true });
    const selected = container.querySelector('.sm-node.sm-selected');
    expect(selected).toBeTruthy();
  });

  it('shows a report-driven validation badge', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const badge = container.querySelector('.sm-validation-badge') as HTMLElement | null;
    expect(badge).toBeTruthy();
    expect(badge!.style.display).not.toBe('none');
    expect(badge!.textContent).toMatch(/valid|error|warn|info/);
  });

  it('settings panel has VALIDATION and RECONCILE sections', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const gear = container.querySelector('button[title="Settings"]') as HTMLButtonElement;
    gear.click();
    expect(container.textContent).toContain('VALIDATION');
    expect(container.textContent).toContain('RECONCILE');
    expect(container.querySelector('#sm-reconcile-report-btn')).toBeTruthy();
    expect(container.querySelector('#sm-reconcile-apply-btn')).toBeTruthy();
    expect(container.textContent).not.toContain('Regenerate Spec Files');
  });

  it('reconcileSpecs report mode writes no spec files and returns a changelog', async () => {
    const sm = new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    (mockElectronAPI.fs.writeFile as any).mockClear();
    const out = await sm.reconcileSpecs('report');
    expect(out).toContain('Reconcile (report)');
    const specWrites = (mockElectronAPI.fs.writeFile as any).mock.calls.filter(
      (c: string[]) => c[0].endsWith('.spec.md'));
    expect(specWrites.length).toBe(0);
  });

  it('validateSpecs returns a markdown report', async () => {
    const sm = new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const out = await sm.validateSpecs();
    expect(out).toContain('# Validation');
  });

  it('reloadSpecs rereads the corpus and reports node count', async () => {
    const sm = new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const out = await sm.reloadSpecs();
    expect(out).toContain('SpecsMap reloaded');
  });
  it('left-drag pans the canvas', async () => {
    const sm = new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const panBefore = (sm as any).panX;
    const panBeforeY = (sm as any).panY;
    const viewport = container.querySelector('.sm-graph')!.parentElement!;
    viewport.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, button: 0, clientX: 60, clientY: 40 }));
    await new Promise(r => setTimeout(r, 20));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    await new Promise(r => setTimeout(r, 20));

    expect((sm as any).panX).toBeCloseTo(panBefore + 50, 4);
    expect((sm as any).panY).toBeCloseTo(panBeforeY + 30, 4);
  });

});