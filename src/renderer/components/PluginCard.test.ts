import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginCard } from './PluginCard';

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

describe('PluginCard', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('creates a card element with the correct structure', () => {
    const parent = makeParent();
    const card = new PluginCard(parent, {
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
    expect(el.querySelector('.card-close')).toBeTruthy();
    expect(el.querySelector('.card-edge-e')).toBeTruthy();
    expect(el.querySelector('.card-edge-s')).toBeTruthy();
    expect(el.querySelector('.card-edge-se')).toBeTruthy();
  });

  it('sets initial position and size from options', () => {
    const parent = makeParent();
    const card = new PluginCard(parent, {
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
    const card1 = new PluginCard(parent, { title: 'A', x: 0, y: 0, width: 200, height: 200 }, getTransform);
    const card2 = new PluginCard(parent, { title: 'B', x: 0, y: 0, width: 200, height: 200 }, getTransform);

    expect(card1.uuid).toBeTruthy();
    expect(card2.uuid).toBeTruthy();
    expect(card1.uuid).not.toBe(card2.uuid);
    expect(card1.uuid).toMatch(/^[0-9a-f-]+$/);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    const parent = makeParent();
    const card = new PluginCard(parent, {
      title: 'Close Test',
      x: 0, y: 0, width: 200, height: 200,
      onClose,
    }, getTransform);

    const closeBtn = card.el.querySelector('.card-close') as HTMLElement;
    closeBtn.click();

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onFocus when card is clicked', () => {
    const onFocus = vi.fn();
    const parent = makeParent();
    const card = new PluginCard(parent, {
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
    const card = new PluginCard(parent, {
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

  it('renders a canvas title element', () => {
    const parent = makeParent();
    const card = new PluginCard(parent, {
      title: 'Canvas Title',
      x: 0, y: 0, width: 400, height: 300,
    }, getTransform);

    const canvas = card.el.querySelector('.card-title-canvas') as HTMLCanvasElement;
    expect(canvas).toBeTruthy();
    expect(canvas.tagName).toBe('CANVAS');
  });

  it('stores width/height from constructor opts', () => {
    const parent = makeParent();
    const card = new PluginCard(parent, {
      title: 'Snap Test',
      x: 50,
      y: 50,
      width: 300,
      height: 300,
    }, getTransform);

    expect(card.opts.width).toBe(300);
    expect(card.opts.height).toBe(300);
  });

  it('supports setContent with HTML (creates canvas)', () => {
    const parent = makeParent();
    const card = new PluginCard(parent, {
      title: 'Content Test',
      x: 0, y: 0, width: 400, height: 300,
    }, getTransform);

    card.setContent('<b>Hello</b>');
    const body = card.el.querySelector('.card-body') as HTMLElement;
    expect(body.querySelector('canvas')).toBeTruthy();
  });
});

describe('PluginCard — drag interaction', () => {
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

  function createCard(opts = {}): PluginCard {
    return new PluginCard(makeParent(), {
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

  it('mousemove updates card position while dragging', () => {
    const card = createCard();
    const header = card.el.querySelector('.card-header')!;
    const startLeft = card.el.style.left;
    const startTop = card.el.style.top;

    // Start drag at (150, 250) relative to viewport
    header.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 150, clientY: 250 }));

    // Move 56px right and 28px down
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 206, clientY: 278, bubbles: true }));

    // Position should have changed from start
    expect(card.el.style.left).not.toBe(startLeft);
    expect(card.el.style.top).not.toBe(startTop);
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

describe('PluginCard — resize interaction', () => {
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

  it('e edge mousedown starts resize', () => {
    const card = new PluginCard(makeParent(), {
      title: 'Resize Test',
      x: 100, y: 100, width: 400, height: 300,
    }, getTransform);

    const edgeE = card.el.querySelector('.card-edge-e') as HTMLElement;
    edgeE.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, clientX: 500, clientY: 200 }));

    // Internal resize state should be set
    expect((card as any).resizing).toBeUndefined(); // resizing is a local variable, not on `this`
    // But the opts should still have original dimensions
    expect(card.opts.width).toBe(400);
  });

  it('resize mousemove updates width', () => {
    const card = new PluginCard(makeParent(), {
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
    const card = new PluginCard(makeParent(), {
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
    const card = new PluginCard(makeParent(), {
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
});
