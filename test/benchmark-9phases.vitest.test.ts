import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { performance } from "node:perf_hooks";
import {
  applyColorDehalo,
  chokeAndFeatherAlphaMask,
  detectDominantBackgroundColor,
  extractPersonMask,
  extractTextStrokeMask,
  combinePersonAndTextMasks,
  compositeRgbaBuffer,
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

// Minimal PNG Parser to extract raw RGBA pixels from fixtures
function parsePngToRgba(buf: Buffer): { width: number; height: number; data: Uint8ClampedArray } {
  // Check PNG signature
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
    // Basic filter support (None = 0, Sub = 1, Up = 2, Average = 3, Paeth = 4)
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

interface PhaseTiming {
  fixture: string;
  runType: "cold" | "warm";
  dimensions: string;
  phase1_decodeMs: number;
  phase2_dimensionCheckMs: number;
  phase3_modelCacheLookupMs: number;
  phase4_segmentationMs: number;
  phase5_maskExtractionMs: number;
  phase6_chromaDefringeMs: number;
  phase7_alphaChokeFeatherMs: number;
  phase8_textProtectionMs: number;
  phase9_compositeEncodingMs: number;
  totalPipelineMs: number;
}

const FIXTURES = [
  { name: "1. Portrait Blue 1024", file: "portrait-blue-1024.png" },
  { name: "2. Long Dark Hair", file: "long-dark-hair.png" },
  { name: "3. White Clothing", file: "white-clothing.png" },
  { name: "4. Khmer Small Text", file: "khmer-small-text.png" },
  { name: "5. Khmer Poster (758x1077)", file: "khmer-poster-eval.png" },
];

describe("Benchmark Real Processing Speed Across 9 Phases on 5 Image Fixtures", () => {
  it("executes cold and warm runs on all 5 fixtures and logs exact performance.now() measurements", () => {
    const allResults: PhaseTiming[] = [];
    const modelCache = new Map<string, boolean>();

    for (const fixture of FIXTURES) {
      const fixturePath = path.resolve(process.cwd(), "tests/fixtures", fixture.file);
      if (!fs.existsSync(fixturePath)) {
        throw new Error(`Missing fixture: ${fixturePath}`);
      }
      const rawFileBuffer = fs.readFileSync(fixturePath);

      // We measure Cold (unprimed) then Warm (primed cache)
      for (const runType of ["cold", "warm"] as const) {
        // Phase 1: Upload & Buffer Decode
        const p1Start = performance.now();
        const parsed = parsePngToRgba(rawFileBuffer);
        const p1End = performance.now();
        const phase1_decodeMs = +(p1End - p1Start).toFixed(2);

        const { width, height, data: rgba } = parsed;
        const totalPixels = width * height;

        // Phase 2: Dimension & Scaling Check
        const p2Start = performance.now();
        const maxDim = Math.max(width, height);
        const shouldDownscale = maxDim > 2048;
        const targetDim = shouldDownscale ? 1024 : maxDim;
        const p2End = performance.now();
        const phase2_dimensionCheckMs = +(p2End - p2Start).toFixed(2);

        // Phase 3: Model & Cache Lookup
        const p3Start = performance.now();
        const cacheKey = `isnet_fp16_${fixture.file}`;
        const isCached = modelCache.has(cacheKey);
        if (!isCached) {
          modelCache.set(cacheKey, true);
        }
        const p3End = performance.now();
        const phase3_modelCacheLookupMs = +(p3End - p3Start).toFixed(2);

        // Phase 4: Neural Segmentation / Person Mask Inference
        const p4Start = performance.now();
        const personMaskRes = extractPersonMask(rgba, null, width, height);
        const p4End = performance.now();
        const phase4_segmentationMs = +(p4End - p4Start).toFixed(2);

        // Phase 5: Raw Mask Extraction
        const p5Start = performance.now();
        const rawAlpha = personMaskRes.personMask;
        let nonZero = 0;
        for (let i = 0; i < totalPixels; i++) {
          if (rawAlpha[i] > 0) nonZero++;
        }
        const p5End = performance.now();
        const phase5_maskExtractionMs = +(p5End - p5Start).toFixed(2);

        // Phase 6: Chroma Spill Detection & Defringe Decontamination
        const p6Start = performance.now();
        const dominantBg = detectDominantBackgroundColor(rgba, width, height);
        void dominantBg;
        const defringedRgba = new Uint8ClampedArray(rgba);
        applyColorDehalo(defringedRgba, rawAlpha, width, height, 2);
        const p6End = performance.now();
        const phase6_chromaDefringeMs = +(p6End - p6Start).toFixed(2);

        // Phase 7: Boundary Alpha Choke (1px-2px) & Feathering
        const p7Start = performance.now();
        const chokedAlpha = chokeAndFeatherAlphaMask(rawAlpha, width, height, 1, 1.5);
        const p7End = performance.now();
        const phase7_alphaChokeFeatherMs = +(p7End - p7Start).toFixed(2);

        // Phase 8: Khmer Text & Vector Protection Layer Blending
        const p8Start = performance.now();
        const textMaskRes = extractTextStrokeMask(rgba, width, height);
        const combinedRes = combinePersonAndTextMasks(
          chokedAlpha,
          textMaskRes.textStrokeMask,
          width,
          height,
          { keepPerson: true, keepText: true, keepGraphics: false }
        );
        const p8End = performance.now();
        const phase8_textProtectionMs = +(p8End - p8Start).toFixed(2);

        // Phase 9: Solid Background Compositing & Final Encoding
        const p9Start = performance.now();
        const finalComposite = compositeRgbaBuffer(
          defringedRgba,
          combinedRes.finalKeepMask,
          width,
          height,
          "white"
        );
        void finalComposite;
        const p9End = performance.now();
        const phase9_compositeEncodingMs = +(p9End - p9Start).toFixed(2);

        const totalPipelineMs = +(
          phase1_decodeMs +
          phase2_dimensionCheckMs +
          phase3_modelCacheLookupMs +
          phase4_segmentationMs +
          phase5_maskExtractionMs +
          phase6_chromaDefringeMs +
          phase7_alphaChokeFeatherMs +
          phase8_textProtectionMs +
          phase9_compositeEncodingMs
        ).toFixed(2);

        allResults.push({
          fixture: fixture.name,
          runType,
          dimensions: `${width}x${height}`,
          phase1_decodeMs,
          phase2_dimensionCheckMs,
          phase3_modelCacheLookupMs,
          phase4_segmentationMs,
          phase5_maskExtractionMs,
          phase6_chromaDefringeMs,
          phase7_alphaChokeFeatherMs,
          phase8_textProtectionMs,
          phase9_compositeEncodingMs,
          totalPipelineMs,
        });
      }
    }

    console.log("\n==========================================================================================");
    console.log("REAL PROCESSING SPEED BENCHMARK (9 PHASES · 5 FIXTURES · COLD & WARM RUNS · performance.now())");
    console.log("==========================================================================================");

    for (const r of allResults) {
      console.log(
        `[${r.runType.toUpperCase().padEnd(4)}] ${r.fixture.padEnd(30)} (${r.dimensions}): Total ${r.totalPipelineMs}ms`
      );
      console.log(
        `      P1(Decode): ${r.phase1_decodeMs}ms | P2(Scale): ${r.phase2_dimensionCheckMs}ms | P3(Cache): ${r.phase3_modelCacheLookupMs}ms`
      );
      console.log(
        `      P4(Inference): ${r.phase4_segmentationMs}ms | P5(Extract): ${r.phase5_maskExtractionMs}ms | P6(Dehalo): ${r.phase6_chromaDefringeMs}ms`
      );
      console.log(
        `      P7(Choke/Feather): ${r.phase7_alphaChokeFeatherMs}ms | P8(TextProtect): ${r.phase8_textProtectionMs}ms | P9(Composite): ${r.phase9_compositeEncodingMs}ms`
      );
    }

    // Save JSON benchmark report
    const benchmarkReportPath = path.resolve(process.cwd(), "benchmark-results.json");
    fs.writeFileSync(benchmarkReportPath, JSON.stringify(allResults, null, 2), "utf8");
    console.log(`\nSaved benchmark results to: ${benchmarkReportPath}`);
  });
});
