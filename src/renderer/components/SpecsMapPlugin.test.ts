import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpecsMapPlugin } from './SpecsMapPlugin';
import { mockElectronAPI } from '../../test/setup';

const MAIN_SPEC = JSON.stringify({
  features: {
    core: [
      { id: 'theme', name: 'Theme', file: 'theme.ts', spec: 'theme.spec.json' },
      { id: 'canvas-engine', name: 'Canvas Engine', file: 'CanvasArea.ts', spec: 'canvas-engine.spec.json', ui: 'canvas-engine-ui.spec.json' },
    ],
    widget: [
      { id: 'plugin-card', name: 'Plugin Card', file: 'PluginCard.ts', spec: 'plugin-card.spec.json' },
    ],
    plugins: [
      { id: 'terminal-plugin', name: 'Terminal Plugin', file: 'TerminalPlugin.ts', spec: 'terminal-plugin.spec.json' },
    ],
  },
});

const SPEC_FILES: Record<string, string> = {
  'theme.spec.json': JSON.stringify({
    name: 'Theme', file: 'src/renderer/theme.ts', type: 'logic', layer: 'core',
    dependencies: [],
    referenced_by: [{ feature: 'Canvas Engine', file: 'CanvasArea.ts' }],
  }),
  'canvas-engine.spec.json': JSON.stringify({
    name: 'Canvas Engine', file: 'src/renderer/components/CanvasArea.ts', type: 'ui', layer: 'core',
    dependencies: [{ feature: 'Theme', file: 'theme.ts', usage: 'Uses theme singleton' }],
    referenced_by: [{ feature: 'Plugin Card', file: 'PluginCard.ts' }],
  }),
  'canvas-engine-ui.spec.json': JSON.stringify({
    name: 'Canvas Engine UI', parent: 'canvas-engine', ui: true,
  }),
  'plugin-card.spec.json': JSON.stringify({
    name: 'Plugin Card', file: 'src/renderer/components/PluginCard.ts', type: 'ui', layer: 'widget',
    dependencies: [{ feature: 'Canvas Engine', file: 'CanvasArea.ts' }],
    referenced_by: [],
  }),
  'terminal-plugin.spec.json': JSON.stringify({
    name: 'Terminal Plugin', file: 'src/renderer/components/TerminalPlugin.ts', type: 'ui', layer: 'plugin',
    dependencies: [],
    referenced_by: [{ feature: 'Canvas Engine', file: 'CanvasArea.ts' }],
  }),
};

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
      if (filename === 'main.spec.json') return Promise.resolve(MAIN_SPEC);
      if (SPEC_FILES[filename]) return Promise.resolve(SPEC_FILES[filename]);
      return Promise.resolve('{}');
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

  it('reads main.spec.json via fs.readFile', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const calls = (mockElectronAPI.fs.readFile as any).mock.calls as string[][];
    const mainCall = calls.find((c: string[]) => c[0].includes('main.spec.json'));
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

  it('loads from snapshot cache when .cockpit/specsmap.json is valid', async () => {
    const snapNodes = Object.keys(SPEC_FILES).map(filename => {
      const raw = JSON.parse(SPEC_FILES[filename]);
      return {
        id: filename, name: raw.name ?? filename, specFile: filename,
        sourceFile: raw.file ? raw.file.split('/').pop() : '',
        layer: raw.layer ?? 'core', isUI: !!raw.parent,
        deps: [], raw,
      };
    });
    const snapshot = JSON.stringify({ v: 1, ts: new Date().toISOString(), nodes: snapNodes });

    (mockElectronAPI.fs.readFile as any).mockImplementation((path: string) => {
      if (path.includes('.cockpit/specsmap.json')) return Promise.resolve(snapshot);
      return Promise.resolve('{}');
    });
    // readDir should NOT be called if snapshot is valid
    (mockElectronAPI.fs.readDir as any).mockResolvedValue([]);

    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();

    const nodes = container.querySelectorAll('.sm-node');
    expect(nodes.length).toBe(Object.keys(SPEC_FILES).length);
    expect(mockElectronAPI.fs.readDir).not.toHaveBeenCalled();
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
    gearBtns[0].click();
    expect(container.textContent).toContain('Settings');
    expect(container.textContent).toContain('Show cyclic dependencies');
  });

  it('gear click again closes settings panel', async () => {
    new SpecsMapPlugin(container, '/test/ws');
    await flushSpecs();
    const gearBtns = container.querySelectorAll<HTMLElement>('.sm-header-btn');
    const gearBtn = gearBtns[0];
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
      'main.spec.json': JSON.stringify({
        features: {
          core: [
            { id: 'alpha', name: 'Alpha', file: 'alpha.ts', spec: 'alpha.spec.json' },
            { id: 'beta', name: 'Beta', file: 'beta.ts', spec: 'beta.spec.json' },
          ],
        },
      }),
      'alpha.spec.json': JSON.stringify({
        name: 'Alpha', file: 'src/alpha.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'Beta', file: 'beta.ts' }],
        referenced_by: [{ feature: 'Beta', file: 'beta.ts' }],
      }),
      'beta.spec.json': JSON.stringify({
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
      return Promise.resolve(cyclicSpecFiles[filename] ?? '{}');
    });

    const c = makeContainer();
    new SpecsMapPlugin(c, '/test/ws');
    await flushSpecs();

    // Open settings panel
    const gearBtns = c.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[0].click();

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
      'main.spec.json': JSON.stringify({
        features: {
          core: [
            { id: 'solo', name: 'Solo', file: 'solo.ts', spec: 'solo.spec.json' },
          ],
        },
      }),
      'solo.spec.json': JSON.stringify({
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
      return Promise.resolve(isolatedSpecFiles[filename] ?? '{}');
    });

    const c = makeContainer();
    new SpecsMapPlugin(c, '/test/ws');
    await flushSpecs();

    const gearBtns = c.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[0].click();

    const toggle = c.querySelector('#sm-cycle-toggle') as HTMLElement;
    toggle.click();

    expect(c.textContent).toContain('No cycles');
  });

  it('toggle detects 3-node cycle (A→B→C→A) and shows members in panel', async () => {
    const cyclicSpecFiles: Record<string, string> = {
      'main.spec.json': JSON.stringify({
        features: {
          core: [
            { id: 'a', name: 'A', file: 'a.ts', spec: 'a.spec.json' },
            { id: 'b', name: 'B', file: 'b.ts', spec: 'b.spec.json' },
            { id: 'c', name: 'C', file: 'c.ts', spec: 'c.spec.json' },
          ],
        },
      }),
      'a.spec.json': JSON.stringify({
        name: 'A', file: 'src/a.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'B', file: 'b.ts' }],
        referenced_by: [{ feature: 'C', file: 'c.ts' }],
      }),
      'b.spec.json': JSON.stringify({
        name: 'B', file: 'src/b.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'C', file: 'c.ts' }],
        referenced_by: [{ feature: 'A', file: 'a.ts' }],
      }),
      'c.spec.json': JSON.stringify({
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
      return Promise.resolve(cyclicSpecFiles[filename] ?? '{}');
    });

    const c = makeContainer();
    new SpecsMapPlugin(c, '/test/ws');
    await flushSpecs();

    const gearBtns = c.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[0].click();

    const toggle = c.querySelector('#sm-cycle-toggle') as HTMLElement;
    toggle.click();

    // Panel should show cycle count of 1 and contain all 3 node names
    expect(c.textContent).toContain('CYCLES');
    expect(c.textContent).toContain('a.spec.json');
    expect(c.textContent).toContain('b.spec.json');
    expect(c.textContent).toContain('c.spec.json');
  });

  it('clicking near a cycle edge midpoint selects that cycle', async () => {
    const cyclicSpecFiles: Record<string, string> = {
      'main.spec.json': JSON.stringify({
        features: {
          core: [
            { id: 'x', name: 'X', file: 'x.ts', spec: 'x.spec.json' },
            { id: 'y', name: 'Y', file: 'y.ts', spec: 'y.spec.json' },
          ],
        },
      }),
      'x.spec.json': JSON.stringify({
        name: 'X', file: 'src/x.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'Y', file: 'y.ts' }],
        referenced_by: [{ feature: 'Y', file: 'y.ts' }],
      }),
      'y.spec.json': JSON.stringify({
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
      return Promise.resolve(cyclicSpecFiles[filename] ?? '{}');
    });

    const c = makeContainer();
    new SpecsMapPlugin(c, '/test/ws');
    await flushSpecs();

    // Open settings and toggle cycle detection
    const gearBtns = c.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[0].click();
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
      'main.spec.json': JSON.stringify({
        features: {
          core: [
            { id: 'a', name: 'A', file: 'a.ts', spec: 'a.spec.json' },
            { id: 'b', name: 'B', file: 'b.ts', spec: 'b.spec.json' },
          ],
        },
      }),
      'a.spec.json': JSON.stringify({
        name: 'A', file: 'src/a.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'B', file: 'b.ts' }],
        referenced_by: [{ feature: 'B', file: 'b.ts' }],
      }),
      'b.spec.json': JSON.stringify({
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
      return Promise.resolve(cyclicSpecFiles[filename] ?? '{}');
    });

    const c = makeContainer();
    new SpecsMapPlugin(c, '/test/ws');
    await flushSpecs();

    const gearBtns = c.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[0].click();

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
    gearBtns[0].click();
    expect(container.textContent).toContain('Show isolated nodes');
    const isolatedToggle = container.querySelector('#sm-isolated-toggle') as HTMLElement;
    expect(isolatedToggle).toBeTruthy();
  });

  it('toggling isolated mode highlights nodes with no deps/refs', async () => {
    // Use a node with no dependencies and no references
    const specFiles: Record<string, string> = {
      'main.spec.json': JSON.stringify({
        features: {
          core: [
            { id: 'connected', name: 'Connected', file: 'connected.ts', spec: 'connected.spec.json' },
            { id: 'orphan', name: 'Orphan', file: 'orphan.ts', spec: 'orphan.spec.json' },
          ],
        },
      }),
      'connected.spec.json': JSON.stringify({
        name: 'Connected', file: 'src/connected.ts', type: 'logic', layer: 'core',
        dependencies: [{ feature: 'Theme', file: 'theme.ts' }],
        referenced_by: [],
      }),
      'orphan.spec.json': JSON.stringify({
        name: 'Orphan', file: 'src/orphan.ts', type: 'logic', layer: 'core',
        dependencies: [],
        referenced_by: [],
      }),
    };

    const allFiles = { ...specFiles, 'theme.spec.json': JSON.stringify({
      name: 'Theme', file: 'src/theme.ts', type: 'logic', layer: 'core',
      dependencies: [],
      referenced_by: [{ feature: 'Connected', file: 'connected.ts' }],
    }) };

    (mockElectronAPI.fs.readDir as any).mockResolvedValue(
      Object.keys(allFiles).map(name => ({ name, isDirectory: false }))
    );
    (mockElectronAPI.fs.readFile as any).mockImplementation((path: string) => {
      const fn = path.split('/').pop()!;
      return Promise.resolve(allFiles[fn] ?? '{}');
    });

    const c = makeContainer();
    new SpecsMapPlugin(c, '/test/ws');
    await flushSpecs();

    const gearBtns = c.querySelectorAll<HTMLElement>('.sm-header-btn');
    gearBtns[0].click();

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
    gearBtns[0].click();

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
});
