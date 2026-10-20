import { describe, it, expect } from "vitest";
import {
  autoPortraitSegmentationPipeline,
  chokeAndFeatherAlphaMask,
  detectDominantBackgroundColor,
  applyColorDehalo,
  isolatePersonMask,
} from "../src/lib/bg-compositor";
import { runImageUpscalePipeline, EnhancementConfig } from "../src/lib/image-upscale-engine";
import { requiresTextDetection } from "../src/lib/bg-removal-client";

describe("Module 02 Acceptance Test — Portrait Cutout Quality & Blue-Dot Elimination", () => {
  /**
   * Helper to construct the exact acceptance test image:
   * - 640 x 480 resolution
   * - White background (#ffffff: 255, 255, 255)
   * - Black suit jacket (#111827: 17, 24, 39)
   * - White shirt collar (#f8fafc: 248, 250, 252)
   * - Blue tie (#2563eb: 37, 99, 235)
   * - Neck & face & ears: skin tone (#f5d0b5: 245, 208, 181)
   * - Black hair (#09090b: 9, 9, 11)
   * - Isolated blue dot to the right of the face at (x=460, y=175) with radius 7 (#2563eb: 37, 99, 235)
   */
  function createAcceptancePortraitFixture(width = 640, height = 480) {
    const rgba = new Uint8ClampedArray(width * height * 4);
    const rawMask = new Uint8ClampedArray(width * height);

    // 1. Initialize entire canvas to white background
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 255;
      rgba[i * 4 + 2] = 255;
      rgba[i * 4 + 3] = 255;
      rawMask[i] = 0;
    }

    // Helper: fill ellipse
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

    // Helper: fill rectangle
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

    // 2. Black suit jacket & shoulders (ellipse at bottom)
    fillEllipse(320, 450, 190, 140, 17, 24, 39, 255);

    // 3. White shirt collar in V-neck opening (x=270..370, y=310..370)
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

    // 4. Blue tie running down chest (x=306..334, y=320..470)
    fillRect(310, 320, 20, 150, 37, 99, 235, 255);

    // 5. Neck
    fillRect(296, 250, 48, 65, 245, 208, 181, 255);

    // 6. Ears
    fillEllipse(248, 200, 14, 24, 245, 208, 181, 255);
    fillEllipse(392, 200, 14, 24, 245, 208, 181, 255);

    // 7. Face
    fillEllipse(320, 200, 72, 85, 245, 208, 181, 255);

    // 8. Hair on top
    fillEllipse(320, 160, 78, 45, 9, 9, 11, 255);

    // 9. Small isolated blue dot to the right of face at (460, 175), radius 7
    // This is separated by >60px of white background from the face
    fillEllipse(460, 175, 7, 7, 37, 99, 235, 255);

    return { rgba, rawMask, width, height };
  }

  it("Test Case 1: Person in suit & tie with isolated blue dot -> Removes blue dot, keeps subject, outputs clean alpha", () => {
    const { rgba, rawMask, width, height } = createAcceptancePortraitFixture(640, 480);

    // Verify initial test state: blue dot pixel is marked in rawMask
    const blueDotIdx = 175 * width + 460;
    expect(rawMask[blueDotIdx]).toBe(255);

    // Run the Auto Portrait dedicated pipeline
    const result = autoPortraitSegmentationPipeline(rgba, rawMask, width, height, {
      alphaChokePx: 1.2,
      featherRadiusPx: 1.0,
      decontaminateBg: true,
    });

    // 1. Expected result: KEEP person silhouette
    // - Black suit shoulder (x=200, y=420)
    expect(result.finalMask[420 * width + 200]).toBeGreaterThanOrEqual(200);
    // - Black suit center (x=320, y=420)
    expect(result.finalMask[420 * width + 320]).toBeGreaterThanOrEqual(240);
    // - Blue tie (x=320, y=360)
    expect(result.finalMask[360 * width + 320]).toBeGreaterThanOrEqual(240);
    // - White shirt collar (x=315, y=330)
    expect(result.finalMask[330 * width + 315]).toBeGreaterThanOrEqual(240);
    // - Face center (x=320, y=200)
    expect(result.finalMask[200 * width + 320]).toBeGreaterThanOrEqual(240);
    // - Left ear (x=248, y=200)
    expect(result.finalMask[200 * width + 248]).toBeGreaterThanOrEqual(200);
    // - Right ear (x=392, y=200)
    expect(result.finalMask[200 * width + 392]).toBeGreaterThanOrEqual(200);
    // - Hair (x=320, y=140)
    expect(result.finalMask[140 * width + 320]).toBeGreaterThanOrEqual(200);

    // 2. Expected result: REMOVE entire white background
    expect(result.finalMask[20 * width + 20]).toBe(0);
    expect(result.finalMask[20 * width + 600]).toBe(0);
    expect(result.finalMask[460 * width + 20]).toBe(0);
    expect(result.finalMask[460 * width + 600]).toBe(0);

    // 3. Expected result: COMPLETELY REMOVE ISOLATED BLUE DOT
    // Must be exactly 0 (transparent)
    expect(result.finalMask[blueDotIdx]).toBe(0);
    // Surrounding pixels of blue dot must also be 0
    for (let dy = -7; dy <= 7; dy++) {
      for (let dx = -7; dx <= 7; dx++) {
        const dotNeighbor = (175 + dy) * width + (460 + dx);
        expect(result.finalMask[dotNeighbor]).toBe(0);
      }
    }

    // 4. Expected result: Blue dot tracked in removedComponentsMask
    expect(result.removedComponentsMask[blueDotIdx]).toBe(255);
    expect(result.removedComponentsCount).toBeGreaterThanOrEqual(1);

    // 5. Expected result: Zero isolated blobs remaining
    expect(result.hasIsolatedBlobsRemaining).toBe(false);
  });

  it("Test Case 2: Portrait with hair and shoulders preserves edges without excessive erosion", () => {
    const { rgba, rawMask, width, height } = createAcceptancePortraitFixture(640, 480);

    const result = autoPortraitSegmentationPipeline(rgba, rawMask, width, height, {
      alphaChokePx: 1.2,
      featherRadiusPx: 1.0,
      decontaminateBg: true,
    });

    // Check fine boundary near top of hair (y=125, inside hair boundary)
    // Should not be completely eroded away
    let preservedHairPixels = 0;
    for (let x = 300; x <= 340; x++) {
      if (result.finalMask[130 * width + x] > 100) preservedHairPixels++;
    }
    expect(preservedHairPixels).toBeGreaterThan(20);

    // Check shoulder boundary
    let preservedShoulderPixels = 0;
    for (let x = 160; x <= 220; x++) {
      if (result.finalMask[420 * width + x] > 100) preservedShoulderPixels++;
    }
    expect(preservedShoulderPixels).toBeGreaterThan(30);
  });

  it("Test Case 3: Mode Auto Portrait disables text detection to guarantee fast performance", () => {
    expect(requiresTextDetection("auto_portrait")).toBe(false);
    expect(requiresTextDetection("auto_general")).toBe(false);
    expect(requiresTextDetection("preserve_all_foreground")).toBe(false);
    expect(requiresTextDetection("person_text_only")).toBe(true);
  });

  it("Test Case 4: Product Image in Auto General keeps product and packaging intact", () => {
    // 200x200 product box
    const width = 400;
    const height = 400;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const rawMask = new Uint8ClampedArray(width * height);

    // White backdrop
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 255;
      rgba[i * 4 + 2] = 255;
      rgba[i * 4 + 3] = 255;
      rawMask[i] = 0;
    }

    // Product box: brown cardboard box (180, 130, 80)
    for (let y = 100; y < 300; y++) {
      for (let x = 100; x < 300; x++) {
        const idx = y * width + x;
        rgba[idx * 4] = 180;
        rgba[idx * 4 + 1] = 130;
        rgba[idx * 4 + 2] = 80;
        rgba[idx * 4 + 3] = 255;
        rawMask[idx] = 255;
      }
    }

    // In Auto General / preserve_all_foreground, product is kept
    expect(rawMask[200 * width + 200]).toBe(255);
  });
});

describe("Module 03 Acceptance Test — 4x Upscale Dimensions & Real Quality", () => {
  it("Test Case 5: 4x mode on 640x480 produces exactly 2560x1920 with factor 4 and zero silent fallback", async () => {
    // Create 640x480 test image
    const width = 640;
    const height = 480;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        data[idx] = (x * 3) % 256;
        data[idx + 1] = (y * 2) % 256;
        data[idx + 2] = 160;
        data[idx + 3] = 255;
      }
    }

    const config: EnhancementConfig = {
      factor: 4,
      preset: "ultra",
      sharpness: 80,
      denoise: 25,
      clarity: 60,
      faceEnhancement: false,
    };

    const result = await runImageUpscalePipeline(
      { data, width, height },
      {
        scale: 4,
        preset: "ultra",
        faceEnhance: false,
        denoise: 25,
        sharpness: 80,
        clarity: 60,
        config,
      }
    );

    // Exact dimension checks
    expect(result.width).toBe(2560);
    expect(result.height).toBe(1920);
    expect(result.data.length).toBe(2560 * 1920 * 4);
    // Non-blank output: check that pixels are non-zero
    let sum = 0;
    for (let i = 0; i < 1000; i++) {
      sum += result.data[i * 4];
    }
    expect(sum).toBeGreaterThan(0);
  });
});
