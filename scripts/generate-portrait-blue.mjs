import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

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

function encodeRgbaToPng(rgba, width, height) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const rawData = Buffer.alloc(height * (stride + 1));
  let srcOffset = 0;
  let dstOffset = 0;

  for (let y = 0; y < height; y++) {
    rawData[dstOffset++] = 0;
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

const w = 1024;
const h = 1024;
const rgba = new Uint8ClampedArray(w * h * 4);

// Solid Blue background: RGB(28, 90, 220)
for (let i = 0; i < w * h; i++) {
  const idx = i * 4;
  rgba[idx] = 28;
  rgba[idx + 1] = 90;
  rgba[idx + 2] = 220;
  rgba[idx + 3] = 255;
}

// Draw a human portrait silhouette: head, neck, shoulders/suit
const cx = 512;
const headCy = 380;
const headRadiusX = 160;
const headRadiusY = 210;

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const idx = (y * w + x) * 4;

    // Head (skin tone)
    const dx = x - cx;
    const dy = y - headCy;
    const inHead = (dx * dx) / (headRadiusX * headRadiusX) + (dy * dy) / (headRadiusY * headRadiusY) <= 1.0;

    // Neck
    const inNeck = x >= cx - 60 && x <= cx + 60 && y >= headCy + 140 && y <= headCy + 280;

    // Torso / shoulders / suit
    const inSuit = y >= headCy + 250 && (dx * dx) / (380 * 380) + ((y - (headCy + 400)) * (y - (headCy + 400))) / (300 * 300) <= 1.0;

    // Hair on top of head
    const inHair = (dx * dx) / (headRadiusX * 1.08 * headRadiusX * 1.08) + ((dy + 40) * (dy + 40)) / (headRadiusY * 0.9 * headRadiusY * 0.9) <= 1.0 && y < headCy + 60;

    if (inHair) {
      rgba[idx] = 25;
      rgba[idx + 1] = 20;
      rgba[idx + 2] = 22;
      rgba[idx + 3] = 255;
    } else if (inHead || inNeck) {
      rgba[idx] = 230;
      rgba[idx + 1] = 180;
      rgba[idx + 2] = 150;
      rgba[idx + 3] = 255;
    } else if (inSuit) {
      rgba[idx] = 40;
      rgba[idx + 1] = 45;
      rgba[idx + 2] = 55;
      rgba[idx + 3] = 255;
    }
  }
}

const png = encodeRgbaToPng(rgba, w, h);
const targetPath = path.resolve('tests/fixtures/portrait-blue-1024.png');
fs.writeFileSync(targetPath, png);
console.log('Successfully generated:', targetPath, `(${png.length} bytes)`);
