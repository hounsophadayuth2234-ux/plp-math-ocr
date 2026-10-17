import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  combineForegroundProposals,
  detectAndProtectTextAndLogos,
  preserveSmallForegroundComponents,
  generateTrimap,
  detectContainerAndContents,
  computeMaskDiagnostics,
  applyAreaSafetyCheck,
  compositeRgbaBuffer,
  SelectionMode,
} from "../src/lib/bg-compositor";
import {
  segmentObjectSelection,
  refineAlphaMattingWithMask,
} from "../src/lib/bg-removal-client";
import { POST, getImageDimensions } from "../src/app/api/remove-bg/route";

// Helper: create a 1x1 valid PNG buffer as Uint8Array
function createTinyPngBuffer(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT
    0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05,
    0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00,
    0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, // IEND
    0x60, 0x82,
  ]);
}

// Helper: create a valid PNG buffer of specified width and height with valid IHDR
function createPngWithDimensions(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(33);
  // PNG Signature
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR length 13
  buf[11] = 13;
  // IHDR tag
  buf.set([0x49, 0x48, 0x44, 0x52], 12);
  // Width (BE 4 bytes)
  const view = new DataView(buf.buffer);
  view.setUint32(16, width, false);
  // Height (BE 4 bytes)
  view.setUint32(20, height, false);
  buf[24] = 8; // Bit depth
  buf[25] = 6; // RGBA
  return buf;
}

describe("AGY Production Acceptance Suite: Preserve All Foreground, Remove Only Background", () => {
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
  // Fixture 1: Hair, Fur & Fine Details Mode Trimap
  // ─────────────────────────────────────────────────────────────
  it("Fixture 1: expands trimap unknown band (radius 6-10px) in fine_details mode for soft hair/fur edges", () => {
    const width = 100;
    const height = 100;
    const mask = new Uint8ClampedArray(width * height);

    // Circle foreground in center
    for (let y = 30; y < 70; y++) {
      for (let x = 30; x < 70; x++) {
        mask[y * width + x] = 255;
      }
    }

    // Fast mode trimap
    const fastTrimap = generateTrimap(mask, width, height, 2, null, null, { quality: "fast" });
    let fastUnknownCount = 0;
    for (let i = 0; i < fastTrimap.length; i++) {
      if (fastTrimap[i] === 128) fastUnknownCount++;
    }

    // Fine details mode trimap
    const fineTrimap = generateTrimap(mask, width, height, 2, null, null, { quality: "fine_details" });
    let fineUnknownCount = 0;
    for (let i = 0; i < fineTrimap.length; i++) {
      if (fineTrimap[i] === 128) fineUnknownCount++;
    }

    // Unknown band in fine_details mode MUST be significantly wider than fast mode to allow soft hair/fur matting
    expect(fineUnknownCount).toBeGreaterThan(fastUnknownCount * 1.5);
  });

  // ─────────────────────────────────────────────────────────────
  // Fixture 2: White Clothing & Low-Saturation Objects
  // ─────────────────────────────────────────────────────────────
  it("Fixture 2: does NOT classify bright or low-saturation pixels as background by color alone", () => {
    const width = 50;
    const height = 50;
    const sourceRgba = new Uint8ClampedArray(width * height * 4);

    // Entire image is bright / white-ish (R=245, G=245, B=245)
    for (let i = 0; i < width * height; i++) {
      sourceRgba[i * 4] = 245;
      sourceRgba[i * 4 + 1] = 245;
      sourceRgba[i * 4 + 2] = 245;
      sourceRgba[i * 4 + 3] = 255;
    }

    // A foreground person wearing a white shirt is in region [10..40, 10..40]
    const initialMask = new Uint8ClampedArray(width * height);
    for (let y = 10; y < 40; y++) {
      for (let x = 10; x < 40; x++) {
        initialMask[y * width + x] = 255;
      }
    }

    const result = detectContainerAndContents(sourceRgba, initialMask, width, height, {
      mode: "whole_product",
      conservative: true,
    });

    // Interior white shirt pixel (x=25, y=25) must remain 100% foreground (255)
    expect(result.contentsMask[25 * width + 25]).toBe(255);
    // Background pixel (x=5, y=5) remains 0
    expect(result.contentsMask[5 * width + 5]).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Fixture 3 & 4: Plants with Thin Branches & Disconnected Leaves
  // ─────────────────────────────────────────────────────────────
  it("Fixture 3 & 4: preserves disconnected small components down to 2px (leaves, twigs, fine details)", () => {
    const width = 80;
    const height = 80;
    const mask = new Uint8ClampedArray(width * height);

    // Main plant trunk at center
    for (let y = 30; y < 60; y++) {
      for (let x = 38; x <= 42; x++) {
        mask[y * width + x] = 255;
      }
    }

    // Disconnected small leaf 1 (3 pixels) at (10, 10)
    mask[10 * width + 10] = 255;
    mask[10 * width + 11] = 255;
    mask[11 * width + 10] = 255;

    // Disconnected small twig 2 (4 pixels) at (65, 20)
    mask[20 * width + 65] = 255;
    mask[20 * width + 66] = 255;
    mask[21 * width + 65] = 255;
    mask[21 * width + 66] = 255;

    // Preserve small foreground components
    const result = preserveSmallForegroundComponents(mask, width, height, 2);

    expect(result.preservedMask[10 * width + 10]).toBe(255);
    expect(result.preservedMask[10 * width + 11]).toBe(255);
    expect(result.preservedMask[20 * width + 65]).toBe(255);
    expect(result.preservedMask[20 * width + 66]).toBe(255);
    expect(result.smallComponentCount).toBeGreaterThanOrEqual(2);
  });

  // ─────────────────────────────────────────────────────────────
  // Fixture 5: Product with White Cardboard Box / Lid (Donut Box)
  // ─────────────────────────────────────────────────────────────
  it("Fixture 5: preserves white cardboard lids and packages in preserve_all_foreground mode", () => {
    const width = 100;
    const height = 100;
    const sourceRgba = new Uint8ClampedArray(width * height * 4);
    const initialMask = new Uint8ClampedArray(width * height);

    // Donut box with white cardboard lid
    for (let y = 20; y < 80; y++) {
      for (let x = 20; x < 80; x++) {
        initialMask[y * width + x] = 255;
        // White cardboard lid color (R=250, G=248, B=245)
        sourceRgba[(y * width + x) * 4] = 250;
        sourceRgba[(y * width + x) * 4 + 1] = 248;
        sourceRgba[(y * width + x) * 4 + 2] = 245;
        sourceRgba[(y * width + x) * 4 + 3] = 255;
      }
    }

    const segmented = detectContainerAndContents(sourceRgba, initialMask, width, height, {
      mode: "whole_product",
      conservative: true,
    });

    // White lid region must not be hollowed out
    expect(segmented.contentsMask[50 * width + 50]).toBe(255);
    expect(segmented.contentsMask[25 * width + 25]).toBe(255);
    expect(segmented.contentsMask[75 * width + 75]).toBe(255);
  });

  // ─────────────────────────────────────────────────────────────
  // Fixture 6: Multiple Disconnected Foreground Objects
  // ─────────────────────────────────────────────────────────────
  it("Fixture 6: preserves all disconnected objects across the image without pruning", () => {
    const width = 120;
    const height = 120;
    const mask = new Uint8ClampedArray(width * height);

    // Object A at top-left
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) {
        mask[y * width + x] = 255;
      }
    }

    // Object B at center
    for (let y = 50; y < 70; y++) {
      for (let x = 50; x < 70; x++) {
        mask[y * width + x] = 255;
      }
    }

    // Object C at bottom-right
    for (let y = 90; y < 110; y++) {
      for (let x = 90; x < 110; x++) {
        mask[y * width + x] = 255;
      }
    }

    const diag = computeMaskDiagnostics(mask, mask, width, height, 0.10);
    expect(diag.connectedComponentCount).toBe(3);
    expect(diag.areaRetentionRatio).toBe(1);
    expect(diag.rollbackTriggered).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // Fixture 7: Poster / Document with Khmer Text and Logos
  // ─────────────────────────────────────────────────────────────
  it("Fixture 7: text & logo protection flags and preserves high-frequency Khmer text strokes", () => {
    const width = 100;
    const height = 100;
    const sourceRgba = new Uint8ClampedArray(width * height * 4);
    const existingMask = new Uint8ClampedArray(width * height);

    // Fill background with light color
    for (let i = 0; i < width * height; i++) {
      sourceRgba[i * 4] = 240;
      sourceRgba[i * 4 + 1] = 240;
      sourceRgba[i * 4 + 2] = 240;
      sourceRgba[i * 4 + 3] = 255;
    }

    // Dark text stroke lines (Khmer lettering contrast)
    for (let y = 40; y <= 45; y++) {
      for (let x = 20; x <= 80; x++) {
        sourceRgba[(y * width + x) * 4] = 20;
        sourceRgba[(y * width + x) * 4 + 1] = 20;
        sourceRgba[(y * width + x) * 4 + 2] = 20;
      }
    }

    const res = detectAndProtectTextAndLogos(sourceRgba, width, height, existingMask);
    // Text stroke at (50, 42) must be preserved in protected mask
    expect(res.protectedMask[42 * width + 50]).toBe(255);
    expect(res.hasProtectedText).toBe(true);
    expect(res.textProtectedArea).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Fixture 9: Low-Contrast Object: Union of Multiple Foreground Proposals
  // ─────────────────────────────────────────────────────────────
  it("Fixture 9: conservative union combines proposals from multiple models without losing either", () => {
    const width = 50;
    const height = 50;
    const proposalA = new Uint8ClampedArray(width * height);
    const proposalB = new Uint8ClampedArray(width * height);

    // Model A detects left portion [10..30, 10..30]
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) {
        proposalA[y * width + x] = 255;
      }
    }

    // Model B detects right portion [10..30, 25..45]
    for (let y = 10; y < 30; y++) {
      for (let x = 25; x < 45; x++) {
        proposalB[y * width + x] = 255;
      }
    }

    const combined = combineForegroundProposals(proposalA, proposalB, width, height);

    // Conservative union: left portion (from A) must be 255
    expect(combined.unionMask[20 * width + 15]).toBe(255);
    // Overlapping portion (from both) must be 255
    expect(combined.unionMask[20 * width + 28]).toBe(255);
    // Right portion (from B) must be 255
    expect(combined.unionMask[20 * width + 40]).toBe(255);
    // Outside must be 0
    expect(combined.unionMask[5 * width + 5]).toBe(0);
    // Disagreements tracked
    expect(combined.disagreementPixelCount).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Safety Check & Rollback (> 10% area drop or > 5% in doc mode)
  // ─────────────────────────────────────────────────────────────
  it("Rollback: triggers when edge refinement removes > 10% of foreground", () => {
    const width = 50;
    const height = 50;
    const initialMask = new Uint8ClampedArray(width * height);
    const refinedMask = new Uint8ClampedArray(width * height);

    // Initial mask has 1000 foreground pixels
    for (let i = 0; i < 1000; i++) {
      initialMask[i] = 255;
      refinedMask[i] = 255;
    }

    // Refinement erroneously deletes 150 pixels (15% drop > 10%)
    for (let i = 850; i < 1000; i++) {
      refinedMask[i] = 0;
    }

    const safetyResult = applyAreaSafetyCheck(initialMask, refinedMask, width, height, 0.10);

    expect(safetyResult.rollbackTriggered).toBe(true);
    expect(safetyResult.diagnostics.removedAreaPercentage).toBeCloseTo(15, 0);
    // Safe mask restored to initialMask
    expect(safetyResult.safeMask[900]).toBe(255);
    expect(safetyResult.diagnostics.warning).toContain("We kept the safer mask because edge refinement removed possible foreground details");
  });

  it("Rollback: triggers when text/document mode foreground drops > 5%", () => {
    const width = 50;
    const height = 50;
    const initialMask = new Uint8ClampedArray(width * height);
    const refinedMask = new Uint8ClampedArray(width * height);

    // Initial mask has 1000 pixels
    for (let i = 0; i < 1000; i++) {
      initialMask[i] = 255;
      refinedMask[i] = 255;
    }

    // Refinement deletes 70 pixels (7% drop > 5% doc threshold)
    for (let i = 930; i < 1000; i++) {
      refinedMask[i] = 0;
    }

    const safetyResult = applyAreaSafetyCheck(initialMask, refinedMask, width, height, 0.10, {
      mode: "document_poster",
    });

    expect(safetyResult.rollbackTriggered).toBe(true);
    expect(safetyResult.safeMask[950]).toBe(255);
  });

  // ─────────────────────────────────────────────────────────────
  // Color Switching & Untouched Original RGB Bytes
  // ─────────────────────────────────────────────────────────────
  it("Color Studio: composites without mutating original RGB bytes", () => {
    const width = 2;
    const height = 2;
    // Source: red pixel (200, 30, 30, 255)
    const sourceRgba = new Uint8ClampedArray([
      200, 30, 30, 255,
      200, 30, 30, 255,
      200, 30, 30, 255,
      200, 30, 30, 255,
    ]);
    // Mask: top-left opaque (255), top-right transparent (0)
    const mask = new Uint8ClampedArray([255, 0, 255, 0]);

    // Composite to white
    const whiteComp = compositeRgbaBuffer(sourceRgba, mask, width, height, "white");
    // Top-left foreground pixel RGB is identical to source
    expect(whiteComp[0]).toBe(200);
    expect(whiteComp[1]).toBe(30);
    expect(whiteComp[2]).toBe(30);
    expect(whiteComp[3]).toBe(255);

    // Top-right background pixel is pure white (255, 255, 255)
    expect(whiteComp[4]).toBe(255);
    expect(whiteComp[5]).toBe(255);
    expect(whiteComp[6]).toBe(255);

    // Composite to custom color (#00FF00 green)
    const customComp = compositeRgbaBuffer(sourceRgba, mask, width, height, "white", { r: 0, g: 255, b: 0 });
    // Foreground pixel still completely unchanged
    expect(customComp[0]).toBe(200);
    expect(customComp[1]).toBe(30);
    expect(customComp[2]).toBe(30);
    // Background pixel has custom green color
    expect(customComp[4]).toBe(0);
    expect(customComp[5]).toBe(255);
    expect(customComp[6]).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // API Contract for POST /api/remove-bg
  // ─────────────────────────────────────────────────────────────
  it("API: accepts JSON imageBase64 and returns structured JSON contract", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://mock-worker.test/api/remove";

    const tinyPng = createTinyPngBuffer();
    const tinyPngBase64 = `data:image/png;base64,${Buffer.from(tinyPng).toString("base64")}`;

    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => {
      return new Response(new Blob([tinyPng as any], { type: "image/png" }), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "X-Segmentation-Model": "BiRefNet-v2",
        },
      });
    });

    const req = new NextRequest("http://localhost:3000/api/remove-bg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: tinyPngBase64,
        mode: "preserve_all_foreground",
        quality: "fine_details",
        keepBoxes: [[0, 0, 1, 1]],
        eraseBoxes: [],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.width).toBe(1);
    expect(body.height).toBe(1);
    expect(body.alphaPngBase64).toBeDefined();
    expect(body.alphaPngBase64).toContain("data:image/png;base64,");
    expect(body.maskPngBase64).toBeDefined();
    expect(body.quality).toBe("fine_details");
    expect(body.timingsMs).toBeDefined();
    expect(body.warnings).toEqual([]);
  });

  it("API: rejects decompression bomb payload exceeding 50MP with DECOMPRESSION_BOMB", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://mock-worker.test/api/remove";

    // 10000x6000 = 60 Megapixels (> 50MP)
    const bombPng = createPngWithDimensions(10000, 6000);
    const bombBase64 = `data:image/png;base64,${Buffer.from(bombPng).toString("base64")}`;

    const req = new NextRequest("http://localhost:3000/api/remove-bg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: bombBase64,
        mode: "preserve_all_foreground",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("DECOMPRESSION_BOMB");
    expect(body.error).toContain("exceed maximum safe limit");
  });
});
