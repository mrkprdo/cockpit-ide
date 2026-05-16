'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'installer-assets');
fs.mkdirSync(OUT, { recursive: true });

// Same dot-grid palette as original BMP brand assets
// GIF GCT must be 2^(N+1) entries — 2 colours → N=1 → 4 entries
const BG  = [0x16, 0x1C, 0x24]; // #161C24  background
const DOT = [0x24, 0x32, 0x48]; // #243248  dot
const PALETTE  = [BG, DOT, [0, 0, 0], [0, 0, 0]];
const GCT_FIELD = 1; // 2^(1+1) = 4 entries
const MIN_CODE  = 2; // GIF LZW minimum

// Squirrel shows loadingGif in its install window — use sidebar proportions
const W = 164, H = 314;
const SPACING = 10, DOT_R = 1.5;

function buildPixels() {
  const px = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = Math.round(x / SPACING) * SPACING;
      const gy = Math.round(y / SPACING) * SPACING;
      px[y * W + x] = Math.hypot(x - gx, y - gy) <= DOT_R ? 1 : 0;
    }
  }
  return px;
}

function lzwEncode(indices) {
  const clearCode = 1 << MIN_CODE;
  const eofCode   = clearCode + 1;
  let codeSize = MIN_CODE + 1, nextCode = eofCode + 1;
  const table = new Map();
  const out = [];
  let buf = 0, bufLen = 0;

  const emit = (code) => {
    buf   |= code << bufLen;
    bufLen += codeSize;
    while (bufLen >= 8) { out.push(buf & 0xFF); buf >>>= 8; bufLen -= 8; }
  };
  const reset = () => { table.clear(); codeSize = MIN_CODE + 1; nextCode = eofCode + 1; };

  reset();
  emit(clearCode);

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = `${prefix},${k}`;
    if (table.has(key)) {
      prefix = table.get(key);
    } else {
      emit(prefix);
      if (nextCode <= 4095) {
        table.set(key, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
      } else { emit(clearCode); reset(); }
      prefix = k;
    }
  }
  emit(prefix);
  emit(eofCode);
  if (bufLen > 0) out.push(buf & 0xFF);
  return out;
}

function buildGIF() {
  const w16 = (n) => [n & 0xFF, (n >> 8) & 0xFF];
  const parts = [];

  parts.push([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a

  // Logical Screen Descriptor
  parts.push([
    ...w16(W), ...w16(H),
    0x80 | (7 << 4) | GCT_FIELD,
    0x00, 0x00,
  ]);

  // Global Color Table (4 entries)
  parts.push(PALETTE.flat());

  // Single image
  parts.push([0x2C, ...w16(0), ...w16(0), ...w16(W), ...w16(H), 0x00]);

  const lzw = lzwEncode(buildPixels());
  const img  = [MIN_CODE];
  for (let i = 0; i < lzw.length; i += 255) {
    const chunk = lzw.slice(i, Math.min(i + 255, lzw.length));
    img.push(chunk.length, ...chunk);
  }
  img.push(0x00);
  parts.push(img);

  parts.push([0x3B]); // Trailer
  return Buffer.from(parts.flat());
}

const gif     = buildGIF();
const gifPath = path.join(OUT, 'loading.gif');
fs.writeFileSync(gifPath, gif);
console.log(`Created installer-assets/loading.gif  (${gif.length} bytes, ${W}×${H}, static dot-grid)`);
