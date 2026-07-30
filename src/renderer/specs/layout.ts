// SPECGEN runtime — pure layout geometry + visual encoding for the SpecsMap
// canvas (no DOM; unit-testable without jsdom).

export interface SpecNode {
  id: string;
  name: string;
  specFile: string;
  sourceFile: string;
  isEntry: boolean;
  entryPath: string;
  layer: string;
  isUI: boolean;
  parentId?: string;
  uiChildId?: string;
  deps: string[];
  x: number;
  y: number;
  w: number;
  h: number;
}

export const NODE_W = 280;
export const NODE_H = 100;
export const NODE_UI_W = 230;
export const NODE_UI_H = 62;
export const NODE_GAP = 28;
export const MAX_PER_ROW = 10;
export const LAYER_GAP = 60;
export const UI_OFFSET_Y = 64;
export const PANEL_W = 320;
export const GRAPH_MARGIN = 80;
export const PORT_OFFSET = 28;

const LAYER_ORDER = ['foundation', 'core', 'widget', 'modal', 'overlay', 'plugin'];

export const LAYER_LABELS: Record<string, string> = {
  foundation: 'Foundation',
  core: 'Core',
  widget: 'Widget',
  modal: 'Modal',
  overlay: 'Overlay',
  plugin: 'Plugins',
};

export const LAYER_COLORS_VAR: Record<string, string> = {
  foundation: 'var(--green)',
  core: 'var(--accent)',
  widget: 'var(--accent2)',
  modal: 'var(--amber)',
  overlay: 'var(--red)',
  plugin: 'var(--secondary)',
};

export const LAYER_COLORS_HEX: Record<string, string> = {
  foundation: '#4ade80',
  core: '#5a8af4',
  widget: '#a78bfa',
  modal: '#fbbf24',
  overlay: '#f87171',
  plugin: '#94a3b8',
};

export function computeLayout(nodes: SpecNode[]): SpecNode[] {
  const mainNodes = nodes.filter(n => !n.isUI);
  const uiNodes = nodes.filter(n => n.isUI);
  const nodeById = new Map<string, SpecNode>(nodes.map(n => [n.id, n]));

  const layerMap = new Map<string, SpecNode[]>();
  for (const n of mainNodes) {
    if (!layerMap.has(n.layer)) layerMap.set(n.layer, []);
    layerMap.get(n.layer)!.push(n);
  }

  let globalY = 40;

  for (const layer of LAYER_ORDER) {
    const items = layerMap.get(layer);
    if (!items || items.length === 0) continue;
    globalY = positionLayer(items, uiNodes, nodeById, globalY);
  }

  // Unknown/custom layers (e.g. "FEATURE" from generated specs) — sort alphabetically, position below
  const unknownLayers = [...layerMap.keys()].filter(l => !LAYER_ORDER.includes(l)).sort();
  for (const layer of unknownLayers) {
    const items = layerMap.get(layer)!;
    globalY = positionLayer(items, uiNodes, nodeById, globalY);
  }

  return nodes;
}

export function positionLayer(
  items: SpecNode[],
  uiNodes: SpecNode[],
  nodeById: Map<string, SpecNode>,
  globalY: number,
): number {
  for (let chunkStart = 0; chunkStart < items.length; chunkStart += MAX_PER_ROW) {
    const chunk = items.slice(chunkStart, chunkStart + MAX_PER_ROW);
    const rowW = chunk.length * NODE_W + (chunk.length - 1) * NODE_GAP;
    const startX = -rowW / 2;

    for (let i = 0; i < chunk.length; i++) {
      chunk[i].x = startX + i * (NODE_W + NODE_GAP);
      chunk[i].y = globalY;
    }

    const chunkUI = uiNodes.filter(u => u.parentId && chunk.some(m => m.id === u.parentId));
    for (const uiNode of chunkUI) {
      const parent = nodeById.get(uiNode.parentId!);
      if (parent) {
        uiNode.x = parent.x + (NODE_W - NODE_UI_W) / 2;
        uiNode.y = globalY + NODE_H + UI_OFFSET_Y;
      }
    }

    const hasUI = chunkUI.length > 0;
    globalY += NODE_H + (hasUI ? UI_OFFSET_Y + NODE_UI_H + 20 : 0) + LAYER_GAP;
  }
  return globalY;
}
