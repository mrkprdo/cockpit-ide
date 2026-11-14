import { describe, it, expect } from 'vitest';
import {
  scrollToBottomIfNearBottom,
  escapeAttr,
  escapeHtml,
  safeAgentId,
  safeAgentState,
  clampPersonaText,
  RenderController,
  formatBody,
} from './render';

/** A container whose scroll geometry can be pinned (jsdom reports 0s). */
function makeScroller(scrollHeight: number, clientHeight: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollTop', { value: 0, writable: true, configurable: true });
  return el;
}

describe('scrollToBottomIfNearBottom', () => {
  it('follows new content while the reader is already at the bottom', () => {
    const el = makeScroller(1000, 100);
    el.scrollTop = 940; // 1000 - 940 - 100 = -40 < 80 → near bottom
    scrollToBottomIfNearBottom(el);
    expect(el.scrollTop).toBe(1000);
  });

  it('does NOT yank a reader who scrolled up to earlier content', () => {
    const el = makeScroller(1000, 100);
    el.scrollTop = 500; // 1000 - 500 - 100 = 400 ≥ 80 → reading history
    scrollToBottomIfNearBottom(el);
    expect(el.scrollTop).toBe(500); // untouched
  });

  it('a mid-range scroll stays put too (just inside the history zone)', () => {
    const el = makeScroller(1000, 100);
    el.scrollTop = 830; // 1000 - 830 - 100 = 70 < 80 → still follows
    scrollToBottomIfNearBottom(el);
    expect(el.scrollTop).toBe(1000);
  });
});

describe('escapeAttr — attribute-position escaping', () => {
  it('escapes the quote that escapeHtml leaves alone', () => {
    // textContent → innerHTML escapes <, > and & but NOT `"`.
    expect(escapeHtml('a" onfocus="x')).toBe('a" onfocus="x');
    expect(escapeAttr('a" onfocus="x')).toBe('a&quot; onfocus=&quot;x');
  });

  it('escapes single quotes too (single-quoted attribute values)', () => {
    expect(escapeAttr("it's")).toBe('it&#39;s');
  });

  it('still escapes markup characters', () => {
    expect(escapeAttr('<img src=x onerror=1>')).toBe('&lt;img src=x onerror=1&gt;');
    expect(escapeAttr('a & b')).toBe('a &amp; b');
  });

  it('cannot break out of a value="…" attribute', () => {
    const host = document.createElement('div');
    host.innerHTML = `<input value="${escapeAttr('" onfocus="alert(1)')}">`;
    const input = host.querySelector('input')!;
    expect(input.getAttribute('onfocus')).toBeNull();
    expect(input.value).toBe('" onfocus="alert(1)');
  });
});

describe('persona sanitisers', () => {
  it('safeAgentId accepts well-formed ids', () => {
    expect(safeAgentId('agent:reviewer')).toBe('agent:reviewer');
    expect(safeAgentId('agent:debug-2')).toBe('agent:debug-2');
  });

  it('safeAgentId replaces anything unvalidated', () => {
    expect(safeAgentId('agent:x" onclick="alert(1)')).toBe('agent:unknown');
    expect(safeAgentId('../../etc/passwd')).toBe('agent:unknown');
    expect(safeAgentId(undefined)).toBe('agent:unknown');
    expect(safeAgentId(42)).toBe('agent:unknown');
  });

  it('clampPersonaText bounds hydrated name/icon length', () => {
    expect(clampPersonaText('Reviewer')).toBe('Reviewer');
    expect(clampPersonaText('x'.repeat(500)).length).toBe(48);
    expect(clampPersonaText('🔎', 4)).toBe('🔎');
    expect(clampPersonaText(undefined)).toBe('');
  });

  it('safeAgentState only lets known states reach the is-<state> class', () => {
    expect(safeAgentState('active')).toBe('active');
    expect(safeAgentState('done')).toBe('done');
    expect(safeAgentState('x" onclick="alert(1)')).toBe('error');
    expect(safeAgentState(undefined)).toBe('error');
  });
});

describe('RenderController.formatCached — formatBody memo', () => {
  function makeController(): RenderController {
    return new RenderController({} as any, { getSettings: () => ({}) } as any);
  }

  it('reuses the rendered html while the content is unchanged', () => {
    const ctrl = makeController();
    const m = { role: 'assistant' as const, content: '**bold**', timestamp: 1 };
    const first = ctrl.formatCached(m);
    const second = ctrl.formatCached(m);
    expect(second).toBe(first);            // same string instance → cache hit
    expect(first).toBe(formatBody('**bold**'));
  });

  it('re-renders after the content changes (streaming)', () => {
    const ctrl = makeController();
    const m = { role: 'assistant' as const, content: 'a', timestamp: 1 };
    const first = ctrl.formatCached(m);
    m.content = 'a **b**';
    const second = ctrl.formatCached(m);
    expect(second).not.toBe(first);
    expect(second).toContain('<strong>b</strong>');
  });

  it('still escapes raw model output', () => {
    const ctrl = makeController();
    const m = { role: 'assistant' as const, content: '<script>alert(1)</script>', timestamp: 1 };
    const html = ctrl.formatCached(m);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
