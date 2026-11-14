import { describe, it, expect, beforeEach } from 'vitest';
import { MessageList, RENDER_WINDOW } from './message-list';
import type { ChatMessage } from './types';

function msg(content: string): ChatMessage {
  return { role: 'assistant', content, timestamp: 1 };
}

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

interface Harness {
  list: MessageList;
  container: HTMLElement;
  source: ChatMessage[];
  header: { html: string };
  renders: number;
}

function makeHarness(source: ChatMessage[], initialHeader = ''): Harness {
  const container = makeContainer();
  const header = { html: initialHeader };
  const harness: Harness = { list: null as any, container, source, header, renders: 0 };
  harness.list = new MessageList({
    getContainer: () => container,
    getSource: () => harness.source,
    renderMessage: (m, i) => {
      harness.renders++;
      return `<div class="m" data-msg-index="${i}"><span class="body">${m.content}</span></div>`;
    },
    paintBody: (el, m) => {
      const body = el.querySelector('.body') as HTMLElement | null;
      if (!body) return false;
      body.textContent = m.content;
      return true;
    },
    headerHtml: () => header.html,
    emptyHtml: () => '<div class="empty">nothing yet</div>',
    isExpanded: () => false,
  });
  return harness;
}

describe('MessageList — incremental reconciliation', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders every message on the first pass', () => {
    const h = makeHarness([msg('a'), msg('b')]);
    h.list.render();
    expect(h.container.querySelectorAll('.m')).toHaveLength(2);
  });

  it('keeps unchanged nodes when a message is appended', () => {
    const h = makeHarness([msg('a'), msg('b')]);
    h.list.render();
    const first = h.container.querySelectorAll('.m')[0];

    h.source.push(msg('c'));
    h.list.render();

    expect(h.container.querySelectorAll('.m')).toHaveLength(3);
    expect(h.container.querySelectorAll('.m')[0]).toBe(first); // same DOM node
  });

  it('repaints only the changed last message in place', () => {
    const h = makeHarness([msg('a'), msg('streaming')]);
    h.list.render();
    const nodes = h.container.querySelectorAll('.m');
    const firstNode = nodes[0];
    const lastNode = nodes[1];

    h.source[1].content = 'streaming done';
    h.list.render();

    const after = h.container.querySelectorAll('.m');
    expect(after[0]).toBe(firstNode);
    // Same node, body mutated — no teardown of the whole list.
    expect(after[1]).toBe(lastNode);
    expect(after[1].textContent).toBe('streaming done');
  });

  it('rebuilds a node whose non-text fields changed', () => {
    const h = makeHarness([msg('a')]);
    h.list.render();
    const before = h.container.querySelectorAll('.m')[0];

    h.source[0] = { ...h.source[0], intent: 'verdict' };
    h.list.render();

    expect(h.container.querySelectorAll('.m')[0]).not.toBe(before);
    expect(h.container.querySelectorAll('.m')).toHaveLength(1);
  });

  it('removes nodes for messages that no longer exist', () => {
    const h = makeHarness([msg('a'), msg('b'), msg('c')]);
    h.list.render();
    h.source.splice(2, 1);
    h.list.render();
    expect(h.container.querySelectorAll('.m')).toHaveLength(2);
  });

  it('wipes the DOM when the source array is swapped (session switch)', () => {
    const h = makeHarness([msg('a'), msg('b')]);
    h.list.render();
    const oldNode = h.container.querySelectorAll('.m')[0];

    h.source = [msg('x')];
    h.list.render();

    expect(h.container.querySelectorAll('.m')).toHaveLength(1);
    expect(h.container.querySelectorAll('.m')[0]).not.toBe(oldNode);
  });

  it('builds markup for ONE message when a tool round appends one', () => {
    // The old renderer rebuilt all N messages (innerHTML = map(...)) on each of
    // the 2+ renderMessages() calls per tool call.
    const h = makeHarness(Array.from({ length: 149 }, (_, i) => msg(`m${i}`)));
    h.list.render();
    const firstPass = h.renders;
    expect(firstPass).toBe(149);

    h.source.push(msg('tool chip'));   // chip pushed
    h.list.render();
    h.source[h.source.length - 1].content = 'chip';  // result attached
    h.list.render();

    expect(h.renders - firstPass).toBe(1);
  });
});

describe('MessageList — windowing', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  function many(n: number): ChatMessage[] {
    return Array.from({ length: n }, (_, i) => msg(`m${i}`));
  }

  it(`mounts only the newest ${RENDER_WINDOW} messages`, () => {
    const h = makeHarness(many(RENDER_WINDOW + 10));
    h.list.render();
    expect(h.container.querySelectorAll('.m')).toHaveLength(RENDER_WINDOW);
    expect(h.list.hiddenCount()).toBe(10);
    expect(h.container.querySelector('.ai-msg-earlier')?.textContent).toContain('Show 10 earlier');
  });

  it('keeps the mounted window bounded while messages keep arriving', () => {
    const h = makeHarness(many(RENDER_WINDOW));
    h.list.render();
    for (let i = 0; i < 25; i++) {
      h.source.push(msg(`late${i}`));
      h.list.render();
    }
    expect(h.container.querySelectorAll('.m')).toHaveLength(RENDER_WINDOW);
    expect(h.list.hiddenCount()).toBe(25);
  });

  it('showEarlier() mounts the whole transcript and drops the control', () => {
    const h = makeHarness(many(RENDER_WINDOW + 10));
    h.list.render();
    h.list.showEarlier();
    expect(h.container.querySelectorAll('.m')).toHaveLength(RENDER_WINDOW + 10);
    expect(h.container.querySelector('.ai-msg-earlier')).toBeNull();
  });
});

describe('MessageList — header + empty state', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders the empty state, then replaces it with messages', () => {
    const h = makeHarness([]);
    h.list.render();
    expect(h.container.querySelector('.empty')).toBeTruthy();

    h.source.push(msg('hello'));
    h.list.render();
    expect(h.container.querySelector('.empty')).toBeNull();
    expect(h.container.querySelectorAll('.m')).toHaveLength(1);
  });

  it('keeps exactly one header element across renders', () => {
    const h = makeHarness([msg('a')], '<div class="hdr">run</div>');
    h.list.render();
    h.list.render();
    expect(h.container.querySelectorAll('.hdr')).toHaveLength(1);

    h.header.html = '<div class="hdr">done</div>';
    h.list.render();
    expect(h.container.querySelectorAll('.hdr')).toHaveLength(1);
    expect(h.container.textContent).toContain('done');
  });

  it('places the header above the messages and the earlier control above it', () => {
    const h = makeHarness(
      Array.from({ length: RENDER_WINDOW + 1 }, (_, i) => msg(`m${i}`)),
      '<div class="hdr">run</div>',
    );
    h.list.render();
    const kids = Array.from(h.container.children).map(el => el.className);
    expect(kids[0]).toBe('ai-msg-earlier');
    expect(kids[1]).toBe('hdr');
  });
});
