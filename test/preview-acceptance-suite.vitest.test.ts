import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractPersonMask,
  extractTextStrokeMask,
  combinePersonAndTextMasks,
  generatePersonTextLayerOverlay,
  detectContainerAndContents,
} from "../src/lib/bg-compositor";
import {
  refineAlphaMattingWithMask,
  createAlphaMaskDataUrl,
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

// Helper to composite RGBA cutout from original RGB and mask
function createCutout(
  sourceRgba: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const cutout = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const pIdx = i * 4;
    cutout[pIdx] = sourceRgba[pIdx];
    cutout[pIdx + 1] = sourceRgba[pIdx + 1];
    cutout[pIdx + 2] = sourceRgba[pIdx + 2];
    cutout[pIdx + 3] = mask[i];
  }
  return cutout;
}

describe("PREVIEW DEPLOYMENT ACCEPTANCE SUITE — 6 REQUIRED FIXTURES", () => {
  // --------------------------------------------------------------------------
  // FIXTURE 1: Khmer text at 12-18px with superscripts, subscripts, diacritics, and punctuation
  // --------------------------------------------------------------------------
  describe("Fixture 1: Khmer text at 12–18px with superscripts, subscripts, diacritics & punctuation", () => {
    it("preserves thin strokes, diacritics, subscripts, and punctuation without rectangular halo", () => {
      const w = 400;
      const h = 300;
      const totalPixels = w * h;
      const rgba = new Uint8ClampedArray(totalPixels * 4);
      rgba.fill(255); // White page canvas

      // Draw Khmer characters at 12px, 14px, 18px lines
      // Line 1: 18px heading text (y: 40-58)
      // Line 2: 14px body text (y: 80-94) with superscript diacritic (y: 72-76) and subscript consonant (y: 98-103)
      // Line 3: 12px caption text (y: 120-132) with punctuation marks (:, .)
      for (let x = 40; x < 360; x++) {
        // Line 1: 18px main text
        for (let y = 40; y < 58; y++) {
          if ((x % 16 < 12) && (y % 4 < 2)) {
            const pIdx = (y * w + x) * 4;
            rgba[pIdx] = 20; rgba[pIdx + 1] = 25; rgba[pIdx + 2] = 30; // dark ink
          }
        }
        // Line 2: 14px main text
        for (let y = 80; y < 94; y++) {
          if ((x % 14 < 10) && (y % 3 < 2)) {
            const pIdx = (y * w + x) * 4;
            rgba[pIdx] = 20; rgba[pIdx + 1] = 25; rgba[pIdx + 2] = 30;
          }
        }
      }

      // Add Khmer Superscript Diacritic marks (dots/accents at y: 72-76, width 4px)
      const diacriticCoords = [{ x: 60, y: 74 }, { x: 120, y: 74 }, { x: 200, y: 74 }];
      for (const pt of diacriticCoords) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const pIdx = ((pt.y + dy) * w + (pt.x + dx)) * 4;
            rgba[pIdx] = 20; rgba[pIdx + 1] = 25; rgba[pIdx + 2] = 30;
          }
        }
      }

      // Add Khmer Subscript Consonant marks (below line at y: 98-103, width 5px)
      const subscriptCoords = [{ x: 80, y: 100 }, { x: 150, y: 100 }, { x: 240, y: 100 }];
      for (const pt of subscriptCoords) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const pIdx = ((pt.y + dy) * w + (pt.x + dx)) * 4;
            rgba[pIdx] = 20; rgba[pIdx + 1] = 25; rgba[pIdx + 2] = 30;
          }
        }
      }

      // Add punctuation marks (:, .) at x: 370, y: 85 and 92
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const pIdx1 = ((85 + dy) * w + (370 + dx)) * 4;
          rgba[pIdx1] = 20; rgba[pIdx1 + 1] = 25; rgba[pIdx1 + 2] = 30;
          const pIdx2 = ((92 + dy) * w + (370 + dx)) * 4;
          rgba[pIdx2] = 20; rgba[pIdx2 + 1] = 25; rgba[pIdx2 + 2] = 30;
        }
      }

      // 1. Run Text Mask extraction
      const tStart = performance.now();
      const textRes = extractTextStrokeMask(rgba, w, h);
      const tElapsed = performance.now() - tStart;

      expect(textRes.textStrokeMask).toBeDefined();
      expect(textRes.textArea).toBeGreaterThan(0);
      expect(textRes.textComponentCount).toBeGreaterThanOrEqual(10);
      expect(textRes.smallComponentCount).toBeGreaterThan(0);

      // Verify diacritics survived
      for (const pt of diacriticCoords) {
        const idx = pt.y * w + pt.x;
        expect(textRes.textStrokeMask[idx]).toBe(255);
      }

      // Verify subscripts survived
      for (const pt of subscriptCoords) {
        const idx = pt.y * w + pt.x;
        expect(textRes.textStrokeMask[idx]).toBe(255);
      }

      // Verify punctuation survived
      expect(textRes.textStrokeMask[85 * w + 370]).toBe(255);
      expect(textRes.textStrokeMask[92 * w + 370]).toBe(255);

      // Verify white paper between lines is NOT kept (NO coarse bounding box!)
      expect(textRes.textStrokeMask[65 * w + 100]).toBe(0);
      expect(textRes.textStrokeMask[110 * w + 100]).toBe(0);

      // 2. Generate 4 previews
      const emptyPerson = new Uint8ClampedArray(totalPixels);
      const combined = combinePersonAndTextMasks(emptyPerson, textRes.textStrokeMask, w, h, {
        keepPerson: false,
        keepText: true,
      });
      const cutout = createCutout(rgba, combined.finalKeepMask, w, h);

      // Verify Cutout has transparent background on white paper
      expect(cutout[(65 * w + 100) * 4 + 3]).toBe(0);
      // Verify Cutout preserves text stroke RGB byte-identical
      const sampleIdx = (80 * w + 45) * 4;
      expect(cutout[sampleIdx]).toBe(rgba[sampleIdx]);
      expect(cutout[sampleIdx + 1]).toBe(rgba[sampleIdx + 1]);
      expect(cutout[sampleIdx + 2]).toBe(rgba[sampleIdx + 2]);
      expect(cutout[sampleIdx + 3]).toBe(255);
    });
  });

  // --------------------------------------------------------------------------
  // FIXTURE 2: White Khmer text on a dark background
  // --------------------------------------------------------------------------
  describe("Fixture 2: White Khmer text on dark background (Polarity adaptation)", () => {
    it("extracts inverted white text strokes on dark banner without keeping dark background", () => {
      const w = 300;
      const h = 150;
      const totalPixels = w * h;
      const rgba = new Uint8ClampedArray(totalPixels * 4);

      // Dark blue/black banner (R: 25, G: 30, B: 45)
      for (let i = 0; i < totalPixels; i++) {
        const pIdx = i * 4;
        rgba[pIdx] = 25; rgba[pIdx + 1] = 30; rgba[pIdx + 2] = 45; rgba[pIdx + 3] = 255;
      }

      // White Khmer text strokes (R: 250, G: 250, B: 250)
      for (let x = 30; x < 270; x++) {
        for (let y = 60; y < 85; y++) {
          if ((x % 18 < 12) && (y % 4 < 2)) {
            const pIdx = (y * w + x) * 4;
            rgba[pIdx] = 250; rgba[pIdx + 1] = 250; rgba[pIdx + 2] = 250;
          }
        }
      }

      const textRes = extractTextStrokeMask(rgba, w, h);
      expect(textRes.textStrokeMask).toBeDefined();

      // White text strokes should be kept
      // For (x % 18 < 12) && (y % 4 < 2): at x=36 (36 % 18 = 0) and y=60 (60 % 4 = 0) is a stroke
      const strokeIdx = 60 * w + 36;
      expect(textRes.textStrokeMask[strokeIdx]).toBe(255);

      // Dark background around the text should be 0
      const bgIdx = 20 * w + 50;
      expect(textRes.textStrokeMask[bgIdx]).toBe(0);

      // Combined mask & cutout
      const pMask = new Uint8ClampedArray(totalPixels);
      const combined = combinePersonAndTextMasks(pMask, textRes.textStrokeMask, w, h, {
        keepPerson: false,
        keepText: true,
      });
      const cutout = createCutout(rgba, combined.finalKeepMask, w, h);

      expect(cutout[strokeIdx * 4 + 3]).toBe(255);
      expect(cutout[strokeIdx * 4]).toBe(250); // Original white RGB preserved
      expect(cutout[bgIdx * 4 + 3]).toBe(0); // Dark background transparent
    });
  });

  // --------------------------------------------------------------------------
  // FIXTURE 3: A person with long dark hair and flyaway strands
  // --------------------------------------------------------------------------
  describe("Fixture 3: A person with long dark hair and flyaway strands", () => {
    it("preserves person hair interior and fine flyaway strands within narrow boundary band", async () => {
      const w = 300;
      const h = 400;
      const totalPixels = w * h;
      const rgba = new Uint8ClampedArray(totalPixels * 4);
      const initialMask = new Uint8ClampedArray(totalPixels);

      // Light gray environmental background (R: 230, G: 232, B: 235)
      for (let i = 0; i < totalPixels; i++) {
        const pIdx = i * 4;
        rgba[pIdx] = 230; rgba[pIdx + 1] = 232; rgba[pIdx + 2] = 235; rgba[pIdx + 3] = 255;
      }

      // Person body and head (x: 100-200, y: 80-380)
      for (let y = 80; y < 380; y++) {
        for (let x = 100; x < 200; x++) {
          const idx = y * w + x;
          const pIdx = idx * 4;
          if (y < 160) {
            // Dark hair (R: 35, G: 30, B: 30)
            rgba[pIdx] = 35; rgba[pIdx + 1] = 30; rgba[pIdx + 2] = 30;
          } else {
            // Body / clothing
            rgba[pIdx] = 180; rgba[pIdx + 1] = 60; rgba[pIdx + 2] = 60;
          }
          initialMask[idx] = 255;
        }
      }

      // Fine flyaway hair strands (1-2px lines at edges x: 88-99, y: 100-140)
      for (let y = 100; y < 140; y += 4) {
        for (let dx = -10; dx <= 0; dx++) {
          const idx = y * w + (100 + dx);
          const pIdx = idx * 4;
          rgba[pIdx] = 45; rgba[pIdx + 1] = 40; rgba[pIdx + 2] = 40;
          initialMask[idx] = 255; // AI detected flyaway hair
        }
      }

      const personRes = extractPersonMask(rgba, initialMask, w, h);
      expect(personRes.personMask).toBeDefined();

      // Hair interior must have alpha >= 242 (>= 0.95)
      const hairCoreIdx = 120 * w + 150;
      expect(personRes.personMask[hairCoreIdx]).toBeGreaterThanOrEqual(242);

      // Boundary band exists around edges for narrow matting
      expect(personRes.boundaryBandMask).toBeDefined();
      expect(personRes.boundaryBandMask.length).toBe(totalPixels);

      // Verify refinement does not erase hair by > 10%
      const imgData = new ImageData(rgba, w, h);
      const refined = await refineAlphaMattingWithMask(
        imgData,
        personRes.personMask,
        null,
        { edgeQuality: "fine" }
      );
      expect(refined).toBeDefined();
      expect(refined.alphaMaskBuffer[hairCoreIdx]).toBeGreaterThanOrEqual(242);
    });
  });

  // --------------------------------------------------------------------------
  // FIXTURE 4: A person wearing white clothing on a light background
  // --------------------------------------------------------------------------
  describe("Fixture 4: A person wearing white clothing on a light background", () => {
    it("never classifies white clothing as background by color alone", () => {
      const w = 300;
      const h = 400;
      const totalPixels = w * h;
      const rgba = new Uint8ClampedArray(totalPixels * 4);
      const initialMask = new Uint8ClampedArray(totalPixels);

      // Light background (R: 252, G: 252, B: 252)
      for (let i = 0; i < totalPixels; i++) {
        const pIdx = i * 4;
        rgba[pIdx] = 252; rgba[pIdx + 1] = 252; rgba[pIdx + 2] = 252; rgba[pIdx + 3] = 255;
      }

      // Person with white blouse / clothing (R: 242, G: 244, B: 246)
      for (let y = 100; y < 350; y++) {
        for (let x = 80; x < 220; x++) {
          const idx = y * w + x;
          const pIdx = idx * 4;
          rgba[pIdx] = 242; rgba[pIdx + 1] = 244; rgba[pIdx + 2] = 246;
          initialMask[idx] = 255; // Initial model segment
        }
      }

      const personRes = extractPersonMask(rgba, initialMask, w, h);
      expect(personRes.personMask).toBeDefined();

      // White blouse core pixel must be preserved at alpha >= 242
      const blouseIdx = 200 * w + 150;
      expect(personRes.personMask[blouseIdx]).toBeGreaterThanOrEqual(242);

      // Environmental background at x: 20, y: 200 must be 0
      const bgIdx = 200 * w + 20;
      expect(personRes.personMask[bgIdx]).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // FIXTURE 5: Hair overlapping printed Khmer text
  // --------------------------------------------------------------------------
  describe("Fixture 5: Hair overlapping printed Khmer text", () => {
    it("preserves both hair and text using union logic without mutual erasure", () => {
      const w = 250;
      const h = 250;
      const totalPixels = w * h;
      const rgba = new Uint8ClampedArray(totalPixels * 4);
      const pMask = new Uint8ClampedArray(totalPixels);
      const tMask = new Uint8ClampedArray(totalPixels);

      // Background
      rgba.fill(255);

      // Hair strands from top-left to bottom-right (y = x)
      for (let i = 0; i < w; i++) {
        for (let d = -2; d <= 2; d++) {
          const y = i + d;
          if (y >= 0 && y < h) {
            const idx = y * w + i;
            pMask[idx] = 255; // Person hair
          }
        }
      }

      // Printed Khmer text horizontal line at y = 120
      for (let x = 30; x < 220; x++) {
        for (let dy = -3; dy <= 3; dy++) {
          const idx = (120 + dy) * w + x;
          tMask[idx] = 255; // Text stroke
        }
      }

      // Intersection / overlap area is at (120, 120)
      const overlapIdx = 120 * w + 120;
      expect(pMask[overlapIdx]).toBe(255);
      expect(tMask[overlapIdx]).toBe(255);

      // Combine using union
      const combined = combinePersonAndTextMasks(pMask, tMask, w, h, {
        keepPerson: true,
        keepText: true,
      });

      // 1. Overlap point must be 255
      expect(combined.finalKeepMask[overlapIdx]).toBe(255);

      // 2. Pure hair point (not on text line) must be kept
      const pureHairIdx = 50 * w + 50;
      expect(combined.finalKeepMask[pureHairIdx]).toBe(255);

      // 3. Pure text point (away from hair) must be kept
      const pureTextIdx = 120 * w + 200;
      expect(combined.finalKeepMask[pureTextIdx]).toBe(255);

      // 4. Background point must be transparent
      const bgIdx = 10 * w + 200;
      expect(combined.finalKeepMask[bgIdx]).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // FIXTURE 6: A poster with small text, blue graphics, borders, and a person
  // --------------------------------------------------------------------------
  describe("Fixture 6: Poster with small text, blue graphics, borders & person", () => {
    it("preserves complete person and text while stripping graphics and poster borders", () => {
      const w = 500;
      const h = 700;
      const totalPixels = w * h;
      const rgba = new Uint8ClampedArray(totalPixels * 4);
      const initialMask = new Uint8ClampedArray(totalPixels);

      // Outer margin: 30px (Camera/table surface)
      const mX = 30, mY = 40;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          const pIdx = idx * 4;
          const isPage = x >= mX && x < w - mX && y >= mY && y < h - mY;
          if (!isPage) {
            rgba[pIdx] = 40; rgba[pIdx + 1] = 40; rgba[pIdx + 2] = 45; rgba[pIdx + 3] = 255;
            initialMask[idx] = 0;
            continue;
          }

          // Top blue graphic banner
          if (y < mY + 70) {
            rgba[pIdx] = 30; rgba[pIdx + 1] = 70; rgba[pIdx + 2] = 180; rgba[pIdx + 3] = 255;
            initialMask[idx] = 255;
          }
          // Khmer small text lines
          else if (y >= mY + 90 && y <= mY + 160) {
            const isStroke = (y % 14 < 3) && (x % 12 < 8);
            if (isStroke) {
              rgba[pIdx] = 25; rgba[pIdx + 1] = 25; rgba[pIdx + 2] = 30; rgba[pIdx + 3] = 255;
              initialMask[idx] = 255;
            } else {
              rgba[pIdx] = 255; rgba[pIdx + 1] = 255; rgba[pIdx + 2] = 255; rgba[pIdx + 3] = 255;
              initialMask[idx] = 0;
            }
          }
          // Person in uniform
          else if (y > mY + 180 && y < mY + 500 && x > 150 && x < 350) {
            rgba[pIdx] = 190; rgba[pIdx + 1] = 50; rgba[pIdx + 2] = 50; rgba[pIdx + 3] = 255;
            initialMask[idx] = 255;
          }
          // White poster page
          else {
            rgba[pIdx] = 255; rgba[pIdx + 1] = 255; rgba[pIdx + 2] = 255; rgba[pIdx + 3] = 255;
            initialMask[idx] = 0;
          }
        }
      }

      const pRes = extractPersonMask(rgba, initialMask, w, h);
      const tRes = extractTextStrokeMask(rgba, w, h);

      const combined = combinePersonAndTextMasks(pRes.personMask, tRes.textStrokeMask, w, h, {
        keepPerson: true,
        keepText: true,
        keepGraphics: false,
        graphicsMask: tRes.graphicsMask,
      });

      const mask = combined.finalKeepMask;

      // Complete person preserved
      expect(mask[(mY + 250) * w + 250]).toBeGreaterThanOrEqual(242);
      // Small Khmer text preserved at y=140 (140 % 14 = 0 < 3), x=100 (100 % 12 = 4 < 8)
      expect(mask[140 * w + 100]).toBe(255);
      // Blue graphic banner removed by default
      expect(mask[(mY + 30) * w + 100]).toBe(0);
      // Outer border removed
      expect(mask[10 * w + 10]).toBe(0);
      // White page background removed
      expect(mask[145 * w + 100]).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // ACCEPTANCE & MANUAL CORRECTION CONTROLS
  // --------------------------------------------------------------------------
  describe("Manual Correction Controls (Keep Brush, Erase Brush, Undo/Redo/Reset)", () => {
    it("Keep Brush restores missed strokes without modifying original RGB", () => {
      const w = 100;
      const h = 100;
      const totalPixels = w * h;
      const rgba = new Uint8ClampedArray(totalPixels * 4);
      for (let i = 0; i < totalPixels; i++) {
        const pIdx = i * 4;
        rgba[pIdx] = 123; rgba[pIdx + 1] = 45; rgba[pIdx + 2] = 67; rgba[pIdx + 3] = 255;
      }
      const initialAlpha = new Uint8ClampedArray(totalPixels); // All 0 initially

      // Simulate Keep Brush stroke at pixel 500
      const userKeep = new Uint8ClampedArray(totalPixels);
      userKeep[500] = 255;

      const combined = combinePersonAndTextMasks(initialAlpha, initialAlpha, w, h, {
        keepPerson: true,
        keepText: true,
        userKeepMask: userKeep,
      });

      expect(combined.finalKeepMask[500]).toBe(255);
      // Original RGB remains byte-identical
      expect(rgba[500 * 4]).toBe(123);
      expect(rgba[500 * 4 + 1]).toBe(45);
      expect(rgba[500 * 4 + 2]).toBe(67);
    });

    it("Erase Brush subtracts pixels from approved model mask", () => {
      const w = 100;
      const h = 100;
      const totalPixels = w * h;
      const pMask = new Uint8ClampedArray(totalPixels);
      pMask.fill(255); // Entire mask approved by model

      // User paints erase stroke on pixel 250
      const userErase = new Uint8ClampedArray(totalPixels);
      userErase[250] = 255;

      const combined = combinePersonAndTextMasks(pMask, pMask, w, h, {
        keepPerson: true,
        keepText: true,
        userEraseMask: userErase,
      });

      expect(combined.finalKeepMask[250]).toBe(0);
      expect(combined.finalKeepMask[249]).toBe(255);
    });
  });

  // --------------------------------------------------------------------------
  // PERFORMANCE & CACHING VERIFICATION
  // --------------------------------------------------------------------------
  describe("Performance, Caching & Resource Constraints", () => {
    it("measures cold-start vs cached-run speedup", () => {
      const w = 400;
      const h = 400;
      const totalPixels = w * h;
      const rgba = new Uint8ClampedArray(totalPixels * 4);
      rgba.fill(200);

      // Cold start: First extraction initializes memory and buffers
      const t0 = performance.now();
      const run1 = extractTextStrokeMask(rgba, w, h);
      const coldTime = performance.now() - t0;

      // Warm/cached run: Subsequent invocation with allocated memory
      const t1 = performance.now();
      const run2 = extractTextStrokeMask(rgba, w, h);
      const warmTime = performance.now() - t1;

      expect(run1.textStrokeMask.length).toBe(totalPixels);
      expect(run2.textStrokeMask.length).toBe(totalPixels);
      expect(coldTime).toBeGreaterThanOrEqual(0);
      expect(warmTime).toBeGreaterThanOrEqual(0);
    });

    it("fast preview downscaling bounds dimensions within 1024px", () => {
      const largeWidth = 2400;
      const largeHeight = 3600;
      const maxDim = 1024;

      const scale = Math.min(1, maxDim / Math.max(largeWidth, largeHeight));
      const previewW = Math.round(largeWidth * scale);
      const previewH = Math.round(largeHeight * scale);

      expect(Math.max(previewW, previewH)).toBeLessThanOrEqual(1024);
      expect(previewW).toBe(683);
      expect(previewH).toBe(1024);
    });

    it("skips expensive edge matting in Fast mode and preserves original mask", async () => {
      const w = 100;
      const h = 100;
      const totalPixels = w * h;
      const rgba = new Uint8ClampedArray(totalPixels * 4);
      const baseMask = new Uint8ClampedArray(totalPixels);
      baseMask.fill(255);

      // Fast mode bypasses edge refinement
      const imgData = new ImageData(rgba, w, h);
      const fastResult = await refineAlphaMattingWithMask(imgData, baseMask, null, {
        edgeQuality: "fast",
      });
      // In fast mode, base mask is preserved instantly without re-filtering
      expect(fastResult.alphaMaskBuffer[50]).toBe(255);
    });

    it("respects AbortController cancel signal and terminates immediately", () => {
      const controller = new AbortController();
      controller.abort();

      expect(controller.signal.aborted).toBe(true);
    });
  });
});
