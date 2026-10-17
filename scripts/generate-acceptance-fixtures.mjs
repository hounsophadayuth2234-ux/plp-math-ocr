import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Minimal PNG encoder in pure Node without native dependencies
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
    }
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const checksum = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(checksum, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export function encodeRgbaToPng(rgba, width, height) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const rawData = Buffer.alloc(height * (stride + 1));
  let srcOffset = 0;
  let dstOffset = 0;

  for (let y = 0; y < height; y++) {
    rawData[dstOffset++] = 0; // None filter
    for (let x = 0; x < stride; x++) {
      rawData[dstOffset++] = rgba[srcOffset++];
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));
  const ihdrChunk = makeChunk('IHDR', ihdr);

  return Buffer.concat([sig, ihdrChunk, idat, iend]);
}

const fixturesDir = path.resolve('tests/fixtures');
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

// 1. khmer-small-text.png (400x300, white background, 12-18px Khmer glyphs, diacritics, subscripts)
{
  const w = 400;
  const h = 300;
  const rgba = new Uint8ClampedArray(w * h * 4);
  rgba.fill(255);

  // Line 1: 18px text (y: 40-58)
  // Line 2: 14px text with diacritics (y: 80-94)
  // Line 3: 12px text with subscripts & punctuation (y: 120-132)
  for (let x = 40; x < 360; x++) {
    for (let y = 40; y < 58; y++) {
      if (x % 16 < 12 && y % 4 < 2) {
        const idx = (y * w + x) * 4;
        rgba[idx] = 20; rgba[idx + 1] = 25; rgba[idx + 2] = 30; rgba[idx + 3] = 255;
      }
    }
    for (let y = 80; y < 94; y++) {
      if (x % 14 < 10 && y % 3 < 2) {
        const idx = (y * w + x) * 4;
        rgba[idx] = 20; rgba[idx + 1] = 25; rgba[idx + 2] = 30; rgba[idx + 3] = 255;
      }
    }
  }
  // Diacritics
  for (const pt of [{ x: 60, y: 74 }, { x: 120, y: 74 }, { x: 200, y: 74 }]) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const idx = ((pt.y + dy) * w + (pt.x + dx)) * 4;
        rgba[idx] = 20; rgba[idx + 1] = 25; rgba[idx + 2] = 30; rgba[idx + 3] = 255;
      }
    }
  }
  // Subscripts
  for (const pt of [{ x: 80, y: 100 }, { x: 150, y: 100 }, { x: 240, y: 100 }]) {
    for (let dy = -2; dy <= 3; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const idx = ((pt.y + dy) * w + (pt.x + dx)) * 4;
        rgba[idx] = 20; rgba[idx + 1] = 25; rgba[idx + 2] = 30; rgba[idx + 3] = 255;
      }
    }
  }

  const png = encodeRgbaToPng(rgba, w, h);
  fs.writeFileSync(path.join(fixturesDir, 'khmer-small-text.png'), png);
  console.log('Created tests/fixtures/khmer-small-text.png');
}

// 2. long-dark-hair.png (400x400, person with long dark hair and flyaways)
{
  const w = 400;
  const h = 400;
  const rgba = new Uint8ClampedArray(w * h * 4);
  rgba.fill(240); // Light warm background

  const cx = 200;
  const cy = 180;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);

      // Body / clothing
      if (y > 240 && Math.abs(dx) < 110) {
        rgba[idx] = 40; rgba[idx + 1] = 50; rgba[idx + 2] = 70; rgba[idx + 3] = 255;
      }
      // Head / Face skin
      else if (r < 65 && y > 140) {
        rgba[idx] = 230; rgba[idx + 1] = 190; rgba[idx + 2] = 160; rgba[idx + 3] = 255;
      }
      // Long hair
      else if (r < 95 && (y < 160 || Math.abs(dx) > 40 && y < 320)) {
        rgba[idx] = 25; rgba[idx + 1] = 20; rgba[idx + 2] = 20; rgba[idx + 3] = 255;
      }
    }
  }
  // Flyaway strands
  for (let i = 0; i < 15; i++) {
    const startX = 110 - i * 4;
    const startY = 100 + i * 14;
    for (let s = 0; s < 45; s++) {
      const px = Math.round(startX - s * 0.8);
      const py = Math.round(startY + s * 1.2);
      if (px >= 0 && px < w && py >= 0 && py < h) {
        const idx = (py * w + px) * 4;
        rgba[idx] = 25; rgba[idx + 1] = 20; rgba[idx + 2] = 20; rgba[idx + 3] = 255;
      }
    }
  }

  const png = encodeRgbaToPng(rgba, w, h);
  fs.writeFileSync(path.join(fixturesDir, 'long-dark-hair.png'), png);
  console.log('Created tests/fixtures/long-dark-hair.png');
}

// 3. white-clothing.png (400x400, person in white clothing on light background)
{
  const w = 400;
  const h = 400;
  const rgba = new Uint8ClampedArray(w * h * 4);
  rgba.fill(235); // Light warm studio wall

  const cx = 200;
  const cy = 180;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);

      // White shirt (250, 252, 255) vs light background (235, 235, 235)
      if (y > 230 && Math.abs(dx) < 115) {
        rgba[idx] = 250; rgba[idx + 1] = 252; rgba[idx + 2] = 255; rgba[idx + 3] = 255;
      }
      // Face
      else if (r < 60) {
        rgba[idx] = 225; rgba[idx + 1] = 185; rgba[idx + 2] = 150; rgba[idx + 3] = 255;
      }
      // Hair
      else if (r < 75 && y < 160) {
        rgba[idx] = 45; rgba[idx + 1] = 35; rgba[idx + 2] = 30; rgba[idx + 3] = 255;
      }
    }
  }

  const png = encodeRgbaToPng(rgba, w, h);
  fs.writeFileSync(path.join(fixturesDir, 'white-clothing.png'), png);
  console.log('Created tests/fixtures/white-clothing.png');
}

// 4. hair-over-khmer-text.png (450x400, hair strands overlapping printed Khmer text)
{
  const w = 450;
  const h = 400;
  const rgba = new Uint8ClampedArray(w * h * 4);
  rgba.fill(255); // White poster paper

  // Khmer printed text underneath
  for (let x = 30; x < 420; x++) {
    for (let y = 140; y < 156; y++) {
      if (x % 14 < 10 && y % 3 < 2) {
        const idx = (y * w + x) * 4;
        rgba[idx] = 20; rgba[idx + 1] = 25; rgba[idx + 2] = 30; rgba[idx + 3] = 255;
      }
    }
    for (let y = 200; y < 216; y++) {
      if (x % 14 < 10 && y % 3 < 2) {
        const idx = (y * w + x) * 4;
        rgba[idx] = 20; rgba[idx + 1] = 25; rgba[idx + 2] = 30; rgba[idx + 3] = 255;
      }
    }
  }

  // Person with long hair on the right side overlapping text
  const cx = 350;
  const cy = 180;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);

      if (r < 55 && y > 130) {
        rgba[idx] = 225; rgba[idx + 1] = 185; rgba[idx + 2] = 150; rgba[idx + 3] = 255;
      } else if (r < 85 && (y < 150 || dx < -20 && y < 280)) {
        rgba[idx] = 25; rgba[idx + 1] = 20; rgba[idx + 2] = 20; rgba[idx + 3] = 255;
      }
    }
  }

  // Hair strands crossing over into the text area
  for (let s = 0; s < 60; s++) {
    const px = Math.round(270 - s * 1.5);
    const py = Math.round(135 + s * 1.1);
    if (px >= 0 && px < w && py >= 0 && py < h) {
      const idx = (py * w + px) * 4;
      rgba[idx] = 25; rgba[idx + 1] = 20; rgba[idx + 2] = 20; rgba[idx + 3] = 255;
    }
  }

  const png = encodeRgbaToPng(rgba, w, h);
  fs.writeFileSync(path.join(fixturesDir, 'hair-over-khmer-text.png'), png);
  console.log('Created tests/fixtures/hair-over-khmer-text.png');
}
