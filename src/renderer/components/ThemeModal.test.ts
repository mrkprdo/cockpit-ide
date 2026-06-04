import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThemeModal } from './ThemeModal';
import { theme } from '../theme';

describe('ThemeModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    theme.setTheme('default', 'dark');
  });

  it('renders overlay and main elements', () => {
    new ThemeModal();
    expect(document.querySelector('.modal-overlay')).toBeTruthy();
    expect(document.querySelector('.modal')).toBeTruthy();
    expect(document.body.textContent).toContain('THEME');
    expect(document.body.textContent).toContain('Default');
    expect(document.body.textContent).toContain('Monokai');
    expect(document.body.textContent).toContain('Idol');
    expect(document.body.textContent).toContain('Dark');
    expect(document.body.textContent).toContain('Light');
  });

  it('dialog has required ARIA attributes', () => {
    new ThemeModal();
    const el = document.querySelector('.modal') as HTMLElement;
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBe('true');
    expect(el.getAttribute('aria-label')).toBe('Theme');
  });

  it('starts hidden', () => {
    new ThemeModal();
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    expect(overlay.style.display).toBe('none');
  });

  it('open() makes it visible', () => {
    const modal = new ThemeModal();
    modal.open();
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    expect(overlay.style.display).toBe('flex');
  });

  it('default and dark are checked by default', () => {
    new ThemeModal();
    expect((document.querySelector('input[name="theme-base"][value="default"]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('input[name="theme-base"][value="monokai"]') as HTMLInputElement).checked).toBe(false);
    expect((document.querySelector('input[name="theme-mode"][value="dark"]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('input[name="theme-mode"][value="light"]') as HTMLInputElement).checked).toBe(false);
  });

  it('reflects monokai base when monokai active', () => {
    theme.setTheme('monokai', 'dark');
    new ThemeModal();
    expect((document.querySelector('input[name="theme-base"][value="monokai"]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('input[name="theme-base"][value="default"]') as HTMLInputElement).checked).toBe(false);
  });

  it('reflects light mode when light active', () => {
    theme.setTheme('default', 'light');
    new ThemeModal();
    expect((document.querySelector('input[name="theme-mode"][value="light"]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('input[name="theme-mode"][value="dark"]') as HTMLInputElement).checked).toBe(false);
  });

  it('Cancel button hides the modal', () => {
    const modal = new ThemeModal();
    modal.open();
    (document.querySelector('#theme-cancel') as HTMLElement).click();
    expect((document.querySelector('.modal-overlay') as HTMLElement).style.display).toBe('none');
  });

  it('Apply with default+dark sets theme correctly', () => {
    theme.setTheme('monokai', 'light');
    const modal = new ThemeModal();
    modal.open();

    (document.querySelector('input[name="theme-base"][value="default"]') as HTMLInputElement).checked = true;
    (document.querySelector('input[name="theme-mode"][value="dark"]') as HTMLInputElement).checked = true;
    (document.querySelector('#theme-apply') as HTMLElement).click();

    expect(theme.base).toBe('default');
    expect(theme.mode).toBe('dark');
  });

  it('Apply with monokai+dark sets theme correctly', () => {
    const modal = new ThemeModal();
    modal.open();

    (document.querySelector('input[name="theme-base"][value="monokai"]') as HTMLInputElement).checked = true;
    (document.querySelector('input[name="theme-mode"][value="dark"]') as HTMLInputElement).checked = true;
    (document.querySelector('#theme-apply') as HTMLElement).click();

    expect(theme.base).toBe('monokai');
    expect(theme.mode).toBe('dark');
  });

  it('Apply with default+light sets theme correctly', () => {
    const modal = new ThemeModal();
    modal.open();

    (document.querySelector('input[name="theme-base"][value="default"]') as HTMLInputElement).checked = true;
    (document.querySelector('input[name="theme-mode"][value="light"]') as HTMLInputElement).checked = true;
    (document.querySelector('#theme-apply') as HTMLElement).click();

    expect(theme.base).toBe('default');
    expect(theme.mode).toBe('light');
  });

  it('Apply with monokai+light sets theme correctly', () => {
    const modal = new ThemeModal();
    modal.open();

    (document.querySelector('input[name="theme-base"][value="monokai"]') as HTMLInputElement).checked = true;
    (document.querySelector('input[name="theme-mode"][value="light"]') as HTMLInputElement).checked = true;
    (document.querySelector('#theme-apply') as HTMLElement).click();

    expect(theme.base).toBe('monokai');
    expect(theme.mode).toBe('light');
  });

  it('clicking overlay background closes it', () => {
    const modal = new ThemeModal();
    modal.open();
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    overlay.click();
    expect(overlay.style.display).toBe('none');
  });

  it('open() accepts onClose callback, called on Cancel', () => {
    const modal = new ThemeModal();
    let called = false;
    modal.open(() => { called = true; });
    (document.querySelector('#theme-cancel') as HTMLElement).click();
    expect(called).toBe(true);
  });

  it('open() callback called when overlay background clicked', () => {
    const modal = new ThemeModal();
    let called = false;
    modal.open(() => { called = true; });
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    overlay.click();
    expect(called).toBe(true);
  });

  it('open() without callback does not throw on close', () => {
    const modal = new ThemeModal();
    modal.open();
    expect(() => {
      (document.querySelector('#theme-cancel') as HTMLElement).click();
    }).not.toThrow();
  });

  it('callback not called again on second open without new callback', () => {
    const modal = new ThemeModal();
    let count = 0;
    modal.open(() => { count++; });
    (document.querySelector('#theme-cancel') as HTMLElement).click();

    modal.open();
    (document.querySelector('#theme-cancel') as HTMLElement).click();

    expect(count).toBe(1);
  });

  it('onClose callback is null after close (not called twice)', () => {
    const modal = new ThemeModal();
    const spy = vi.fn();
    modal.open(spy);

    (document.querySelector('#theme-cancel') as HTMLElement).click();
    (document.querySelector('#theme-cancel') as HTMLElement).click();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('Apply with idol+dark sets theme correctly', () => {
    const modal = new ThemeModal();
    modal.open();

    (document.querySelector('input[name="theme-base"][value="idol"]') as HTMLInputElement).checked = true;
    (document.querySelector('input[name="theme-mode"][value="dark"]') as HTMLInputElement).checked = true;
    (document.querySelector('#theme-apply') as HTMLElement).click();

    expect(theme.base).toBe('idol');
    expect(theme.mode).toBe('dark');
  });

  it('re-renders on open to reflect current theme state', () => {
    const modal = new ThemeModal();
    theme.setTheme('default', 'dark');

    modal.open();
    expect((document.querySelector('input[name="theme-base"][value="default"]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('input[name="theme-mode"][value="dark"]') as HTMLInputElement).checked).toBe(true);

    (document.querySelector('#theme-cancel') as HTMLElement).click();
    theme.setTheme('monokai', 'light');
    modal.open();

    expect((document.querySelector('input[name="theme-base"][value="monokai"]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('input[name="theme-mode"][value="light"]') as HTMLInputElement).checked).toBe(true);
  });
});
