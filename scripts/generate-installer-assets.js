const fs = require('fs');
const path = require('path');

const BG = hexToRgb('#161C24');
const DOT = hexToRgb('#243248');

function hexToRgb(h) {
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}

function createBMP(w, h, pixel) {
  const rowBytes = Math.ceil((w * 3) / 4) * 4;
  const pxSize = rowBytes * h;
  const buf = Buffer.alloc(54 + pxSize);

  let off = 0;
  const w32 = (n, b) => { buf.writeUInt32LE(n, off); off += b; };
  const w16 = (n, b) => { buf.writeUInt16LE(n, off); off += b; };

  // BITMAPFILEHEADER
  buf.write('BM', 0, 2); off = 2;
  w32(54 + pxSize, 4);
  w16(0, 2); w16(0, 2);
  w32(54, 4);

  // BITMAPINFOHEADER
  w32(40, 4);
  w32(w, 4); w32(h, 4);
  w16(1, 2); w16(24, 2);
  w32(0, 4); w32(pxSize, 4);
  w32(2835, 4); w32(2835, 4);
  w32(0, 4); w32(0, 4);

  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      const c = pixel(x, y);
      buf.writeUInt8(c.b, off++);
      buf.writeUInt8(c.g, off++);
      buf.writeUInt8(c.r, off++);
    }
    off += rowBytes - w * 3;
  }
  return buf;
}

// Dot grid pattern
function dotGrid(spacing, dotR) {
  return (x, y) => {
    const gx = Math.round(x / spacing) * spacing;
    const gy = Math.round(y / spacing) * spacing;
    const d = Math.hypot(x - gx, y - gy);
    return d <= dotR ? DOT : BG;
  };
}

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

// Header: 150x57
fs.writeFileSync(
  path.join(outDir, 'installerHeader.bmp'),
  createBMP(150, 57, dotGrid(10, 1.5))
);
console.log('Created build/installerHeader.bmp (150x57)');

// Sidebar: 164x314
fs.writeFileSync(
  path.join(outDir, 'installerSidebar.bmp'),
  createBMP(164, 314, dotGrid(10, 1.5))
);
console.log('Created build/installerSidebar.bmp (164x314)');
