import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WindowCard } from './WindowCard';

function makeParent(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'canvas';
  el.style.cssText = 'width:1920px;height:1080px;position:relative';
  document.body.appendChild(el);
  return el;
}

function getTransform() {
  return { scale: 1, panX: 960, panY: 540 };
}

describe('WindowCard', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('creates a card element with the correct structure', () => {
    const parent = makeParent();
    const card = new WindowCard(parent, {
      title: 'Test Card',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    }, getTransform);

    const el = card.el;
    expect(el.className).toBe('card');
    expect(el.querySelector('.card-header')).toBeTruthy();
    expect(el.querySelector('.card-body')).toBeTruthy();
    expect(el.querySelector('.card-controls')).toBeTruthy();
    expect(el.querySelector('.card-btn-minimize')).toBeTruthy();
    expect(el.querySelector('.card-btn-fitview')).toBeTruthy();
    expect(el.querySelector('.card-btn-terminate')).toBeTruthy();
    expect(el.querySelector('.card-edge-e')).toBeTruthy();
    expect(el.querySelector('.card-edge-s')).toBeTruthy();
    expect(el.querySelector('.card-edge-se')).toBeTruthy();
  });

  it('sets initial position and size from options', () => {
    const parent = makeParent();
    const card = new WindowCard(parent, {
      title: 'Pos Test',
      x: 100,
      y: 200,
      width: 500,
      height: 400,
    }, getTransform);

    expect(card.el.style.left).toBe('100px');
    expect(card.el.style.top).toBe('200px');
    expect(card.el.style.width).toBe('500px');
    expect(card.el.style.height).toBe('400px');
  });

  it('generates a unique UUID', () => {
    const parent = makeParent();
    const card1 = new WindowCard(parent, { title: 'A', x: 0, y: 0, width: 200, height: 200 }, getTransform);
    const card2 = new WindowCard(parent, { title: 'B', x: 0, y: 0, width: 200, height: 200 }, getTransform);

    expect(card1.uuid).toBeTruthy();
    expect(card2.uuid).toBeTruthy();
    expect(card1.uuid).not.toBe(card2.uuid);
    expect(card1.uuid).toMatch(/^[0-9a-f-]+$/);
  });

  it('calls onMinimize when minimize button is clicked', () => {
    const onMinimize = vi.fn();
    const parent = makeParent();
    const card = new WindowCard(parent, {
      title: 'Min Test',
      x: 0, y: 0, width: 200, height: 200,
      onMinimize,
    }, getTransform);

    const btn = card.el.querySelector('.card-btn-minimize') as HTMLElement;
    btn.click();
    expect(onMinimize).toHaveBeenCalledOnce();
  });

  it('calls onFitViewport when fit viewport button is clicked', () => {
    const onFitViewport = vi.fn();
    const parent = makeParent();
    const card = new WindowCard(parent, {
      title: 'Fit Test',
      x: 0, y: 0, width: 200, height: 200,
      onFitViewport,
    }, getTransform);

    const btn = card.el.querySelector('.card-btn-fitview') as HTMLElement;
    btn.click();
    expect(onFitViewport).toHaveBeenCalledOnce();
  });

  it('calls onTerminate when terminate button is clicked', () => {
    const onTerminate = vi.fn();
    const parent = makeParent();
    const card = new WindowCard(parent, {
      title: 'Term Test',
      x: 0, y: 0, width: 200, height: 200,
      onTerminate,
    }, getTransform);

    const btn = card.el.querySelector('.card-btn-terminate') as HTMLElement;
    btn.click();
    expect(onTerminate).toHaveBeenCalledOnce();
  });

  it('calls onFocus when card is clicked', () => {
    const onFocus = vi.fn();
    const parent = makeParent();
    const card = new WindowCard(parent, {
      title: 'Focus Test',
      x: 0, y: 0, width: 200, height: 200,
      onFocus,
    }, getTransform);

    card.el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(onFocus).toHaveBeenCalled();
  });

  it('remove() calls onDestroy and removes element from DOM', () => {
    const onDestroy = vi.fn();
    const parent = makeParent();
    const card = new WindowCard(parent, {
      title: 'Remove Test',
      x: 0, y: 0, width: 200, height: 200,
    }, getTransform);
    card.onDestroy = onDestroy;

    const el = card.el;
    expect(parent.contains(el)).toBe(true);

    card.remove();
    expect(onDestroy).toHaveBeenCalledOnce();
    expect(parent.contains(el)).toBe(false);
  });

  it('renders a DOM title element with the title text', () => {
    const parent = makeParent();
    const card = new WindowCard(parent, {
      title: 'DOM Title',
      x: 0, y: 0, width: 400, height: 300,
    }, getTransform);

    const titleEl = card.el.querySelector('.card-title-text') as HTMLElement;
    expect(titleEl).toBeTruthy();
    expect(titleEl.textContent).toBe('DOM Title');
  });

  it('stores width/height from constructor opts', () => {
    const parent = makeParent();
    const card = new WindowCard(parent, {
      title: 'Snap Test',
      x: 50,
      y: 50,
      width: 300,
      height: 300,
    }, getTransform);

    expect(card.opts.width).toBe(300);
    expect(card.opts.height).toBe(300);
  });

  it('supports setContent with HTML (renders DOM text)', () => {
    const parent = makeParent();
    const card = new WindowCard(parent, {
      title: 'Content Test',
      x: 0, y: 0, width: 400, height: 300,
    }, getTransform);

    card.setContent('<b>Hello</b>');
    const body = card.el.querySelector('.card-body') as HTMLElement;
    const content = body.querySelector('.card-content-text') as HTMLElement;
    expect(content).toBeTruthy();
    expect(content.querySelector('b')?.textContent).toBe('Hello');
  });

  it('double-click on header fires onFitViewport', () => {
    const onFitViewport = vi.fn();
    const parent = makeParent();
    const card = new WindowCard(parent, {
      title: 'DblClick Test',
      x: 0, y: 0, width: 200, height: 200,
      onFitViewport,
    }, getTransform);

    const header = card.el.querySelector('.card-header') as HTMLElement;
    header.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onFitViewport).toHaveBeenCalledOnce();
  });

  it('double-click on control button does not fire onFitViewport', () => {
    const onFitViewport = vi.fn();
    const onMinimize = vi.fn();
    const parent = makeParent();
    const card = new WindowCard(parent, {
      title: 'Btn DblClick',
      x: 0, y: 0, width: 200, height: 200,
      onFitViewport,
      onMinimize,
    }, getTransform);

    const btn = card.el.querySelector('.card-btn-minimize') as HTMLElement;
    btn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onFitViewport).not.toHaveBeenCalled();

    btn.click();
    expect(onMinimize).toHaveBeenCalledOnce();
  });

  it('calls onHeaderContextMenu on right-click of header', () => {
    const onHeaderContextMenu = vi.fn();
    const parent = makeParent();
    const card = new WindowCard(parent, {
      title: 'CtxMenu Test',
      x: 0, y: 0, width: 200, height: 200,
      onHeaderContextMenu,
    }, getTransform);

    const header = card.el.querySelector('.card-header') as HTMLElement;
    const event = new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 });
    header.dispatchEvent(event);

    expect(onHeaderContextMenu).toHaveBeenCalledOnce();
    expect(onHeaderContextMenu).toHaveBeenCalledWith(event);
  });
});

describe('WindowCard — drag interaction', () => {
  function makeParent(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'canvas';
    el.style.cssText = 'width:1920px;height:1080px;position:relative';
    document.body.appendChild(el);
    return el;
  }

  function getTransform() {
    return { scale: 1, panX: 960, panY: 540 };
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function createCard(opts = {}): WindowCard {
    return new WindowCard(makeParent(), {
      title: 'Drag Test',
      x: 100,
      y: 200,
      width: 400,
      height: 300,
      ...opts,
    }, getTransform);
  }

  it('header mousedown starts drag state internally', () => {
    const card = createCard();
    const header = card.el.querySelector('.card-header')!;

    header.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 150, clientY: 250 }));

    // Internal drag state should be set
    expect((card as any).isDragging).toBe(true);
  });

  it('right-click on header does not start drag', () => {
    const card = createCard();
    const header = card.el.querySelector('.card-header')!;

    header.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));

    expect((card as any).isDragging).toBe(false);
  });

  it('mousedown on control buttons does not start drag', () => {
    const card = createCard();
    for (const sel of ['.card-btn-minimize', '.card-btn-fitview', '.card-btn-terminate']) {
      const btn = card.el.querySelector(sel) as HTMLElement;
      btn.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      expect((card as any).isDragging).toBe(false);
    }
  });

  it('clicking control button does not trigger drag or focus', () => {
    const onDragEnd = vi.fn();
    const onFocus = vi.fn();
    const onFitViewport = vi.fn();
    const card = createCard({ onDragEnd, onFocus, onFitViewport });
    const btn = card.el.querySelector('.card-btn-fitview') as HTMLElement;

    // Simulate full click sequence: mousedown → mouseup → click
    btn.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 150, clientY: 250 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Button callback fires
    expect(onFitViewport).toHaveBeenCalledOnce();
    // Drag NOT triggered
    expect(onDragEnd).not.toHaveBeenCalled();
    // Focus IS triggered (capture-phase mousedown on card.el)
    expect(onFocus).toHaveBeenCalled();
  });

  it('each control button fires only its own callback', () => {
    const onMinimize = vi.fn();
    const onFitViewport = vi.fn();
    const onTerminate = vi.fn();
    const parent = makeParent();
    const card = new WindowCard(parent, {
      title: 'Isolation',
      x: 0, y: 0, width: 200, height: 200,
      onMinimize,
      onFitViewport,
      onTerminate,
    }, getTransform);

    card.el.querySelector('.card-btn-minimize')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onMinimize).toHaveBeenCalledOnce();
    expect(onFitViewport).not.toHaveBeenCalled();
    expect(onTerminate).not.toHaveBeenCalled();

    card.el.querySelector('.card-btn-fitview')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onFitViewport).toHaveBeenCalledOnce();
    expect(onTerminate).not.toHaveBeenCalled();

    card.el.querySelector('.card-btn-terminate')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onTerminate).toHaveBeenCalledOnce();
  });

  it('mousemove updates card position while dragging', async () => {
    const card = createCard();
    const header = card.el.querySelector('.card-header')!;
    const startTransform = card.el.style.transform;

    // Start drag at (150, 250) relative to viewport
    header.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 150, clientY: 250 }));

    // Move 56px right and 28px down
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 206, clientY: 278, bubbles: true }));
    // Drag moves via a rAF-batched transform (compositor-only, no per-move layout reflow)
    await new Promise((r) => requestAnimationFrame(r));

    expect(card.el.style.transform).not.toBe(startTransform);

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    // Final position commits to left/top on mouseup (x:100+56 snapped to 28 -> 168, y:200+28 snapped -> 224)
    expect(card.el.style.left).toBe('168px');
    expect(card.el.style.top).toBe('224px');
    expect(card.el.style.transform).toBe('');
  });

  it('onDragStart called on mousedown and onDragMove during mouse move', async () => {
    const onDragStart = vi.fn();
    const onDragMove = vi.fn();
    const card = createCard({ onDragStart, onDragMove });
    const header = card.el.querySelector('.card-header')!;

    header.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 150, clientY: 250 }));
    expect(onDragStart).toHaveBeenCalledWith(150, 250);

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 280, bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
    expect(onDragMove).toHaveBeenCalledWith(200, 280);
  });

  it('mouseup ends drag and calls onDragEnd', () => {
    const onDragEnd = vi.fn();
    const card = createCard({ onDragEnd });
    const header = card.el.querySelector('.card-header')!;

    header.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 150, clientY: 250 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 280, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect((card as any).isDragging).toBe(false);
    expect(onDragEnd).toHaveBeenCalled();
  });

  it('mouseup without prior mousedown does nothing', () => {
    const onDragEnd = vi.fn();
    createCard({ onDragEnd });

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(onDragEnd).not.toHaveBeenCalled();
  });
});

describe('WindowCard — resize interaction', () => {
  function makeParent(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'canvas';
    el.style.cssText = 'width:1920px;height:1080px;position:relative';
    document.body.appendChild(el);
    return el;
  }

  function getTransform() {
    return { scale: 1, panX: 960, panY: 540 };
  }

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('e edge mousedown + mousemove resizes width', () => {
    const card = new WindowCard(makeParent(), {
      title: 'Resize Test',
      x: 100, y: 100, width: 400, height: 300,
    }, getTransform);

    const edgeE = card.el.querySelector('.card-edge-e') as HTMLElement;
    edgeE.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 500, clientY: 200 }));

    // Move 56px right (2 SNAP units) — should increase width
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 556, clientY: 200, bubbles: true }));

    expect(card.opts.width).toBeGreaterThan(400);
  });

  it('resize mousemove updates width', () => {
    const card = new WindowCard(makeParent(), {
      title: 'Resize Test',
      x: 100, y: 100, width: 400, height: 300,
    }, getTransform);

    const edgeE = card.el.querySelector('.card-edge-e') as HTMLElement;
    edgeE.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 500, clientY: 200 }));

    // Move 56px right (2 SNAP units)
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 556, clientY: 200, bubbles: true }));

    expect(card.opts.width).toBeGreaterThan(400);
  });

  it('resize respects minimum SNAP size', () => {
    const card = new WindowCard(makeParent(), {
      title: 'Resize Test',
      x: 100, y: 100, width: 400, height: 300,
    }, getTransform);

    const edgeE = card.el.querySelector('.card-edge-e') as HTMLElement;
    edgeE.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 500, clientY: 200 }));

    // Try to shrink below minimum (28px SNAP)
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 200, bubbles: true }));

    expect(card.opts.width).toBeGreaterThanOrEqual(28);
  });

  it('resize mouseup calls onResizeEnd', () => {
    const onResizeEnd = vi.fn();
    const card = new WindowCard(makeParent(), {
      title: 'Resize Test',
      x: 100, y: 100, width: 400, height: 300,
      onResizeEnd,
    }, getTransform);

    const edgeSE = card.el.querySelector('.card-edge-se') as HTMLElement;
    edgeSE.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 500, clientY: 400 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 556, clientY: 456, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(onResizeEnd).toHaveBeenCalled();
  });

  it('sets aria-label on card header with card title', () => {
    const card = new WindowCard(makeParent(), {
      title: 'Aria Test', x: 0, y: 0, width: 200, height: 200,
    }, getTransform);
    const header = card.el.querySelector('.card-header')!;
    expect(header.getAttribute('aria-label')).toBe('Aria Test');
  });

  it('terminate button has title "Close"', () => {
    const card = new WindowCard(makeParent(), {
      title: 'Btn Test', x: 0, y: 0, width: 200, height: 200,
    }, getTransform);
    const btn = card.el.querySelector('.card-btn-terminate') as HTMLElement;
    expect(btn.getAttribute('title')).toBe('Close');
  });

  it('remove() detaches drag document listeners', () => {
    const card = new WindowCard(makeParent(), {
      title: 'Cleanup', x: 0, y: 0, width: 200, height: 200,
    }, getTransform);
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    card.remove();
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('remove() detaches resize document listeners', () => {
    const card = new WindowCard(makeParent(), {
      title: 'Cleanup2', x: 0, y: 0, width: 200, height: 200,
    }, getTransform);
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    card.remove();
    const calls = removeSpy.mock.calls.filter(c => c[0] === 'mousemove' || c[0] === 'mouseup');
    expect(calls.length).toBe(4); // drag(2) + resize(2)
    removeSpy.mockRestore();
  });

  it('resize shows tooltip on mousedown and updates on mousemove', () => {
    const card = new WindowCard(makeParent(), {
      title: 'Tooltip Test',
      x: 100, y: 100, width: 400, height: 300,
    }, getTransform);

    const edgeSE = card.el.querySelector('.card-edge-se') as HTMLElement;
    edgeSE.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 500, clientY: 400 }));

    const tooltip = document.querySelector('.resize-tooltip') as HTMLElement;
    expect(tooltip).toBeTruthy();
    // 400px → 14 grid units (Math.round(400/28)), 300px → 11 grid units
    expect(tooltip.textContent).toBe('14 × 11');
    expect(tooltip.style.left).toBe('516px');
    expect(tooltip.style.top).toBe('416px');

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 556, clientY: 456, bubbles: true }));
    expect(tooltip.textContent).toMatch(/\d+ × \d+/);
    expect(parseInt(tooltip.textContent!.split(' × ')[0])).toBeGreaterThan(14);
  });

  it('resize tooltip is removed on mouseup', () => {
    const card = new WindowCard(makeParent(), {
      title: 'Tooltip Remove',
      x: 100, y: 100, width: 400, height: 300,
    }, getTransform);

    const edgeSE = card.el.querySelector('.card-edge-se') as HTMLElement;
    edgeSE.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 500, clientY: 400 }));
    expect(document.querySelector('.resize-tooltip')).toBeTruthy();

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(document.querySelector('.resize-tooltip')).toBeNull();
  });

  it('calls onDestroy before removing element', () => {
    const onDestroy = vi.fn();
    const card = new WindowCard(makeParent(), {
      title: 'Destroy', x: 0, y: 0, width: 200, height: 200,
    }, getTransform);
    card.onDestroy = onDestroy;
    const parent = card.el.parentElement;
    card.remove();
    expect(onDestroy).toHaveBeenCalledOnce();
    expect(parent?.contains(card.el)).toBe(false);
  });
});
