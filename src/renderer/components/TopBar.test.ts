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
      onOpenPreferences: vi.fn(),
      onThemeToggle: vi.fn(),
      onOpenWorkspace: vi.fn(),
      onNewTerminal: vi.fn(),
      onNewExplorer: vi.fn(),
      onNewEditor: vi.fn(),
      onNewDev: vi.fn(),
      onNewContext: vi.fn(),
      onFocusTerminal: vi.fn(),
      onReopenTerminal: vi.fn(),
      onFocusDev: vi.fn(),
      onReopenDev: vi.fn(),
      onFocusContext: vi.fn(),
      onReopenContext: vi.fn(),
      onAbout: vi.fn(),
      onTutorial: vi.fn(),
      onZoomIn: vi.fn(),
      onZoomOut: vi.fn(),
      onResetView: vi.fn(),
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

  it('clicking "New" under Dev calls onNewDev', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#menu-new-dev') as HTMLElement;
    btn.click();
    expect(callbacks.onNewDev).toHaveBeenCalledOnce();
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

  it('shows dev items in the Dev submenu', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setDevItems([
      { uuid: 'd1', title: 'Dev 1', isOpen: true },
    ]);

    const items = document.querySelectorAll('.dev-instance');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toBe('Dev 1');
  });

  it('shows context items in the Context submenu', () => {
    const bar = new TopBar(makeTopBarEl(), callbacks);
    bar.setContextItems([
      { uuid: 'c1', title: 'Context 1', isOpen: true },
    ]);

    const items = document.querySelectorAll('.ctx-instance');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toBe('Context 1');
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

  it('"New" in Context submenu calls onNewContext', () => {
    new TopBar(makeTopBarEl(), callbacks);
    const btn = document.querySelector('#menu-new-context') as HTMLElement;
    btn.click();
    expect(callbacks.onNewContext).toHaveBeenCalledOnce();
  });
});
