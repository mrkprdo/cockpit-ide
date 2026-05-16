import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatusBar } from './canvas-statusbar';

describe('StatusBar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    const statusbar = document.createElement('div');
    statusbar.id = 'statusbar';
    document.body.appendChild(statusbar);
  });

  it('init() creates DOM elements inside #statusbar', () => {
    const sb = new StatusBar();
    sb.init();
    const container = document.getElementById('statusbar')!;
    expect(container.children.length).toBeGreaterThan(0);
    // Should have zoom display element
    const zoomEl = container.querySelector('.status-item');
    expect(zoomEl).not.toBeNull();
  });

  it('init() is idempotent — second call does not duplicate children', () => {
    const sb = new StatusBar();
    sb.init();
    const childCount = document.getElementById('statusbar')!.children.length;
    sb.init();
    expect(document.getElementById('statusbar')!.children.length).toBe(childCount);
  });

  it('update() sets zoom text and lock icon', () => {
    const sb = new StatusBar();
    sb.init();
    sb.update(true, 1, 'test-workspace', null, vi.fn());
    const span = document.getElementById('statusbar')!.querySelector('.status-item')!;
    expect(span.innerHTML).toContain('Zoom: 100%');
    expect(span.innerHTML).toContain('svg'); // lock icon
  });

  it('update() shows refresh icon when unlocked and not at 1x zoom', () => {
    const sb = new StatusBar();
    sb.init();
    sb.update(false, 1.5, 'test-workspace', null, vi.fn());
    const items = document.getElementById('statusbar')!.querySelectorAll('.status-item');
    // Second status-item is the refresh icon
    const refreshEl = items[1] as HTMLElement;
    expect(refreshEl.style.visibility).not.toBe('hidden');
  });

  it('update() hides refresh icon when zoom is 1x', () => {
    const sb = new StatusBar();
    sb.init();
    sb.update(false, 1.0, 'test-workspace', null, vi.fn());
    const items = document.getElementById('statusbar')!.querySelectorAll('.status-item');
    const refreshEl = items[1] as HTMLElement;
    expect(refreshEl.style.visibility).toBe('hidden');
  });

  it('update() hides refresh icon when locked', () => {
    const sb = new StatusBar();
    sb.init();
    sb.update(true, 1.5, 'test-workspace', null, vi.fn());
    const items = document.getElementById('statusbar')!.querySelectorAll('.status-item');
    const refreshEl = items[1] as HTMLElement;
    expect(refreshEl.style.visibility).toBe('hidden');
  });

  it('update() sets workspace name text', () => {
    const sb = new StatusBar();
    sb.init();
    sb.update(false, 1, 'my-project', null, vi.fn());
    const items = document.getElementById('statusbar')!.querySelectorAll('.status-item');
    // Fourth .status-item (index 3) is the workspace span
    const sbWorkspace = items[3] as HTMLElement;
    expect(sbWorkspace.textContent).toBe('my-project');
  });

  it('update() calls fitAll when view-all button is clicked', () => {
    const sb = new StatusBar();
    sb.init();
    const fitAll = vi.fn();
    sb.update(false, 1, 'test', null, fitAll);
    const viewAllBtn = document.getElementById('statusbar')!.querySelector('.status-btn') as HTMLButtonElement;
    viewAllBtn.click();
    expect(fitAll).toHaveBeenCalledOnce();
  });

  it('refresh icon click triggers resetZoom callback', () => {
    const sb = new StatusBar();
    sb.init();
    const resetZoom = vi.fn();
    sb.update(false, 1.5, 'test', null, vi.fn(), resetZoom);
    const items = document.getElementById('statusbar')!.querySelectorAll('.status-item');
    const refreshEl = items[1] as HTMLElement;
    refreshEl.click();
    expect(resetZoom).toHaveBeenCalledOnce();
  });

  it('zoom click triggers lockToggle callback', () => {
    const sb = new StatusBar();
    sb.init();
    const lockToggle = vi.fn();
    sb.update(true, 1, 'test', lockToggle, vi.fn());
    const zoomEl = document.getElementById('statusbar')!.querySelector('.status-item') as HTMLElement;
    zoomEl.click();
    expect(lockToggle).toHaveBeenCalledOnce();
  });
});
