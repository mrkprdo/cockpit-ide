import { describe, it, expect } from 'vitest';
import { scrollToBottomIfNearBottom } from './render';

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
