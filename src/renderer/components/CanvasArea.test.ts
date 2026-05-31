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
    (canvas as any).restorePlugins(makeMinimalState('Explorer 1'), '/test');
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
      expect(state.plugins[0].title).toMatch(/^Explorer \d+$/);
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

    it('addMarkdown() creates card with title matching Markdown N pattern', async () => {
      canvas.addMarkdown();
      await new Promise(r => setTimeout(r, 50));
      const state = canvas.getSaveState();
      expect(state.plugins.length).toBe(1);
      expect(state.plugins[0].title).toMatch(/^Markdown \d+$/);
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

    it('getMarkdownLabels() returns title array of all markdown plugins', async () => {
      canvas.addMarkdown();
      canvas.addMarkdown();
      await new Promise(r => setTimeout(r, 50));
      const labels = (canvas as any).getMarkdownLabels();
      expect(labels.length).toBe(2);
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

    it('offsetCard() moves card to specified world coordinates', async () => {
      canvas.addTerminal();
      await new Promise(r => setTimeout(r, 50));
      (canvas as any).offsetCard('Terminal 1', 100, 200);
      const state = canvas.getSaveState();
      expect(state.plugins[0].x).toBe(100);
      expect(state.plugins[0].y).toBe(200);
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
  });

  describe('zoom lock', () => {
    it('locked = true prevents pan initiation', () => {
      canvas.locked = true;
      const el = document.getElementById('canvas')!;
      el.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 100, clientY: 200 }));
      expect((canvas as any).isPanning).toBe(false);
    });
  });

  describe('restorePlugins edge cases', () => {
    it('restorePlugins() migrates "Dev" title to "Explorer 1"', async () => {
      const state = {
        plugins: [{ title: 'Dev', x: 0, y: 0, width: 560, height: 420, isOpen: true }],
        zOrder: [],
        zoom: 1, panX: 0, panY: 0,
      };
      (canvas as any).restorePlugins(state, '/test');
      await new Promise(r => setTimeout(r, 50));
      expect(canvas.getSaveState().plugins[0].title).toBe('Explorer 1');
    });
  });
});
