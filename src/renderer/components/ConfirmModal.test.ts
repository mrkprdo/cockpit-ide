import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmModal } from './ConfirmModal';

describe('ConfirmModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves true when confirm button is clicked', async () => {
    const modal = new ConfirmModal('Are you sure?', 'Delete');
    const promise = modal.open();

    const btn = document.querySelector('#confirm-ok') as HTMLElement;
    btn.click();

    const result = await promise;
    expect(result).toBe(true);
  });

  it('resolves false when cancel button is clicked', async () => {
    const modal = new ConfirmModal('Are you sure?', 'Delete');
    const promise = modal.open();

    const btn = document.querySelector('#confirm-cancel') as HTMLElement;
    btn.click();

    const result = await promise;
    expect(result).toBe(false);
  });

  it('resolves false when overlay background is clicked', async () => {
    const modal = new ConfirmModal('Are you sure?');
    const promise = modal.open();

    // The overlay is a direct child of body with fixed positioning and high z-index
    const overlay = document.body.lastElementChild as HTMLElement;
    expect(overlay).toBeTruthy();
    overlay.click();

    const result = await promise;
    expect(result).toBe(false);
  });

  it('removes the overlay from DOM after resolution', async () => {
    const modal = new ConfirmModal('Test message');
    const promise = modal.open();

    const overlay = document.body.lastElementChild as HTMLElement;
    expect(overlay).toBeTruthy();

    (document.querySelector('#confirm-ok') as HTMLElement).click();
    await promise;

    expect(document.body.contains(overlay)).toBe(false);
  });

  it('displays the provided message', () => {
    new ConfirmModal('Delete this file?', 'Delete');
    expect(document.body.textContent).toContain('Delete this file?');
  });

  it('uses custom confirm label', () => {
    new ConfirmModal('Proceed? 2', 'Yes, do it');
    const btn = document.querySelector('#confirm-ok') as HTMLElement;
    expect(btn.textContent).toBe('Yes, do it');
  });

  it('defaults confirm label to Delete', () => {
    new ConfirmModal('Sure?');
    const btn = document.querySelector('#confirm-ok') as HTMLElement;
    expect(btn.textContent).toBe('Delete');
  });

  it('Escape key resolves false', async () => {
    const modal = new ConfirmModal('Are you sure?');
    const promise = modal.open();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    const result = await promise;
    expect(result).toBe(false);
  });

  it('clicking overlay background resolves false', async () => {
    const modal = new ConfirmModal('Are you sure?');
    const promise = modal.open();

    const overlay = document.querySelector('.modal-overlay.confirm') as HTMLElement;
    overlay.click();

    const result = await promise;
    expect(result).toBe(false);
  });

  it('sanitizes script tags from message', () => {
    new ConfirmModal('<script>alert(1)</script>Are you sure?');
    const msg = document.querySelector('.confirm-modal-msg') as HTMLElement;
    expect(msg.innerHTML).not.toContain('<script');
  });

  it('sanitizes img tags', () => {
    new ConfirmModal('<img src=x onerror=alert(1)>Are you sure?');
    const msg = document.querySelector('.confirm-modal-msg') as HTMLElement;
    expect(msg.innerHTML).not.toContain('<img');
  });

  it('sanitizes inline onclick handlers', () => {
    new ConfirmModal('<span onclick="evil()">text</span>');
    const msg = document.querySelector('.confirm-modal-msg') as HTMLElement;
    expect(msg.innerHTML).not.toContain('onclick');
  });

  it('destructive=true adds btn-ok-destructive class', () => {
    new ConfirmModal('test');
    const btn = document.querySelector('#confirm-ok') as HTMLElement;
    expect(btn.classList.contains('btn-ok-destructive')).toBe(true);
  });

  it('destructive=false does NOT add btn-ok-destructive class', () => {
    new ConfirmModal('msg', 'OK', false);
    const btn = document.querySelector('#confirm-ok') as HTMLElement;
    expect(btn.classList.contains('btn-ok-destructive')).toBe(false);
  });

  it('open() focuses the cancel button', async () => {
    const modal = new ConfirmModal('test');
    modal.open();
    await new Promise(r => setTimeout(r, 10));
    expect(document.activeElement).toBe(document.querySelector('#confirm-cancel'));
  });
});
