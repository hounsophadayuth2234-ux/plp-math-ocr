import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const chunk = Buffer.alloc(8 + data.length + 4);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + data.length));
  chunk.writeUInt32BE(crc, 8 + data.length);
  return chunk;
}

export function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = makeChunk("IHDR", ihdr);

  const raw = Buffer.alloc(height * (1 + width * 4));
  let pos = 0;
  for (let y = 0; y < height; y++) {
    raw[pos++] = 0;
    for (let x = 0; x < width * 4; x++) {
      raw[pos++] = rgba[y * width * 4 + x];
    }
  }

  const idatChunk = makeChunk("IDAT", zlib.deflateSync(raw));
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// Draw stroke helper
function drawRect(rgba, width, height, x0, y0, w, h, r, g, b, a = 255) {
  for (let y = y0; y < Math.min(height, y0 + h); y++) {
    for (let x = x0; x < Math.min(width, x0 + w); x++) {
      const idx = (y * width + x) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }
}

// Draw character glyph matrix (5x7)
function drawGlyph(rgba, width, height, startX, startY, grid, scale = 2, r = 20, g = 20, b = 20) {
  for (let gy = 0; gy < grid.length; gy++) {
    for (let gx = 0; gx < grid[gy].length; gx++) {
      if (grid[gy][gx]) {
        drawRect(rgba, width, height, startX + gx * scale, startY + gy * scale, scale, scale, r, g, b);
      }
    }
  }
}

// Glyph definitions for simple letters
const GLYPH_E = [
  [1, 1, 1, 1],
  [1, 0, 0, 0],
  [1, 1, 1, 0],
  [1, 0, 0, 0],
  [1, 1, 1, 1],
];

const GLYPH_T = [
  [1, 1, 1, 1, 1],
  [0, 0, 1, 0, 0],
  [0, 0, 1, 0, 0],
  [0, 0, 1, 0, 0],
  [0, 0, 1, 0, 0],
];

const GLYPH_X = [
  [1, 0, 0, 0, 1],
  [0, 1, 0, 1, 0],
  [0, 0, 1, 0, 0],
  [0, 1, 0, 1, 0],
  [1, 0, 0, 0, 1],
];

// Khmer 'Ka' consonant approximate glyph
const GLYPH_KA = [
  [0, 1, 1, 1, 0],
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1],
  [1, 0, 1, 0, 1],
  [1, 0, 1, 0, 1],
];

// Upper vowel diacritic dot/arc
const GLYPH_DIACRITIC = [
  [0, 1, 1, 0],
  [1, 0, 0, 1],
];

// Lower subscript glyph
const GLYPH_SUBSCRIPT = [
  [1, 0, 1],
  [0, 1, 0],
  [1, 1, 1],
];

const fixturesDir = path.resolve(process.cwd(), "tests/fixtures");
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

// 1. English text on plain backgrounds
{
  const w = 400, h = 200;
  const rgba = Buffer.alloc(w * h * 4, 255); // White background
  // Draw "TEXT" letters
  drawGlyph(rgba, w, h, 40, 70, GLYPH_T, 4, 25, 25, 25);
  drawGlyph(rgba, w, h, 80, 70, GLYPH_E, 4, 25, 25, 25);
  drawGlyph(rgba, w, h, 120, 70, GLYPH_X, 4, 25, 25, 25);
  drawGlyph(rgba, w, h, 160, 70, GLYPH_T, 4, 25, 25, 25);
  fs.writeFileSync(path.join(fixturesDir, "english-text-plain-bg.png"), encodePng(w, h, rgba));
}

// 2. 12–18px Khmer text
{
  const w = 350, h = 200;
  const rgba = Buffer.alloc(w * h * 4, 250); // Light off-white paper
  // Draw 12px, 14px, 16px, 18px glyphs
  drawGlyph(rgba, w, h, 30, 40, GLYPH_KA, 2, 20, 20, 20); // 12-14px
  drawGlyph(rgba, w, h, 60, 40, GLYPH_KA, 2, 20, 20, 20);
  drawGlyph(rgba, w, h, 30, 90, GLYPH_KA, 3, 20, 20, 20); // 16-18px
  drawGlyph(rgba, w, h, 70, 90, GLYPH_KA, 3, 20, 20, 20);
  fs.writeFileSync(path.join(fixturesDir, "khmer-12-18px-text.png"), encodePng(w, h, rgba));
}

// 3. Khmer with diacritics and subscripts
{
  const w = 350, h = 200;
  const rgba = Buffer.alloc(w * h * 4, 255);
  // Main consonant
  drawGlyph(rgba, w, h, 60, 80, GLYPH_KA, 3, 20, 20, 20);
  // Upper vowel diacritic
  drawGlyph(rgba, w, h, 62, 65, GLYPH_DIACRITIC, 2, 20, 20, 20);
  // Lower subscript consonant
  drawGlyph(rgba, w, h, 64, 105, GLYPH_SUBSCRIPT, 2, 20, 20, 20);

  // Second character with diacritic
  drawGlyph(rgba, w, h, 140, 80, GLYPH_KA, 3, 20, 20, 20);
  drawGlyph(rgba, w, h, 142, 65, GLYPH_DIACRITIC, 2, 20, 20, 20);
  drawGlyph(rgba, w, h, 144, 105, GLYPH_SUBSCRIPT, 2, 20, 20, 20);
  fs.writeFileSync(path.join(fixturesDir, "khmer-diacritics-subscripts.png"), encodePng(w, h, rgba));
}

// 4. Person with text outside body
{
  const w = 400, h = 400;
  const rgba = Buffer.alloc(w * h * 4, 240); // Studio backdrop
  // Draw person in center: head, body, arms
  // Head (skin tone)
  drawRect(rgba, w, h, 160, 90, 80, 80, 215, 155, 120);
  // Hair (dark)
  drawRect(rgba, w, h, 155, 75, 90, 30, 25, 20, 20);
  // Shirt/Uniform (blue)
  drawRect(rgba, w, h, 120, 170, 160, 150, 35, 65, 175);

  // Text outside body: top header
  drawGlyph(rgba, w, h, 50, 30, GLYPH_T, 3, 20, 20, 20);
  drawGlyph(rgba, w, h, 80, 30, GLYPH_E, 3, 20, 20, 20);
  drawGlyph(rgba, w, h, 110, 30, GLYPH_X, 3, 20, 20, 20);
  drawGlyph(rgba, w, h, 140, 30, GLYPH_T, 3, 20, 20, 20);

  // Text outside body: bottom caption
  drawGlyph(rgba, w, h, 50, 350, GLYPH_KA, 3, 20, 20, 20);
  drawGlyph(rgba, w, h, 90, 350, GLYPH_KA, 3, 20, 20, 20);
  fs.writeFileSync(path.join(fixturesDir, "person-with-text-outside-body.png"), encodePng(w, h, rgba));
}

// 5. Hair overlapping text
{
  const w = 350, h = 300;
  const rgba = Buffer.alloc(w * h * 4, 245);
  // Text line
  drawGlyph(rgba, w, h, 40, 120, GLYPH_T, 4, 20, 20, 20);
  drawGlyph(rgba, w, h, 80, 120, GLYPH_E, 4, 20, 20, 20);
  drawGlyph(rgba, w, h, 120, 120, GLYPH_X, 4, 20, 20, 20);
  // Hair strands crossing over
  for (let y = 50; y < 220; y++) {
    const x = Math.round(100 + Math.sin(y * 0.05) * 20);
    drawRect(rgba, w, h, x, y, 4, 1, 30, 20, 20);
    drawRect(rgba, w, h, x + 8, y, 3, 1, 35, 25, 22);
  }
  fs.writeFileSync(path.join(fixturesDir, "hair-overlapping-text.png"), encodePng(w, h, rgba));
}

// 6. Dark text on white background
{
  const w = 300, h = 150;
  const rgba = Buffer.alloc(w * h * 4, 255);
  drawGlyph(rgba, w, h, 30, 50, GLYPH_KA, 3, 15, 15, 15);
  drawGlyph(rgba, w, h, 70, 50, GLYPH_T, 3, 15, 15, 15);
  drawGlyph(rgba, w, h, 100, 50, GLYPH_E, 3, 15, 15, 15);
  fs.writeFileSync(path.join(fixturesDir, "dark-on-white-text.png"), encodePng(w, h, rgba));
}

// 7. White text on dark background
{
  const w = 300, h = 150;
  const rgba = Buffer.alloc(w * h * 4, 255);
  // Dark header block
  drawRect(rgba, w, h, 10, 10, 280, 130, 30, 41, 59);
  // Crisp white text strokes
  drawGlyph(rgba, w, h, 40, 50, GLYPH_KA, 3, 255, 255, 255);
  drawGlyph(rgba, w, h, 80, 50, GLYPH_T, 3, 255, 255, 255);
  drawGlyph(rgba, w, h, 110, 50, GLYPH_E, 3, 255, 255, 255);
  fs.writeFileSync(path.join(fixturesDir, "white-on-dark-text.png"), encodePng(w, h, rgba));
}

// 8. Text close to body boundary (3px gap)
{
  const w = 350, h = 300;
  const rgba = Buffer.alloc(w * h * 4, 250);
  // Person torso/shoulder
  drawRect(rgba, w, h, 20, 50, 120, 200, 200, 140, 105);
  // Text 3px away from right edge of shoulder (x = 143)
  drawGlyph(rgba, w, h, 145, 100, GLYPH_KA, 3, 20, 20, 20);
  drawGlyph(rgba, w, h, 180, 100, GLYPH_T, 3, 20, 20, 20);
  fs.writeFileSync(path.join(fixturesDir, "text-close-to-body-boundary.png"), encodePng(w, h, rgba));
}

console.log("Successfully generated all 8 text regression fixtures in tests/fixtures/");
