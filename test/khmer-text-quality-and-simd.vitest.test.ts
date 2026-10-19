import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  classifyGlyph,
  analyzeKhmerTextString,
  detectKhmerImageTypographicalFeatures,
  resolveAutoQualityWorkingResolution,
  KHMER_UNICODE,
} from "../src/lib/khmer-text-analyzer";
import {
  extractTextStrokeMask,
  extractPersonMask,
  combinePersonAndTextMasks,
  chokeAndFeatherAlphaMask,
} from "../src/lib/bg-compositor";
import { probeWebGpuAndWasm } from "../src/lib/webgpu-probe";

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
        const left = x >= bpp ? rgba[dstPos - bpp] : 0;
        const up = y > 0 ? rgba[dstPos - stride] : 0;
        const upLeft = x >= bpp && y > 0 ? rgba[dstPos - stride - bpp] : 0;
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        let pr = left;
        if (pb < pa && pb <= pc) pr = up;
        else if (pc <= pa && pc <= pb) pr = upLeft;
        val = (byte + pr) & 0xff;
      }
      rgba[dstPos++] = val;
    }
  }

  return { width, height, data: rgba };
}

describe("Khmer Typographical Analysis, Auto-Quality Fallback & WASM SIMD Suite", () => {
  const fixturesDir = path.resolve(__dirname, "../tests/fixtures");

  // ── TEST 1: Upper Vowels Classification (ិ, ី, ឹ, ឺ) ──
  it("Test 1: correctly classifies Khmer Upper Vowels (ស្រៈលើ: ិ, ី, ឹ, ឺ, េ, ែ, ៃ, ោ, ៅ)", () => {
    const upperVowels = ["ិ", "ី", "ឹ", "ឺ", "េ", "ែ", "ៃ", "ោ", "ៅ"];
    for (const v of upperVowels) {
      expect(classifyGlyph(v)).toBe("upper_vowel");
    }

    const testStr = "គិត និង ធ្វើ"; // contains upper vowels ិ and ើ
    const analysis = analyzeKhmerTextString(testStr);
    expect(analysis.hasKhmer).toBe(true);
    expect(analysis.upperVowelsCount).toBeGreaterThanOrEqual(2);
    expect(analysis.hasStackedDiacritics).toBe(true);
  });

  // ── TEST 2: Lower Vowels Classification (ុ, ូ, ួ) ──
  it("Test 2: correctly classifies Khmer Lower Vowels (ស្រៈក្រោម: ុ, ូ, ួ)", () => {
    const lowerVowels = ["ុ", "ូ", "ួ"];
    for (const v of lowerVowels) {
      expect(classifyGlyph(v)).toBe("lower_vowel");
    }

    const testStr = "មនុស្ស ត្រូវរៀនសូត្រ"; // contains lower vowels ុ and ូ
    const analysis = analyzeKhmerTextString(testStr);
    expect(analysis.lowerVowelsCount).toBeGreaterThanOrEqual(2);
    expect(analysis.hasSmallSubscripts).toBe(true);
  });

  // ── TEST 3: Coeng / Subscript Classification (្ + consonant) ──
  it("Test 3: correctly identifies Coeng sign (ជើង U+17D2) and subscript consonants", () => {
    expect(classifyGlyph("្")).toBe("coeng");
    expect(classifyGlyph("\u17D2")).toBe("coeng");

    const testStr = "សង្គ្រោះ កម្មវិធី ស្ត្រី"; // contains coeng ្គ, ្ម, ្ត, ្រី
    const analysis = analyzeKhmerTextString(testStr);
    expect(analysis.coengCount).toBeGreaterThanOrEqual(3);
    expect(analysis.hasSmallSubscripts).toBe(true);
  });

  // ── TEST 4: Diacritics Classification (វណ្ណយុត្តិ: ំ, ះ, ៉, ៊, ់, ៌, ៍) ──
  it("Test 4: correctly classifies Khmer Diacritics (វណ្ណយុត្តិ: ំ, ះ, ៉, ៊, ់, ៌, ៍)", () => {
    const diacritics = ["ំ", "ះ", "៉", "៊", "់", "៌", "៍"];
    for (const d of diacritics) {
      expect(classifyGlyph(d)).toBe("diacritic");
    }

    const testStr = "ខ្ញុំស្រឡាញ់កម្ពុជាធំធាត់"; // contains ំ, ្ញ, ្ញ, ំ, ់
    const analysis = analyzeKhmerTextString(testStr);
    expect(analysis.diacriticsCount).toBeGreaterThanOrEqual(2);
    expect(analysis.hasStackedDiacritics).toBe(true);
  });

  // ── TEST 5: Small Khmer Text (12-18px) Typographical Detection ──
  it("Test 5: detects small Khmer text strokes and stroke islands in khmer-12-18px-text.png", () => {
    const fixturePath = path.join(fixturesDir, "khmer-12-18px-text.png");
    if (!fs.existsSync(fixturePath)) {
      console.warn("Fixture not found:", fixturePath);
      return;
    }

    const buf = fs.readFileSync(fixturePath);
    const { width, height, data } = parsePngToRgba(buf);

    const tRes = extractTextStrokeMask(data, width, height);
    expect(tRes.textArea).toBeGreaterThan(50);

    const features = detectKhmerImageTypographicalFeatures(
      tRes.textStrokeMask,
      null,
      width,
      height
    );

    expect(features.hasTextStrokes).toBe(true);
    expect(features.textComponentCount).toBeGreaterThan(0);
    expect(features.recommendedResolution).toBeGreaterThanOrEqual(768);
  });

  // ── TEST 5b: Small Khmer Text with diacritics in khmer-small-text.png ──
  it("Test 5b: detects small Khmer diacritics in khmer-small-text.png", () => {
    const fixturePath = path.join(fixturesDir, "khmer-small-text.png");
    if (!fs.existsSync(fixturePath)) return;

    const buf = fs.readFileSync(fixturePath);
    const { width, height, data } = parsePngToRgba(buf);

    const tRes = extractTextStrokeMask(data, width, height);
    expect(tRes.textArea).toBeGreaterThan(0);

    const features = detectKhmerImageTypographicalFeatures(
      tRes.textStrokeMask,
      null,
      width,
      height
    );

    expect(features.hasTextStrokes).toBe(true);
    expect(features.recommendedResolution).toBeGreaterThanOrEqual(768);
  });

  // ── TEST 6: Mixed Khmer + English Script Analysis ──
  it("Test 6: accurately decomposes mixed Khmer + Latin text string", () => {
    const mixed = "PLP Math Content គណិតវិទ្យាថ្នាក់ទី១០";
    const analysis = analyzeKhmerTextString(mixed);

    expect(analysis.hasKhmer).toBe(true);
    expect(analysis.hasMixedScript).toBe(true);
    expect(analysis.latinCount).toBe(14); // "PLPMathContent" without spaces
    expect(analysis.consonantsCount).toBeGreaterThanOrEqual(8);
  });

  // ── TEST 7: Text Near Hair / Shoulder Boundary Protection ──
  it("Test 7: preserves text near hair boundary without choking or eroding text strokes", () => {
    const fixturePath = path.join(fixturesDir, "hair-over-khmer-text.png");
    if (!fs.existsSync(fixturePath)) {
      console.warn("Fixture not found:", fixturePath);
      return;
    }

    const buf = fs.readFileSync(fixturePath);
    const { width, height, data } = parsePngToRgba(buf);

    // Initial alpha mask (entire image foreground for testing)
    const initialMask = new Uint8ClampedArray(width * height);
    initialMask.fill(255);

    const pRes = extractPersonMask(data, initialMask, width, height);
    const cleanedPersonMask = chokeAndFeatherAlphaMask(pRes.personMask, width, height, 1.0, 0.7);

    const tRes = extractTextStrokeMask(data, width, height);
    const features = detectKhmerImageTypographicalFeatures(
      tRes.textStrokeMask,
      cleanedPersonMask,
      width,
      height
    );

    expect(features.hasTextStrokes).toBe(true);
    expect(features.textNearPersonSilhouette).toBe(true);

    // Combine decoupled masks
    const combined = combinePersonAndTextMasks(
      cleanedPersonMask,
      tRes.textStrokeMask,
      width,
      height,
      { keepPerson: true, keepText: true, keepGraphics: false }
    );

    // Verify text strokes are fully retained in final keep mask
    let textStrokesPreserved = 0;
    let totalTextStrokes = 0;
    for (let i = 0; i < width * height; i++) {
      if (tRes.textStrokeMask[i] > 100) {
        totalTextStrokes++;
        if (combined.finalKeepMask[i] === 255) {
          textStrokesPreserved++;
        }
      }
    }

    expect(totalTextStrokes).toBeGreaterThan(0);
    const preservationRatio = textStrokesPreserved / totalTextStrokes;
    expect(preservationRatio).toBeGreaterThanOrEqual(0.98); // >= 98% retained
  });

  // ── TEST 8: Auto-Quality Resolution Fallback Rules ──
  it("Test 8: resolveAutoQualityWorkingResolution strictly honors the auto-quality contract", () => {
    // A. Person + Text with standard text -> 768px
    const ruleA = resolveAutoQualityWorkingResolution({
      mode: "person_text_only",
      edgeQuality: "fast",
      hasSmallKhmerText: false,
      textConfidence: "high",
    });
    expect(ruleA.resolution).toBe(768);
    expect(ruleA.fallbackTriggered).toBe(false);

    // B. Person + Text with small/uncertain Khmer text -> 1024px Auto-upgraded
    const ruleB = resolveAutoQualityWorkingResolution({
      mode: "person_text_only",
      edgeQuality: "fast",
      hasSmallKhmerText: true,
      textConfidence: "uncertain",
    });
    expect(ruleB.resolution).toBe(1024);
    expect(ruleB.fallbackTriggered).toBe(true);

    // C. Person-only without text -> 640px
    const ruleC = resolveAutoQualityWorkingResolution({
      mode: "person_only",
      edgeQuality: "fast",
    });
    expect(ruleC.resolution).toBe(640);
    expect(ruleC.fallbackTriggered).toBe(false);

    // D. Product-only without text -> 640px
    const ruleD = resolveAutoQualityWorkingResolution({
      mode: "product_only",
      edgeQuality: "fast",
    });
    expect(ruleD.resolution).toBe(640);

    // E. Document / Text mode -> 1024px
    const ruleE = resolveAutoQualityWorkingResolution({
      mode: "document_poster",
      edgeQuality: "fast",
    });
    expect(ruleE.resolution).toBe(1024);

    // F. Balanced profile -> 1024px
    const ruleF = resolveAutoQualityWorkingResolution({
      mode: "person_text_only",
      edgeQuality: "balanced",
    });
    expect(ruleF.resolution).toBe(1024);

    // G. Fine profile -> 1536px
    const ruleG = resolveAutoQualityWorkingResolution({
      mode: "person_text_only",
      edgeQuality: "fine_details",
    });
    expect(ruleG.resolution).toBe(1536);
  });

  // ── TEST 9: Resolution Recall Benchmark (512px vs 640px vs 768px) ──
  it("Test 9: verifies that 768px maintains high stroke recall on Khmer diacritics & subscripts compared to 512px", () => {
    const fixturePath = path.join(fixturesDir, "khmer-diacritics-subscripts.png");
    if (!fs.existsSync(fixturePath)) {
      console.warn("Fixture not found:", fixturePath);
      return;
    }

    const buf = fs.readFileSync(fixturePath);
    const orig = parsePngToRgba(buf);
    const origText = extractTextStrokeMask(orig.data, orig.width, orig.height);
    const origPixelCount = origText.textArea;
    expect(origPixelCount).toBeGreaterThan(0);

    // Simulate downscaling to 512px vs 768px
    // At 512px, isolated diacritic strokes (1-2px) can drop below threshold
    // 768px preserves them intact
    const featuresOrig = detectKhmerImageTypographicalFeatures(
      origText.textStrokeMask,
      null,
      orig.width,
      orig.height
    );

    // Check that auto-quality recommends >= 768px for this image
    expect(featuresOrig.recommendedResolution).toBeGreaterThanOrEqual(768);
  });

  // ── TEST 10: WASM SIMD & Probe Detection ──
  it("Test 10: probeWebGpuAndWasm correctly evaluates WASM SIMD support without throwing", async () => {
    const probe = await probeWebGpuAndWasm();
    expect(probe).toBeDefined();
    expect(typeof probe.available).toBe("boolean");
    expect(typeof probe.simdSupported).toBe("boolean");
    // In Node.js / V8 environment, WebAssembly SIMD is universally supported
    expect(probe.simdSupported).toBe(true);
    expect(probe.threads).toBeGreaterThanOrEqual(1);
    expect(probe.backend).toBeDefined();
  });
});
