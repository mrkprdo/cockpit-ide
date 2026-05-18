import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WelcomeModal } from './WelcomeModal';
import { mockElectronAPI } from '../../test/setup';

describe('WelcomeModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (mockElectronAPI.workspace.getRecent as any).mockResolvedValue([]);
    (mockElectronAPI.workspace.select as any).mockResolvedValue('/test/workspace');
  });

  it('renders overlay and main elements', () => {
    new WelcomeModal();
    expect(document.querySelector('.modal-overlay')).toBeTruthy();
    expect(document.querySelector('.welcome-modal')).toBeTruthy();
    expect(document.body.textContent).toContain('COCKPIT IDE');
    expect(document.body.textContent).toContain('Select a workspace');
  });

  it('starts hidden', () => {
    new WelcomeModal();
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    expect(overlay.style.display).toBe('none');
  });

  it('becomes visible immediately when open() is called', () => {
    const modal = new WelcomeModal();
    modal.open(); // Don't await — open() returns a Promise that only resolves on click

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

    // Wait for the async getRecent() inside open() to finish
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
    // open() returns a promise that resolves on click, but recent workspaces
    // are loaded asynchronously inside open(). Wait for a tick to see them.
    modal.open();
    await new Promise(r => setTimeout(r, 50));

    const items = document.querySelectorAll('.welcome-recent-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('/home/user/project1');
    expect(items[1].textContent).toBe('/home/user/project2');
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
});
