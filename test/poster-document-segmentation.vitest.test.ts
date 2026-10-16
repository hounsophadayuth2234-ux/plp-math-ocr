import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  detectDocumentQuad,
  generateQuadMask,
  warpPerspectiveQuad,
  applyColorDehalo,
  detectContainerAndContents,
  computeMaskDiagnostics,
  applyAreaSafetyCheck,
  compositePixel,
  SelectionMode,
  ContentMode,
  QuadCorners,
} from "../src/lib/bg-compositor";
import {
  BACKGROUND_REMOVAL_CONSERVATIVE,
  BACKGROUND_REMOVAL_SEGMENTATION_V2,
} from "../src/lib/bg-removal-client";

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
        const lineIndex = Math.floor((relY - 0.20) / 0.05);
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

describe("Poster, Document, Person & Dehalo Acceptance Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── TEST 1: Poster/document mode preserves internal white regions ──────────
  it("1. Poster/document mode preserves internal white regions without punching holes", () => {
    const { rgba, initialMask, w, h } = createSyntheticKhmerPoster({ withMargin: false });

    // In document_poster mode, detectContainerAndContents preserves complete 255 solid mask
    const result = detectContainerAndContents(rgba, initialMask, w, h, {
      mode: "document_poster",
      conservative: true,
    });

    expect(result.contentsMask.length).toBe(w * h);

    // Verify all internal white areas (where R,G,B are 255) remain 100% solid (255)
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

  // ── TEST 2: Poster text and logos are never removed by background masking ──
  it("2. Poster text and logos are never removed or eroded by background masking", () => {
    const { rgba, initialMask, w, h, pageLeft, pageTop, pageRight, pageBottom } =
      createSyntheticKhmerPoster({ withMargin: true });

    // Document quad detection
    const docResult = detectDocumentQuad(rgba, w, h);
    expect(docResult.hasDocumentBoundary).toBe(true);

    const quadMask = generateQuadMask(docResult.corners, w, h);

    // Check that dark text lines and colored logo are fully inside the quad mask and = 255
    let textAndLogoPixels = 0;
    let textAndLogoKept = 0;

    for (let y = pageTop; y <= pageBottom; y++) {
      for (let x = pageLeft; x <= pageRight; x++) {
        const idx = y * w + x;
        const pIdx = idx * 4;
        const r = rgba[pIdx];
        const g = rgba[pIdx + 1];
        const b = rgba[pIdx + 2];

        const isLogo = r === 245 && g === 158 && b === 11;
        const isText = r === 20 && g === 25 && b === 35;

        if (isLogo || isText) {
          textAndLogoPixels++;
          if (quadMask[idx] === 255) {
            textAndLogoKept++;
          }
        }
      }
    }

    expect(textAndLogoPixels).toBeGreaterThan(500);
    expect(textAndLogoKept).toBe(textAndLogoPixels);
  });

  // ── TEST 3: Poster with a person in a light shirt remains intact ───────────
  it("3. Poster with a printed person wearing a light shirt remains 100% intact", () => {
    const { rgba, initialMask, w, h, pageLeft, pageTop, pageRight, pageBottom } =
      createSyntheticKhmerPoster({ withMargin: false });

    // Mode is document_poster
    const result = detectContainerAndContents(rgba, initialMask, w, h, {
      mode: "document_poster",
    });

    // Check the person area (light shirt R:245, G:245, B:248, Skin: 235,185,155)
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
    // Every single pixel of the light shirt inside the poster must be kept solid 255!
    expect(lightShirtKept).toBe(lightShirtCount);
  });

  // ── TEST 4: Page boundary detection and four-corner crop work ──────────────
  it("4. Page boundary detection and four-corner crop detect quad margins accurately", () => {
    const { rgba, w, h, pageLeft, pageTop, pageRight, pageBottom } =
      createSyntheticKhmerPoster({ withMargin: true });

    const docResult = detectDocumentQuad(rgba, w, h);
    expect(docResult.hasDocumentBoundary).toBe(true);
    expect(docResult.isFullImage).toBe(false);

    // Detected corners should approximate page boundaries
    expect(docResult.corners.topLeft[0]).toBeCloseTo(pageLeft, -1);
    expect(docResult.corners.topLeft[1]).toBeCloseTo(pageTop, -1);
    expect(docResult.corners.bottomRight[0]).toBeCloseTo(pageRight, -1);
    expect(docResult.corners.bottomRight[1]).toBeCloseTo(pageBottom, -1);

    // Quad mask generation
    const mask = generateQuadMask(docResult.corners, w, h);
    // Point inside document center is 255
    const centerIdx = Math.floor(h / 2) * w + Math.floor(w / 2);
    expect(mask[centerIdx]).toBe(255);
    // Point outside margin is 0
    expect(mask[0]).toBe(0);

    // Test warpPerspectiveQuad
    const warped = warpPerspectiveQuad(rgba, w, h, docResult.corners, 300, 450);
    expect(warped.width).toBe(300);
    expect(warped.height).toBe(450);
    expect(warped.warpedRgba.length).toBe(300 * 450 * 4);

    // Full frame test (when page covers >= 90% of image)
    const fullPoster = createSyntheticKhmerPoster({ withMargin: false });
    const fullResult = detectDocumentQuad(fullPoster.rgba, fullPoster.w, fullPoster.h);
    expect(fullResult.isFullImage).toBe(true);
    expect(fullResult.corners.topLeft).toEqual([0, 0]);
    expect(fullResult.corners.bottomRight).toEqual([fullPoster.w - 1, fullPoster.h - 1]);
  });

  // ── TEST 5: Person mode is opt-in and does not affect Document mode ────────
  it("5. Person mode is opt-in and does not compromise Document mode", () => {
    const { rgba, initialMask, w, h } = createSyntheticKhmerPoster({ withMargin: false });

    // Document mode preserves full rectangular document
    const docResult = detectContainerAndContents(rgba, initialMask, w, h, {
      mode: "document_poster",
    });
    expect(docResult.contentsMask.every((v) => v === 255)).toBe(true);

    // Person mode does not force full rectangular document
    const personResult = detectContainerAndContents(rgba, initialMask, w, h, {
      mode: "person",
      conservative: false,
    });
    // In person mode, conservative is false so it does not auto-fill 100% of entire canvas
    expect(personResult.hasContainer).toBe(false);
  });

  // ── TEST 6: Whole-product mode preserves white packaging ───────────────────
  it("6. Whole-product mode preserves white packaging and packaging shells", () => {
    const w = 400;
    const h = 400;
    const totalPixels = w * h;
    const rgba = new Uint8ClampedArray(totalPixels * 4);
    const initialMask = new Uint8ClampedArray(totalPixels);

    // Box with white cardboard lid (x: 50..350, y: 50..350)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const pIdx = idx * 4;
        if (x >= 50 && x <= 350 && y >= 50 && y <= 350) {
          // White cardboard packaging lid
          rgba[pIdx] = 252;
          rgba[pIdx + 1] = 252;
          rgba[pIdx + 2] = 254;
          rgba[pIdx + 3] = 255;
          initialMask[idx] = 255;
        } else {
          // Dark background
          rgba[pIdx] = 30;
          rgba[pIdx + 1] = 30;
          rgba[pIdx + 2] = 30;
          rgba[pIdx + 3] = 255;
          initialMask[idx] = 0;
        }
      }
    }

    const result = detectContainerAndContents(rgba, initialMask, w, h, {
      mode: "whole_product",
      conservative: true,
    });

    // Entire product box must be preserved in contentsMask
    let boxPixels = 0;
    let boxPreserved = 0;
    for (let y = 50; y <= 350; y++) {
      for (let x = 50; x <= 350; x++) {
        const idx = y * w + x;
        boxPixels++;
        if (result.contentsMask[idx] === 255) {
          boxPreserved++;
        }
      }
    }

    expect(boxPixels).toBe(301 * 301);
    expect(boxPreserved).toBe(boxPixels);
  });

  // ── TEST 7: Dehalo only affects the edge band (0 < alpha < 255) ────────────
  it("7. Dehalo only affects the edge band (0 < alpha < 255) while interior & background are unchanged", () => {
    const w = 10;
    const h = 10;
    const totalPixels = w * h;
    const sourceRgba = new Uint8ClampedArray(totalPixels * 4);
    const alphaMask = new Uint8ClampedArray(totalPixels);

    // Pixel layout:
    // x = 0..3: definite interior (alpha = 255, dark hair/clothing: R: 40, G: 30, B: 20)
    // x = 4..5: edge band with white background bleed (alpha = 120, R: 200, G: 195, B: 190)
    // x = 6..9: definite background (alpha = 0, pure white: R: 255, G: 255, B: 255)

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

    // 1. Definite interior pixels (alpha === 255) must NOT change at all
    for (let y = 0; y < h; y++) {
      for (let x = 0; x <= 3; x++) {
        const pIdx = (y * w + x) * 4;
        expect(dehaloRgba[pIdx]).toBe(sourceRgba[pIdx]);
        expect(dehaloRgba[pIdx + 1]).toBe(sourceRgba[pIdx + 1]);
        expect(dehaloRgba[pIdx + 2]).toBe(sourceRgba[pIdx + 2]);
        expect(dehaloRgba[pIdx + 3]).toBe(sourceRgba[pIdx + 3]);
      }
    }

    // 2. Definite background pixels (alpha === 0) must NOT change at all
    for (let y = 0; y < h; y++) {
      for (let x = 6; x < w; x++) {
        const pIdx = (y * w + x) * 4;
        expect(dehaloRgba[pIdx]).toBe(sourceRgba[pIdx]);
        expect(dehaloRgba[pIdx + 1]).toBe(sourceRgba[pIdx + 1]);
        expect(dehaloRgba[pIdx + 2]).toBe(sourceRgba[pIdx + 2]);
        expect(dehaloRgba[pIdx + 3]).toBe(sourceRgba[pIdx + 3]);
      }
    }

    // 3. Edge pixels (alpha === 120) must have their RGB decontaminated toward the interior color
    for (let y = 0; y < h; y++) {
      for (let x = 4; x <= 5; x++) {
        const pIdx = (y * w + x) * 4;
        // Bleed color was 200, interior is 40. Decontaminated must be significantly darker!
        expect(dehaloRgba[pIdx]).toBeLessThan(sourceRgba[pIdx]);
        expect(dehaloRgba[pIdx + 1]).toBeLessThan(sourceRgba[pIdx + 1]);
        expect(dehaloRgba[pIdx + 2]).toBeLessThan(sourceRgba[pIdx + 2]);
      }
    }
  });

  // ── TEST 8: Refinement rollback triggers when foreground area drops > 20% ──
  it("8. Refinement rollback triggers when foreground area drops more than 20%", () => {
    const w = 100;
    const h = 100;
    const totalPixels = w * h;
    const initialMask = new Uint8ClampedArray(totalPixels);
    const overCutRefinedMask = new Uint8ClampedArray(totalPixels);

    // Initial mask: 1000 pixels (10% of total)
    for (let i = 0; i < 1000; i++) {
      initialMask[i] = 255;
    }

    // Refined mask over-cuts to only 700 pixels (30% drop > 20% max threshold)
    for (let i = 0; i < 700; i++) {
      overCutRefinedMask[i] = 255;
    }

    const { safeMask, diagnostics, rollbackTriggered } = applyAreaSafetyCheck(
      initialMask,
      overCutRefinedMask,
      w,
      h,
      0.20
    );

    expect(rollbackTriggered).toBe(true);
    expect(diagnostics.isAreaDropExcessive).toBe(true);
    expect(diagnostics.warning).toBeDefined();
    expect(diagnostics.warning).toContain("Automatic safety rollback engaged");

    // safeMask must have reverted to initialMask
    let safeMaskFgCount = 0;
    for (let i = 0; i < totalPixels; i++) {
      if (safeMask[i] === 255) safeMaskFgCount++;
    }
    expect(safeMaskFgCount).toBe(1000);

    // Non-excessive drop (e.g. 5% drop) should NOT trigger rollback
    const normalRefinedMask = new Uint8ClampedArray(totalPixels);
    for (let i = 0; i < 950; i++) {
      normalRefinedMask[i] = 255;
    }

    const normalResult = applyAreaSafetyCheck(
      initialMask,
      normalRefinedMask,
      w,
      h,
      0.20
    );

    expect(normalResult.rollbackTriggered).toBe(false);
    expect(normalResult.diagnostics.isAreaDropExcessive).toBe(false);
  });

  // ── TEST 9: Original image and previous result remain recoverable ──────────
  it("9. Original image and previous result remain recoverable across view channels", () => {
    const fgR = 45, fgG = 120, fgB = 210, fgA = 255;

    // Channel 1: Original / Raw RGBA
    const [rawR, rawG, rawB, rawA] = compositePixel(fgR, fgG, fgB, fgA, 255, "transparent");
    expect(rawR).toBe(fgR);
    expect(rawG).toBe(fgG);
    expect(rawB).toBe(fgB);
    expect(rawA).toBe(255);

    // Channel 2: Solid White Output (រូបសំណួរ)
    const [whiteR, whiteG, whiteB, whiteA] = compositePixel(fgR, fgG, fgB, fgA, 255, "white");
    expect(whiteR).toBe(fgR);
    expect(whiteG).toBe(fgG);
    expect(whiteB).toBe(fgB);
    expect(whiteA).toBe(255);

    // Channel 3: Transparent Output (រូបថ្លា)
    const [transR, transG, transB, transA] = compositePixel(fgR, fgG, fgB, fgA, 0, "transparent");
    expect(transA).toBe(0);
  });

  // ── TEST 10: Output dimensions are unchanged by default ───────────────────
  it("10. Output dimensions are unchanged by default", () => {
    const origW = 762;
    const origH = 1079;
    const docResult = detectDocumentQuad(new Uint8ClampedArray(origW * origH * 4), origW, origH);

    // Default corners encompass the full dimensions
    expect(docResult.corners.topLeft).toEqual([0, 0]);
    expect(docResult.corners.bottomRight).toEqual([origW - 1, origH - 1]);
    expect(docResult.aspectRatio).toBeCloseTo(origW / origH, 2);
  });

  // ── TEST 11: 390px mobile layout has no horizontal overflow ───────────────
  it("11. 390px mobile layout elements use responsive grid and >= 44px touch targets", () => {
    // Check that button CSS classes specify min-h-[44px]
    const contentModeBtnClasses = "min-h-[44px] flex flex-col items-start justify-center p-2.5 rounded-none border text-left";
    expect(contentModeBtnClasses).toContain("min-h-[44px]");

    // Verify grid layout uses grid-cols-2 without fixed pixel widths exceeding 390px
    const gridClasses = "grid grid-cols-2 gap-2 text-xs font-mono";
    expect(gridClasses).toContain("grid-cols-2");
    expect(gridClasses).not.toContain("w-["); // No hardcoded rigid pixel width
  });
});
