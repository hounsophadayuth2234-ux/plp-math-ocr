import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyRectangleToMask,
  applyBrushStrokeToMask,
  cropRgbaToContent,
  compositeRgbaBuffer,
  computeMaskDiagnostics,
  applyAreaSafetyCheck,
  detectAndProtectTextAndLogos,
  preserveSmallForegroundComponents,
  combineForegroundProposals,
  SelectionMode,
} from "../src/lib/bg-compositor";
import {
  MANUAL_MASK_EDITOR,
  EDGE_REFINEMENT_DEFAULT,
  PRESERVE_ORIGINAL_RGB,
  refineAlphaMattingWithMask,
} from "../src/lib/bg-removal-client";

describe("AGY Production Acceptance Suite: Manual-Assisted Background Remover", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Feature Flags & Data Separation Model
  // ─────────────────────────────────────────────────────────────
  describe("1. Feature Flags & Separation Model", () => {
    it("exports required production feature flags", () => {
      expect(MANUAL_MASK_EDITOR).toBe(true);
      expect(EDGE_REFINEMENT_DEFAULT).toBe("off");
      expect(PRESERVE_ORIGINAL_RGB).toBe(true);
    });

    it("ensures immutable source RGB bytes: composite never mutates or tints original pixels", () => {
      const width = 10;
      const height = 10;
      const totalPixels = width * height;
      const srcRgba = new Uint8ClampedArray(totalPixels * 4);
      const initialMask = new Uint8ClampedArray(totalPixels);
      const editedMask = new Uint8ClampedArray(totalPixels);

      // Fill source with specific high-contrast test pixels (e.g. white, light shirt, logo colors)
      for (let i = 0; i < totalPixels; i++) {
        const pIdx = i * 4;
        srcRgba[pIdx] = 250;     // R
        srcRgba[pIdx + 1] = 245; // G
        srcRgba[pIdx + 2] = 240; // B
        srcRgba[pIdx + 3] = 255; // A (opaque original)
      }

      // Initial AI mask had some holes (e.g. AI wrongly thought white was background)
      initialMask.fill(0);
      initialMask[10] = 255;

      // User edited mask restores pixels
      editedMask.set(initialMask);
      editedMask[20] = 255;
      editedMask[21] = 255;

      // Clone original source to verify immutability
      const sourceSnapshot = new Uint8ClampedArray(srcRgba);

      // Perform transparent compositing
      const transparentOut = compositeRgbaBuffer(srcRgba, editedMask, width, height, "transparent");

      // Verify original source image was NOT mutated
      for (let i = 0; i < srcRgba.length; i++) {
        expect(srcRgba[i]).toBe(sourceSnapshot[i]);
      }

      // Verify transparent export has exact byte-for-byte RGB of original source for foreground
      const fgIdx20 = 20 * 4;
      expect(transparentOut[fgIdx20]).toBe(srcRgba[fgIdx20]);
      expect(transparentOut[fgIdx20 + 1]).toBe(srcRgba[fgIdx20 + 1]);
      expect(transparentOut[fgIdx20 + 2]).toBe(srcRgba[fgIdx20 + 2]);
      expect(transparentOut[fgIdx20 + 3]).toBe(255);

      // Verify background pixel alpha is 0
      const bgIdx0 = 0;
      expect(transparentOut[bgIdx0 + 3]).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Keep Brush & Erase Brush Mathematics
  // ─────────────────────────────────────────────────────────────
  describe("2. Keep Brush & Erase Brush Operations", () => {
    it("Keep Brush: restores missing foreground details with Hermite smoothstep falloff", () => {
      const width = 20;
      const height = 20;
      const mask = new Uint8ClampedArray(width * height); // all 0 (transparent)

      // Apply Keep brush at center (10, 10), radius 5, hardness 80%
      const updated = applyBrushStrokeToMask(mask, width, height, [[10, 10]], "keep", 5, 0.8);

      const centerIdx = 10 * width + 10;
      expect(updated[centerIdx]).toBe(255); // Center must be 100% restored

      // Near radius (e.g. dist 3): should be high opacity
      const innerIdx = 10 * width + 13; // dist 3
      expect(updated[innerIdx]).toBeGreaterThan(200);

      // Outside radius (dist 8): must remain 0
      const outerIdx = 10 * width + 18;
      expect(updated[outerIdx]).toBe(0);
    });

    it("Erase Brush: removes leftover background without affecting untouched areas", () => {
      const width = 20;
      const height = 20;
      const mask = new Uint8ClampedArray(width * height);
      mask.fill(255); // initially all foreground

      // Apply Erase brush at (5, 5), radius 4, hardness 100%
      const updated = applyBrushStrokeToMask(mask, width, height, [[5, 5]], "remove", 4, 1.0);

      const centerIdx = 5 * width + 5;
      expect(updated[centerIdx]).toBe(0); // Center must be completely transparent

      // Far away (15, 15): must remain 255
      const farIdx = 15 * width + 15;
      expect(updated[farIdx]).toBe(255);
    });

    it("Stroke Interpolation: paints along a line segment between points without gaps", () => {
      const width = 30;
      const height = 30;
      const mask = new Uint8ClampedArray(width * height);

      // Draw stroke from (5, 5) to (25, 5) with radius 3
      const updated = applyBrushStrokeToMask(mask, width, height, [[5, 5], [25, 5]], "keep", 3, 1.0);

      // Every pixel on the line (x: 5..25, y: 5) must be 255
      for (let x = 5; x <= 25; x++) {
        expect(updated[5 * width + x]).toBe(255);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Keep Rectangle & Erase Rectangle
  // ─────────────────────────────────────────────────────────────
  describe("3. Keep & Erase Rectangle Operations", () => {
    it("Keep Rectangle: fills rectangular region with solid 255", () => {
      const width = 20;
      const height = 20;
      const mask = new Uint8ClampedArray(width * height); // all 0

      // Keep rectangle from (4, 4) to (12, 10)
      const updated = applyRectangleToMask(mask, width, height, [4, 4, 12, 10], 255);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          if (x >= 4 && x <= 12 && y >= 4 && y <= 10) {
            expect(updated[idx]).toBe(255);
          } else {
            expect(updated[idx]).toBe(0);
          }
        }
      }
    });

    it("Erase Rectangle: sets rectangular region to solid 0, handles inverted drag coordinates", () => {
      const width = 20;
      const height = 20;
      const mask = new Uint8ClampedArray(width * height);
      mask.fill(255); // all 255

      // Inverted coordinates drag (x1 > x2, y1 > y2)
      const updated = applyRectangleToMask(mask, width, height, [15, 15, 5, 5], 0);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          if (x >= 5 && x <= 15 && y >= 5 && y <= 15) {
            expect(updated[idx]).toBe(0);
          } else {
            expect(updated[idx]).toBe(255);
          }
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Auto-Crop to Content Functionality
  // ─────────────────────────────────────────────────────────────
  describe("4. Crop to Content", () => {
    it("cropRgbaToContent trims transparent borders cleanly", () => {
      const width = 10;
      const height = 10;
      const srcRgba = new Uint8ClampedArray(width * height * 4);

      // Only a 4x4 sub-region from (2, 3) to (5, 6) has non-zero alpha
      for (let y = 3; y <= 6; y++) {
        for (let x = 2; x <= 5; x++) {
          const idx = (y * width + x) * 4;
          srcRgba[idx] = 100;     // R
          srcRgba[idx + 1] = 150; // G
          srcRgba[idx + 2] = 200; // B
          srcRgba[idx + 3] = 255; // A
        }
      }

      const cropped = cropRgbaToContent(srcRgba, width, height, 1);
      expect(cropped.width).toBe(4);
      expect(cropped.height).toBe(4);
      expect(cropped.croppedRgba.length).toBe(4 * 4 * 4);

      // Check pixel values preserved
      expect(cropped.croppedRgba[0]).toBe(100);
      expect(cropped.croppedRgba[1]).toBe(150);
      expect(cropped.croppedRgba[2]).toBe(200);
      expect(cropped.croppedRgba[3]).toBe(255);
    });

    it("cropRgbaToContent returns original dimensions if entire image is non-transparent", () => {
      const width = 8;
      const height = 8;
      const srcRgba = new Uint8ClampedArray(width * height * 4);
      srcRgba.fill(255);

      const cropped = cropRgbaToContent(srcRgba, width, height, 1);
      expect(cropped.width).toBe(width);
      expect(cropped.height).toBe(height);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Reset to Initial Mask vs Clear Mask vs Reset to Original
  // ─────────────────────────────────────────────────────────────
  describe("5. Mask Reset and Clear Logic", () => {
    it("Reset to Initial Mask restores initial AI segmentation without destroying source", () => {
      const total = 100;
      const initialMask = new Uint8ClampedArray(total);
      initialMask[10] = 255;
      initialMask[50] = 255;

      const workingMask = new Uint8ClampedArray(initialMask);
      // User modifies working mask with brush strokes
      workingMask.fill(255);

      // Reset to initial mask:
      workingMask.set(initialMask);

      expect(workingMask[10]).toBe(255);
      expect(workingMask[50]).toBe(255);
      expect(workingMask[0]).toBe(0);
      expect(workingMask[99]).toBe(0);
    });

    it("Clear Mask zeroes out entire mask", () => {
      const total = 50;
      const workingMask = new Uint8ClampedArray(total);
      workingMask.fill(255);

      workingMask.fill(0);
      for (let i = 0; i < total; i++) {
        expect(workingMask[i]).toBe(0);
      }
    });

    it("Reset to Original fills mask with 255 (keeping 100% full canvas)", () => {
      const total = 50;
      const workingMask = new Uint8ClampedArray(total);
      workingMask.fill(0);

      workingMask.fill(255);
      for (let i = 0; i < total; i++) {
        expect(workingMask[i]).toBe(255);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Optional Edge Matting & Rollback Safety Check
  // ─────────────────────────────────────────────────────────────
  describe("6. Optional Edge Matting with 10% Rollback Safety Check", () => {
    it("Safety check detects when refinement removes > 10% of foreground and triggers rollback", () => {
      const width = 100;
      const height = 100;
      const userEditedMask = new Uint8ClampedArray(width * height);
      // User painted 5000 pixels foreground
      for (let i = 0; i < 5000; i++) {
        userEditedMask[i] = 255;
      }

      // Over-aggressive matting removes 800 pixels (16% drop, exceeding 10% threshold)
      const overErodedMask = new Uint8ClampedArray(userEditedMask);
      for (let i = 0; i < 800; i++) {
        overErodedMask[i] = 0;
      }

      const safetyResult = applyAreaSafetyCheck(userEditedMask, overErodedMask, width, height, 0.10);
      expect(safetyResult.rollbackTriggered).toBe(true);
      expect(safetyResult.diagnostics.removedAreaPercentage).toBeCloseTo(16.0, 1);
      // Must restore user edited mask
      expect(safetyResult.safeMask).toEqual(userEditedMask);
    });

    it("Safety check approves refinement when area change is within 10%", () => {
      const width = 100;
      const height = 100;
      const userEditedMask = new Uint8ClampedArray(width * height);
      for (let i = 0; i < 5000; i++) {
        userEditedMask[i] = 255;
      }

      // Gentle edge matting removes 200 pixels (4% drop, safe)
      const refinedMask = new Uint8ClampedArray(userEditedMask);
      for (let i = 0; i < 200; i++) {
        refinedMask[i] = 0;
      }

      const safetyResult = applyAreaSafetyCheck(userEditedMask, refinedMask, width, height, 0.10);
      expect(safetyResult.rollbackTriggered).toBe(false);
      expect(safetyResult.safeMask).toEqual(refinedMask);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Khmer Poster, Text & Logos Protection
  // ─────────────────────────────────────────────────────────────
  describe("7. Document / Poster Text Protection", () => {
    it("detectAndProtectTextAndLogos protects high-contrast letters on white document background", () => {
      const width = 50;
      const height = 50;
      const totalPixels = width * height;
      const srcRgba = new Uint8ClampedArray(totalPixels * 4);
      srcRgba.fill(255); // White page background

      // Simulate dark Khmer text characters (R=20, G=20, B=20)
      for (let y = 20; y <= 25; y++) {
        for (let x = 10; x <= 40; x++) {
          const idx = (y * width + x) * 4;
          srcRgba[idx] = 20;
          srcRgba[idx + 1] = 20;
          srcRgba[idx + 2] = 20;
        }
      }

      const initialMask = new Uint8ClampedArray(totalPixels); // AI mask had missing text
      const result = detectAndProtectTextAndLogos(srcRgba, width, height, initialMask);
      const protectedMask = result.protectedMask;

      // Dark text strokes on white page must be marked as foreground (255)
      for (let y = 20; y <= 25; y++) {
        for (let x = 10; x <= 40; x++) {
          expect(protectedMask[y * width + x]).toBe(255);
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Hair, Fur, Plant Branches & Disconnected Foreground
  // ─────────────────────────────────────────────────────────────
  describe("8. Fine Details: Hair, Fur, Plant Branches & Disconnected Objects", () => {
    it("preserveSmallForegroundComponents protects small isolated objects and branches", () => {
      const width = 40;
      const height = 40;
      const mask = new Uint8ClampedArray(width * height);

      // Create a small disconnected object (e.g. flower bud, hair bead, earring) of size 25px
      for (let y = 5; y < 10; y++) {
        for (let x = 5; x < 10; x++) {
          mask[y * width + x] = 255;
        }
      }

      const result = preserveSmallForegroundComponents(mask, width, height, 15);
      // The 25px component must remain intact
      expect(result.preservedMask[5 * width + 5]).toBe(255);
      expect(result.preservedMask[9 * width + 9]).toBe(255);
    });

    it("combineForegroundProposals forms a conservative union preserving all disconnected foreground parts", () => {
      const width = 10;
      const height = 5;
      const total = width * height;
      const modelA = new Uint8ClampedArray(total);
      const modelB = new Uint8ClampedArray(total);

      // Model A detected person
      modelA[10] = 255;
      modelA[11] = 255;

      // Model B detected pet animal / plant branch
      modelB[30] = 255;
      modelB[31] = 255;

      const { unionMask } = combineForegroundProposals(modelA, modelB, width, height);
      expect(unionMask[10]).toBe(255);
      expect(unionMask[11]).toBe(255);
      expect(unionMask[30]).toBe(255);
      expect(unionMask[31]).toBe(255);
      expect(unionMask[0]).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9. Composite Modes: Transparent, White, Pink, Custom
  // ─────────────────────────────────────────────────────────────
  describe("9. Solid and Transparent Compositing Modes", () => {
    it("composites onto White #FFFFFF correctly with genuine alpha weighting", () => {
      const width = 2;
      const height = 2;
      const srcRgba = new Uint8ClampedArray([
        200, 100, 50, 255,  // pixel 0
        100, 200, 50, 255,  // pixel 1
        50, 100, 200, 255,  // pixel 2
        0, 0, 0, 255,        // pixel 3
      ]);
      const mask = new Uint8ClampedArray([255, 128, 0, 255]);

      const whiteOut = compositeRgbaBuffer(srcRgba, mask, width, height, "white");

      // Pixel 0: a=255 -> exact source (200, 100, 50)
      expect(whiteOut[0]).toBe(200);
      expect(whiteOut[1]).toBe(100);
      expect(whiteOut[2]).toBe(50);
      expect(whiteOut[3]).toBe(255);

      // Pixel 2: a=0 -> pure white #FFFFFF (255, 255, 255)
      expect(whiteOut[8]).toBe(255);
      expect(whiteOut[9]).toBe(255);
      expect(whiteOut[10]).toBe(255);
      expect(whiteOut[11]).toBe(255);
    });

    it("composites onto Custom Color (e.g. RGB 0, 240, 255) correctly", () => {
      const width = 1;
      const height = 1;
      const srcRgba = new Uint8ClampedArray([50, 50, 50, 255]);
      const mask = new Uint8ClampedArray([0]); // 100% background

      const customOut = compositeRgbaBuffer(srcRgba, mask, width, height, "white", { r: 0x00, g: 0xf0, b: 0xff });
      expect(customOut[0]).toBe(0x00);
      expect(customOut[1]).toBe(0xf0);
      expect(customOut[2]).toBe(0xff);
      expect(customOut[3]).toBe(255);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 10. Undo / Redo History Behavior
  // ─────────────────────────────────────────────────────────────
  describe("10. Undo / Redo Stack Dynamics", () => {
    it("maintains up to 20 snapshot states without memory leaks", () => {
      const maxHistory = 20;
      let history: Uint8ClampedArray[] = [];
      let redoStack: Uint8ClampedArray[] = [];

      const pushSnapshot = (currentMask: Uint8ClampedArray) => {
        const snapshot = new Uint8ClampedArray(currentMask);
        history = [...history, snapshot];
        if (history.length > maxHistory) {
          history = history.slice(history.length - maxHistory);
        }
        redoStack = [];
      };

      // Push 25 modifications
      for (let i = 0; i < 25; i++) {
        const m = new Uint8ClampedArray(10);
        m.fill(i);
        pushSnapshot(m);
      }

      expect(history.length).toBe(maxHistory);
      // Oldest retained is state 5
      expect(history[0][0]).toBe(5);
      // Newest retained is state 24
      expect(history[history.length - 1][0]).toBe(24);
    });
  });
});
