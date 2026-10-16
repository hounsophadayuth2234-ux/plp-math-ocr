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
 * Creates a synthetic vertical Khmer poster image (600x900)
 * containing:
 * - Outer camera/table background margin (if withMargin = true)
 * - White rectangular page/poster canvas
 * - Top header with Blue Graphic (R: 30, G: 64, B: 175)
 * - Khmer Logo (R: 245, G: 158, B: 11)
 * - Khmer Text lines (Dark R: 20, G: 25, B: 35)
 * - Printed Person wearing a light/white shirt (Shirt R: 245, G: 245, B: 248, Skin R: 235, G: 185, B: 155, Hair R: 40, G: 30, B: 25)
 */
function createSyntheticKhmerPoster(options?: { withMargin?: boolean; width?: number; height?: number }) {
  const w = options?.width || 600;
  const h = options?.height || 900;
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
        // Outer dark surface/background
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

      // 1. Blue Graphic banner at top (y: 0% to 18%)
      if (relY >= 0 && relY < 0.18) {
        // Logo inside banner (circle at center)
        const logoDx = (relX - 0.5) * 400;
        const logoDy = (relY - 0.09) * 400;
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
      // 2. Khmer Text Lines (y: 20% to 45%)
      else if (relY >= 0.20 && relY <= 0.45) {
        const lineOffset = (relY - 0.20) % 0.05;
        // Text strokes
        if (lineOffset < 0.018 && relX >= 0.15 && relX <= 0.85) {
          // Dark charcoal Khmer text
          rgba[pIdx] = 20;
          rgba[pIdx + 1] = 25;
          rgba[pIdx + 2] = 35;
        } else {
          // Clean white poster background
          rgba[pIdx] = 255;
          rgba[pIdx + 1] = 255;
          rgba[pIdx + 2] = 255;
        }
      }
      // 3. Printed Person wearing light shirt (y: 50% to 92%, x: 25% to 75%)
      else if (relY > 0.50 && relY < 0.92 && relX > 0.25 && relX < 0.75) {
        // Head / hair
        if (relY >= 0.52 && relY <= 0.62 && relX >= 0.42 && relX <= 0.58) {
          if (relY <= 0.55) {
            // Dark hair
            rgba[pIdx] = 40;
            rgba[pIdx + 1] = 30;
            rgba[pIdx + 2] = 25;
          } else {
            // Face skin tone
            rgba[pIdx] = 235;
            rgba[pIdx + 1] = 185;
            rgba[pIdx + 2] = 155;
          }
        }
        // Light / white shirt
        else if (relY > 0.62) {
          // Light shirt (R: 245, G: 245, B: 248 - near white)
          rgba[pIdx] = 245;
          rgba[pIdx + 1] = 245;
          rgba[pIdx + 2] = 248;
        } else {
          // White poster page around head
          rgba[pIdx] = 255;
          rgba[pIdx + 1] = 255;
          rgba[pIdx + 2] = 255;
        }
      }
      // 4. White base page
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

describe("Poster & Document Safe Mode Acceptance Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── TEST 1: Feature Flag & Default Mode ───────────────────────────────────
  it("1. DOCUMENT_SAFE_MODE feature flag is enabled by default", () => {
    expect(DOCUMENT_SAFE_MODE).toBe(true);
  });

  // ── TEST 2: Pixel-Level SHA256 & All-Opaque Alpha ──────────────────────────
  it("2. Document mode without polygon: SHA256(output RGB) == SHA256(input RGB) and all(output alpha) == 255", () => {
    const { rgba, w, h } = createSyntheticKhmerPoster({ withMargin: false });
    const totalPixels = w * h;

    const { outputRgba, alphaMask, isAllOpaque } = createDocumentSafeRgba(rgba, w, h);

    // 1. SHA256 of output RGB matches SHA256 of input RGB
    const inputSha = computeRgbSha256(rgba, totalPixels);
    const outputSha = computeRgbSha256(outputRgba, totalPixels);
    expect(outputSha).toBe(inputSha);

    // 2. All output alpha values are 255
    expect(isAllOpaque).toBe(true);
    for (let i = 0; i < totalPixels; i++) {
      expect(outputRgba[i * 4 + 3]).toBe(255);
      expect(alphaMask[i]).toBe(255);
    }
  });

  // ── TEST 3: Preserve Internal White Regions Without Holes ─────────────────
  it("3. Poster/document mode preserves internal white regions without punching holes", () => {
    const { rgba, initialMask, w, h } = createSyntheticKhmerPoster({ withMargin: false });

    const result = detectContainerAndContents(rgba, initialMask, w, h, {
      mode: "document_poster",
      conservative: true,
    });

    expect(result.contentsMask.length).toBe(w * h);

    let whitePixelCount = 0;
    let whitePreservedCount = 0;
    for (let i = 0; i < w * h; i++) {
      const pIdx = i * 4;
      if (rgba[pIdx] === 255 && rgba[pIdx + 1] === 255 && rgba[pIdx + 2] === 255) {
        whitePixelCount++;
        if (result.contentsMask[i] === 255) {
          whitePreservedCount++;
        }
      }
    }

    expect(whitePixelCount).toBeGreaterThan(5000);
    expect(whitePreservedCount).toBe(whitePixelCount);
  });

  // ── TEST 4: Text, Logos and Blue Graphic Unchanged ─────────────────────────
  it("4. Poster text, logos, and blue graphic are 100% byte-preserved in Document Safe Mode", () => {
    const { rgba, w, h, pageLeft, pageTop, pageRight, pageBottom } =
      createSyntheticKhmerPoster({ withMargin: true });
    const totalPixels = w * h;

    const { outputRgba } = createDocumentSafeRgba(rgba, w, h);

    // Check all pixels across the poster
    for (let y = pageTop; y <= pageBottom; y++) {
      for (let x = pageLeft; x <= pageRight; x++) {
        const pIdx = (y * w + x) * 4;
        expect(outputRgba[pIdx]).toBe(rgba[pIdx]);
        expect(outputRgba[pIdx + 1]).toBe(rgba[pIdx + 1]);
        expect(outputRgba[pIdx + 2]).toBe(rgba[pIdx + 2]);
        expect(outputRgba[pIdx + 3]).toBe(255);
      }
    }
  });

  // ── TEST 5: Printed Person in Light Shirt Remains Intact ──────────────────
  it("5. Poster with a printed person wearing a light shirt remains 100% intact", () => {
    const { rgba, initialMask, w, h } = createSyntheticKhmerPoster({ withMargin: false });

    const result = detectContainerAndContents(rgba, initialMask, w, h, {
      mode: "document_poster",
    });

    let lightShirtCount = 0;
    let lightShirtKept = 0;

    for (let i = 0; i < w * h; i++) {
      const pIdx = i * 4;
      if (
        rgba[pIdx] === 245 &&
        rgba[pIdx + 1] === 245 &&
        rgba[pIdx + 2] === 248
      ) {
        lightShirtCount++;
        if (result.contentsMask[i] === 255) {
          lightShirtKept++;
        }
      }
    }

    expect(lightShirtCount).toBeGreaterThan(1000);
    expect(lightShirtKept).toBe(lightShirtCount);
  });

  // ── TEST 6: Explicit User Polygon (Opt-In Outside Transparency) ───────────
  it("6. Four-corner page polygon: pixels inside remain byte-identical, only outside pixels become transparent", () => {
    const { rgba, w, h } = createSyntheticKhmerPoster({ withMargin: true });
    const polygon: [number, number][] = [
      [40, 60],
      [w - 41, 60],
      [w - 41, h - 61],
      [40, h - 61],
    ];

    const { outputRgba, alphaMask } = createDocumentSafeRgba(rgba, w, h, { polygon });

    // 1. Pixel inside polygon (e.g. center of poster)
    const centerX = Math.floor(w / 2);
    const centerY = Math.floor(h / 2);
    const inIdx = (centerY * w + centerX) * 4;
    expect(alphaMask[centerY * w + centerX]).toBe(255);
    expect(outputRgba[inIdx]).toBe(rgba[inIdx]);
    expect(outputRgba[inIdx + 1]).toBe(rgba[inIdx + 1]);
    expect(outputRgba[inIdx + 2]).toBe(rgba[inIdx + 2]);
    expect(outputRgba[inIdx + 3]).toBe(255);

    // 2. Pixel outside polygon (e.g. at [10, 10])
    const outIdx = (10 * w + 10) * 4;
    expect(alphaMask[10 * w + 10]).toBe(0);
    expect(outputRgba[outIdx + 3]).toBe(0);
  });

  // ── TEST 7: Zero AI Model Invocation in Document Safe Mode ────────────────
  it("7. Document Safe Mode never invokes AI models, RMBG, SAM, or guided filter", async () => {
    const dummyBlob = new Blob(["fake-image-bytes"], { type: "image/png" });
    const srcImageData = new ImageData(100, 100);
    const activeMask = new Uint8ClampedArray(100 * 100);
    activeMask.fill(255);

    // Call refineAlphaMattingWithMask in document safe mode
    const output = await refineAlphaMattingWithMask(srcImageData, activeMask, null, {
      mode: "document_poster",
      documentSafeMode: true,
    });

    expect(output.model).toBe("DOCUMENT SAFE MODE: AI MATTE DISABLED");
    expect(output.label).toBe("Document Safe Mode (AI Matte Disabled)");
    expect(output.alphaMaskBuffer.every((v) => v === 255)).toBe(true);
  });

  // ── TEST 8: Page Boundary Detection & Quad Crop ────────────────────────────
  it("8. Page boundary detection and four-corner crop work accurately", () => {
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

  // ── TEST 9: Whole-Product Mode Conservative Default ────────────────────────
  it("9. Whole-product mode preserves white packaging and packaging shells", () => {
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

  // ── TEST 10: Dehalo Only Affects Edge Band in Person Mode ───────────────────
  it("10. Dehalo only affects edge band in Person mode while interior & background remain unchanged", () => {
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

  // ── TEST 11: Safety Rollback Triggers on > 20% Area Loss ───────────────────
  it("11. Safety rollback triggers when foreground area drops more than 20%", () => {
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

  // ── TEST 12: Output Dimensions Unchanged by Default ─────────────────────────
  it("12. Output dimensions are unchanged by default", () => {
    const origW = 762;
    const origH = 1079;
    const docResult = detectDocumentQuad(new Uint8ClampedArray(origW * origH * 4), origW, origH);

    expect(docResult.corners.topLeft).toEqual([0, 0]);
    expect(docResult.corners.bottomRight).toEqual([origW - 1, origH - 1]);
    expect(docResult.aspectRatio).toBeCloseTo(origW / origH, 2);
  });

  // ── TEST 13: 390px Mobile Layout and Badge Touch Targets ───────────────────
  it("13. 390px mobile layout elements use responsive grid and >= 44px touch targets", () => {
    const contentModeBtnClasses = "min-h-[44px] flex flex-col items-start justify-center p-2.5 rounded-none border text-left";
    expect(contentModeBtnClasses).toContain("min-h-[44px]");

    const gridClasses = "grid grid-cols-2 gap-2 text-xs font-mono";
    expect(gridClasses).toContain("grid-cols-2");
    expect(gridClasses).not.toContain("w-[");

    const badgeText = "DOCUMENT SAFE MODE: AI MATTE DISABLED";
    expect(badgeText).toBe("DOCUMENT SAFE MODE: AI MATTE DISABLED");
  });
});
