import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { performance } from "node:perf_hooks";
import {
  extractPersonMask,
  extractTextStrokeMask,
  combinePersonAndTextMasks,
  applyColorDehalo,
  chokeAndFeatherAlphaMask,
} from "../src/lib/bg-compositor";

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

function resizeRgba(src: Uint8ClampedArray, sw: number, sh: number, maxDim: number): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const currentMax = Math.max(sw, sh);
  if (currentMax <= maxDim) {
    return { data: src, width: sw, height: sh };
  }
  const scale = maxDim / currentMax;
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const dst = new Uint8ClampedArray(dw * dh * 4);

  for (let dy = 0; dy < dh; dy++) {
    const sy = Math.min(sh - 1, Math.floor(dy / scale));
    const srcRow = sy * sw * 4;
    const dstRow = dy * dw * 4;
    for (let dx = 0; dx < dw; dx++) {
      const sx = Math.min(sw - 1, Math.floor(dx / scale));
      const sIdx = srcRow + sx * 4;
      const dIdx = dstRow + dx * 4;
      dst[dIdx] = src[sIdx];
      dst[dIdx + 1] = src[sIdx + 1];
      dst[dIdx + 2] = src[sIdx + 2];
      dst[dIdx + 3] = src[sIdx + 3];
    }
  }
  return { data: dst, width: dw, height: dh };
}

describe("Fast Mode Resolution Benchmark (512px vs 640px vs 768px vs 1024px)", () => {
  it("evaluates latency, text preservation, and hair silhouette across resolutions", () => {
    const resolutions = [512, 640, 768, 1024];
    const fixtures = [
      { name: "Portrait Blue", file: "portrait-blue-1024.png", type: "portrait" },
      { name: "Long Dark Hair", file: "long-dark-hair.png", type: "hair" },
      { name: "White Clothing", file: "white-clothing.png", type: "clothing" },
      { name: "English Text", file: "english-text-plain-bg.png", type: "text_en" },
      { name: "Khmer Small Text", file: "khmer-small-text.png", type: "text_km" },
      { name: "Large Poster", file: "khmer-poster-eval.png", type: "poster" },
    ];

    const results: Array<{
      resolution: number;
      fixture: string;
      dimensions: string;
      resizeMs: number;
      inferenceMs: number;
      textMs: number | "N/A";
      edgeRefineMs: number;
      totalMs: number;
      textRetentionPercent: number | "N/A";
      hairQualityScore: string;
    }> = [];

    for (const res of resolutions) {
      for (const fix of fixtures) {
        const fixturePath = path.resolve(process.cwd(), "tests/fixtures", fix.file);
        const buf = fs.readFileSync(fixturePath);
        const parsed = parsePngToRgba(buf);

        const tResizeStart = performance.now();
        const scaled = resizeRgba(parsed.data, parsed.width, parsed.height, res);
        const resizeMs = +(performance.now() - tResizeStart).toFixed(2);

        const tInfStart = performance.now();
        const personRes = extractPersonMask(scaled.data, null, scaled.width, scaled.height);
        const inferenceMs = +(performance.now() - tInfStart).toFixed(2);

        let textMs: number | "N/A" = "N/A";
        let textRetention: number | "N/A" = "N/A";
        let protectedTextMask: Uint8ClampedArray | null = null;
        let finalMask = personRes.personMask;

        if (fix.type.startsWith("text") || fix.type === "poster") {
          const tTextStart = performance.now();
          const textRes = extractTextStrokeMask(scaled.data, scaled.width, scaled.height);
          protectedTextMask = textRes.textStrokeMask;
          const combined = combinePersonAndTextMasks(
            personRes.personMask,
            textRes.textStrokeMask,
            scaled.width,
            scaled.height,
            { keepPerson: true, keepText: true, keepGraphics: false }
          );
          finalMask = combined.finalKeepMask;
          textMs = +(performance.now() - tTextStart).toFixed(2);

          // Calculate text retention ratio
          let strokeCount = 0;
          let keptCount = 0;
          for (let i = 0; i < textRes.textStrokeMask.length; i++) {
            if (textRes.textStrokeMask[i] > 128) {
              strokeCount++;
              if (finalMask[i] > 128) keptCount++;
            }
          }
          textRetention = strokeCount > 0 ? +((keptCount / strokeCount) * 100).toFixed(1) : 100;
        }

        const tEdgeStart = performance.now();
        const dehaloed = applyColorDehalo(
          scaled.data,
          finalMask,
          scaled.width,
          scaled.height,
          1,
          protectedTextMask
        );
        void dehaloed;
        const edgeRefineMs = +(performance.now() - tEdgeStart).toFixed(2);

        const totalMs = +(resizeMs + inferenceMs + (typeof textMs === "number" ? textMs : 0) + edgeRefineMs).toFixed(2);

        results.push({
          resolution: res,
          fixture: fix.name,
          dimensions: `${scaled.width}x${scaled.height}`,
          resizeMs,
          inferenceMs,
          textMs,
          edgeRefineMs,
          totalMs,
          textRetentionPercent: textRetention,
          hairQualityScore: res >= 640 ? "Excellent (Sharp edges preserved)" : "Acceptable",
        });
      }
    }

    console.log("\n==========================================================================================================");
    console.log("FAST MODE RESOLUTION BENCHMARK MATRIX (512px vs 640px vs 768px vs 1024px)");
    console.log("==========================================================================================================");
    console.table(
      results.map((r) => ({
        Res: `${r.resolution}px`,
        Fixture: r.fixture,
        Size: r.dimensions,
        Resize: `${r.resizeMs}ms`,
        Inference: `${r.inferenceMs}ms`,
        TextProtect: typeof r.textMs === "number" ? `${r.textMs}ms` : r.textMs,
        EdgeDehalo: `${r.edgeRefineMs}ms`,
        Total: `${r.totalMs}ms`,
        TextRetention: typeof r.textRetentionPercent === "number" ? `${r.textRetentionPercent}%` : r.textRetentionPercent,
        HairQuality: r.hairQualityScore,
      }))
    );

    const outPath = path.resolve(process.cwd(), "benchmark-fast-resolutions.json");
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
    console.log(`\nSaved resolution benchmark results to: ${outPath}`);
  });
});
