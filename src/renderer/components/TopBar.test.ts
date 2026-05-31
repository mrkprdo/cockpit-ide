import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopBar } from '../components/TopBar';

function makeTopBarEl(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'menu-bar';
  document.body.appendChild(el);
  return el;
}

describe('TopBar', () => {
  let callbacks: any;

  beforeEach(() => {
    document.body.innerHTML = '';
    callbacks = {
      onGridChange: vi.fn(),
      onThemeToggle: vi.fn(),
      onOpenWorkspace: vi.fn(),
      onNewTerminal: vi.fn(),
      onNewExplorer: vi.fn(),
      onNewGit: vi.fn(),
      onNewMarkdown: vi.fn(),
      onFocusTerminal: vi.fn(),
      onReopenTerminal: vi.fn(),
      onFocusExplorer: vi.fn(),
      onReopenExplorer: vi.fn(),
      onFocusMarkdown: vi.fn(),
      onReopenMarkdown: vi.fn(),
      onAbout: vi.fn(),
      onTutorial: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
      onResetView: vi.fn(),
      onZoomLock: vi.fn(),
    };
  });

  it('renders File, View, Help menus', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const text = document.body.textContent || '';
    expect(text).toContain('File');
    expect(text).toContain('View');
    expect(text).toContain('Help');
  });

  it('renders theme toggle button', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#theme-toggle');
    expect(btn).toBeTruthy();
    expect(btn!.textContent).toContain('◐');
  });

  it('clicking theme toggle calls onThemeToggle', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#theme-toggle') as HTMLElement;
    btn.click();
    expect(callbacks.onThemeToggle).toHaveBeenCalledOnce();
  });

  it('clicking "Open Workspace" calls onOpenWorkspace', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#menu-open-workspace') as HTMLElement;
    btn.click();
    expect(callbacks.onOpenWorkspace).toHaveBeenCalledOnce();
  });

  it('clicking "New" under Terminal calls onNewTerminal', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#menu-new-terminal') as HTMLElement;
    btn.click();
    expect(callbacks.onNewTerminal).toHaveBeenCalledOnce();
  });

  it('clicking "New" under Explorer calls onNewExplorer', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#menu-new-explorer') as HTMLElement;
    btn.click();
    expect(callbacks.onNewExplorer).toHaveBeenCalledOnce();
  });

  it('clicking "Tutorial" calls onTutorial', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#menu-tutorial') as HTMLElement;
    btn.click();
    expect(callbacks.onTutorial).toHaveBeenCalledOnce();
  });

  it('clicking "About Cockpit IDE" calls onAbout', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#menu-about') as HTMLElement;
    btn.click();
    expect(callbacks.onAbout).toHaveBeenCalledOnce();
  });

  it('clicking Zoom In calls onZoomIn', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#menu-zoom-in') as HTMLElement;
    btn.click();
    expect(callbacks.onZoomIn).toHaveBeenCalledOnce();
  });

  it('clicking Zoom Out calls onZoomOut', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#menu-zoom-out') as HTMLElement;
    btn.click();
    expect(callbacks.onZoomOut).toHaveBeenCalledOnce();
  });

  it('clicking Reset View calls onResetView', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#menu-reset-view') as HTMLElement;
    btn.click();
    expect(callbacks.onResetView).toHaveBeenCalledOnce();
  });

  it('shows terminal items in the Terminal submenu', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setTerminalItems([
      { uuid: 't1', title: 'Terminal 1', isOpen: true },
      { uuid: 't2', title: 'Terminal 2', isOpen: false },
    ]);

    const items = document.querySelectorAll('.term-instance');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('Terminal 1');
    expect(items[1].textContent).toBe('Terminal 2');
  });

  it('shows explorer items in the Explorer submenu', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setExplorerItems([
      { uuid: 'd1', title: 'Explorer 1', isOpen: true },
    ]);

    const items = document.querySelectorAll('.explorer-instance');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toBe('Explorer 1');
  });

  it('shows markdown items in the Markdown submenu', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setMarkdownItems([
      { uuid: 'c1', title: 'Markdown 1', isOpen: true },
    ]);

    const items = document.querySelectorAll('.md-instance');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toBe('Markdown 1');
  });

  it('directs terminal item click properly for open vs closed', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setTerminalItems([
      { uuid: 't1', title: 'Terminal 1', isOpen: true },
      { uuid: 't2', title: 'Terminal 2', isOpen: false },
    ]);

    const openItem = document.querySelector('[data-term-open="true"]') as HTMLElement;
    openItem.click();
    expect(callbacks.onFocusTerminal).toHaveBeenCalledWith('t1');

    const closedItem = document.querySelector('[data-term-open="false"]') as HTMLElement;
    closedItem.click();
    expect(callbacks.onReopenTerminal).toHaveBeenCalledWith('t2');
  });

  it('"New" in Markdown submenu calls onNewMarkdown', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#menu-new-markdown') as HTMLElement;
    btn.click();
    expect(callbacks.onNewMarkdown).toHaveBeenCalledOnce();
  });

  it('clicking "Git" under View menu calls onNewGit', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#menu-new-git') as HTMLElement;
    btn.click();
    expect(callbacks.onNewGit).toHaveBeenCalledOnce();
  });

  it('clicking "Lock" in Zoom submenu calls onZoomLock(true) when not locked', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#menu-zoom-lock') as HTMLElement;
    btn.click();
    expect(callbacks.onZoomLock).toHaveBeenCalledWith(true);
  });

  it('setZoomLocked(true) shows check mark next to Lock item', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setZoomLocked(true);
    const btn = document.querySelector('#menu-zoom-lock') as HTMLElement;
    expect(btn.textContent).toContain('✓');
  });

  it('setZoomLocked(false) removes check mark from Lock item', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setZoomLocked(true);
    bar.setZoomLocked(false);
    const btn = document.querySelector('#menu-zoom-lock') as HTMLElement;
    expect(btn.textContent).not.toContain('✓');
  });

  it('clicking Dot grid option calls onGridChange("dots")', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const el = document.querySelector('[data-grid="dots"]') as HTMLElement;
    el.click();
    expect(callbacks.onGridChange).toHaveBeenCalledWith('dots');
  });

  it('clicking Grid option calls onGridChange("grid")', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const el = document.querySelector('[data-grid="grid"]') as HTMLElement;
    el.click();
    expect(callbacks.onGridChange).toHaveBeenCalledWith('grid');
  });

  it('clicking None option calls onGridChange("none")', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const el = document.querySelector('[data-grid="none"]') as HTMLElement;
    el.click();
    expect(callbacks.onGridChange).toHaveBeenCalledWith('none');
  });

  it('setGridStyle("grid") shows check mark on Grid item', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setGridStyle('grid');
    const el = document.querySelector('[data-grid="grid"]') as HTMLElement;
    expect(el.textContent).toContain('✓');
  });

  it('clicking open markdown instance calls onFocusMarkdown with uuid', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setMarkdownItems([{ uuid: 'md1', title: 'Markdown 1', isOpen: true }]);
    const inst = document.querySelector('.md-instance') as HTMLElement;
    inst.click();
    expect(callbacks.onFocusMarkdown).toHaveBeenCalledWith('md1');
  });

  it('clicking closed markdown instance calls onReopenMarkdown with uuid', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setMarkdownItems([{ uuid: 'md1', title: 'Markdown 1', isOpen: false }]);
    const inst = document.querySelector('.md-instance') as HTMLElement;
    inst.click();
    expect(callbacks.onReopenMarkdown).toHaveBeenCalledWith('md1');
  });

  it('clicking open terminal instance calls onFocusTerminal with uuid', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setTerminalItems([{ uuid: 'tid', title: 'Terminal 1', isOpen: true }]);
    const inst = document.querySelector('.term-instance') as HTMLElement;
    inst.click();
    expect(callbacks.onFocusTerminal).toHaveBeenCalledWith('tid');
  });

  it('clicking closed terminal instance calls onReopenTerminal with uuid', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setTerminalItems([{ uuid: 'tid', title: 'Terminal 1', isOpen: false }]);
    const inst = document.querySelector('.term-instance') as HTMLElement;
    inst.click();
    expect(callbacks.onReopenTerminal).toHaveBeenCalledWith('tid');
  });

  it('clicking open explorer instance calls onFocusExplorer with uuid', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setExplorerItems([{ uuid: 'eid', title: 'Explorer 1', isOpen: true }]);
    const inst = document.querySelector('.explorer-instance') as HTMLElement;
    inst.click();
    expect(callbacks.onFocusExplorer).toHaveBeenCalledWith('eid');
  });

  it('clicking closed explorer instance calls onReopenExplorer with uuid', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setExplorerItems([{ uuid: 'eid', title: 'Explorer 1', isOpen: false }]);
    const inst = document.querySelector('.explorer-instance') as HTMLElement;
    inst.click();
    expect(callbacks.onReopenExplorer).toHaveBeenCalledWith('eid');
  });
});
