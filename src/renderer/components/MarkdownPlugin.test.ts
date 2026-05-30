import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarkdownPlugin, MarkdownState } from './MarkdownPlugin';
import { mockElectronAPI } from '../../test/setup';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'width:600px;height:400px';
  document.body.appendChild(el);
  return el;
}

describe('MarkdownPlugin', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('# Hello World\n\nThis is a test.');
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(vi.fn());
  });

  it('creates the preview pane with "No file loaded"', () => {
    new MarkdownPlugin(container);
    expect(container.textContent).toContain('No file loaded');
  });

  it('sets the title property', () => {
    const ctx = new MarkdownPlugin(container);
    ctx.title = 'Markdown 1';
    expect(ctx.title).toBe('Markdown 1');
  });

  it('loadFile adds a tab and renders markdown content', async () => {
    const ctx = new MarkdownPlugin(container);
    await ctx.loadFile('/test/readme.md');

    const text = container.textContent || '';
    expect(text).toContain('readme.md');
    expect(text).toContain('Hello World');
  });

  it('loadFile does not add duplicate tabs', async () => {
    const ctx = new MarkdownPlugin(container);
    await ctx.loadFile('/test/readme.md');
    await ctx.loadFile('/test/readme.md');

    // The plugin tracks tabs internally; verify there's only one
    // We can verify via getState that only one file is open
    const state = ctx.getState();
    expect(state).not.toBeNull();
    expect(state!.openFiles.length).toBe(1);
  });

  it('shows "Empty file" for empty content', async () => {
    (mockElectronAPI.fs.readFile as any).mockResolvedValue('   ');
    const ctx = new MarkdownPlugin(container);
    await ctx.loadFile('/test/empty.md');

    expect(container.textContent).toContain('Empty file');
  });

  it('getState returns null when no tabs are open', () => {
    const ctx = new MarkdownPlugin(container);
    const state = ctx.getState();
    expect(state).toBeNull();
  });

  it('getState returns open files and active file', async () => {
    const ctx = new MarkdownPlugin(container);
    await ctx.loadFile('/test/a.md');
    await ctx.loadFile('/test/b.md');

    const state = ctx.getState();
    expect(state).not.toBeNull();
    expect(state!.openFiles.length).toBe(2);
    expect(state!.activeFile).toBeTruthy();
    expect(state!.scrollTops).toBeDefined();
  });

  it('destroy cleans up file watcher', () => {
    const unsub = vi.fn();
    (mockElectronAPI.fs.onChanged as any).mockReturnValue(unsub);

    const ctx = new MarkdownPlugin(container);
    ctx.destroy();

    expect(unsub).toHaveBeenCalled();
  });

  it('restoreState loads tabs from serialized state', async () => {
    const state: MarkdownState = {
      openFiles: ['/test/x.md', '/test/y.md'],
      activeFile: '/test/x.md',
      scrollTops: { '/test/x.md': 100, '/test/y.md': 50 },
    };

    const ctx = new MarkdownPlugin(container);
    await ctx.restoreState(state);

    const text = container.textContent || '';
    expect(text).toContain('x.md');
    expect(text).toContain('y.md');
  });

  it('restoreState handles null state gracefully', async () => {
    const ctx = new MarkdownPlugin(container);
    await ctx.restoreState(null);
    expect(container.textContent).toContain('No file loaded');
  });

  it('sanitizes XSS in markdown — blocks raw script tags', async () => {
    (mockElectronAPI.fs.readFile as any).mockResolvedValue(
      '# XSS\n\n<script>alert(\'xss\')</script>\n\nNormal text'
    );
    const ctx = new MarkdownPlugin(container);
    await ctx.loadFile('/test/xss.md');

    const html = container.innerHTML || '';
    // Raw HTML is escaped via marked renderer override
    expect(html).not.toContain('<script>');   // no active <script> tag
    expect(html).toContain('&lt;script&gt;'); // HTML-escaped version present
    expect(container.textContent).toContain('XSS');
    expect(container.textContent).toContain('Normal text');
  });

  it('sanitizes XSS in markdown — escapes event handler attributes', async () => {
    (mockElectronAPI.fs.readFile as any).mockResolvedValue(
      '<img src=x onerror=alert(1)>'
    );
    const ctx = new MarkdownPlugin(container);
    await ctx.loadFile('/test/xss2.md');

    const html = container.innerHTML || '';
    expect(html).not.toContain('<img');       // no active <img tag
    expect(html).toContain('&lt;img');        // HTML-escaped version
    expect(container.textContent).toContain('onerror');
    expect(container.textContent).toContain('alert(1)');
  });

  it('sanitizes XSS in markdown — blocks javascript: protocol in links', async () => {
    (mockElectronAPI.fs.readFile as any).mockResolvedValue(
      '[click](javascript:alert(1))'
    );
    const ctx = new MarkdownPlugin(container);
    await ctx.loadFile('/test/xss3.md');

    const html = container.innerHTML || '';
    expect(html).not.toContain('javascript:'); // no javascript: in href
    expect(html).not.toContain('href=');        // no clickable link created
    expect(container.textContent).toContain('click');
  });
});
