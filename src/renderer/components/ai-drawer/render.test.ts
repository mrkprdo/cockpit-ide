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
import { mockElectronAPI } from '../../../test/setup';

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

describe('RenderController — conversation copy affordances', () => {
  function makeController(): RenderController {
    return new RenderController({} as any, { getSettings: () => ({} as any) } as any);
  }
  const render = (ctrl: RenderController, m: any) => (ctrl as any).renderMessage(m, 0);

  it('gives every conversation card a copy button', () => {
    const ctrl = makeController();
    expect(render(ctrl, { role: 'user', content: 'mine', timestamp: 1 })).toContain('ai-chat-copy-btn');
    expect(render(ctrl, { role: 'assistant', content: 'reply', timestamp: 1 })).toContain('ai-chat-copy-btn');
    expect(render(ctrl, { role: 'system', content: 'notice', timestamp: 1 })).toContain('ai-chat-copy-btn');
    expect(render(ctrl, {
      role: 'assistant', content: 'agent says', timestamp: 1,
      speaker: { id: 'agent:test', name: 'Tester', icon: 'TE', color: '#4B9EB5' },
    })).toContain('ai-chat-copy-btn');
  });

  it('adds dedicated copy controls to tool results and reasoning, not pending tools', () => {
    const ctrl = makeController();
    const done = render(ctrl, { role: 'tool', content: 'path=x', toolName: 'read', toolResult: 'ok', timestamp: 1 });
    expect(done).toContain('ai-tool-copy');
    const pending = render(ctrl, { role: 'tool', content: 'path=x', toolName: 'read', timestamp: 1 });
    expect(pending).not.toContain('ai-tool-copy');
    expect(render(ctrl, { role: 'thinking', content: 'reasoning', timestamp: 1 })).toContain('ai-thinking-copy');
  });

  it('does not add a copy button to a join marker', () => {
    const ctrl = makeController();
    const join = render(ctrl, {
      role: 'system', content: 'Tester joined', timestamp: 1,
      speaker: { id: 'agent:test', name: 'Tester', icon: 'TE', color: '#4B9EB5' },
    });
    expect(join).toContain('ai-room-join');
    expect(join).not.toContain('ai-chat-copy-btn');
  });

  it('copies from the visible PoV transcript, not the hidden chat list', () => {
    const messagesEl = document.createElement('div');
    const feed = {
      transcripts: new Map([['agent:test', { steps: [{ role: 'assistant', content: 'pov text', timestamp: 2 }] }]]),
    };
    const ctrl = new RenderController({ messagesEl } as any, { getFeed: () => feed } as any);
    ctrl.messages = [{ role: 'assistant', content: 'chat text', timestamp: 1 }];
    (ctrl as any).activeView = 'agent:test';
    ctrl.bindMessageActions();

    messagesEl.innerHTML = '<button class="ai-chat-copy-btn" data-msg-index="0" title="Copy text"></button>';
    const btn = messagesEl.querySelector<HTMLButtonElement>('.ai-chat-copy-btn')!;
    (mockElectronAPI.clipboard.writeText as any).mockClear();
    btn.click();

    expect(mockElectronAPI.clipboard.writeText).toHaveBeenLastCalledWith('pov text');
    expect(btn.classList.contains('is-copied')).toBe(true);
  });

  it('copies a tool result rather than its chip args', () => {
    const messagesEl = document.createElement('div');
    const ctrl = new RenderController({ messagesEl } as any, { getFeed: () => ({ transcripts: new Map() }) } as any);
    ctrl.messages = [{ role: 'tool', content: 'path=x', toolName: 'read', toolResult: 'file body', timestamp: 1 }];
    ctrl.bindMessageActions();

    messagesEl.innerHTML = '<button class="ai-chat-copy-btn ai-tool-copy" data-msg-index="0" title="Copy result"></button>';
    (mockElectronAPI.clipboard.writeText as any).mockClear();
    messagesEl.querySelector('button')!.click();

    expect(mockElectronAPI.clipboard.writeText).toHaveBeenLastCalledWith('file body');
  });
});
