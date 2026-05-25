import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasArea } from './CanvasArea';

function makeCanvasEl(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'canvas';
  el.style.cssText = 'width:1920px;height:1080px;position:relative';
  document.body.appendChild(el);

  // jsdom doesn't compute layout, so clientWidth/Height return 0
  Object.defineProperty(el, 'clientWidth', { value: 1920, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 1080, configurable: true });

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

  describe('arrange panel (lower-right triangle)', () => {
    function getZone(): HTMLElement {
      return document.querySelector('.prr-zone') as HTMLElement;
    }

    function getIcon(): HTMLElement {
      return document.querySelector('.prr-icon') as HTMLElement;
    }

    function getPanel(): HTMLElement {
      return document.querySelector('.arr-panel') as HTMLElement;
    }

    function getInputs(): HTMLInputElement[] {
      return Array.from(document.querySelectorAll('.arr-input'));
    }

    function queryArrItems(): NodeListOf<Element> {
      return document.querySelectorAll('.arr-item');
    }

    it('creates lower-right zone with ◢ icon', () => {
      const zone = getZone();
      expect(zone).toBeTruthy();
      expect(zone.classList.contains('prr-zone')).toBe(true);

      const icon = getIcon();
      expect(icon).toBeTruthy();
      expect(icon.textContent).toBe('◢');
    });

    it('panel is hidden by default', () => {
      expect(getComputedStyle(getPanel()).display).toBe('none');
    });

    it('shows panel on mouseenter', () => {
      const zone = getZone();
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      expect(getPanel().style.display).toBe('block');
    });

    it('hides on panel mouseleave if zone not hovered', () => {
      const zone = getZone();
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      getPanel().dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      expect(getPanel().style.display).toBe('none');
    });

    it('hides panel on mouseleave after timeout', async () => {
      const zone = getZone();
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      zone.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
      expect(getPanel().style.display).toBe('none');
    });

    it('panel contains Auto Arrange and Tile Plugins items', () => {
      const zone = getZone();
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const items = queryArrItems();
      expect(items.length).toBe(2);
      expect(items[0].textContent).toBe('Auto Arrange');
      expect(items[1].textContent).toBe('Tile Plugins');
    });

    it('panel contains two input fields for W and H', () => {
      const zone = getZone();
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const inputs = getInputs();
      expect(inputs.length).toBe(2);
      expect(inputs[0].placeholder).toBe('W');
      expect(inputs[1].placeholder).toBe('H');
    });

    it('input fields store W and H values', () => {
      const zone = getZone();
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const inputs = getInputs();
      inputs[0].value = '560';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].value = '420';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      expect(getPanel().style.display).toBe('block');
    });

    it('shows a × separator between the two inputs', () => {
      const zone = getZone();
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const sep = document.querySelector('.arr-input-sep');
      expect(sep).toBeTruthy();
      expect(sep?.textContent).toBe('×');
    });

    it('icon has ◢ character', () => {
      expect(getIcon().textContent).toBe('◢');
    });

    describe('W×H input validation', () => {
      function getInputs(): HTMLInputElement[] {
        return Array.from(document.querySelectorAll('.arr-input'));
      }

      function showPanel(): void {
        const zone = getZone();
        zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      }

      it('allows typing any value without immediate clamping', () => {
        showPanel();
        const [w, h] = getInputs();
        w.value = '5';
        w.dispatchEvent(new Event('input', { bubbles: true }));
        expect(w.value).toBe('5');
        h.value = '9999';
        h.dispatchEvent(new Event('input', { bubbles: true }));
        expect(h.value).toBe('9999');
      });

      it('allows empty string while typing', () => {
        showPanel();
        const [w] = getInputs();
        w.value = '';
        w.dispatchEvent(new Event('input', { bubbles: true }));
        expect(w.value).toBe('');
      });

      it('allows non-numeric text while typing', () => {
        showPanel();
        const [w] = getInputs();
        w.value = 'abc';
        w.dispatchEvent(new Event('input', { bubbles: true }));
        expect(w.value).toBe('abc');
      });

      it('clamps below-minimum values to 10 on blur', () => {
        showPanel();
        const [w, h] = getInputs();
        w.value = '5';
        w.dispatchEvent(new Event('change', { bubbles: true }));
        expect(w.value).toBe('10');

        h.value = '1';
        h.dispatchEvent(new Event('change', { bubbles: true }));
        expect(h.value).toBe('10');
      });

      it('clamps above-maximum values to 2000 on blur', () => {
        showPanel();
        const [w, h] = getInputs();
        w.value = '9999';
        w.dispatchEvent(new Event('change', { bubbles: true }));
        expect(w.value).toBe('2000');

        h.value = '5000';
        h.dispatchEvent(new Event('change', { bubbles: true }));
        expect(h.value).toBe('2000');
      });

      it('defaults non-numeric text to 10 on blur', () => {
        showPanel();
        const [w, h] = getInputs();
        w.value = 'abc';
        w.dispatchEvent(new Event('change', { bubbles: true }));
        expect(w.value).toBe('10');

        h.value = '---';
        h.dispatchEvent(new Event('change', { bubbles: true }));
        expect(h.value).toBe('10');
      });

      it('defaults empty string to 10 on blur', () => {
        showPanel();
        const [w, h] = getInputs();
        w.value = '';
        w.dispatchEvent(new Event('change', { bubbles: true }));
        expect(w.value).toBe('10');

        h.value = '';
        h.dispatchEvent(new Event('change', { bubbles: true }));
        expect(h.value).toBe('10');
      });

      it('clamps negative values to 10 on blur', () => {
        showPanel();
        const [w] = getInputs();
        w.value = '-50';
        w.dispatchEvent(new Event('change', { bubbles: true }));
        expect(w.value).toBe('10');
      });

      it('clamps zero to 10 on blur', () => {
        showPanel();
        const [w] = getInputs();
        w.value = '0';
        w.dispatchEvent(new Event('change', { bubbles: true }));
        expect(w.value).toBe('10');
      });

      it('keeps valid values unchanged on blur', () => {
        showPanel();
        const [w, h] = getInputs();
        w.value = '23';
        w.dispatchEvent(new Event('change', { bubbles: true }));
        expect(w.value).toBe('23');

        h.value = '17';
        h.dispatchEvent(new Event('change', { bubbles: true }));
        expect(h.value).toBe('17');
      });

      it('keeps boundary values unchanged on blur', () => {
        showPanel();
        const [w, h] = getInputs();
        w.value = '10';
        w.dispatchEvent(new Event('change', { bubbles: true }));
        expect(w.value).toBe('10');

        h.value = '2000';
        h.dispatchEvent(new Event('change', { bubbles: true }));
        expect(h.value).toBe('2000');
      });

      it('clamps decimal values to int on blur', () => {
        showPanel();
        const [w] = getInputs();
        w.value = '3.14';
        w.dispatchEvent(new Event('change', { bubbles: true }));
        expect(w.value).toBe('10');
      });

      it('stores validated value used by tilePlugins layout', async () => {
        canvas.addTerminal();
        canvas.addTerminal();
        await new Promise(r => setTimeout(r, 50));

        showPanel();
        const [w, h] = getInputs();
        w.value = '10';
        w.dispatchEvent(new Event('change', { bubbles: true }));
        h.value = '7';
        h.dispatchEvent(new Event('change', { bubbles: true }));

        const items = document.querySelectorAll('.arr-item');
        (items[1] as HTMLElement).click();

        const state = canvas.getSaveState();
        expect(state.plugins.length).toBe(2);
        for (const p of state.plugins) {
          expect(p.width).toBe(280);
          expect(p.height).toBe(280);
        }
      });
    });
  });

  describe('fit all', () => {
    function callFitAll(): void {
      (canvas as any).fitAll();
    }

    it('is a no-op with zero open cards', () => {
      const before = canvas.getSaveState();
      expect(() => callFitAll()).not.toThrow();
      // scale should be unchanged (still 1)
      expect(canvas.getSaveState().zoom).toBe(1);
    });

    it('zooms out to fit a single large card', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));

      // Make the card larger than the viewport so zoom-out is needed
      const cs = (canvas as any).cards as any[];
      cs[0].savedWidth = 3000;
      cs[0].savedHeight = 2000;

      callFitAll();
      await new Promise(r => setTimeout(r, 100));

      const state = canvas.getSaveState();
      // fitX = (1920-80)/3000 ≈ 0.613, fitY = (1080-80)/2000 = 0.5
      expect(state.zoom).toBe(0.5);
      // Pan should have moved from default (0,0)
      expect(state.panX).not.toBe(0);
      expect(state.panY).not.toBe(0);
    });

    it('fits multiple cards into the viewport', async () => {
      canvas.addTerminal();
      canvas.addTerminal();
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));

      // Spread cards wide so they don't fit in viewport at 1x
      const cs = (canvas as any).cards as any[];
      cs[0].worldX = 0;
      cs[1].worldX = 2000;
      cs[2].worldX = 4000;

      callFitAll();
      await new Promise(r => setTimeout(r, 100));

      const state = canvas.getSaveState();
      // Should zoom out enough to see all cards
      expect(state.zoom).toBeLessThan(1);
      // Pan should have moved from default (0,0)
      expect(state.panX).not.toBe(0);
      expect(state.panY).not.toBe(0);
    });

    it('clamps zoom to minimum 0.1 for very spread-out cards', async () => {
      canvas.addTerminal();
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));

      const cs = (canvas as any).cards as any[];
      cs[0].worldX = 0;
      cs[0].worldY = 0;
      cs[1].worldX = 50000;
      cs[1].worldY = 50000;

      callFitAll();
      await new Promise(r => setTimeout(r, 100));

      expect(canvas.getSaveState().zoom).toBe(0.1);
    });

    it('never zooms in past 1x', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));

      const cs = (canvas as any).cards as any[];
      cs[0].worldX = 0;
      cs[0].worldY = 0;
      cs[0].savedWidth = 100;
      cs[0].savedHeight = 80;

      callFitAll();
      await new Promise(r => setTimeout(r, 100));

      // Cards fit comfortably at 1x, should not zoom in
      expect(canvas.getSaveState().zoom).toBe(1);
    });
});

describe('fitViewport', () => {
  function callFitViewport(cs: any): void {
    (canvas as any).fitViewport(cs);
  }

  it('resets scale to 1', async () => {
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];

    canvas.zoomIn();
    canvas.zoomIn();
    callFitViewport(cs);
    await new Promise(r => setTimeout(r, 50));

    expect(canvas.getSaveState().zoom).toBe(1);
  });

  it('centers viewport on origin', async () => {
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 400)); // wait for panToCard animation (300ms) to finish

    const cs = (canvas as any).cards[0];
    callFitViewport(cs);
    await new Promise(r => setTimeout(r, 50));

    const state = canvas.getSaveState();
    expect(state.panX).toBe(960);
    expect(state.panY).toBe(540);
  });

  it('centers card on origin', async () => {
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];

    cs.worldX = 1000;
    cs.worldY = 500;
    callFitViewport(cs);
    await new Promise(r => setTimeout(r, 50));

    expect(cs.worldX).toBe(-960);
    expect(cs.worldY).toBe(-540);
  });

  it('sizes card to fill viewport exactly', async () => {
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];

    callFitViewport(cs);
    await new Promise(r => setTimeout(r, 50));

    expect(cs.savedWidth).toBe(1920);
    expect(cs.savedHeight).toBe(1080);
    expect(cs.card.opts.width).toBe(1920);
    expect(cs.card.opts.height).toBe(1080);
    expect(cs.card.el.style.width).toBe('1920px');
    expect(cs.card.el.style.height).toBe('1080px');
  });

  it('fires onStateChange after fitting', async () => {
    const onChange = vi.fn();
    canvas.onStateChange = onChange;
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];

    callFitViewport(cs);
    await new Promise(r => setTimeout(r, 50));

    expect(onChange).toHaveBeenCalled();
  });
});

describe('auto arrange', () => {
    it('positions open cards in a left-to-right grid', async () => {
      canvas.addTerminal();
      canvas.addTerminal();
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));

      const before = canvas.getSaveState();
      expect(before.plugins.length).toBe(3);

      const zone = document.querySelector('.prr-zone') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const items = document.querySelectorAll('.arr-item');
      (items[0] as HTMLElement).click();

      const after = canvas.getSaveState();
      // Cards are centered on origin (not at 0,0)
      expect(after.plugins[0].x).toBeLessThan(0);
      expect(after.plugins[0].y).toBeLessThan(0);
      // Cards are placed left-to-right with 28 gap
      expect(after.plugins[1].x - after.plugins[0].x).toBe(after.plugins[0].width + 28);
      expect(after.plugins[2].x - after.plugins[1].x).toBe(after.plugins[1].width + 28);
    });

    it('calls onStateChange after arranging', async () => {
      const onChange = vi.fn();
      canvas.onStateChange = onChange;
      canvas.addTerminal();
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));

      const zone = document.querySelector('.prr-zone') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const items = document.querySelectorAll('.arr-item');
      (items[0] as HTMLElement).click();

      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('tile plugins', () => {
    it('arranges cards in a grid layout with unique positions', async () => {
      canvas.addTerminal();
      canvas.addTerminal();
      canvas.addTerminal();
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));

      const zone = document.querySelector('.prr-zone') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const items = document.querySelectorAll('.arr-item');
      (items[1] as HTMLElement).click();

      const state = canvas.getSaveState();
      expect(state.plugins.length).toBe(4);
      const positions = state.plugins.map((p: any) => `${p.x},${p.y}`);
      expect(new Set(positions).size).toBe(4);
    });

    it('uses custom W×H tile size from two inputs (in grid units)', async () => {
      canvas.addTerminal();
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));

      const zone = document.querySelector('.prr-zone') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const inputs = document.querySelectorAll('.arr-input') as NodeListOf<HTMLInputElement>;
      inputs[0].value = '10';
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].value = '7';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      const items = document.querySelectorAll('.arr-item');
      (items[1] as HTMLElement).click();

      const state = canvas.getSaveState();
      expect(state.plugins.length).toBe(2);
      for (const p of state.plugins) {
        expect(p.width).toBe(280);
        expect(p.height).toBe(280);
      }
    });

    it('is a no-op with no open cards', () => {
      expect(() => {
        const zone = document.querySelector('.prr-zone') as HTMLElement;
        zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        const items = document.querySelectorAll('.arr-item');
        (items[1] as HTMLElement).click();
      }).not.toThrow();
    });

    it('leaves 1-unit gap between tiled cards', async () => {
      canvas.addTerminal();
      canvas.addTerminal();
      canvas.addTerminal();
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));

      const zone = document.querySelector('.prr-zone') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const items = document.querySelectorAll('.arr-item');
      (items[1] as HTMLElement).click();

      const state = canvas.getSaveState();
      expect(state.plugins.length).toBe(4);
      // 4 cards -> 2x2 grid centered on origin, row spacing is cellH + gap
      const cellH = state.plugins[0].height;
      expect(state.plugins[2].y - state.plugins[0].y).toBe(cellH + 28);
    });

  });
});
