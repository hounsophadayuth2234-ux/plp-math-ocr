import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { performance } from "node:perf_hooks";
import {
  applyColorDehalo,
  chokeAndFeatherAlphaMask,
  extractPersonMask,
  extractTextStrokeMask,
  combinePersonAndTextMasks,
} from "../src/lib/bg-compositor";

// Node environment ImageData polyfill for headless vitest testing
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as any).ImageData = class ImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    constructor(w: number, h: number);
    constructor(data: Uint8ClampedArray, w: number, h?: number);
    constructor(arg1: any, arg2?: any, arg3?: any) {
      if (typeof arg1 === "number") {
        this.width = arg1;
        this.height = arg2;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = arg1;
        this.width = arg2;
        this.height = arg3 ?? arg1.length / 4 / arg2;
      }
    }
  };
}

function parsePngToRgba(buf: Buffer): { width: number; height: number; data: Uint8ClampedArray } {
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    throw new Error("Invalid PNG signature");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    offset += 12 + len;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  const compressed = Buffer.concat(idatChunks);
  const decompressed = zlib.inflateSync(compressed);

  const rgba = new Uint8ClampedArray(width * height * 4);
  const bpp = 4;
  const stride = width * bpp;
  let srcPos = 0;
  let dstPos = 0;

  for (let y = 0; y < height; y++) {
    const filter = decompressed[srcPos++];
    for (let x = 0; x < stride; x++) {
      const byte = decompressed[srcPos++];
      let val = byte;
      if (filter === 1) {
        const left = x >= bpp ? rgba[dstPos - bpp] : 0;
        val = (byte + left) & 0xff;
      } else if (filter === 2) {
        const up = y > 0 ? rgba[dstPos - stride] : 0;
        val = (byte + up) & 0xff;
      } else if (filter === 3) {
        const left = x >= bpp ? rgba[dstPos - bpp] : 0;
        const up = y > 0 ? rgba[dstPos - stride] : 0;
        val = (byte + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        const a = x >= bpp ? rgba[dstPos - bpp] : 0;
        const b = y > 0 ? rgba[dstPos - stride] : 0;
        const c = x >= bpp && y > 0 ? rgba[dstPos - stride - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        val = (byte + pr) & 0xff;
      }
      rgba[dstPos++] = val;
    }
  }

  return { width, height, data: rgba };
}

function loadFixture(filename: string) {
  const filePath = path.resolve(process.cwd(), "tests/fixtures", filename);
  const buf = fs.readFileSync(filePath);
  return parsePngToRgba(buf);
}

describe("Text Retention Regression Test Suite (Khmer & English Protection)", () => {
  it("1. English text on plain backgrounds: extracts stroke mask and retains > 95% of strokes", () => {
    const { width, height, data } = loadFixture("english-text-plain-bg.png");
    const t0 = performance.now();
    const textRes = extractTextStrokeMask(data, width, height);
    const duration = performance.now() - t0;

    expect(duration).toBeLessThan(500); // fast execution
    expect(textRes.textArea).toBeGreaterThan(100);
    expect(textRes.textComponentCount).toBeGreaterThanOrEqual(4); // 4 letters: T, E, X, T

    // Verify strokes are never eroded: apply mask combination
    const emptyPerson = new Uint8ClampedArray(width * height);
    const combined = combinePersonAndTextMasks(emptyPerson, textRes.textStrokeMask, width, height, {
      keepPerson: true,
      keepText: true,
      keepGraphics: false,
    });
    expect(combined.diagnostics.textArea).toBe(textRes.textArea);
  });

  it("2. 12–18px Khmer text: captures thin consonants and diacritics without broken chunks", () => {
    const { width, height, data } = loadFixture("khmer-12-18px-text.png");
    const textRes = extractTextStrokeMask(data, width, height);

    expect(textRes.textArea).toBeGreaterThan(80);
    expect(textRes.textComponentCount).toBeGreaterThanOrEqual(2);
  });

  it("3. Khmer with diacritics and subscripts: preserves upper vowel marks and lower subscripts", () => {
    const { width, height, data } = loadFixture("khmer-diacritics-subscripts.png");
    const textRes = extractTextStrokeMask(data, width, height);

    expect(textRes.textArea).toBeGreaterThan(120);
    // Upper and lower marks should be detected as text components
    expect(textRes.smallComponentCount).toBeGreaterThanOrEqual(2);
  });

  it("4. Person with text outside body: preserves text outside silhouette and isolates person", () => {
    const { width, height, data } = loadFixture("person-with-text-outside-body.png");
    // Initial mask from model covers person area
    const initialMask = new Uint8ClampedArray(width * height);
    for (let y = 70; y < 330; y++) {
      for (let x = 110; x < 290; x++) {
        initialMask[y * width + x] = 255;
      }
    }

    // Step A: Extract person
    const pRes = extractPersonMask(data, initialMask, width, height);
    expect(pRes.hasPerson).toBe(true);

    // Step B: Conservative 1px inward choke strictly on person
    const cleanedPersonMask = chokeAndFeatherAlphaMask(pRes.personMask, width, height, 1.0, 0.7);

    // Step C: Extract text strokes (both top header and bottom caption outside body)
    const tRes = extractTextStrokeMask(data, width, height);
    expect(tRes.textArea).toBeGreaterThan(150);

    // Check that text lines exist outside the person body (y < 60 and y > 330)
    let textOutsideCount = 0;
    for (let y = 0; y < height; y++) {
      if (y < 60 || y > 330) {
        for (let x = 0; x < width; x++) {
          if (tRes.textStrokeMask[y * width + x] > 0) textOutsideCount++;
        }
      }
    }
    expect(textOutsideCount).toBeGreaterThan(50);

    // Step D: Combine finalKeepMask = union(cleanedPersonMask, protectedTextMask)
    const combined = combinePersonAndTextMasks(
      cleanedPersonMask,
      tRes.textStrokeMask,
      width,
      height,
      { keepPerson: true, keepText: true }
    );

    // Verify text outside body is 100% kept in finalKeepMask
    let keptTextOutsideCount = 0;
    for (let y = 0; y < height; y++) {
      if (y < 60 || y > 330) {
        for (let x = 0; x < width; x++) {
          if (combined.finalKeepMask[y * width + x] > 0) keptTextOutsideCount++;
        }
      }
    }
    expect(keptTextOutsideCount).toBe(textOutsideCount); // 100% of text outside body preserved!
  });

  it("5. Hair overlapping text: preserves high-contrast text strokes adjacent to hair strands", () => {
    const { width, height, data } = loadFixture("hair-overlapping-text.png");
    const tRes = extractTextStrokeMask(data, width, height);

    expect(tRes.textArea).toBeGreaterThan(100);
    expect(tRes.textComponentCount).toBeGreaterThanOrEqual(2);
  });

  it("6. Dark-on-white text: extracts clean high-contrast strokes", () => {
    const { width, height, data } = loadFixture("dark-on-white-text.png");
    const tRes = extractTextStrokeMask(data, width, height);

    expect(tRes.textArea).toBeGreaterThan(60);
    expect(tRes.textComponentCount).toBeGreaterThanOrEqual(3);
  });

  it("7. White-on-dark text: detects inverted contrast text on dark header/card", () => {
    const { width, height, data } = loadFixture("white-on-dark-text.png");
    const tRes = extractTextStrokeMask(data, width, height);

    expect(tRes.textArea).toBeGreaterThan(60);
    expect(tRes.textComponentCount).toBeGreaterThanOrEqual(3);
  });

  it("8. Text close to body boundary: 1px inward choke on person does NOT erode text (retention > 95%)", () => {
    const { width, height, data } = loadFixture("text-close-to-body-boundary.png");
    // Simulate person mask
    const personMask = new Uint8ClampedArray(width * height);
    for (let y = 50; y < 250; y++) {
      for (let x = 20; x < 140; x++) {
        personMask[y * width + x] = 255;
      }
    }

    // Measure raw text stroke area
    const tRes = extractTextStrokeMask(data, width, height);
    const rawTextArea = tRes.textArea;
    expect(rawTextArea).toBeGreaterThan(50);

    // Apply 1px choke to person mask ONLY
    const cleanedPersonMask = chokeAndFeatherAlphaMask(personMask, width, height, 1.0, 0.7);

    // Protected text mask is combined WITHOUT choke
    const combined = combinePersonAndTextMasks(
      cleanedPersonMask,
      tRes.textStrokeMask,
      width,
      height,
      { keepPerson: true, keepText: true }
    );

    // Count text pixels retained in combined mask
    let textPixelsRetained = 0;
    for (let i = 0; i < width * height; i++) {
      if (tRes.textStrokeMask[i] > 128 && combined.finalKeepMask[i] > 128) {
        textPixelsRetained++;
      }
    }

    const retentionRatio = textPixelsRetained / rawTextArea;
    expect(retentionRatio).toBeGreaterThanOrEqual(0.95); // Greater than or equal to 95% retention!
  });

  it("9. applyColorDehalo with protectedMask: does not alter RGB values of protected text pixels", () => {
    const { width, height, data } = loadFixture("text-close-to-body-boundary.png");
    const tRes = extractTextStrokeMask(data, width, height);

    const dehaloed = applyColorDehalo(
      data,
      tRes.textStrokeMask, // alpha mask
      width,
      height,
      3,
      tRes.textStrokeMask // protected mask
    );

    // Every text pixel must remain byte-identical to source
    let textDiffs = 0;
    for (let i = 0; i < width * height; i++) {
      if (tRes.textStrokeMask[i] > 128) {
        const pIdx = i * 4;
        if (
          dehaloed[pIdx] !== data[pIdx] ||
          dehaloed[pIdx + 1] !== data[pIdx + 1] ||
          dehaloed[pIdx + 2] !== data[pIdx + 2]
        ) {
          textDiffs++;
        }
      }
    }
    expect(textDiffs).toBe(0); // 100% byte identical, zero corruption from dehalo!
  });
});
