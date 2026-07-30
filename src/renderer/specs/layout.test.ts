import { describe, it, expect } from 'vitest';
import {
  computeLayout, positionLayer,
  NODE_W, NODE_H, NODE_UI_W, NODE_UI_H, NODE_GAP, MAX_PER_ROW, LAYER_GAP, UI_OFFSET_Y,
  type SpecNode,
} from './layout';

function node(id: string, layer: string, overrides: Partial<SpecNode> = {}): SpecNode {
  return {
    id, name: id, specFile: `${id}.spec.md`, sourceFile: `${id}.ts`,
    isEntry: false, entryPath: '', layer, isUI: false, deps: [],
    x: 0, y: 0, w: NODE_W, h: NODE_H,
    ...overrides,
  };
}

function uiNode(id: string, parentId: string, layer: string): SpecNode {
  return node(id, layer, { isUI: true, parentId, w: NODE_UI_W, h: NODE_UI_H });
}

describe('positionLayer', () => {
  it('wraps rows at MAX_PER_ROW and centers each row around x=0', () => {
    const items = Array.from({ length: MAX_PER_ROW + 3 }, (_, i) => node(`n${i}`, 'core'));
    const nodeById = new Map(items.map(n => [n.id, n]));
    positionLayer(items, [], nodeById, 40);

    const row1 = items.slice(0, MAX_PER_ROW);
    const row2 = items.slice(MAX_PER_ROW);

    // Same row → same y
    expect(new Set(row1.map(n => n.y)).size).toBe(1);
    expect(new Set(row2.map(n => n.y)).size).toBe(1);
    expect(row2[0].y).toBeGreaterThan(row1[0].y);

    // Row is centered: leftmost x + rightmost x + NODE_W should be symmetric around 0
    const minX = Math.min(...row1.map(n => n.x));
    const maxX = Math.max(...row1.map(n => n.x + NODE_W));
    expect(minX + maxX).toBeCloseTo(0, 5);

    // Consecutive nodes in a row are spaced NODE_W + NODE_GAP apart
    expect(row1[1].x - row1[0].x).toBeCloseTo(NODE_W + NODE_GAP, 5);
  });

  it('positions a UI child centered under its parent, offset below by UI_OFFSET_Y', () => {
    const parent = node('p', 'core');
    const ui = uiNode('p-ui', 'p', 'core');
    const nodeById = new Map([[parent.id, parent]]);
    positionLayer([parent], [ui], nodeById, 40);

    expect(ui.x).toBeCloseTo(parent.x + (NODE_W - NODE_UI_W) / 2, 5);
    expect(ui.y).toBe(40 + NODE_H + UI_OFFSET_Y);
  });

  it('returns advanced globalY that reserves extra vertical space when a row has UI children', () => {
    const parent = node('p', 'core');
    const ui = uiNode('p-ui', 'p', 'core');
    const nodeById = new Map([[parent.id, parent]]);
    const nextY = positionLayer([parent], [ui], nodeById, 40);
    expect(nextY).toBe(40 + NODE_H + UI_OFFSET_Y + NODE_UI_H + 20 + LAYER_GAP);
  });

  it('returns advanced globalY with no extra space when a row has no UI children', () => {
    const items = [node('a', 'core')];
    const nodeById = new Map(items.map(n => [n.id, n]));
    const nextY = positionLayer(items, [], nodeById, 40);
    expect(nextY).toBe(40 + NODE_H + LAYER_GAP);
  });

  it('does not reposition a UI node whose parent is not in this layer chunk', () => {
    const items = [node('a', 'core')];
    const ui = uiNode('orphan-ui', 'missing-parent', 'core');
    const nodeById = new Map(items.map(n => [n.id, n]));
    positionLayer(items, [ui], nodeById, 40);
    expect(ui.x).toBe(0);
    expect(ui.y).toBe(0);
  });
});

describe('computeLayout', () => {
  it('stacks known layers in LAYER_ORDER (foundation above core above widget)', () => {
    const nodes = [
      node('w1', 'widget'),
      node('f1', 'foundation'),
      node('c1', 'core'),
    ];
    computeLayout(nodes);
    const f1 = nodes.find(n => n.id === 'f1')!;
    const c1 = nodes.find(n => n.id === 'c1')!;
    const w1 = nodes.find(n => n.id === 'w1')!;
    expect(f1.y).toBeLessThan(c1.y);
    expect(c1.y).toBeLessThan(w1.y);
  });

  it('places unknown/custom layers below all known layers, sorted alphabetically', () => {
    const nodes = [
      node('z1', 'zeta'),
      node('a1', 'alpha'),
      node('c1', 'core'),
    ];
    computeLayout(nodes);
    const c1 = nodes.find(n => n.id === 'c1')!;
    const a1 = nodes.find(n => n.id === 'a1')!;
    const z1 = nodes.find(n => n.id === 'z1')!;
    expect(c1.y).toBeLessThan(a1.y);
    expect(a1.y).toBeLessThan(z1.y);
  });

  it('links a UI node to its parent across the full layout pass', () => {
    const parent = node('p', 'modal');
    const ui = uiNode('p-ui', 'p', 'modal');
    computeLayout([parent, ui]);
    expect(ui.y).toBe(parent.y + NODE_H + UI_OFFSET_Y);
  });

  it('returns the same node array reference it was given (mutates in place)', () => {
    const nodes = [node('a', 'core')];
    expect(computeLayout(nodes)).toBe(nodes);
  });
});
