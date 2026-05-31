import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AboutModal } from './AboutModal';

describe('AboutModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders overlay and main elements', () => {
    new AboutModal();
    expect(document.querySelector('.modal-overlay')).toBeTruthy();
    expect(document.querySelector('.about-modal')).toBeTruthy();
    expect(document.body.textContent).toContain('COCKPIT IDE');
    expect(document.body.textContent).toContain('dev');
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
    expect(link.textContent).toBe('UseDesign.md');
  });

  it('open() accepts onClose callback, called on close button click', () => {
    const modal = new AboutModal();
    let called = false;
    modal.open(() => { called = true; });

    const closeBtn = document.querySelector('#about-close') as HTMLElement;
    closeBtn.click();

    expect(called).toBe(true);
  });

  it('open() callback called when overlay background clicked', () => {
    const modal = new AboutModal();
    let called = false;
    modal.open(() => { called = true; });

    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    overlay.click();

    expect(called).toBe(true);
  });

  it('open() without callback does not throw on close', () => {
    const modal = new AboutModal();
    modal.open();
    expect(() => {
      (document.querySelector('#about-close') as HTMLElement).click();
    }).not.toThrow();
  });

  it('callback not called again on second open without new callback', () => {
    const modal = new AboutModal();
    let count = 0;
    modal.open(() => { count++; });
    (document.querySelector('#about-close') as HTMLElement).click();

    // second open, no callback — previous callback must be cleared
    modal.open();
    (document.querySelector('#about-close') as HTMLElement).click();

    expect(count).toBe(1);
  });

  it('onClose callback is null after close (not called twice)', () => {
    const modal = new AboutModal();
    const spy = vi.fn();
    modal.open(spy);

    const closeBtn = document.querySelector('#about-close') as HTMLElement;
    closeBtn.click();
    closeBtn.click();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('design link fires shell:openExternal with https URL', () => {
    new AboutModal();
    const link = document.querySelector('#about-design-link') as HTMLElement;
    link.click();
    expect((window as any).electronAPI.shell.openExternal).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\//)
    );
  });

  it('version info shown from electronAPI.versions', () => {
    new AboutModal();
    const el = document.querySelector('.about-modal') as HTMLElement;
    expect(el.textContent).toContain('dev');
  });
});
