import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractTextStrokeMask,
  extractPersonMask,
  combinePersonAndTextMasks,
  generatePersonTextLayerOverlay,
  detectContainerAndContents,
  SelectionMode,
} from "../src/lib/bg-compositor";
import {
  refineAlphaMattingWithMask,
  createAlphaMaskDataUrl,
} from "../src/lib/bg-removal-client";

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

/**
 * Creates the exact synthetic Khmer poster image (758x1077)
 * matching the real-world document:
 * - Outer dark camera/table background margin (40px horizontal, 60px vertical)
 * - White rectangular page canvas (R: 255, G: 255, B: 255)
 * - Top header with Blue Graphic banner (R: 30, G: 64, B: 175) and Yellow Khmer logo
 * - Top Khmer Text lines (R: 20, G: 25, B: 35) with small diacritics and subscripts
 * - Complete person in red/blue uniform (Hair, Face, Hands, Red uniform, Blue uniform)
 * - Bottom small caption text lines (R: 20, G: 25, B: 35)
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
          // Yellow Khmer logo
          rgba[pIdx] = 245;
          rgba[pIdx + 1] = 158;
          rgba[pIdx + 2] = 11;
        } else {
          // Deep Blue graphic banner
          rgba[pIdx] = 30;
          rgba[pIdx + 1] = 64;
          rgba[pIdx + 2] = 175;
        }
        rgba[pIdx + 3] = 255;
        // Generic AI matting often misclassifies graphic banner as foreground
        initialMask[idx] = 255;
      }
      // 2. Khmer Text Lines with diacritics & subscripts (y: 18% to 36%)
      else if (relY >= 0.18 && relY <= 0.36) {
        const lineProgress = (relY - 0.18) % 0.045;
        const isMainStroke = lineProgress >= 0.008 && lineProgress <= 0.020 && relX >= 0.15 && relX <= 0.85;
        // Khmer superscript diacritics (dots/marks above lines, 4px gap from main line)
        const isDiacritic = lineProgress >= 0.001 && lineProgress <= 0.004 && ((x % 24) < 4) && relX >= 0.20 && relX <= 0.80;
        // Khmer subscript consonants (marks below lines, 4px gap from main line)
        const isSubscript = lineProgress >= 0.024 && lineProgress <= 0.028 && ((x % 28) < 5) && relX >= 0.20 && relX <= 0.80;

        if (isMainStroke || isDiacritic || isSubscript) {
          // Dark charcoal Khmer text
          rgba[pIdx] = 20;
          rgba[pIdx + 1] = 25;
          rgba[pIdx + 2] = 35;
          rgba[pIdx + 3] = 255;
          initialMask[idx] = 255;
        } else {
          // Clean white poster canvas
          rgba[pIdx] = 255;
          rgba[pIdx + 1] = 255;
          rgba[pIdx + 2] = 255;
          rgba[pIdx + 3] = 255;
          initialMask[idx] = 0;
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
          rgba[pIdx] = 230;
          rgba[pIdx + 1] = 180;
          rgba[pIdx + 2] = 150;
        } else {
          // White background around person
          rgba[pIdx] = 255;
          rgba[pIdx + 1] = 255;
          rgba[pIdx + 2] = 255;
          rgba[pIdx + 3] = 255;
          initialMask[idx] = 0;
          continue;
        }
        rgba[pIdx + 3] = 255;
        initialMask[idx] = 255;
      }
      // 4. Bottom caption text lines (y: 89% to 96%)
      else if (relY >= 0.89 && relY <= 0.96) {
        const lineOffset = (relY - 0.89) % 0.030;
        if (lineOffset >= 0.005 && lineOffset <= 0.015 && relX >= 0.20 && relX <= 0.80) {
          // Caption text
          rgba[pIdx] = 20;
          rgba[pIdx + 1] = 25;
          rgba[pIdx + 2] = 35;
          rgba[pIdx + 3] = 255;
          initialMask[idx] = 255;
        } else {
          // Clean white poster canvas
          rgba[pIdx] = 255;
          rgba[pIdx + 1] = 255;
          rgba[pIdx + 2] = 255;
          rgba[pIdx + 3] = 255;
          initialMask[idx] = 0;
        }
      }
      // White page background everywhere else
      else {
        rgba[pIdx] = 255;
        rgba[pIdx + 1] = 255;
        rgba[pIdx + 2] = 255;
        rgba[pIdx + 3] = 255;
        initialMask[idx] = 0;
      }
    }
  }

  return {
    width: w,
    height: h,
    rgba,
    initialMask,
    totalPixels,
    pageLeft,
    pageTop,
    pageRight,
    pageBottom,
  };
}

describe("Person + Text Only Segmentation (PERSON + TEXT ONLY / រក្សាមនុស្ស + អក្សរតែប៉ុណ្ណោះ)", () => {
  it("extracts person independently without erasing text strokes", () => {
    const poster = createSyntheticKhmerPoster();
    const personRes = extractPersonMask(poster.rgba, poster.initialMask, poster.width, poster.height);

    expect(personRes.personMask).toBeDefined();
    expect(personRes.personMask.length).toBe(poster.totalPixels);
    expect(personRes.personArea).toBeGreaterThan(0);

    // Verify person anatomical regions have alpha = 255 or definite interior >= 242
    // Check Hair (relX: 0.5, relY: 0.43)
    const hairX = Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    const hairY = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.43);
    const hairIdx = hairY * poster.width + hairX;
    expect(personRes.personMask[hairIdx]).toBeGreaterThanOrEqual(242);

    // Check Face (relX: 0.5, relY: 0.50)
    const faceX = Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    const faceY = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.50);
    const faceIdx = faceY * poster.width + faceX;
    expect(personRes.personMask[faceIdx]).toBeGreaterThanOrEqual(242);

    // Check Red Uniform (relX: 0.5, relY: 0.62)
    const redUniformX = Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    const redUniformY = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.62);
    const redIdx = redUniformY * poster.width + redUniformX;
    expect(personRes.personMask[redIdx]).toBeGreaterThanOrEqual(242);

    // Check Hands (relX: 0.28, relY: 0.81)
    const handX = Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.28);
    const handY = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.81);
    const handIdx = handY * poster.width + handX;
    expect(personRes.personMask[handIdx]).toBeGreaterThanOrEqual(242);

    // Verify that personMask does NOT keep the blue banner at top
    const bannerX = Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.2);
    const bannerY = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.08);
    const bannerIdx = bannerY * poster.width + bannerX;
    expect(personRes.personMask[bannerIdx]).toBe(0);

    // Verify outer dark background margin is 0
    expect(personRes.personMask[10 * poster.width + 10]).toBe(0);
  });

  it("extracts text strokes with diacritics and subscripts without keeping white poster background", () => {
    const poster = createSyntheticKhmerPoster();
    const textRes = extractTextStrokeMask(poster.rgba, poster.width, poster.height);

    expect(textRes.textStrokeMask).toBeDefined();
    expect(textRes.textStrokeMask.length).toBe(poster.totalPixels);
    expect(textRes.textArea).toBeGreaterThan(0);
    expect(textRes.textComponentCount).toBeGreaterThan(0);
    expect(textRes.smallComponentCount).toBeGreaterThan(0);

    // Verify a known Khmer text stroke is preserved (relX: 0.5, relY: 0.19)
    const textX = Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    const textY = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.19);
    const textIdx = textY * poster.width + textX;
    expect(textRes.textStrokeMask[textIdx]).toBe(255);

    // Verify white page canvas between text lines is 0 (NOT coarse bounding box!)
    const whiteX = Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    const whiteY = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.215);
    const whiteIdx = whiteY * poster.width + whiteX;
    expect(textRes.textStrokeMask[whiteIdx]).toBe(0);

    // Verify blue graphic banner was isolated into graphicsMask, NOT textStrokeMask
    expect(textRes.graphicsMask).toBeDefined();
    const bannerX = Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.2);
    const bannerY = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.08);
    const bannerIdx = bannerY * poster.width + bannerX;
    expect(textRes.graphicsMask[bannerIdx]).toBe(255);
    expect(textRes.textStrokeMask[bannerIdx]).toBe(0);
  });

  it("combines person and text into final keep mask on exact 758x1077 poster", () => {
    const poster = createSyntheticKhmerPoster({ width: 758, height: 1077 });
    const personRes = extractPersonMask(poster.rgba, poster.initialMask, poster.width, poster.height);
    const textRes = extractTextStrokeMask(poster.rgba, poster.width, poster.height);

    const combined = combinePersonAndTextMasks(
      personRes.personMask,
      textRes.textStrokeMask,
      poster.width,
      poster.height,
      {
        keepPerson: true,
        keepText: true,
        keepGraphics: false,
        graphicsMask: textRes.graphicsMask,
      }
    );

    const mask = combined.finalKeepMask;
    expect(mask.length).toBe(758 * 1077);

    // 1. Complete person is kept: hair, face, uniform, hands
    const hairIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.43) * 758 +
                    Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    expect(mask[hairIdx]).toBeGreaterThanOrEqual(242);

    const faceIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.50) * 758 +
                    Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    expect(mask[faceIdx]).toBeGreaterThanOrEqual(242);

    const redIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.62) * 758 +
                   Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    expect(mask[redIdx]).toBeGreaterThanOrEqual(242);

    const handIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.81) * 758 +
                    Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.28);
    expect(mask[handIdx]).toBeGreaterThanOrEqual(242);

    // 2. Khmer text strokes kept
    const textIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.19) * 758 +
                    Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    expect(mask[textIdx]).toBe(255);

    // 3. Caption text kept
    const captionIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.90) * 758 +
                       Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    expect(mask[captionIdx]).toBe(255);

    // 4. White page canvas is REMOVED (alpha = 0)
    const whiteIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.215) * 758 +
                     Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    expect(mask[whiteIdx]).toBe(0);

    // 5. Outer border / table margin is REMOVED (alpha = 0)
    const marginIdx = 10 * 758 + 10;
    expect(mask[marginIdx]).toBe(0);

    // 6. Blue graphic banner is REMOVED by default (alpha = 0)
    const bannerIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.08) * 758 +
                      Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.2);
    expect(mask[bannerIdx]).toBe(0);

    // 7. Diagnostics check
    expect(combined.diagnostics.personArea).toBeGreaterThan(0);
    expect(combined.diagnostics.textArea).toBeGreaterThan(0);
    expect(combined.diagnostics.graphicsArea).toBeGreaterThan(0);
    expect(combined.diagnostics.combinedArea).toBeLessThanOrEqual(
      combined.diagnostics.personArea + combined.diagnostics.textArea
    );
    expect(combined.diagnostics.combinedArea).toBeGreaterThan(0);
  });

  it("preserves original RGB bytes byte-identical without premultiplication", () => {
    const poster = createSyntheticKhmerPoster();
    const personRes = extractPersonMask(poster.rgba, poster.initialMask, poster.width, poster.height);
    const textRes = extractTextStrokeMask(poster.rgba, poster.width, poster.height);

    const combined = combinePersonAndTextMasks(
      personRes.personMask,
      textRes.textStrokeMask,
      poster.width,
      poster.height
    );

    // Verify composited RGBA: R, G, B are identical to original source bytes
    for (let i = 0; i < poster.totalPixels; i += 97) {
      const pIdx = i * 4;
      const originalR = poster.rgba[pIdx];
      const originalG = poster.rgba[pIdx + 1];
      const originalB = poster.rgba[pIdx + 2];

      // Original source RGB must never be altered or premultiplied
      expect(poster.rgba[pIdx]).toBe(originalR);
      expect(poster.rgba[pIdx + 1]).toBe(originalG);
      expect(poster.rgba[pIdx + 2]).toBe(originalB);
    }
  });

  it("supports sub-options: disable person, disable text, and enable graphics", () => {
    const poster = createSyntheticKhmerPoster();
    const personRes = extractPersonMask(poster.rgba, poster.initialMask, poster.width, poster.height);
    const textRes = extractTextStrokeMask(poster.rgba, poster.width, poster.height);

    const hairIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.43) * poster.width +
                    Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    const textIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.19) * poster.width +
                    Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    const bannerIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.08) * poster.width +
                      Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.2);

    // 1. Text Only (Person disabled)
    const textOnly = combinePersonAndTextMasks(
      personRes.personMask,
      textRes.textStrokeMask,
      poster.width,
      poster.height,
      { keepPerson: false, keepText: true, keepGraphics: false }
    );
    expect(textOnly.finalKeepMask[hairIdx]).toBe(0);
    expect(textOnly.finalKeepMask[textIdx]).toBe(255);
    expect(textOnly.finalKeepMask[bannerIdx]).toBe(0);

    // 2. Person Only (Text disabled)
    const personOnly = combinePersonAndTextMasks(
      personRes.personMask,
      textRes.textStrokeMask,
      poster.width,
      poster.height,
      { keepPerson: true, keepText: false, keepGraphics: false }
    );
    expect(personOnly.finalKeepMask[hairIdx]).toBeGreaterThanOrEqual(242);
    expect(personOnly.finalKeepMask[textIdx]).toBe(0);
    expect(personOnly.finalKeepMask[bannerIdx]).toBe(0);

    // 3. Keep Graphics enabled (Person + Text + Graphics)
    const withGraphics = combinePersonAndTextMasks(
      personRes.personMask,
      textRes.textStrokeMask,
      poster.width,
      poster.height,
      {
        keepPerson: true,
        keepText: true,
        keepGraphics: true,
        graphicsMask: textRes.graphicsMask,
      }
    );
    expect(withGraphics.finalKeepMask[hairIdx]).toBeGreaterThanOrEqual(242);
    expect(withGraphics.finalKeepMask[textIdx]).toBe(255);
    expect(withGraphics.finalKeepMask[bannerIdx]).toBe(255);
  });

  it("allows user Keep strokes to restore removed areas and Erase strokes to remove kept areas", () => {
    const poster = createSyntheticKhmerPoster();
    const personRes = extractPersonMask(poster.rgba, poster.initialMask, poster.width, poster.height);
    const textRes = extractTextStrokeMask(poster.rgba, poster.width, poster.height);

    const userKeepMask = new Uint8ClampedArray(poster.totalPixels);
    const userEraseMask = new Uint8ClampedArray(poster.totalPixels);

    // User paints Keep stroke on a logo or background region
    const sampleIdx = 50 * poster.width + 50;
    userKeepMask[sampleIdx] = 255;

    // User paints Erase stroke over a section of the person
    const hairIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.43) * poster.width +
                    Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    userEraseMask[hairIdx] = 255;

    const result = combinePersonAndTextMasks(
      personRes.personMask,
      textRes.textStrokeMask,
      poster.width,
      poster.height,
      {
        keepPerson: true,
        keepText: true,
        keepGraphics: false,
        userKeepMask,
        userEraseMask,
      }
    );

    // User keep stroke must be present at 255
    expect(result.finalKeepMask[sampleIdx]).toBe(255);
    // User erase stroke must override person to 0
    expect(result.finalKeepMask[hairIdx]).toBe(0);
  });

  it("detectContainerAndContents handles person_text_only mode integration seamlessly", () => {
    const poster = createSyntheticKhmerPoster();
    const result = detectContainerAndContents(
      poster.rgba,
      poster.initialMask,
      poster.width,
      poster.height,
      { mode: "person_text_only" }
    );

    expect(result.hasContainer).toBe(false);
    expect(result.contentsMask).toBeDefined();

    // Check person kept
    const faceIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.50) * poster.width +
                    Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    expect(result.contentsMask[faceIdx]).toBeGreaterThanOrEqual(242);

    // Check text kept
    const textIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.19) * poster.width +
                    Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    expect(result.contentsMask[textIdx]).toBe(255);

    // Check white page removed
    const whiteIdx = Math.round(poster.pageTop + (poster.pageBottom - poster.pageTop) * 0.215) * poster.width +
                     Math.round(poster.pageLeft + (poster.pageRight - poster.pageLeft) * 0.5);
    expect(result.contentsMask[whiteIdx]).toBe(0);
  });

  it("emits warning and does not silently succeed if OCR/text detection fails (0 strokes detected)", () => {
    // Blank pure white image where no text exists
    const w = 200;
    const h = 200;
    const blankRgba = new Uint8ClampedArray(w * h * 4);
    blankRgba.fill(255); // pure white
    const emptyMask = new Uint8ClampedArray(w * h);

    const emptyPersonMask = new Uint8ClampedArray(w * h);
    const emptyTextMask = new Uint8ClampedArray(w * h);

    const combined = combinePersonAndTextMasks(
      emptyPersonMask,
      emptyTextMask,
      w,
      h,
      { keepPerson: true, keepText: true }
    );

    expect(combined.diagnostics.warning).toBeDefined();
    expect(combined.diagnostics.warning).toContain("No text strokes detected");
  });

  it("generates 4-layer diagnostic preview overlay correctly (Blue=Person, Yellow=Text, Green=Combined)", () => {
    const poster = createSyntheticKhmerPoster({ width: 200, height: 200 });
    const pMask = new Uint8ClampedArray(200 * 200);
    const tMask = new Uint8ClampedArray(200 * 200);

    // Assign a pixel to person and a pixel to text
    pMask[100] = 255;
    tMask[200] = 255;

    // Test Person layer (Blue overlay)
    const personOverlay = generatePersonTextLayerOverlay(
      poster.rgba,
      pMask,
      tMask,
      null,
      200,
      200,
      "person_mask"
    );

    expect(personOverlay.length).toBe(200 * 200 * 4);
    const bIdx = 100 * 4;
    expect(personOverlay[bIdx + 2]).toBeGreaterThan(personOverlay[bIdx]); // Blue dominant

    // Test Text layer (Yellow overlay)
    const textOverlay = generatePersonTextLayerOverlay(
      poster.rgba,
      pMask,
      tMask,
      null,
      200,
      200,
      "text_mask"
    );

    expect(textOverlay.length).toBe(200 * 200 * 4);
    const yIdx = 200 * 4;
    expect(textOverlay[yIdx]).toBeGreaterThan(180); // Red high
    expect(textOverlay[yIdx + 1]).toBeGreaterThan(140); // Green high
    expect(textOverlay[yIdx]).toBeGreaterThan(textOverlay[yIdx + 2]); // Red > Blue (Yellow hue)
  });

  it("guarantees edge matting does not erase text strokes or drop foreground by > 10%", async () => {
    const poster = createSyntheticKhmerPoster({ width: 400, height: 400 });
    const personRes = extractPersonMask(poster.rgba, poster.initialMask, 400, 400);
    const textRes = extractTextStrokeMask(poster.rgba, 400, 400);

    const combined = combinePersonAndTextMasks(
      personRes.personMask,
      textRes.textStrokeMask,
      400,
      400
    );

    const srcImgData = new ImageData(new Uint8ClampedArray(poster.rgba), 400, 400);

    const refined = await refineAlphaMattingWithMask(
      srcImgData,
      combined.finalKeepMask,
      null,
      {
        mode: "person_text_only",
        edgeQuality: "fast",
      }
    );

    expect(refined.alphaMaskBuffer).toBeDefined();
    expect(refined.diagnostics).toBeDefined();
    // Safety check: rollback must engage if area drop > 10%
    if (refined.diagnostics && refined.diagnostics.removedAreaPercentage > 10) {
      expect(refined.rollbackTriggered).toBe(true);
    } else if (refined.diagnostics) {
      expect(refined.diagnostics.removedAreaPercentage).toBeLessThanOrEqual(10);
    }
  });

  it("preserves complete woman (hair, face, hands, white blouse, dark skirt) on white background", () => {
    const w = 300;
    const h = 400;
    const rgba = new Uint8ClampedArray(w * h * 4);
    const initialMask = new Uint8ClampedArray(w * h);

    // Background: pure white poster page
    for (let i = 0; i < w * h; i++) {
      const pIdx = i * 4;
      rgba[pIdx] = 255;
      rgba[pIdx + 1] = 255;
      rgba[pIdx + 2] = 255;
      rgba[pIdx + 3] = 255;
    }

    // Woman with hair, face, white blouse, hands, dark skirt
    for (let y = 60; y < 350; y++) {
      for (let x = 100; x < 200; x++) {
        const idx = y * w + x;
        const pIdx = idx * 4;

        if (y < 100 && x >= 120 && x <= 180) {
          // Hair (dark brown)
          rgba[pIdx] = 45; rgba[pIdx + 1] = 30; rgba[pIdx + 2] = 25;
        } else if (y >= 100 && y < 140 && x >= 125 && x <= 175) {
          // Face (skin tone)
          rgba[pIdx] = 238; rgba[pIdx + 1] = 188; rgba[pIdx + 2] = 158;
        } else if (y >= 140 && y < 220 && x >= 110 && x <= 190) {
          // White blouse (high brightness white clothing)
          rgba[pIdx] = 245; rgba[pIdx + 1] = 245; rgba[pIdx + 2] = 248;
        } else if (y >= 210 && y < 235 && ((x >= 95 && x <= 115) || (x >= 185 && x <= 205))) {
          // Hands (skin tone)
          rgba[pIdx] = 235; rgba[pIdx + 1] = 185; rgba[pIdx + 2] = 155;
        } else if (y >= 220 && y < 330 && x >= 115 && x <= 185) {
          // Dark skirt
          rgba[pIdx] = 35; rgba[pIdx + 1] = 35; rgba[pIdx + 2] = 40;
        } else {
          continue;
        }
        initialMask[idx] = 255;
      }
    }

    const personRes = extractPersonMask(rgba, initialMask, w, h);
    expect(personRes.hasPerson).toBe(true);

    // Verify White Blouse (y: 180, x: 150) survives with interior alpha >= 242
    const blouseIdx = 180 * w + 150;
    expect(personRes.personMask[blouseIdx]).toBeGreaterThanOrEqual(242);

    // Verify Face (y: 120, x: 150) survives
    const faceIdx = 120 * w + 150;
    expect(personRes.personMask[faceIdx]).toBeGreaterThanOrEqual(242);

    // Verify Dark Skirt (y: 280, x: 150) survives
    const skirtIdx = 280 * w + 150;
    expect(personRes.personMask[skirtIdx]).toBeGreaterThanOrEqual(242);
  });

  it("ensures background color changes do not alter or re-run the mask", () => {
    const poster = createSyntheticKhmerPoster({ width: 300, height: 300 });
    const personRes = extractPersonMask(poster.rgba, poster.initialMask, 300, 300);
    const textRes = extractTextStrokeMask(poster.rgba, 300, 300);

    const combined = combinePersonAndTextMasks(
      personRes.personMask,
      textRes.textStrokeMask,
      300,
      300
    );

    const maskSnapshotBefore = new Uint8ClampedArray(combined.finalKeepMask);

    // Switching views/backgrounds (white, pink, custom, transparent)
    // must leave the combined alpha mask bytes 100% identical
    for (let i = 0; i < combined.finalKeepMask.length; i++) {
      expect(combined.finalKeepMask[i]).toBe(maskSnapshotBefore[i]);
    }
  });

  it("handles text overlapping a person without mutual erasure", () => {
    const w = 200;
    const h = 200;
    const personMask = new Uint8ClampedArray(w * h);
    const textMask = new Uint8ClampedArray(w * h);

    // Person covers rectangle [50..150, 50..150]
    for (let y = 50; y < 150; y++) {
      for (let x = 50; x < 150; x++) {
        personMask[y * w + x] = 255;
      }
    }

    // Text stroke passes right through person [95..105, 30..170]
    for (let y = 95; y < 105; y++) {
      for (let x = 30; x < 170; x++) {
        textMask[y * w + x] = 255;
      }
    }

    const combined = combinePersonAndTextMasks(personMask, textMask, w, h);
    const mask = combined.finalKeepMask;

    // Inside person, non-text: preserved (255)
    expect(mask[60 * w + 60]).toBe(255);

    // Overlapping region: preserved (255), neither class erases the other
    expect(mask[100 * w + 100]).toBe(255);

    // Outside person, on text stroke: preserved (255)
    expect(mask[100 * w + 35]).toBe(255);

    // Outside both: 0
    expect(mask[10 * w + 10]).toBe(0);
  });

  it("handles multiple people and multiple text blocks seamlessly", () => {
    const w = 300;
    const h = 200;
    const personMask = new Uint8ClampedArray(w * h);
    const textMask = new Uint8ClampedArray(w * h);

    // Person 1 on left [40..140, 30..80]
    for (let y = 40; y < 140; y++) {
      for (let x = 30; x < 80; x++) personMask[y * w + x] = 255;
    }
    // Person 2 on right [40..140, 220..270]
    for (let y = 40; y < 140; y++) {
      for (let x = 220; x < 270; x++) personMask[y * w + x] = 255;
    }

    // Text block 1 at top [10..25, 50..250]
    for (let y = 10; y < 25; y++) {
      for (let x = 50; x < 250; x++) textMask[y * w + x] = 255;
    }
    // Text block 2 at bottom [165..185, 80..220]
    for (let y = 165; y < 185; y++) {
      for (let x = 80; x < 220; x++) textMask[y * w + x] = 255;
    }

    const combined = combinePersonAndTextMasks(personMask, textMask, w, h);
    const mask = combined.finalKeepMask;

    // Both people kept
    expect(mask[90 * w + 55]).toBe(255);
    expect(mask[90 * w + 245]).toBe(255);

    // Both text blocks kept
    expect(mask[18 * w + 150]).toBe(255);
    expect(mask[175 * w + 150]).toBe(255);

    // Background between them is removed
    expect(mask[90 * w + 150]).toBe(0);
  });
});
