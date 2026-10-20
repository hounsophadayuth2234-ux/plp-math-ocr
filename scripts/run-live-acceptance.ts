import fs from "fs";
import path from "path";
import zlib from "zlib";
import { autoPortraitSegmentationPipeline } from "../src/lib/bg-compositor";

// Standard CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type: string, data: Buffer): Buffer {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, "ascii");
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function encodePng(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdrChunk = createChunk("IHDR", ihdrData);

  const rowBytes = width * 4;
  const rawScanlines = Buffer.alloc(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (rowBytes + 1);
    rawScanlines[rowOffset] = 0; // Filter: None
    const srcOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      rawScanlines[rowOffset + 1 + x] = rgba[srcOffset + x];
    }
  }

  const idatCompressed = zlib.deflateSync(rawScanlines);
  const idatChunk = createChunk("IDAT", idatCompressed);
  const iendChunk = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Builds the exact acceptance portrait test case:
 * - 640x480 resolution
 * - White background (#ffffff)
 * - Black suit jacket (#111827)
 * - White shirt collar (#f8fafc)
 * - Blue tie (#2563eb)
 * - Neck, ears, face (#f5d0b5)
 * - Black hair (#09090b)
 * - CRITICAL: Isolated blue dot beside the face at (460, 175)
 */
function createAcceptancePortrait(width = 640, height = 480) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const rawMask = new Uint8ClampedArray(width * height);

  // 1. Pure White Background
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = 255;
    rawMask[i] = 0;
  }

  function fillEllipse(cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, maskVal = 255) {
    const minX = Math.max(0, Math.floor(cx - rx));
    const maxX = Math.min(width - 1, Math.ceil(cx + rx));
    const minY = Math.max(0, Math.floor(cy - ry));
    const maxY = Math.min(height - 1, Math.ceil(cy + ry));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          const idx = y * width + x;
          rgba[idx * 4] = r;
          rgba[idx * 4 + 1] = g;
          rgba[idx * 4 + 2] = b;
          rgba[idx * 4 + 3] = 255;
          rawMask[idx] = maskVal;
        }
      }
    }
  }

  function fillRect(x1: number, y1: number, w: number, h: number, r: number, g: number, b: number, maskVal = 255) {
    for (let y = y1; y < y1 + h && y < height; y++) {
      for (let x = x1; x < x1 + w && x < width; x++) {
        const idx = y * width + x;
        rgba[idx * 4] = r;
        rgba[idx * 4 + 1] = g;
        rgba[idx * 4 + 2] = b;
        rgba[idx * 4 + 3] = 255;
        rawMask[idx] = maskVal;
      }
    }
  }

  // 2. Black suit jacket and shoulders
  fillEllipse(320, 450, 190, 140, 17, 24, 39, 255);

  // 3. White shirt collar in V-neck opening
  for (let y = 310; y <= 370; y++) {
    const halfW = Math.round(((370 - y) / 60) * 50);
    for (let x = 320 - halfW; x <= 320 + halfW; x++) {
      const idx = y * width + x;
      rgba[idx * 4] = 248;
      rgba[idx * 4 + 1] = 250;
      rgba[idx * 4 + 2] = 252;
      rgba[idx * 4 + 3] = 255;
      rawMask[idx] = 255;
    }
  }

  // 4. Blue tie running down from collar
  fillRect(310, 320, 20, 150, 37, 99, 235, 255);

  // 5. Neck
  fillRect(296, 250, 48, 65, 245, 208, 181, 255);

  // 6. Ears
  fillEllipse(248, 200, 14, 24, 245, 208, 181, 255);
  fillEllipse(392, 200, 14, 24, 245, 208, 181, 255);

  // 7. Face
  fillEllipse(320, 200, 72, 85, 245, 208, 181, 255);

  // 8. Hair
  fillEllipse(320, 170, 78, 60, 9, 9, 11, 255);

  // 9. Eyes
  fillEllipse(295, 195, 4, 4, 30, 41, 59, 255);
  fillEllipse(345, 195, 4, 4, 30, 41, 59, 255);

  // 10. CRITICAL ACCEPTANCE ARTIFACT: Isolated blue dot beside head
  // at x=460, y=175, radius 7
  fillEllipse(460, 175, 7, 7, 37, 99, 235, 255);

  return { rgba, rawMask, width, height };
}

async function runLiveAcceptance() {
  console.log("==================================================");
  console.log("STARTING MANDATORY LIVE ACCEPTANCE TEST (MODULE 02)");
  console.log("==================================================");

  const tStart = performance.now();
  const width = 640;
  const height = 480;
  const { rgba, rawMask } = createAcceptancePortrait(width, height);

  // Save BEFORE image
  const beforePng = encodePng(rgba, width, height);

  // Run the EXACT production Auto Portrait Pipeline
  const pipelineResult = autoPortraitSegmentationPipeline(rgba, rawMask, width, height, {
    alphaChokePx: 1.2,
    featherRadiusPx: 1.0,
    decontaminateBg: true,
  });

  const tElapsed = Math.round(performance.now() - tStart);

  // 1. Generate transparent PNG buffer
  const transRgba = new Uint8ClampedArray(width * height * 4);
  const maskRgba = new Uint8ClampedArray(width * height * 4);
  const whiteCompositedRgba = new Uint8ClampedArray(width * height * 4);

  let transparentPixelCount = 0;
  let subjectPixelCount = 0;

  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const alpha = pipelineResult.finalMask[i];
    const srcR = pipelineResult.decontaminatedRgba[p];
    const srcG = pipelineResult.decontaminatedRgba[p + 1];
    const srcB = pipelineResult.decontaminatedRgba[p + 2];

    // Transparent PNG
    transRgba[p] = srcR;
    transRgba[p + 1] = srcG;
    transRgba[p + 2] = srcB;
    transRgba[p + 3] = alpha;

    if (alpha < 10) transparentPixelCount++;
    if (alpha > 200) subjectPixelCount++;

    // Mask image (black & white alpha visualizer)
    maskRgba[p] = alpha;
    maskRgba[p + 1] = alpha;
    maskRgba[p + 2] = alpha;
    maskRgba[p + 3] = 255;

    // Composited onto pure white #FFFFFF
    const aNorm = alpha / 255;
    whiteCompositedRgba[p] = Math.round(srcR * aNorm + 255 * (1 - aNorm));
    whiteCompositedRgba[p + 1] = Math.round(srcG * aNorm + 255 * (1 - aNorm));
    whiteCompositedRgba[p + 2] = Math.round(srcB * aNorm + 255 * (1 - aNorm));
    whiteCompositedRgba[p + 3] = 255;
  }

  const transPng = encodePng(transRgba, width, height);
  const maskPng = encodePng(maskRgba, width, height);
  const whitePng = encodePng(whiteCompositedRgba, width, height);

  // ── Verification Assertions ──
  // 1. Check isolated blue dot at (460, 175)
  let maxBlueDotAlpha = 0;
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const idx = (175 + dy) * width + (460 + dx);
      if (pipelineResult.finalMask[idx] > maxBlueDotAlpha) {
        maxBlueDotAlpha = pipelineResult.finalMask[idx];
      }
    }
  }

  // 2. Check subject preservation: Face, Tie, Suit, Hair, Ears
  const faceIdx = 200 * width + 320;
  const tieIdx = 360 * width + 320;
  const suitIdx = 440 * width + 320;
  const hairIdx = 160 * width + 320;
  const earLIdx = 200 * width + 248;
  const earRIdx = 200 * width + 392;

  const faceAlpha = pipelineResult.finalMask[faceIdx];
  const tieAlpha = pipelineResult.finalMask[tieIdx];
  const suitAlpha = pipelineResult.finalMask[suitIdx];
  const hairAlpha = pipelineResult.finalMask[hairIdx];
  const earLAlpha = pipelineResult.finalMask[earLIdx];
  const earRAlpha = pipelineResult.finalMask[earRIdx];

  // 3. Background corner checks (white background transparency)
  const cornerTopLeftAlpha = pipelineResult.finalMask[5 * width + 5];
  const cornerTopRightAlpha = pipelineResult.finalMask[5 * width + (width - 6)];
  const cornerBottomLeftAlpha = pipelineResult.finalMask[(height - 6) * width + 5];
  const cornerBottomRightAlpha = pipelineResult.finalMask[(height - 6) * width + (width - 6)];

  const allPassed =
    maxBlueDotAlpha === 0 &&
    faceAlpha >= 240 &&
    tieAlpha >= 240 &&
    suitAlpha >= 240 &&
    hairAlpha >= 240 &&
    earLAlpha >= 240 &&
    earRAlpha >= 240 &&
    cornerTopLeftAlpha === 0 &&
    cornerTopRightAlpha === 0 &&
    pipelineResult.hasIsolatedBlobsRemaining === false &&
    pipelineResult.removedComponentsCount >= 1 &&
    transparentPixelCount > 100000;

  const diagnostics = {
    testDate: new Date().toISOString(),
    status: allPassed ? "PASSED" : "FAILED",
    inputDimensions: { width, height },
    outputDimensions: { width, height },
    executionDurationMs: tElapsed,
    pipeline: "Auto Portrait Pipeline (8-Connected Component Silhouette Isolation)",
    chokePx: 1.2,
    featherPx: 1.0,
    chromaDecontamination: true,
    acceptanceCriteria: {
      "1. Isolated blue dot removed": {
        expected: "Alpha == 0 at (460, 175)",
        actualAlpha: maxBlueDotAlpha,
        passed: maxBlueDotAlpha === 0,
      },
      "2. White background is transparent": {
        corners: {
          topLeft: cornerTopLeftAlpha,
          topRight: cornerTopRightAlpha,
          bottomLeft: cornerBottomLeftAlpha,
          bottomRight: cornerBottomRightAlpha,
        },
        transparentPixels: transparentPixelCount,
        passed: cornerTopLeftAlpha === 0 && cornerTopRightAlpha === 0,
      },
      "3. Person, hair, ears, face, shirt, suit, tie preserved": {
        faceAlpha,
        tieAlpha,
        suitAlpha,
        hairAlpha,
        earLAlpha,
        earRAlpha,
        passed: faceAlpha >= 240 && tieAlpha >= 240 && suitAlpha >= 240 && hairAlpha >= 240,
      },
      "4. No detached blobs remaining": {
        removedComponentsCount: pipelineResult.removedComponentsCount,
        hasIsolatedBlobsRemaining: pipelineResult.hasIsolatedBlobsRemaining,
        passed: pipelineResult.hasIsolatedBlobsRemaining === false,
      },
      "5. Real transparent PNG generated": {
        transparentPixelCount,
        subjectPixelCount,
        passed: transparentPixelCount > 100000 && subjectPixelCount > 50000,
      },
    },
  };

  // ── Write Artifacts ──
  const targetDirs = [
    path.resolve(process.cwd(), "artifacts"),
    path.resolve("C:/Users/User/.gemini/antigravity-ide/brain/3cdc23dc-115f-4103-a790-940fc815ba4f/artifacts"),
  ];

  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, "bg-remover-before.png"), beforePng);
    fs.writeFileSync(path.join(dir, "bg-remover-after-transparent.png"), transPng);
    fs.writeFileSync(path.join(dir, "bg-remover-composited-white.png"), whitePng);
    fs.writeFileSync(path.join(dir, "bg-remover-mask.png"), maskPng);
    fs.writeFileSync(path.join(dir, "bg-remover-diagnostics.json"), JSON.stringify(diagnostics, null, 2));
    console.log(`Saved artifacts to: ${dir}`);
  }

  console.log("\n==================================================");
  console.log("LIVE ACCEPTANCE TEST SUMMARY:");
  console.log(`Status: ${diagnostics.status}`);
  console.log(`Blue dot alpha at (460, 175): ${maxBlueDotAlpha} (Expected: 0)`);
  console.log(`Face alpha: ${faceAlpha}, Tie alpha: ${tieAlpha}, Suit alpha: ${suitAlpha}`);
  console.log(`Removed disconnected blobs: ${pipelineResult.removedComponentsCount}`);
  console.log(`Isolated blobs remaining: ${pipelineResult.hasIsolatedBlobsRemaining}`);
  console.log(`Total duration: ${tElapsed} ms`);
  console.log("==================================================");

  if (!allPassed) {
    process.exit(1);
  }
}

runLiveAcceptance().catch((err) => {
  console.error("Acceptance test runner failed:", err);
  process.exit(1);
});
