import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasArea } from './CanvasArea';

function makeCanvasEl(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'canvas';
  el.style.cssText = 'width:1920px;height:1080px;position:relative';
  document.body.appendChild(el);

  const sb = document.createElement('div');
  sb.id = 'statusbar';
  document.body.appendChild(sb);

  return el;
}

describe('CanvasArea', () => {
  let canvas: CanvasArea;

  beforeEach(() => {
    document.body.innerHTML = '';
    const el = makeCanvasEl();
    canvas = new CanvasArea(el);
  });

  it('starts with dots grid style', () => {
    const state = canvas.getSaveState();
    expect(state.zoom).toBe(1);
    expect(state.plugins).toEqual([]);
  });

  it('setGridStyle changes grid style without errors', () => {
    canvas.setGridStyle('none');
    canvas.setGridStyle('grid');
    canvas.setGridStyle('dots');
  });

  it('zoomIn increases scale', () => {
    canvas.zoomIn();
    const state = canvas.getSaveState();
    expect(state.zoom).toBeGreaterThan(1);
  });

  it('zoomOut decreases scale', () => {
    canvas.zoomOut();
    const state = canvas.getSaveState();
    expect(state.zoom).toBeLessThan(1);
  });

  it('resetView sets scale to 1', () => {
    canvas.zoomIn();
    canvas.zoomIn();
    canvas.resetView();
    const state = canvas.getSaveState();
    expect(state.zoom).toBe(1);
  });

  it('getSaveState returns correct structure', () => {
    const state = canvas.getSaveState();
    expect(state).toHaveProperty('plugins');
    expect(state).toHaveProperty('zOrder');
    expect(state).toHaveProperty('zoom');
    expect(state).toHaveProperty('panX');
    expect(state).toHaveProperty('panY');
    expect(state).toHaveProperty('isDark');
    expect(Array.isArray(state.plugins)).toBe(true);
  });

  it('notifies state change callbacks after transform', async () => {
    const onChange = vi.fn();
    canvas.onStateChange = onChange;

    canvas.zoomIn();
    // The callback fires in rAF
    await new Promise(r => setTimeout(r, 10));
    expect(onChange).toHaveBeenCalled();
  });

  it('initial term/dev/ctx change callbacks are not called without cards', () => {
    const onTerm = vi.fn();
    const onDev = vi.fn();
    const onCtx = vi.fn();

    canvas.onTerminalsChanged = onTerm;
    canvas.onDevsChanged = onDev;
    canvas.onContextsChanged = onCtx;

    expect(onTerm).not.toHaveBeenCalled();
    expect(onDev).not.toHaveBeenCalled();
    expect(onCtx).not.toHaveBeenCalled();
  });
});
