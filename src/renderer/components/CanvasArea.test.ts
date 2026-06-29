import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasArea } from './CanvasArea';
import { TerminalPlugin } from './TerminalPlugin';
import { ExplorerPlugin } from './ExplorerPlugin';

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
    const onMd = vi.fn();

    canvas.onTerminalsChanged = onTerm;
    canvas.onExplorersChanged = onDev;
    canvas.onMarkdownChanged = onMd;

    expect(onTerm).not.toHaveBeenCalled();
    expect(onDev).not.toHaveBeenCalled();
    expect(onMd).not.toHaveBeenCalled();
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

    it('panel contains Auto Arrange, Tile Plugins, and Snap Origin items', () => {
      const zone = getZone();
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const items = queryArrItems();
      expect(items.length).toBe(3);
      expect(items[0].textContent).toBe('Auto Arrange');
      expect(items[1].textContent).toBe('Tile Plugins');
      expect(items[2].textContent).toBe('Snap Origin');
    });

    it('Snap Origin button snaps panX/panY to pattern grid', () => {
      canvas['panX'] = 137;
      canvas['panY'] = 73;
      (canvas as any).snapOrigin();
      expect(canvas['panX']).toBe(140);
      expect(canvas['panY']).toBe(84);
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

    it('fitAll zooms out to fit cards spread across the 8000x4500 canvas', async () => {
      canvas.addTerminal();
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));

      const cs = (canvas as any).cards as any[];
      cs[0].worldX = -4000;
      cs[0].worldY = -2250;
      cs[1].worldX = 4000;
      cs[1].worldY = 2250;

      callFitAll();
      await new Promise(r => setTimeout(r, 100));

      const state = canvas.getSaveState();
      expect(state.zoom).toBeLessThan(1);
      // With a 1920x1080 viewport the canvas-fitting minimum is 1920/8000 = 0.24
      expect(state.zoom).toBeGreaterThanOrEqual(0.24);
      expect(cs[0].worldX).toBe(-4000);
      expect(cs[1].worldX).toBe(4000);
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

    it('fitAll uses available width when overlayLeft is set', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const cs = (canvas as any).cards as any[];
      cs[0].worldX = 0; cs[0].worldY = 0;
      cs[0].savedWidth = 1000; cs[0].savedHeight = 500;

      // Without overlay: fitX = (1920-80)/1000 = 1.84, fitY = (1080-80)/500 = 2 → clamped to 1
      callFitAll();
      await new Promise(r => setTimeout(r, 100));
      expect(canvas.getSaveState().zoom).toBe(1);

      // With 800px overlay: avW = 1120; fitX = (1120-80)/1000 = 1.04 → clamped to 1 still
      canvas.overlayLeft = 800;
      cs[0].savedWidth = 1200;
      callFitAll();
      await new Promise(r => setTimeout(r, 100));
      // fitX = (1120-80)/1200 ≈ 0.867, fitY = (1080-80)/500 = 2 → zoom = 0.867
      expect(canvas.getSaveState().zoom).toBeCloseTo(0.867, 2);
      canvas.overlayLeft = 0;
    });

    it('fitAll centers pan in uncovered area when overlayLeft is set', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const cs = (canvas as any).cards as any[];
      cs[0].worldX = 0; cs[0].worldY = 0;
      cs[0].savedWidth = 100; cs[0].savedHeight = 80;

      canvas.overlayLeft = 420;
      callFitAll();
      await new Promise(r => setTimeout(r, 100));
      const state = canvas.getSaveState();
      // avCX = 420 + (1920-420)/2 = 420 + 750 = 1170; panX should be around avCX
      expect(state.panX).toBeGreaterThan(420); // must be in the uncovered zone
      canvas.overlayLeft = 0;
    });
});

describe('fitViewport', () => {
  function callFitViewport(cs: any): void {
    (canvas as any).fitViewport(cs);
  }

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

  it('sets scale to 1 (100% zoom)', async () => {
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];

    canvas.zoomIn();
    canvas.zoomIn();
    callFitViewport(cs);
    await new Promise(r => setTimeout(r, 50));

    expect(canvas.getSaveState().zoom).toBe(1);
  });

  it('calls animatePan to center card in viewport', async () => {
    const animatePan = vi.fn();
    (canvas as any).animatePan = animatePan;
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];
    animatePan.mockReset(); // clear addTerminal's panToCard call

    callFitViewport(cs);
    await new Promise(r => setTimeout(r, 50));

    expect(animatePan).toHaveBeenCalledOnce();
    // targetX = 960 - (cs.worldX + 960) = -cs.worldX
    // targetY = 540 - (cs.worldY + 540) = -cs.worldY
    const [targetX, targetY] = animatePan.mock.calls[0];
    expect(targetX).toBe(-cs.worldX);
    expect(targetY).toBe(-cs.worldY);
  });

  it('does not rearrange when only one card is open', async () => {
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];
    const origX = cs.worldX;
    const origY = cs.worldY;

    callFitViewport(cs);
    await new Promise(r => setTimeout(r, 50));

    expect(cs.worldX).toBe(origX);
    expect(cs.worldY).toBe(origY);
  });

  it('calls onCardResize when defined', async () => {
    const onResize = vi.fn();
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];
    cs.onCardResize = onResize;

    callFitViewport(cs);
    await new Promise(r => setTimeout(r, 50));

    expect(onResize).toHaveBeenCalledOnce();
  });

  it('does not throw when onCardResize is undefined', async () => {
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];
    cs.onCardResize = undefined;

    expect(() => callFitViewport(cs)).not.toThrow();
    await new Promise(r => setTimeout(r, 50));
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

  it('arranges multiple open cards into a grid', async () => {
    canvas.addTerminal();
    canvas.addTerminal();
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];
    const cs2 = (canvas as any).cards[1];
    const cs3 = (canvas as any).cards[2];

    callFitViewport(cs);
    await new Promise(r => setTimeout(r, 50));

    // Card fills viewport
    expect(cs.savedWidth).toBe(1920);
    // Other cards are placed below (wrapped to next row)
    expect(cs2.worldY).toBeGreaterThan(cs.worldY);
    expect(cs3.worldY).toBeGreaterThan(cs.worldY);
  });

  it('skips minimized (isOpen=false) cards when arranging', async () => {
    canvas.addTerminal();
    canvas.addTerminal();
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];
    const cs2 = (canvas as any).cards[1];
    const cs3 = (canvas as any).cards[2];
    const cs2origX = cs2.worldX;
    const cs2origY = cs2.worldY;
    cs2.isOpen = false;

    callFitViewport(cs);
    await new Promise(r => setTimeout(r, 50));

    // Minimized card position unchanged
    expect(cs2.worldX).toBe(cs2origX);
    expect(cs2.worldY).toBe(cs2origY);
    // Open card cs3 was rearranged
    expect(cs3.worldY).toBeGreaterThan(cs.worldY);
  });

  it('handles card already at viewport size gracefully', async () => {
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];
    // Pretend card is already viewport-sized
    cs.savedWidth = 1920;
    cs.savedHeight = 1080;
    cs.card.opts.width = 1920;
    cs.card.opts.height = 1080;
    cs.card.el.style.width = '1920px';
    cs.card.el.style.height = '1080px';

    callFitViewport(cs);
    await new Promise(r => setTimeout(r, 50));

    // No change — dimensions remain the same
    expect(cs.savedWidth).toBe(1920);
    expect(cs.savedHeight).toBe(1080);
  });

  it('sizes card to available width when overlayLeft is set', async () => {
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];
    canvas.overlayLeft = 420;

    callFitViewport(cs);
    await new Promise(r => setTimeout(r, 50));

    expect(cs.savedWidth).toBe(1920 - 420);  // avW = 1500
    expect(cs.savedHeight).toBe(1080);
    canvas.overlayLeft = 0;
  });

  it('locked fitViewport centers in available area', async () => {
    canvas.locked = true;
    canvas.addTerminal();
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];
    canvas.overlayLeft = 420;
    const animatePan = vi.fn();
    (canvas as any).animatePan = animatePan;

    callFitViewport(cs);

    expect(animatePan).toHaveBeenCalled();
    const [panX] = animatePan.mock.calls[0];
    // avCX = 420 + (1920-420)/2 = 1170; centered on card at worldX=0 w=1500 → center world=750
    // targetX = 1170 - 750 * scale
    expect(panX).toBeGreaterThanOrEqual(420); // must be in uncovered zone
    canvas.overlayLeft = 0;
    canvas.locked = false;
  });
});

describe('restore path callbacks', () => {
  function makeMinimalState(title: string, opts?: Partial<{ width: number; height: number; x: number; y: number; isOpen: boolean }>): any {
    return {
      zoom: 1, panX: 0, panY: 0, zOrder: [],
      plugins: [{
        title,
        x: opts?.x ?? 0,
        y: opts?.y ?? 0,
        width: opts?.width ?? 560,
        height: opts?.height ?? 420,
        isOpen: opts?.isOpen ?? true,
      }],
    };
  }

  it('restored terminal card has working onFitViewport callback', async () => {
    const fitSpy = vi.fn();
    (canvas as any).fitViewport = fitSpy;
    (canvas as any).restorePlugins(makeMinimalState('Terminal 1'), '/test');
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];

    const btn = cs.card.el.querySelector('.card-btn-fitview') as HTMLElement;
    btn.click();

    expect(fitSpy).toHaveBeenCalledOnce();
    expect(fitSpy).toHaveBeenCalledWith(cs);
  });

  it('restored terminal card has working onTerminate callback', async () => {
    const termSpy = vi.fn();
    (canvas as any).terminateCard = termSpy;
    (canvas as any).restorePlugins(makeMinimalState('Terminal 1'), '/test');
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];

    const btn = cs.card.el.querySelector('.card-btn-terminate') as HTMLElement;
    btn.click();

    expect(termSpy).toHaveBeenCalledOnce();
    expect(termSpy).toHaveBeenCalledWith(cs);
  });

  it('restored dev card has both onFitViewport and onTerminate callbacks', async () => {
    const fitSpy = vi.fn();
    const termSpy = vi.fn();
    (canvas as any).fitViewport = fitSpy;
    (canvas as any).terminateCard = termSpy;
    (canvas as any).restorePlugins(makeMinimalState('Explorer'), '/test');
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];

    cs.card.el.querySelector('.card-btn-fitview')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fitSpy).toHaveBeenCalledOnce();
    expect(fitSpy).toHaveBeenCalledWith(cs);

    cs.card.el.querySelector('.card-btn-terminate')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(termSpy).toHaveBeenCalledOnce();
    expect(termSpy).toHaveBeenCalledWith(cs);
  });

  it('restored git card has both onFitViewport and onTerminate callbacks', async () => {
    const fitSpy = vi.fn();
    const termSpy = vi.fn();
    (canvas as any).fitViewport = fitSpy;
    (canvas as any).terminateCard = termSpy;
    (canvas as any).restorePlugins(makeMinimalState('Git'), '/test');
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];

    cs.card.el.querySelector('.card-btn-fitview')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fitSpy).toHaveBeenCalledOnce();

    cs.card.el.querySelector('.card-btn-terminate')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(termSpy).toHaveBeenCalledOnce();
  });

  it('restored context card has both onFitViewport and onTerminate callbacks', async () => {
    const fitSpy = vi.fn();
    const termSpy = vi.fn();
    (canvas as any).fitViewport = fitSpy;
    (canvas as any).terminateCard = termSpy;
    (canvas as any).restorePlugins(makeMinimalState('Markdown 1'), '/test');
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];

    cs.card.el.querySelector('.card-btn-fitview')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fitSpy).toHaveBeenCalledOnce();

    cs.card.el.querySelector('.card-btn-terminate')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(termSpy).toHaveBeenCalledOnce();
  });

  it('restored card that is not open still has callbacks wired', async () => {
    const fitSpy = vi.fn();
    const termSpy = vi.fn();
    (canvas as any).fitViewport = fitSpy;
    (canvas as any).terminateCard = termSpy;
    (canvas as any).restorePlugins(makeMinimalState('Terminal 1', { isOpen: false }), '/test');
    await new Promise(r => setTimeout(r, 50));
    const cs = (canvas as any).cards[0];

    // Card is display:none but the buttons should still be wired
    cs.card.el.querySelector('.card-btn-fitview')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fitSpy).toHaveBeenCalledOnce();

    cs.card.el.querySelector('.card-btn-terminate')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(termSpy).toHaveBeenCalledOnce();
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
      const cellH = state.plugins[0].height;
      expect(state.plugins[2].y - state.plugins[0].y).toBe(cellH + 28);
    });

  });

  describe('addTerminal / addExplorer / addGit / addMarkdown', () => {
    it('addTerminal() creates a card with title matching Terminal N pattern', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const state = canvas.getSaveState();
      expect(state.plugins.length).toBe(1);
      expect(state.plugins[0].title).toMatch(/^Terminal \d+$/);
    });

    it('addTerminal() fires onTerminalsChanged', async () => {
      const onChanged = vi.fn();
      canvas.onTerminalsChanged = onChanged;
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      expect(onChanged).toHaveBeenCalled();
    });

    it('addExplorer() creates a card with title matching Explorer N pattern', async () => {
      canvas.addExplorer('/test');
      await new Promise(r => setTimeout(r, 50));
      const state = canvas.getSaveState();
      expect(state.plugins.length).toBe(1);
      expect(state.plugins[0].title).toBe('Explorer');
    });

    it('addExplorer() fires onExplorersChanged', async () => {
      const onChanged = vi.fn();
      canvas.onExplorersChanged = onChanged;
      canvas.addExplorer('/test');
      await new Promise(r => setTimeout(r, 50));
      expect(onChanged).toHaveBeenCalled();
    });

    it('addGit() creates card with title "Git"', async () => {
      canvas.addGit('/test');
      await new Promise(r => setTimeout(r, 50));
      const state = canvas.getSaveState();
      expect(state.plugins.length).toBe(1);
      expect(state.plugins[0].title).toBe('Git');
    });

    it('addGit() single-instance: second call reopens existing card', async () => {
      canvas.addGit('/test');
      await new Promise(r => setTimeout(r, 50));
      canvas.addGit('/test');
      await new Promise(r => setTimeout(r, 50));
      const state = canvas.getSaveState();
      expect(state.plugins.length).toBe(1);
    });

    it('addMarkdown() creates card with title "Markdown"', async () => {
      canvas.addMarkdown();
      await new Promise(r => setTimeout(r, 50));
      const state = canvas.getSaveState();
      expect(state.plugins.length).toBe(1);
      expect(state.plugins[0].title).toBe('Markdown');
    });

    it('addMarkdown() fires onMarkdownChanged', async () => {
      const onChanged = vi.fn();
      canvas.onMarkdownChanged = onChanged;
      canvas.addMarkdown();
      await new Promise(r => setTimeout(r, 50));
      expect(onChanged).toHaveBeenCalled();
    });
  });

  describe('terminateCard / reopen / focus', () => {
    it('terminateCard() removes card from getSaveState().plugins', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const cs = (canvas as any).cards[0];
      (canvas as any).terminateCard(cs);
      await new Promise(r => setTimeout(r, 50));
      expect(canvas.getSaveState().plugins.length).toBe(0);
    });

    it('terminateCard() fires onStateChange', async () => {
      const onChange = vi.fn();
      canvas.onStateChange = onChange;
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const cs = (canvas as any).cards[0];
      (canvas as any).terminateCard(cs);
      await new Promise(r => setTimeout(r, 50));
      expect(onChange).toHaveBeenCalled();
    });

    it('reopenTerminal() makes minimized terminal visible again', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const cs = (canvas as any).cards[0];
      cs.isOpen = false;
      cs.card.el.style.display = 'none';
      const uuid = cs.card.uuid;
      (canvas as any).reopenTerminal(uuid);
      await new Promise(r => setTimeout(r, 50));
      expect(cs.isOpen).toBe(true);
      expect(cs.card.el.style.display).not.toBe('none');
    });

    it('reopenExplorer() restores minimized explorer', async () => {
      canvas.addExplorer('/test');
      await new Promise(r => setTimeout(r, 50));
      const cs = (canvas as any).cards[0];
      cs.isOpen = false;
      cs.card.el.style.display = 'none';
      (canvas as any).reopenExplorer(cs.card.uuid);
      await new Promise(r => setTimeout(r, 50));
      expect(cs.isOpen).toBe(true);
    });

    it('reopenMarkdown() restores minimized markdown card', async () => {
      canvas.addMarkdown();
      await new Promise(r => setTimeout(r, 50));
      const cs = (canvas as any).cards[0];
      cs.isOpen = false;
      cs.card.el.style.display = 'none';
      (canvas as any).reopenMarkdown(cs.card.uuid);
      await new Promise(r => setTimeout(r, 50));
      expect(cs.isOpen).toBe(true);
    });

    it('focusTerminal() brings card to front (highest z-index)', async () => {
      canvas.addTerminal();
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const cs1 = (canvas as any).cards[0];
      const cs2 = (canvas as any).cards[1];
      (canvas as any).focusTerminal(cs1.card.uuid);
      const z1 = parseInt(cs1.card.el.style.zIndex);
      const z2 = parseInt(cs2.card.el.style.zIndex);
      expect(z1).toBeGreaterThan(z2);
    });

    it('focusTerminal() no-op for non-existent uuid', () => {
      expect(() => (canvas as any).focusTerminal('nonexistent')).not.toThrow();
    });

    it('cycleCard(1) moves focus to next open card', async () => {
      canvas.addTerminal();
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const before = (canvas as any).cards.map((c: any) => parseInt(c.card.el.style.zIndex));
      (canvas as any).cycleCard(1);
      await new Promise(r => setTimeout(r, 10));
      const after = (canvas as any).cards.map((c: any) => parseInt(c.card.el.style.zIndex));
      expect(after).not.toEqual(before);
    });

    it('cycleCard(-1) moves focus to previous card', async () => {
      canvas.addTerminal();
      canvas.addTerminal();
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      (canvas as any).cycleCard(-1);
      await new Promise(r => setTimeout(r, 10));
      // Should not throw
    });

    it('cycleCard() no-op when fewer than 2 open cards', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      expect(() => (canvas as any).cycleCard(1)).not.toThrow();
    });
  });

  describe('getActiveExplorerPlugin / getMarkdownLabels', () => {
    it('getActiveExplorerPlugin() returns null when no explorers exist', () => {
      expect((canvas as any).getActiveExplorerPlugin()).toBeNull();
    });

    it('getActiveExplorerPlugin() returns non-null after addExplorer()', async () => {
      canvas.addExplorer('/test');
      await new Promise(r => setTimeout(r, 50));
      expect((canvas as any).getActiveExplorerPlugin()).not.toBeNull();
    });

    it('getMarkdownLabels() returns empty array when no markdowns', () => {
      expect((canvas as any).getMarkdownLabels()).toEqual([]);
    });

    it('getMarkdownLabels() returns title array with singleton Markdown', async () => {
      canvas.addMarkdown();
      await new Promise(r => setTimeout(r, 50));
      const labels = (canvas as any).getMarkdownLabels();
      expect(labels).toEqual(['Markdown']);
    });

    it('updateAllThemes calls updateTheme on terminal plugins', async () => {
      canvas.addTerminal();
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const termSpy = vi.spyOn(TerminalPlugin.prototype, 'updateTheme');
      (canvas as any).updateAllThemes();
      expect(termSpy).toHaveBeenCalledTimes(2);
      termSpy.mockRestore();
    });

    it('updateAllThemes calls updateTheme on explorer plugins', async () => {
      canvas.addExplorer('/test');
      await new Promise(r => setTimeout(r, 50));
      const explorerSpy = vi.spyOn(ExplorerPlugin.prototype, 'updateTheme');
      (canvas as any).updateAllThemes();
      expect(explorerSpy).toHaveBeenCalledTimes(1);
      explorerSpy.mockRestore();
    });

    it('updateAllThemes calls updateTheme on both terminals and explorers', async () => {
      canvas.addTerminal();
      canvas.addExplorer('/test');
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const termSpy = vi.spyOn(TerminalPlugin.prototype, 'updateTheme');
      const explorerSpy = vi.spyOn(ExplorerPlugin.prototype, 'updateTheme');
      (canvas as any).updateAllThemes();
      expect(termSpy).toHaveBeenCalledTimes(2);
      expect(explorerSpy).toHaveBeenCalledTimes(1);
      termSpy.mockRestore();
      explorerSpy.mockRestore();
    });

    it('updateAllThemes does not throw when no cards exist', () => {
      expect(() => (canvas as any).updateAllThemes()).not.toThrow();
    });
  });

  describe('setView / centerView / offsetCard', () => {
    it('setView() sets zoom and pan', () => {
      (canvas as any).setView({ zoom: 2, panX: 100, panY: 200 });
      const state = canvas.getSaveState();
      expect(state.zoom).toBe(2);
      expect(state.panX).toBe(100);
      expect(state.panY).toBe(200);
    });

    it('centerView() sets panX/panY to half viewport dimensions', () => {
      (canvas as any).centerView();
      const state = canvas.getSaveState();
      expect(state.panX).toBe(960);
      expect(state.panY).toBe(540);
    });

    it('centerView() offsets center right when overlayLeft is set', () => {
      canvas.overlayLeft = 420;
      (canvas as any).centerView();
      const state = canvas.getSaveState();
      // Available width = 1920 - 420 = 1500; center = 420 + 750 = 1170
      expect(state.panX).toBe(1170);
      expect(state.panY).toBe(540);
      canvas.overlayLeft = 0;
    });

    it('offsetCard() moves card to specified world coordinates', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      (canvas as any).offsetCard('Terminal 1', 100, 200);
      const state = canvas.getSaveState();
      expect(state.plugins[0].x).toBe(100);
      expect(state.plugins[0].y).toBe(200);
    });
  });

  describe('panToCard', () => {
    it('centers card in viewport at scale ≤ 1', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const cs = (canvas as any).cards[0];
      cs.worldX = 500; cs.worldY = 200;
      cs.savedWidth = 800; cs.savedHeight = 600;
      const animatePan = vi.fn();
      (canvas as any).animatePan = animatePan;

      (canvas as any).panToCard(cs);

      expect(animatePan).toHaveBeenCalled();
      const [px, py] = animatePan.mock.calls[0];
      const scale = canvas.getSaveState().zoom;
      expect(scale).toBeLessThanOrEqual(1);
      // targetX = cw/2 - (worldX + w/2) * scale
      expect(px).toBeCloseTo(960 - (500 + 400) * scale, 1);
      expect(py).toBeCloseTo(540 - (200 + 300) * scale, 1);
    });

    it('locked panToCard centers without changing zoom', async () => {
      canvas.locked = true;
      (canvas as any).scale = 0.5;
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const cs = (canvas as any).cards[0];
      cs.worldX = 0; cs.worldY = 0;
      cs.savedWidth = 400; cs.savedHeight = 300;
      const animatePan = vi.fn();
      (canvas as any).animatePan = animatePan;

      (canvas as any).panToCard(cs);

      expect(animatePan).toHaveBeenCalled();
      expect(canvas.getSaveState().zoom).toBe(0.5); // unchanged
      canvas.locked = false;
    });

    it('panToCard respects overlayLeft when centering', async () => {
      canvas.overlayLeft = 420;
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const cs = (canvas as any).cards[0];
      cs.worldX = 0; cs.worldY = 0;
      cs.savedWidth = 400; cs.savedHeight = 300;
      const animatePan = vi.fn();
      (canvas as any).animatePan = animatePan;

      (canvas as any).panToCard(cs);

      const [px] = animatePan.mock.calls[0];
      // avCX = 420 + (1920-420)/2 = 1170; must pan toward 1170 not 960
      const scale = canvas.getSaveState().zoom;
      expect(px).toBeCloseTo(1170 - (0 + 200) * scale, 1);
      canvas.overlayLeft = 0;
    });
  });

  describe('canvas bounds', () => {
    it('cards are clamped to ±4000x±2250 world coordinates', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      (canvas as any).offsetCard('Terminal 1', 99999, -99999);
      const state = canvas.getSaveState();
      expect(state.plugins[0].x).toBe(4000);
      expect(state.plugins[0].y).toBe(-2250);
    });

    it('pan clamps to keep viewport inside the 8000x4500 canvas', async () => {
      const el = document.getElementById('canvas')!;
      (canvas as any).scale = 1;
      (canvas as any).panX = 10000;
      (canvas as any).panY = -10000;
      canvas.refresh();
      await new Promise(r => setTimeout(r, 50));
      const state = canvas.getSaveState();
      // viewport 1920x1080, boundX=4000, boundY=2250:
      // panX ∈ [1920-4000, 4000], panY ∈ [1080-2250, 2250]
      expect(state.panX).toBe(4000);
      expect(state.panY).toBe(el.clientHeight - 2250);
    });

    it('renders a canvas-boundary element aligned to world bounds', async () => {
      (canvas as any).scale = 1;
      canvas.refresh();
      await new Promise(r => setTimeout(r, 50));
      const boundary = document.querySelector('.canvas-boundary') as HTMLElement;
      expect(boundary).toBeTruthy();
      expect(parseFloat(boundary.style.width)).toBe(8000);
      expect(parseFloat(boundary.style.height)).toBe(4500);
    });
  });

  describe('plugin list panel', () => {
    it('plugin list zone exists with icon', () => {
      const zone = document.querySelector('.pli-zone') as HTMLElement;
      expect(zone).toBeTruthy();
    });

    it('plugin list shows on mouseenter zone', () => {
      const zone = document.querySelector('.pli-zone') as HTMLElement;
      const panel = document.querySelector('.plugin-list-panel') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      expect(panel.style.display).toBe('block');
    });

    it('plugin list shows "(No plugins)" message when no cards exist', () => {
      const zone = document.querySelector('.pli-zone') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const panel = document.querySelector('.plugin-list-panel') as HTMLElement;
      expect(panel.textContent).toContain('No plugins');
    });

    it('plugin list shows card titles after adding cards', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const zone = document.querySelector('.pli-zone') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const panel = document.querySelector('.plugin-list-panel') as HTMLElement;
      expect(panel.textContent).toContain('Terminal 1');
    });

    it('right-click on plugin list item opens context menu with Show and Terminate', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const zone = document.querySelector('.pli-zone') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const item = document.querySelector('.pli-item') as HTMLElement;
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }));

      const menu = document.querySelector('.ctx-menu') as HTMLElement;
      expect(menu).toBeTruthy();
      const ctxItems = menu.querySelectorAll('.ctx-item');
      expect(ctxItems.length).toBe(2);
      expect(ctxItems[0].textContent).toBe('Show');
      expect(ctxItems[1].textContent).toBe('Terminate');

      const sep = menu.querySelector('.ctx-sep');
      expect(sep).toBeTruthy();
    });

    it('right-click context menu Show focuses open card', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const cs = (canvas as any).cards[0];
      cs.card.el.style.zIndex = '10';
      const zone = document.querySelector('.pli-zone') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const item = document.querySelector('.pli-item') as HTMLElement;
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }));

      const showItem = document.querySelector('.ctx-item') as HTMLElement;
      showItem.click();
      expect(parseInt(cs.card.el.style.zIndex)).toBeGreaterThan(100);
    });

    it('right-click context menu Terminate removes card', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const zone = document.querySelector('.pli-zone') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const item = document.querySelector('.pli-item') as HTMLElement;
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }));

      const ctxItems = document.querySelectorAll('.ctx-item');
      ctxItems[1].click();
      await new Promise(r => setTimeout(r, 50));
      expect(canvas.getSaveState().plugins.length).toBe(0);
    });

    it('right-click context menu removes DOM after action', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const zone = document.querySelector('.pli-zone') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const item = document.querySelector('.pli-item') as HTMLElement;
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }));

      expect(document.querySelector('.ctx-menu')).toBeTruthy();
      const ctxItems = document.querySelectorAll('.ctx-item');
      ctxItems[1].click();
      expect(document.querySelector('.ctx-menu')).toBeNull();
    });

    it('right-click context menu resets contextMenuOpen on close', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const zone = document.querySelector('.pli-zone') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const item = document.querySelector('.pli-item') as HTMLElement;
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }));

      const menu = document.querySelector('.ctx-menu') as HTMLElement;
      const closeBtn = menu.querySelector('.ctx-item') as HTMLElement;
      closeBtn.click();
      await new Promise(r => setTimeout(r, 50));
      expect((canvas as any).contextMenuOpen).toBe(false);
    });

    it('corner zone is a button element with tabIndex and aria-label', () => {
      const pliZone = document.querySelector('.pli-zone') as HTMLElement;
      expect(pliZone.tagName).toBe('BUTTON');
      expect(pliZone.getAttribute('aria-label')).toBe('Plugin list');
      expect(pliZone.tabIndex).toBe(0);

      const prrZone = document.querySelector('.prr-zone') as HTMLElement;
      expect(prrZone.tagName).toBe('BUTTON');
      expect(prrZone.getAttribute('aria-label')).toBe('Arrange panel');
      expect(prrZone.tabIndex).toBe(0);
    });

    it('prr-zone opens on Space keydown', () => {
      const prrZone = document.querySelector('.prr-zone') as HTMLElement;
      prrZone.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      const panel = document.querySelector('.arr-panel') as HTMLElement;
      expect(panel.style.display).toBe('block');
    });

    it('pli-zone opens on Space keydown', () => {
      const pliZone = document.querySelector('.pli-zone') as HTMLElement;
      pliZone.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      const panel = document.querySelector('.plugin-list-panel') as HTMLElement;
      expect(panel.style.display).toBe('block');
    });

    it('pli-zone shifts right when overlayLeft matches an open drawer', () => {
      const pliZone = document.querySelector('.pli-zone') as HTMLElement;
      expect(pliZone.style.left).toBe('');
      canvas.overlayLeft = 420;
      expect(pliZone.style.left).toBe('424px');
    });

    it('pli-zone returns to base position when overlayLeft is cleared', () => {
      const pliZone = document.querySelector('.pli-zone') as HTMLElement;
      canvas.overlayLeft = 420;
      expect(pliZone.style.left).toBe('424px');
      canvas.overlayLeft = 0;
      expect(pliZone.style.left).toBe('4px');
    });

    it('context menu shows "Close" for non-terminal cards', async () => {
      canvas.addExplorer('/test');
      await new Promise(r => setTimeout(r, 50));
      const zone = document.querySelector('.pli-zone') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const item = document.querySelector('.pli-item') as HTMLElement;
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }));

      const ctxItems = document.querySelectorAll('.ctx-item');
      const labels = Array.from(ctxItems).map(el => el.textContent);
      expect(labels).toContain('Close');
      expect(labels).not.toContain('Terminate');
    });

    it('context menu shows "Terminate" for terminal cards', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      const zone = document.querySelector('.pli-zone') as HTMLElement;
      zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const item = document.querySelector('.pli-item') as HTMLElement;
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }));

      const ctxItems = document.querySelectorAll('.ctx-item');
      const labels = Array.from(ctxItems).map(el => el.textContent);
      expect(labels).toContain('Terminate');
    });
  });



  describe('zoom lock', () => {
    it('locked = true allows pan initiation (pan works even when locked)', () => {
      canvas.locked = true;
      const el = document.getElementById('canvas')!;
      el.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 100, clientY: 200 }));
      expect((canvas as any).isPanning).toBe(true);
    });
  });

  describe('layout overlays', () => {
    it('creates 8 overlay elements', () => {
      const overlays = (canvas as any).layoutOverlays as HTMLElement[];
      expect(overlays.length).toBe(8);
      for (const el of overlays) {
        expect(el.classList.contains('layout-overlay')).toBe(true);
        expect(el.style.display).toBe('none');
        expect(el.querySelector('svg')).toBeTruthy();
      }
    });

    it('showLayoutOverlays does nothing when not locked', () => {
      (canvas as any).showLayoutOverlays();
      for (const el of (canvas as any).layoutOverlays) {
        expect(el.style.display).toBe('none');
      }
    });

    it('showLayoutOverlays does nothing when scale !== 1', () => {
      canvas.locked = true;
      (canvas as any).scale = 0.5;
      (canvas as any).showLayoutOverlays();
      for (const el of (canvas as any).layoutOverlays) {
        expect(el.style.display).toBe('none');
      }
    });

    it('showLayoutOverlays shows all overlays when locked && scale===1', () => {
      canvas.locked = true;
      (canvas as any).scale = 1;
      (canvas as any).showLayoutOverlays();
      for (const el of (canvas as any).layoutOverlays) {
        expect(el.style.display).not.toBe('none');
        expect(parseFloat(el.style.left)).not.toBeNaN();
        expect(parseFloat(el.style.top)).not.toBeNaN();
      }
    });

    it('hideLayoutOverlays hides all overlays', () => {
      canvas.locked = true;
      (canvas as any).scale = 1;
      (canvas as any).showLayoutOverlays();
      (canvas as any).hideLayoutOverlays();
      for (const el of (canvas as any).layoutOverlays) {
        expect(el.style.display).toBe('none');
      }
    });

    it('getDropZone returns zone name when cursor within overlay bounds', () => {
      canvas.locked = true;
      (canvas as any).scale = 1;
      (canvas as any).showLayoutOverlays();
      const el = (canvas as any).layoutOverlays[0] as HTMLElement;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const zone = (canvas as any).getDropZone(cx, cy);
      expect(zone).toBe(el.dataset.zone);
    });

    it('getDropZone returns null when cursor far from any overlay', () => {
      canvas.locked = true;
      (canvas as any).scale = 1;
      (canvas as any).showLayoutOverlays();
      const zone = (canvas as any).getDropZone(-999, -999);
      expect(zone).toBeNull();
    });

    it('getDropZone returns null when overlays are hidden', () => {
      const zone = (canvas as any).getDropZone(100, 100);
      expect(zone).toBeNull();
    });

    it('applyDropZone top-left sets card to viewport top-left quadrant', () => {
      canvas.locked = true;
      (canvas as any).scale = 1;
      (canvas as any).panX = 500;
      (canvas as any).panY = 300;
      const el = document.getElementById('canvas')!;
      const cs = (canvas as any).addCard('Test', '', 0, 0, 400, 300);
      (canvas as any).applyDropZone('top-left', cs);
      const cw = el.clientWidth, ch = el.clientHeight;
      const W2 = Math.round(cw / 56) * 28;
      const H2 = Math.round(ch / 56) * 28;
      expect(cs.savedWidth).toBe(W2);
      expect(cs.savedHeight).toBe(H2);
      expect(cs.worldX).toBe(Math.round(-500 / 28) * 28);
      expect(cs.worldY).toBe(Math.round(-300 / 28) * 28);
    });

    it('applyDropZone top sets card to top half', () => {
      canvas.locked = true;
      (canvas as any).scale = 1;
      (canvas as any).panX = 100;
      (canvas as any).panY = 50;
      const cs = (canvas as any).addCard('Test', '', 0, 0, 400, 300);
      (canvas as any).applyDropZone('top', cs);
      const el = document.getElementById('canvas')!;
      const cw = el.clientWidth, ch = el.clientHeight;
      const W = Math.round(cw / 28) * 28;
      const H2 = Math.round(ch / 56) * 28;
      expect(cs.savedWidth).toBe(W);
      expect(cs.savedHeight).toBe(H2);
    });
  });

  describe('restorePlugins edge cases', () => {
    it('restorePlugins() migrates "Dev" title to "Explorer"', async () => {
      const state = {
        plugins: [{ title: 'Dev', x: 0, y: 0, width: 560, height: 420, isOpen: true }],
        zOrder: [],
        zoom: 1, panX: 0, panY: 0,
      };
      (canvas as any).restorePlugins(state, '/test');
      await new Promise(r => setTimeout(r, 50));
      expect(canvas.getSaveState().plugins[0].title).toBe('Explorer');
    });
  });
});
