import { describe, it, expect, beforeEach } from 'vitest';
import { AboutModal } from './AboutModal';

describe('AboutModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders overlay and main elements', () => {
    new AboutModal();
    expect(document.querySelector('.modal-overlay')).toBeTruthy();
    expect(document.querySelector('.welcome-modal')).toBeTruthy();
    expect(document.body.textContent).toContain('COCKPIT IDE');
    expect(document.body.textContent).toContain('v1.0.0');
  });

  it('starts hidden', () => {
    new AboutModal();
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    expect(overlay.style.display).toBe('none');
  });

  it('open() makes it visible', () => {
    const modal = new AboutModal();
    modal.open();
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    expect(overlay.style.display).toBe('flex');
  });

  it('close button hides the modal', () => {
    const modal = new AboutModal();
    modal.open();

    const closeBtn = document.querySelector('#about-close') as HTMLElement;
    closeBtn.click();

    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    expect(overlay.style.display).toBe('none');
  });

  it('clicking overlay background closes it', () => {
    const modal = new AboutModal();
    modal.open();
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;

    overlay.click();

    expect(overlay.style.display).toBe('none');
  });

  it('has a clickable design.md link that opens external URL', () => {
    new AboutModal();
    const link = document.querySelector('#about-design-link') as HTMLElement;
    expect(link).toBeTruthy();
    expect(link.textContent).toBe('design.md');
    expect(link.style.cursor).toBe('pointer');
  });
});
