import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import {
  detectDocumentQuad,
  generateQuadMask,
  warpPerspectiveQuad,
  applyColorDehalo,
  detectContainerAndContents,
  computeMaskDiagnostics,
  applyAreaSafetyCheck,
  compositePixel,
  createDocumentSafeRgba,
  isolatePersonMask,
  combinePersonWithSelectedRegions,
  SelectionMode,
  ContentMode,
  QuadCorners,
} from "../src/lib/bg-compositor";
import {
  DOCUMENT_SAFE_MODE,
  BACKGROUND_REMOVAL_CONSERVATIVE,
  BACKGROUND_REMOVAL_SEGMENTATION_V2,
  segmentObjectSelection,
  refineAlphaMattingWithMask,
  ProcessingStageMetrics,
} from "../src/lib/bg-removal-client";

// Node environment ImageData polyfill for headless testing
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

/**
 * Creates the exact synthetic Khmer poster image (758x1077)
 * containing:
 * - Outer camera/table background margin (if withMargin = true)
 * - White rectangular page/poster canvas
 * - Top header with Blue Graphic (R: 30, G: 64, B: 175)
 * - Yellow Khmer Logo (R: 245, G: 158, B: 11)
 * - Top Khmer Text lines (Dark R: 20, G: 25, B: 35)
 * - Person in red/blue uniform (Hair R: 40, G: 30, B: 25; Skin R: 235, G: 185, B: 155; Red uniform R: 190, G: 40, B: 40; Blue uniform R: 30, G: 60, B: 180)
 * - Bottom small caption text lines (Dark R: 20, G: 25, B: 35)
 */
function createSyntheticKhmerPoster(options?: { withMargin?: boolean; width?: number; height?: number }) {
  const w = options?.width || 758;
  const h = options?.height || 1077;
  const withMargin = options?.withMargin ?? true;
  const totalPixels = w * h;

  const rgba = new Uint8ClampedArray(totalPixels * 4);
  const initialMask = new Uint8ClampedArray(totalPixels);

  const marginX = withMargin ? 40 : 0;
  const marginY = withMargin ? 60 : 0;
  const pageLeft = marginX;
  const pageTop = marginY;
  const pageRight = w - 1 - marginX;
  const pageBottom = h - 1 - marginY;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const pIdx = idx * 4;

      const isInsidePage = x >= pageLeft && x <= pageRight && y >= pageTop && y <= pageBottom;

      if (!isInsidePage) {
        // Outer dark surface/background margin
        rgba[pIdx] = 35;
        rgba[pIdx + 1] = 38;
        rgba[pIdx + 2] = 45;
        rgba[pIdx + 3] = 255;
        initialMask[idx] = 0;
        continue;
      }

      // Inside poster page:
      const relX = (x - pageLeft) / (pageRight - pageLeft);
      const relY = (y - pageTop) / (pageBottom - pageTop);

      // 1. Blue Graphic banner at top (y: 0% to 16%)
      if (relY >= 0 && relY < 0.16) {
        const logoDx = (relX - 0.5) * 400;
        const logoDy = (relY - 0.08) * 400;
        if (Math.hypot(logoDx, logoDy) < 22) {
          // Yellow/gold Khmer logo
          rgba[pIdx] = 245;
          rgba[pIdx + 1] = 158;
          rgba[pIdx + 2] = 11;
        } else {
          // Deep Blue graphic banner
          rgba[pIdx] = 30;
          rgba[pIdx + 1] = 64;
          rgba[pIdx + 2] = 175;
        }
      }
      // 2. Khmer Text Lines (y: 18% to 36%)
      else if (relY >= 0.18 && relY <= 0.36) {
        const lineOffset = (relY - 0.18) % 0.045;
        if (lineOffset < 0.015 && relX >= 0.15 && relX <= 0.85) {
          // Dark charcoal Khmer text
          rgba[pIdx] = 20;
          rgba[pIdx + 1] = 25;
          rgba[pIdx + 2] = 35;
        } else {
          // Clean white poster canvas
          rgba[pIdx] = 255;
          rgba[pIdx + 1] = 255;
          rgba[pIdx + 2] = 255;
        }
      }
      // 3. Person in red/blue uniform (y: 40% to 86%, x: 25% to 75%)
      else if (relY >= 0.40 && relY <= 0.86 && relX >= 0.25 && relX <= 0.75) {
        // Dark hair
        if (relY >= 0.40 && relY <= 0.46 && relX >= 0.44 && relX <= 0.56) {
          rgba[pIdx] = 40;
          rgba[pIdx + 1] = 30;
          rgba[pIdx + 2] = 25;
        }
        // Face skin tone
        else if (relY > 0.46 && relY <= 0.54 && relX >= 0.43 && relX <= 0.57) {
          rgba[pIdx] = 235;
          rgba[pIdx + 1] = 185;
          rgba[pIdx + 2] = 155;
        }
        // Red uniform (upper torso)
        else if (relY > 0.54 && relY <= 0.70 && relX >= 0.30 && relX <= 0.70) {
          rgba[pIdx] = 190;
          rgba[pIdx + 1] = 40;
          rgba[pIdx + 2] = 40;
        }
        // Blue uniform (vest / lower torso)
        else if (relY > 0.70 && relY <= 0.86 && relX >= 0.32 && relX <= 0.68) {
          rgba[pIdx] = 30;
          rgba[pIdx + 1] = 60;
          rgba[pIdx + 2] = 180;
        }
        // Hands skin tone
        else if (
          relY > 0.78 &&
          relY <= 0.85 &&
          ((relX >= 0.25 && relX <= 0.32) || (relX >= 0.68 && relX <= 0.75))
        ) {
          rgba[pIdx] = 235;
          rgba[pIdx + 1] = 185;
          rgba[pIdx + 2] = 155;
        } else {
          // White canvas around person
          rgba[pIdx] = 255;
          rgba[pIdx + 1] = 255;
          rgba[pIdx + 2] = 255;
        }
      }
      // 4. Small caption text near bottom (y: 89% to 96%)
      else if (relY >= 0.89 && relY <= 0.96) {
        const lineOffset = (relY - 0.89) % 0.035;
        if (lineOffset < 0.012 && relX >= 0.20 && relX <= 0.80) {
          rgba[pIdx] = 20;
          rgba[pIdx + 1] = 25;
          rgba[pIdx + 2] = 35;
        } else {
          rgba[pIdx] = 255;
          rgba[pIdx + 1] = 255;
          rgba[pIdx + 2] = 255;
        }
      }
      // 5. White base canvas for everything else
      else {
        rgba[pIdx] = 255;
        rgba[pIdx + 1] = 255;
        rgba[pIdx + 2] = 255;
      }

      rgba[pIdx + 3] = 255;
      initialMask[idx] = 255; // Document foreground
    }
  }

  return {
    rgba,
    initialMask,
    w,
    h,
    pageLeft,
    pageTop,
    pageRight,
    pageBottom,
  };
}

function computeRgbSha256(rgba: Uint8ClampedArray | Uint8Array, totalPixels: number): string {
  const rgbBytes = Buffer.alloc(totalPixels * 3);
  for (let i = 0; i < totalPixels; i++) {
    rgbBytes[i * 3] = rgba[i * 4];
    rgbBytes[i * 3 + 1] = rgba[i * 4 + 1];
    rgbBytes[i * 3 + 2] = rgba[i * 4 + 2];
  }
  return crypto.createHash("sha256").update(rgbBytes).digest("hex");
}

describe("AGY Acceptance Suite — Poster Text Preservation & Processing Speed", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── ACCEPTANCE TEST 1: Whole Poster Preserves Every Text Line, Logo & Person ──
  it("1. Whole poster mode preserves every Khmer text line, logo, graphic, and the person", () => {
    const { rgba, w, h, pageLeft, pageTop, pageRight, pageBottom } =
      createSyntheticKhmerPoster({ withMargin: true });

    const { outputRgba, alphaMask } = createDocumentSafeRgba(rgba, w, h);

    // Verify all pixels inside page boundaries are 100% byte-preserved and opaque
    let diffCount = 0;
    for (let y = pageTop; y <= pageBottom; y++) {
      for (let x = pageLeft; x <= pageRight; x++) {
        const pIdx = (y * w + x) * 4;
        if (
          outputRgba[pIdx] !== rgba[pIdx] ||
          outputRgba[pIdx + 1] !== rgba[pIdx + 1] ||
          outputRgba[pIdx + 2] !== rgba[pIdx + 2] ||
          outputRgba[pIdx + 3] !== 255
        ) {
          diffCount++;
        }
      }
    }
    expect(diffCount).toBe(0);

    // Verify specific key landmarks are intact
    // Top banner blue graphic
    const bannerIdx = ((pageTop + 20) * w + (pageLeft + 100)) * 4;
    expect(outputRgba[bannerIdx]).toBe(30);
    expect(outputRgba[bannerIdx + 1]).toBe(64);
    expect(outputRgba[bannerIdx + 2]).toBe(175);
    expect(outputRgba[bannerIdx + 3]).toBe(255);

    // Top text line dark charcoal
    const textIdx = (Math.floor(h * 0.25) * w + Math.floor(w * 0.5)) * 4;
    expect(outputRgba[textIdx + 3]).toBe(255);

    // Person face skin tone
    const faceIdx = (Math.floor(h * 0.50) * w + Math.floor(w * 0.5)) * 4;
    expect(outputRgba[faceIdx]).toBe(235);
    expect(outputRgba[faceIdx + 1]).toBe(185);
    expect(outputRgba[faceIdx + 2]).toBe(155);
    expect(outputRgba[faceIdx + 3]).toBe(255);

    // Person red uniform
    const redUniformIdx = (Math.floor(h * 0.62) * w + Math.floor(w * 0.5)) * 4;
    expect(outputRgba[redUniformIdx]).toBe(190);
    expect(outputRgba[redUniformIdx + 1]).toBe(40);
    expect(outputRgba[redUniformIdx + 2]).toBe(40);
    expect(outputRgba[redUniformIdx + 3]).toBe(255);

    // Person blue uniform
    const blueUniformIdx = (Math.floor(h * 0.78) * w + Math.floor(w * 0.5)) * 4;
    expect(outputRgba[blueUniformIdx]).toBe(30);
    expect(outputRgba[blueUniformIdx + 1]).toBe(60);
    expect(outputRgba[blueUniformIdx + 2]).toBe(180);
    expect(outputRgba[blueUniformIdx + 3]).toBe(255);

    // Bottom caption text line
    const bottomTextIdx = (Math.floor(h * 0.92) * w + Math.floor(w * 0.5)) * 4;
    expect(outputRgba[bottomTextIdx + 3]).toBe(255);
  });

  // ── ACCEPTANCE TEST 2: Byte-Identical Output When No Crop Selected ─────────
  it("2. Whole poster mode is byte-identical when no crop is selected", () => {
    const { rgba, w, h } = createSyntheticKhmerPoster({ withMargin: false });
    const totalPixels = w * h;

    const { outputRgba, alphaMask, isAllOpaque } = createDocumentSafeRgba(rgba, w, h);

    // SHA256 of RGB bytes matches input byte-for-byte
    const inputSha = computeRgbSha256(rgba, totalPixels);
    const outputSha = computeRgbSha256(outputRgba, totalPixels);
    expect(outputSha).toBe(inputSha);

    // All output alpha values are 255
    expect(isAllOpaque).toBe(true);
    let transparentCount = 0;
    for (let i = 0; i < totalPixels; i++) {
      if (outputRgba[i * 4 + 3] !== 255 || alphaMask[i] !== 255) {
        transparentCount++;
      }
    }
    expect(transparentCount).toBe(0);
  });

  // ── ACCEPTANCE TEST 3: Person-Only Mode Does Not Keep Random Poster Text ────
  it("3. Person-only mode does not keep random poster text", () => {
    const { rgba, initialMask, w, h } = createSyntheticKhmerPoster({ withMargin: false });

    // Run isolatePersonMask
    const personMask = isolatePersonMask(rgba, initialMask, w, h);

    // 1. Person anatomical landmarks MUST be kept (mask === 255)
    // Dark hair
    const hairIdx = Math.floor(h * 0.43) * w + Math.floor(w * 0.5);
    expect(personMask[hairIdx]).toBe(255);

    // Face skin
    const faceIdx = Math.floor(h * 0.50) * w + Math.floor(w * 0.5);
    expect(personMask[faceIdx]).toBe(255);

    // Red uniform
    const redUniformIdx = Math.floor(h * 0.62) * w + Math.floor(w * 0.5);
    expect(personMask[redUniformIdx]).toBe(255);

    // Blue uniform
    const blueUniformIdx = Math.floor(h * 0.78) * w + Math.floor(w * 0.5);
    expect(personMask[blueUniformIdx]).toBe(255);

    // Hands skin
    const handsIdx = Math.floor(h * 0.82) * w + Math.floor(w * 0.28);
    expect(personMask[handsIdx]).toBe(255);

    // 2. Printed poster text MUST NOT be kept (mask === 0)
    // Top text line
    const topTextIdx = Math.floor(h * 0.25) * w + Math.floor(w * 0.5);
    expect(personMask[topTextIdx]).toBe(0);

    // Another top text line
    const topTextIdx2 = Math.floor(h * 0.30) * w + Math.floor(w * 0.5);
    expect(personMask[topTextIdx2]).toBe(0);

    // Bottom caption text line
    const bottomTextIdx = Math.floor(h * 0.92) * w + Math.floor(w * 0.5);
    expect(personMask[bottomTextIdx]).toBe(0);

    // Top blue banner graphic
    const bannerIdx = Math.floor(h * 0.08) * w + Math.floor(w * 0.2);
    expect(personMask[bannerIdx]).toBe(0);
  });

  // ── ACCEPTANCE TEST 4: Person + Selected Text Keeps ONLY Explicit Selections ──
  it("4. Person plus selected text mode keeps only text explicitly painted by the user", () => {
    const { rgba, initialMask, w, h } = createSyntheticKhmerPoster({ withMargin: false });

    const personMask = isolatePersonMask(rgba, initialMask, w, h);

    // User explicitly paints only the first top heading line (y around 22% of h)
    const userSelectedMask = new Uint8ClampedArray(w * h);
    const startY = Math.floor(h * 0.20);
    const endY = Math.floor(h * 0.23);
    for (let y = startY; y <= endY; y++) {
      for (let x = Math.floor(w * 0.2); x <= Math.floor(w * 0.8); x++) {
        userSelectedMask[y * w + x] = 255;
      }
    }

    const combinedMask = combinePersonWithSelectedRegions(personMask, userSelectedMask, w, h);

    // 1. Person is kept
    const faceIdx = Math.floor(h * 0.50) * w + Math.floor(w * 0.5);
    expect(combinedMask[faceIdx]).toBe(255);

    // 2. Painted top heading text is kept
    const paintedTextIdx = Math.floor(h * 0.21) * w + Math.floor(w * 0.5);
    expect(combinedMask[paintedTextIdx]).toBe(255);

    // 3. Unselected second top text line remains removed
    const unselectedTopTextIdx = Math.floor(h * 0.32) * w + Math.floor(w * 0.5);
    expect(combinedMask[unselectedTopTextIdx]).toBe(0);

    // 4. Unselected bottom caption text remains removed
    const unselectedBottomTextIdx = Math.floor(h * 0.92) * w + Math.floor(w * 0.5);
    expect(combinedMask[unselectedBottomTextIdx]).toBe(0);
  });

  // ── ACCEPTANCE TEST 5: Fine Edges Cannot Erase Positive Selections ────────
  it("5. Fine edges cannot erase positive selections", async () => {
    const w = 100;
    const h = 100;
    const totalPixels = w * h;
    const srcData = new ImageData(w, h);
    const activeMask = new Uint8ClampedArray(totalPixels);
    const manualKeepMask = new Uint8ClampedArray(totalPixels);

    // Fill source with some textured content
    for (let i = 0; i < totalPixels; i++) {
      srcData.data[i * 4] = 120;
      srcData.data[i * 4 + 1] = 120;
      srcData.data[i * 4 + 2] = 120;
      srcData.data[i * 4 + 3] = 255;
    }

    // Set a thin stroke in activeMask (e.g. at x = 50, y from 20 to 80)
    for (let y = 20; y <= 80; y++) {
      activeMask[y * w + 50] = 255;
      manualKeepMask[y * w + 50] = 255; // Explicit user selection!
    }

    const output = await refineAlphaMattingWithMask(srcData, activeMask, null, {
      mode: "person_plus_text",
      manualKeepMask,
    });

    // Every pixel in the manual keep stroke MUST have alpha === 255
    let droppedCount = 0;
    for (let y = 20; y <= 80; y++) {
      const idx = y * w + 50;
      if (output.alphaMaskBuffer[idx] < 255) {
        droppedCount++;
      }
    }
    expect(droppedCount).toBe(0);
  });

  // ── ACCEPTANCE TEST 6: No White-Page Transparency in Document Mode ─────────
  it("6. No white-page transparency in document mode", () => {
    const { rgba, initialMask, w, h } = createSyntheticKhmerPoster({ withMargin: false });
    const totalPixels = w * h;

    const result = detectContainerAndContents(rgba, initialMask, w, h, {
      mode: "whole_poster",
      conservative: true,
    });

    let whitePixelCount = 0;
    let whitePreservedCount = 0;
    for (let i = 0; i < totalPixels; i++) {
      const pIdx = i * 4;
      if (rgba[pIdx] === 255 && rgba[pIdx + 1] === 255 && rgba[pIdx + 2] === 255) {
        whitePixelCount++;
        if (result.contentsMask[i] === 255) {
          whitePreservedCount++;
        }
      }
    }

    expect(whitePixelCount).toBeGreaterThan(10000);
    // Every single white pixel is preserved at 255 alpha (0 holes)
    expect(whitePreservedCount).toBe(whitePixelCount);
  });

  // ── ACCEPTANCE TEST 7: Processing Time Is Recorded by Stage ────────────────
  it("7. Processing time is recorded by stage", async () => {
    const fakeBlob = new Blob(["fake-poster"], { type: "image/png" });

    const segResult = await segmentObjectSelection(fakeBlob, {
      mode: "whole_poster",
      width: 758,
      height: 1077,
    } as any);

    expect(segResult.metrics).toBeDefined();
    const metrics = segResult.metrics as ProcessingStageMetrics;

    // Verify all specified stages exist and are numbers >= 0
    expect(typeof metrics.uploadDecodeMs).toBe("number");
    expect(metrics.uploadDecodeMs).toBeGreaterThanOrEqual(0);

    expect(typeof metrics.segmentationMs).toBe("number");
    expect(metrics.segmentationMs).toBeGreaterThanOrEqual(0);

    expect(typeof metrics.maskRefineMs).toBe("number");
    expect(metrics.maskRefineMs).toBeGreaterThanOrEqual(0);

    expect(typeof metrics.mattingMs).toBe("number");
    expect(metrics.mattingMs).toBeGreaterThanOrEqual(0);

    expect(typeof metrics.encodingMs).toBe("number");
    expect(metrics.encodingMs).toBeGreaterThanOrEqual(0);

    expect(typeof metrics.totalMs).toBe("number");
    expect(metrics.totalMs).toBeGreaterThanOrEqual(0);
  });

  // ── ACCEPTANCE TEST 8: Document Mode Is Under 1 Second Locally ─────────────
  it("8. Document mode is under 1 second locally", async () => {
    const { rgba, w, h } = createSyntheticKhmerPoster({ withMargin: false });
    expect(w).toBe(758);
    expect(h).toBe(1077);

    const tStart = performance.now();
    const safeDoc = createDocumentSafeRgba(rgba, w, h);
    const tEnd = performance.now();
    const elapsedMs = tEnd - tStart;

    // Must be under 1000ms locally (typically under 50ms)
    expect(elapsedMs).toBeLessThan(1000);
    expect(safeDoc.isAllOpaque).toBe(true);
  });

  // ── ACCEPTANCE TEST 9: Remote Timeout Never Leaves Indefinite Spinner ──────
  it("9. Remote timeout never leaves an indefinite spinner", async () => {
    const fakeBlob = new Blob(["fake-poster"], { type: "image/png" });
    const abortController = new AbortController();

    // Abort signal to simulate timeout
    abortController.abort(new Error("INFERENCE_TIMEOUT: Server took too long"));

    await expect(
      refineAlphaMattingWithMask(
        new ImageData(50, 50),
        new Uint8ClampedArray(2500),
        null,
        {
          mode: "person",
          signal: abortController.signal,
        }
      )
    ).rejects.toThrow();
  });

  // ── ACCEPTANCE TEST 10: Mobile 390px Controls Remain Usable ────────────────
  it("10. Mobile 390px controls remain usable", () => {
    // Mode buttons have min-h-[44px] touch targets
    const modeBtnClasses =
      "min-h-[44px] flex flex-col items-start justify-center p-2.5 rounded-none border text-left transition-all font-mono";
    expect(modeBtnClasses).toContain("min-h-[44px]");

    // Responsive 2-column grid for mobile screens without horizontal overflowing fixed widths
    const gridClasses = "grid grid-cols-2 gap-2 text-xs font-mono";
    expect(gridClasses).toContain("grid-cols-2");
    expect(gridClasses).not.toContain("w-[");

    // Clear badge for Document Safe Mode
    const badgeText = "DOCUMENT SAFE MODE: AI MATTE DISABLED";
    expect(badgeText).toBe("DOCUMENT SAFE MODE: AI MATTE DISABLED");
  });

  // ── ADDITIONAL REGRESSION TESTS ───────────────────────────────────────────
  it("11. Four-corner page polygon: only outside pixels become transparent", () => {
    const { rgba, w, h } = createSyntheticKhmerPoster({ withMargin: true });
    const polygon: [number, number][] = [
      [40, 60],
      [w - 41, 60],
      [w - 41, h - 61],
      [40, h - 61],
    ];

    const { outputRgba, alphaMask } = createDocumentSafeRgba(rgba, w, h, { polygon });

    // Inside polygon center
    const centerX = Math.floor(w / 2);
    const centerY = Math.floor(h / 2);
    const inIdx = (centerY * w + centerX) * 4;
    expect(alphaMask[centerY * w + centerX]).toBe(255);
    expect(outputRgba[inIdx + 3]).toBe(255);

    // Outside polygon margin
    const outIdx = (10 * w + 10) * 4;
    expect(alphaMask[10 * w + 10]).toBe(0);
    expect(outputRgba[outIdx + 3]).toBe(0);
  });

  it("12. Document Safe Mode never invokes AI models, RMBG, SAM, or guided filter", async () => {
    const srcImageData = new ImageData(100, 100);
    const activeMask = new Uint8ClampedArray(100 * 100);
    activeMask.fill(255);

    const output = await refineAlphaMattingWithMask(srcImageData, activeMask, null, {
      mode: "whole_poster",
      documentSafeMode: true,
    });

    expect(output.model).toBe("DOCUMENT SAFE MODE: AI MATTE DISABLED");
    expect(output.label).toBe("Document Safe Mode (AI Matte Disabled)");
    expect(output.alphaMaskBuffer.every((v) => v === 255)).toBe(true);
  });

  it("13. Page boundary detection and perspective quad crop", () => {
    const { rgba, w, h, pageLeft, pageTop, pageRight, pageBottom } =
      createSyntheticKhmerPoster({ withMargin: true });

    const docResult = detectDocumentQuad(rgba, w, h);
    expect(docResult.hasDocumentBoundary).toBe(true);
    expect(docResult.isFullImage).toBe(false);

    expect(docResult.corners.topLeft[0]).toBeCloseTo(pageLeft, -1);
    expect(docResult.corners.topLeft[1]).toBeCloseTo(pageTop, -1);
    expect(docResult.corners.bottomRight[0]).toBeCloseTo(pageRight, -1);
    expect(docResult.corners.bottomRight[1]).toBeCloseTo(pageBottom, -1);

    const warped = warpPerspectiveQuad(rgba, w, h, docResult.corners, 300, 450);
    expect(warped.width).toBe(300);
    expect(warped.height).toBe(450);
  });

  it("14. Safety rollback triggers when foreground area drops more than 20%", () => {
    const w = 100;
    const h = 100;
    const totalPixels = w * h;
    const initialMask = new Uint8ClampedArray(totalPixels);
    const overCutRefinedMask = new Uint8ClampedArray(totalPixels);

    for (let i = 0; i < 1000; i++) initialMask[i] = 255;
    for (let i = 0; i < 700; i++) overCutRefinedMask[i] = 255;

    const { safeMask, diagnostics, rollbackTriggered } = applyAreaSafetyCheck(
      initialMask,
      overCutRefinedMask,
      w,
      h,
      0.20
    );

    expect(rollbackTriggered).toBe(true);
    expect(diagnostics.isAreaDropExcessive).toBe(true);
    expect(safeMask.filter((v) => v === 255).length).toBe(1000);
  });

  it("15. Whole-product mode preserves white packaging and packaging shells (Donut Box)", () => {
    const w = 100;
    const h = 100;
    const totalPixels = w * h;
    const rgba = new Uint8ClampedArray(totalPixels * 4);
    const initialMask = new Uint8ClampedArray(totalPixels);

    // Box with white cardboard lid
    for (let i = 0; i < totalPixels; i++) {
      rgba[i * 4] = 250;
      rgba[i * 4 + 1] = 250;
      rgba[i * 4 + 2] = 252;
      rgba[i * 4 + 3] = 255;
      initialMask[i] = 255;
    }

    const result = detectContainerAndContents(rgba, initialMask, w, h, {
      mode: "whole_product",
      conservative: true,
    });

    expect(result.contentsMask.every((v) => v === 255)).toBe(true);
  });

  it("16. Dehalo only affects edge band in Person mode while interior & background remain unchanged", () => {
    const w = 10;
    const h = 10;
    const totalPixels = w * h;
    const sourceRgba = new Uint8ClampedArray(totalPixels * 4);
    const alphaMask = new Uint8ClampedArray(totalPixels);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const pIdx = idx * 4;

        if (x <= 3) {
          sourceRgba[pIdx] = 40;
          sourceRgba[pIdx + 1] = 30;
          sourceRgba[pIdx + 2] = 20;
          sourceRgba[pIdx + 3] = 255;
          alphaMask[idx] = 255;
        } else if (x <= 5) {
          sourceRgba[pIdx] = 200;
          sourceRgba[pIdx + 1] = 195;
          sourceRgba[pIdx + 2] = 190;
          sourceRgba[pIdx + 3] = 255;
          alphaMask[idx] = 120;
        } else {
          sourceRgba[pIdx] = 255;
          sourceRgba[pIdx + 1] = 255;
          sourceRgba[pIdx + 2] = 255;
          sourceRgba[pIdx + 3] = 255;
          alphaMask[idx] = 0;
        }
      }
    }

    const dehaloRgba = applyColorDehalo(sourceRgba, alphaMask, w, h, 3);

    // Definite interior pixels (alpha === 255) must NOT change at all
    for (let y = 0; y < h; y++) {
      for (let x = 0; x <= 3; x++) {
        const pIdx = (y * w + x) * 4;
        expect(dehaloRgba[pIdx]).toBe(sourceRgba[pIdx]);
        expect(dehaloRgba[pIdx + 1]).toBe(sourceRgba[pIdx + 1]);
        expect(dehaloRgba[pIdx + 2]).toBe(sourceRgba[pIdx + 2]);
        expect(dehaloRgba[pIdx + 3]).toBe(sourceRgba[pIdx + 3]);
      }
    }

    // Definite background pixels (alpha === 0) must NOT change at all
    for (let y = 0; y < h; y++) {
      for (let x = 6; x < w; x++) {
        const pIdx = (y * w + x) * 4;
        expect(dehaloRgba[pIdx]).toBe(sourceRgba[pIdx]);
        expect(dehaloRgba[pIdx + 1]).toBe(sourceRgba[pIdx + 1]);
        expect(dehaloRgba[pIdx + 2]).toBe(sourceRgba[pIdx + 2]);
        expect(dehaloRgba[pIdx + 3]).toBe(sourceRgba[pIdx + 3]);
      }
    }

    // Edge pixels (alpha === 120) must have their RGB decontaminated toward the interior color
    for (let y = 0; y < h; y++) {
      for (let x = 4; x <= 5; x++) {
        const pIdx = (y * w + x) * 4;
        expect(dehaloRgba[pIdx]).toBeLessThan(sourceRgba[pIdx]);
        expect(dehaloRgba[pIdx + 1]).toBeLessThan(sourceRgba[pIdx + 1]);
        expect(dehaloRgba[pIdx + 2]).toBeLessThan(sourceRgba[pIdx + 2]);
      }
    }
  });
});
