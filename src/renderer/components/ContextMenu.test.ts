import { describe, it, expect, vi, afterEach } from 'vitest';
import { ContextMenu } from './ContextMenu';

describe('ContextMenu', () => {
  afterEach(() => {
    document.body.querySelectorAll('.ctx-menu').forEach(el => el.remove());
  });

  it('creates menu items in the DOM', () => {
    new ContextMenu([
      { label: 'Copy', action: vi.fn() },
      { label: 'Paste', action: vi.fn() },
    ], 100, 200);

    const items = document.querySelectorAll('.ctx-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('Copy');
    expect(items[1].textContent).toBe('Paste');
  });

  it('positions the menu at given coordinates', () => {
    new ContextMenu([{ label: 'Test' }], 150, 300);

    const menu = document.querySelector('.ctx-menu') as HTMLElement;
    expect(menu.style.left).toBe('150px');
    expect(menu.style.top).toBe('300px');
  });

  it('fires action on item click and removes menu', () => {
    const action = vi.fn();
    new ContextMenu([{ label: 'Run', action }], 0, 0);

    const item = document.querySelector('.ctx-item') as HTMLElement;
    item.click();

    expect(action).toHaveBeenCalledOnce();
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });

  it('renders separators', () => {
    new ContextMenu([
      { label: 'A' },
      { separator: true },
      { label: 'B' },
    ], 0, 0);

    const sep = document.querySelector('.ctx-sep');
    expect(sep).toBeTruthy();
  });

  it('does not fire action on disabled items', () => {
    const action = vi.fn();
    new ContextMenu([{ label: 'Disabled', action, disabled: true }], 0, 0);

    const item = document.querySelector('.ctx-disabled') as HTMLElement;
    item.click();

    expect(action).not.toHaveBeenCalled();
  });

  it('closes on outside click (after setTimeout)', async () => {
    new ContextMenu([{ label: 'X' }], 0, 0);
    expect(document.querySelector('.ctx-menu')).toBeTruthy();

    // The outside click listener is added via setTimeout(0)
    await new Promise(r => setTimeout(r, 10));

    document.body.click();
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });

  it('calls onClose callback when removed', () => {
    const onClose = vi.fn();
    const menu = new ContextMenu([{ label: 'X' }], 0, 0);
    menu.onClose = onClose;

    menu.remove();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes previous menus when a new one is opened', () => {
    new ContextMenu([{ label: 'First' }], 0, 0);
    new ContextMenu([{ label: 'Second' }], 0, 0);

    const menus = document.querySelectorAll('.ctx-menu');
    expect(menus.length).toBe(1);
    expect(menus[0].querySelector('.ctx-item')!.textContent).toBe('Second');
  });
});
