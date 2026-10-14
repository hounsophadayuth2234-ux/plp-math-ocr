import fs from "fs";
import zlib from "zlib";

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, "ascii");
  data.copy(buf, 8);
  const crcData = buf.subarray(4, 8 + len);
  buf.writeUInt32BE(crc32(crcData), 8 + len);
  return buf;
}

function generatePortraitPink(w = 400, h = 500) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = makeChunk("IHDR", ihdrData);

  const rawData = Buffer.alloc(h * (1 + w * 4));
  let offset = 0;

  // Background: Rich educational pink background (#F8C8D8 or #FFC0CB)
  const bgR = 248, bgG = 200, bgB = 216;

  // Head center at (200, 160)
  const headCx = 200, headCy = 160, headR = 70;

  // Hair center at (200, 140)
  const hairCx = 200, hairCy = 140, hairR = 78;

  // Skin color
  const skinR = 245, skinG = 208, skinB = 192;

  // Black hair color
  const hairR_col = 18, hairG_col = 18, hairB_col = 22;

  // Dark suit color
  const suitR = 25, suitG = 28, suitB = 38;

  for (let y = 0; y < h; y++) {
    rawData[offset++] = 0; // Filter None

    for (let x = 0; x < w; x++) {
      let r = bgR, g = bgG, b = bgB, a = 255;

      // 1. Dark Suit Shoulders (from y=260 down to y=500)
      if (y >= 260) {
        const shoulderWidth = 80 + (y - 260) * 0.9;
        const dx = Math.abs(x - 200);

        if (dx <= shoulderWidth) {
          // Inside suit shoulder
          // Shirt collar in middle
          if (dx <= 22 && y <= 330) {
            r = 250; g = 250; b = 250; // White collar
          } else {
            r = suitR; g = suitG; b = suitB; // Dark suit jacket
          }
        }
      }

      // 2. Neck
      if (y >= 210 && y < 270) {
        if (Math.abs(x - 200) <= 30) {
          r = skinR - 15; g = skinG - 15; b = skinB - 15; // Neck shadow
        }
      }

      // 3. Head / Face (Light skin)
      const distHead = Math.sqrt((x - headCx) ** 2 + (y - headCy) ** 2);
      if (distHead <= headR) {
        r = skinR; g = skinG; b = skinB;
        // Simple eyes
        if (y >= 150 && y <= 156 && (Math.abs(x - 175) <= 5 || Math.abs(x - 225) <= 5)) {
          r = 40; g = 30; b = 30;
        }
      }

      // 4. Black Hair (crown and sides)
      const distHair = Math.sqrt((x - hairCx) ** 2 + (y - hairCy) ** 2);
      if (distHair <= hairR) {
        // Crown above forehead
        if (y < 145 || Math.abs(x - 200) > 45) {
          r = hairR_col; g = hairG_col; b = hairB_col;
        }
      }

      // 5. Fine hair flyaways / thin strands extending into the pink background!
      // Add delicate strands along the top and sides:
      for (let angle = -120; angle <= -60; angle += 10) {
        const rad = (angle * Math.PI) / 180;
        const strandX = hairCx + (hairR + 6) * Math.cos(rad);
        const strandY = hairCy + (hairR + 6) * Math.sin(rad);
        if (Math.hypot(x - strandX, y - strandY) < 1.8) {
          r = hairR_col; g = hairG_col; b = hairB_col;
        }
      }

      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const idatData = zlib.deflateSync(rawData);
  const idat = makeChunk("IDAT", idatData);
  const iend = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

const portraitBuf = generatePortraitPink(400, 500);
fs.writeFileSync("portrait-pink.png", portraitBuf);
console.log("Generated portrait-pink.png successfully! Size:", portraitBuf.length, "bytes");
