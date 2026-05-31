import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WelcomeModal } from './WelcomeModal';
import { mockElectronAPI } from '../../test/setup';

describe('WelcomeModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (mockElectronAPI.workspace.getRecent as any).mockResolvedValue([]);
    (mockElectronAPI.workspace.select as any).mockResolvedValue('/test/workspace');
    (mockElectronAPI.workspace.removeRecent as any).mockResolvedValue(undefined);
    (mockElectronAPI.fs.readDir as any).mockResolvedValue([{ name: 'file.txt', isDirectory: false }]);
  });

  it('does not close modal when Open Workspace is canceled', async () => {
    (mockElectronAPI.workspace.select as any).mockResolvedValue(null);
    const modal = new WelcomeModal();
    const promise = modal.open();
    // Wait for recent list to populate
    await new Promise(r => setTimeout(r, 50));

    const btn = document.querySelector('#welcome-open') as HTMLElement;
    btn.click();
    // Wait for async handler
    await new Promise(r => setTimeout(r, 50));

    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    expect(overlay.style.display).toBe('flex');
  });

  it('renders overlay and main elements', () => {
    new WelcomeModal();
    expect(document.querySelector('.modal-overlay')).toBeTruthy();
    expect(document.querySelector('.welcome-modal')).toBeTruthy();
    expect(document.body.textContent).toContain('COCKPIT IDE');
    expect(document.body.textContent).toContain('Select a workspace');
  });

  it('dialog has required ARIA attributes', () => {
    new WelcomeModal();
    const modal = document.querySelector('.welcome-modal') as HTMLElement;
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.getAttribute('aria-labelledby')).toBe('welcome-title');
    expect(document.querySelector('#welcome-title')).toBeTruthy();
  });

  it('starts hidden', () => {
    new WelcomeModal();
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    expect(overlay.style.display).toBe('none');
  });

  it('becomes visible immediately when open() is called', () => {
    const modal = new WelcomeModal();
    modal.open();

    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    expect(overlay.style.display).toBe('flex');
  });

  it('clicking "Open Workspace" calls workspace.select and resolves with path', async () => {
    const modal = new WelcomeModal();
    const promise = modal.open();

    const btn = document.querySelector('#welcome-open') as HTMLElement;
    btn.click();

    const result = await promise;
    expect(mockElectronAPI.workspace.select).toHaveBeenCalled();
    expect(result).toBe('/test/workspace');
  });

  it('clicking "Close" resolves with null', async () => {
    const modal = new WelcomeModal();
    const promise = modal.open();

    await new Promise(r => setTimeout(r, 50));

    const btn = document.querySelector('#welcome-close') as HTMLElement;
    btn.click();

    const result = await promise;
    expect(result).toBeNull();
  });

  it('shows recent workspaces when available', async () => {
    (mockElectronAPI.workspace.getRecent as any).mockResolvedValue([
      '/home/user/project1',
      '/home/user/project2',
    ]);

    const modal = new WelcomeModal();
    modal.open();
    await new Promise(r => setTimeout(r, 50));

    const items = document.querySelectorAll('.welcome-recent-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('/home/user/project1');
    expect(items[1].textContent).toContain('/home/user/project2');
  });

  it('hides recent section when no recent workspaces', async () => {
    (mockElectronAPI.workspace.getRecent as any).mockResolvedValue([]);

    const modal = new WelcomeModal();
    modal.open();
    await new Promise(r => setTimeout(r, 50));

    const container = document.querySelector('#welcome-recent') as HTMLElement;
    expect(container.style.display).toBe('none');
  });

  it('clicking a recent item resolves with that path', async () => {
    (mockElectronAPI.workspace.getRecent as any).mockResolvedValue(['/my/project']);

    const modal = new WelcomeModal();
    const promise = modal.open();
    await new Promise(r => setTimeout(r, 50));

    const item = document.querySelector('.welcome-recent-item') as HTMLElement;
    item.click();

    const result = await promise;
    expect(result).toBe('/my/project');
  });

  it('clicking a missing recent item does NOT resolve', async () => {
    (mockElectronAPI.workspace.getRecent as any).mockResolvedValue(['/missing/path']);
    (mockElectronAPI.fs.readDir as any).mockResolvedValue(null);

    const modal = new WelcomeModal();
    const promise = modal.open();
    await new Promise(r => setTimeout(r, 50));

    const item = document.querySelector('.welcome-recent-item') as HTMLElement;
    item.click();
    await new Promise(r => setTimeout(r, 20));

    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    expect(overlay.style.display).toBe('flex');
  });

  it('marks missing recent workspaces with .welcome-recent-item-missing', async () => {
    (mockElectronAPI.workspace.getRecent as any).mockResolvedValue(['/exists', '/missing']);
    (mockElectronAPI.fs.readDir as any).mockImplementation(async (p: string) => {
      return p === '/exists' ? [{ name: 'foo', isDirectory: false }] : null;
    });

    const modal = new WelcomeModal();
    modal.open();
    await new Promise(r => setTimeout(r, 50));

    const items = document.querySelectorAll('.welcome-recent-item-path');
    expect(items[0].classList.contains('welcome-recent-item-missing')).toBe(false);
    expect(items[0].textContent).toBe('/exists');
    expect(items[1].classList.contains('welcome-recent-item-missing')).toBe(true);
    expect(items[1].textContent).toBe('/missing');
  });

  it('each recent item has a remove button', async () => {
    (mockElectronAPI.workspace.getRecent as any).mockResolvedValue(['/my/project']);

    const modal = new WelcomeModal();
    modal.open();
    await new Promise(r => setTimeout(r, 50));

    const removeBtns = document.querySelectorAll('.welcome-recent-item-remove');
    expect(removeBtns.length).toBe(1);
    expect(removeBtns[0].textContent).toBe('×');
  });

  it('clicking remove button calls removeRecent and removes the item', async () => {
    (mockElectronAPI.workspace.getRecent as any).mockResolvedValue(['/my/project']);
    (mockElectronAPI.workspace.removeRecent as any).mockResolvedValue(undefined);

    const modal = new WelcomeModal();
    modal.open();
    await new Promise(r => setTimeout(r, 50));

    const removeBtn = document.querySelector('.welcome-recent-item-remove') as HTMLElement;
    removeBtn.click();
    await new Promise(r => setTimeout(r, 50));

    expect(mockElectronAPI.workspace.removeRecent).toHaveBeenCalledWith('/my/project');
    expect(document.querySelectorAll('.welcome-recent-item').length).toBe(0);
  });

  it('clicking remove button does not trigger item click (does not close modal)', async () => {
    (mockElectronAPI.workspace.getRecent as any).mockResolvedValue(['/my/project']);

    const modal = new WelcomeModal();
    const promise = modal.open();
    await new Promise(r => setTimeout(r, 50));

    const removeBtn = document.querySelector('.welcome-recent-item-remove') as HTMLElement;
    removeBtn.click();
    await new Promise(r => setTimeout(r, 50));

    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    expect(overlay.style.display).toBe('flex');
  });

  it('hides recent section when all items removed', async () => {
    (mockElectronAPI.workspace.getRecent as any).mockResolvedValue(['/only/project']);

    const modal = new WelcomeModal();
    modal.open();
    await new Promise(r => setTimeout(r, 50));

    const container = document.querySelector('#welcome-recent') as HTMLElement;
    expect(container.style.display).toBe('block');

    const removeBtn = document.querySelector('.welcome-recent-item-remove') as HTMLElement;
    removeBtn.click();
    await new Promise(r => setTimeout(r, 50));

    expect(container.style.display).toBe('none');
  });
});
