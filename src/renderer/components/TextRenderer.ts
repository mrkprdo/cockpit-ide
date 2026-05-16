import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

export interface TextStyle {
  font: string;
  color: string;
  lineHeight?: number;
}

export class TextRenderer {
  static measure(text: string, font: string, maxWidth: number): number {
    const p = prepareWithSegments(text, font);
    const { height } = layoutWithLines(p, maxWidth, 1);
    return height;
  }

  static draw(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    style: TextStyle,
  ): void {
    const p = prepareWithSegments(text, style.font);
    const lh = style.lineHeight || 18;
    const { lines } = layoutWithLines(p, maxWidth, lh);

    ctx.font = style.font;
    ctx.fillStyle = style.color;
    ctx.textBaseline = 'top';

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i].text, x, y + i * lh);
    }
  }

  static createCanvas(
    text: string,
    width: number,
    height: number,
    style: TextStyle,
  ): HTMLCanvasElement {
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    TextRenderer.draw(ctx, text, 0, 0, width, style);

    return canvas;
  }

  static createCanvas2(
    lines: { text: string; style: TextStyle }[],
    width: number,
    height: number,
  ): HTMLCanvasElement {
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    let y = 0;
    for (const line of lines) {
      const lh = line.style.lineHeight || 18;
      TextRenderer.draw(ctx, line.text, 0, y, width, line.style);
      y += TextRenderer.measure(line.text, line.style.font, width) || lh;
    }
    return canvas;
  }
}
