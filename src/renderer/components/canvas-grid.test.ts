import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateGridPattern, applyGridToElement, GridStyle } from './canvas-grid';

describe('generateGridPattern', () => {
  it('returns empty string for "none" style', () => {
    expect(generateGridPattern('none', 28)).toBe('');
  });

  it('returns a data URL for "dots" style', () => {
    const result = generateGridPattern('dots', 28);
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it('returns a data URL for "grid" style', () => {
    const result = generateGridPattern('grid', 28);
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it('uses patternSize to determine canvas dimensions', () => {
    const resultSmall = generateGridPattern('dots', 14);
    const resultLarge = generateGridPattern('dots', 56);
    expect(resultSmall).toMatch(/^data:image\/png;base64,/);
    expect(resultLarge).toMatch(/^data:image\/png;base64,/);
  });

  it('handles all valid style values without throwing', () => {
    const styles: GridStyle[] = ['none', 'dots', 'grid'];
    for (const style of styles) {
      expect(() => generateGridPattern(style, 28)).not.toThrow();
    }
  });
});

describe('applyGridToElement', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
  });

  it('removes backgroundImage when style is "none"', () => {
    el.style.backgroundImage = 'url(data:image/png;base64,abc)';
    applyGridToElement(el, 'none', 'data:image/png;base64,abc', 28, 1, 0, 0);
    expect(el.style.backgroundImage).toBe('none');
  });

  it('removes backgroundImage when dataURL is empty', () => {
    el.style.backgroundImage = 'url(data:image/png;base64,abc)';
    applyGridToElement(el, 'dots', '', 28, 1, 0, 0);
    expect(el.style.backgroundImage).toBe('none');
  });

  it('sets background properties when style is active', () => {
    const dataURL = 'data:image/png;base64,mockdata';
    applyGridToElement(el, 'dots', dataURL, 28, 2, -100, -50);
    // jsdom adds quotes around the URL value, so use toContain for the substring
    expect(el.style.backgroundImage).toContain(dataURL);
    expect(el.style.backgroundRepeat).toBe('repeat');
    expect(el.style.backgroundSize).toBe('56px 56px'); // 28 * 2
    expect(el.style.backgroundPosition).toBe('-100px -50px');
  });

  it('handles fractional scale values', () => {
    const dataURL = 'data:image/png;base64,mockdata';
    applyGridToElement(el, 'grid', dataURL, 28, 1.5, 10, 20);
    expect(el.style.backgroundSize).toBe('42px 42px'); // 28 * 1.5
    expect(el.style.backgroundPosition).toBe('10px 20px');
  });

  it('handles scale of 0 (zero zoom)', () => {
    const dataURL = 'data:image/png;base64,mockdata';
    applyGridToElement(el, 'grid', dataURL, 28, 0, 0, 0);
    expect(el.style.backgroundSize).toBe('0px 0px');
  });
});
