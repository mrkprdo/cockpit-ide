export type GridStyle = 'none' | 'dots' | 'grid';

function resolveCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function generateGridPattern(style: GridStyle, patternSize: number): string {
  if (style === 'none') return '';
  const s = patternSize;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d')!;
  const color = resolveCSSVar('--tertiary');

  if (style === 'dots') {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s, 0); ctx.lineTo(s, s);
    ctx.moveTo(0, s); ctx.lineTo(s, s);
    ctx.stroke();
  }
  return c.toDataURL();
}

/** Paint a fixed-size tile pattern (zoom/pan applied via applyViewTransform on a parent/world layer).
 *  The phase is derived from the element's left/top so tile corners always land on world-grid
 *  multiples of patternSize, regardless of where the layer is placed. */
export function applyGridPattern(el: HTMLElement, style: GridStyle, dataURL: string, patternSize: number): void {
  if (style === 'none' || !dataURL) {
    el.style.backgroundImage = 'none';
    return;
  }
  const left = parseFloat(el.style.left) || 0;
  const top = parseFloat(el.style.top) || 0;
  const phase = (v: number) => ((-v % patternSize) + patternSize) % patternSize;
  el.style.backgroundImage = `url(${dataURL})`;
  el.style.backgroundRepeat = 'repeat';
  el.style.backgroundSize = `${patternSize}px ${patternSize}px`;
  el.style.backgroundPosition = `${phase(left)}px ${phase(top)}px`;
}

/** Compositor-friendly pan/zoom transform (origin top-left). */
export function applyViewTransform(el: HTMLElement, scale: number, panX: number, panY: number): void {
  el.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
  el.style.transformOrigin = '0 0';
}

/** @deprecated Prefer applyGridPattern + applyViewTransform on a world layer. */
export function applyGridToElement(el: HTMLElement, style: GridStyle, dataURL: string, patternSize: number, scale: number, panX: number, panY: number): void {
  if (style === 'none' || !dataURL) {
    el.style.backgroundImage = 'none';
    return;
  }
  el.style.backgroundImage = `url(${dataURL})`;
  el.style.backgroundRepeat = 'repeat';
  el.style.backgroundSize = `${patternSize * scale}px ${patternSize * scale}px`;
  el.style.backgroundPosition = `${panX}px ${panY}px`;
}
