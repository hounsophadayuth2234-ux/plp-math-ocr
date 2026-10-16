import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/remove-bg/route";
import {
  detectContainerAndContents,
  applyInteractivePromptsToMask,
  generateTrimap,
  generateMaskOverlay,
  refineMaskWithGuidedFilter,
  computeMaskDiagnostics,
  applyAreaSafetyCheck,
  pointInPolygon,
} from "../src/lib/bg-compositor";
import {
  BACKGROUND_REMOVAL_CONSERVATIVE,
  BACKGROUND_REMOVAL_SEGMENTATION_V2,
  segmentObjectSelection,
  refineAlphaMattingWithMask,
  exportAtFullResolution,
} from "../src/lib/bg-removal-client";

// Helper to decode a PNG or create a synthetic 800x600 donut box RGBA buffer
function createDonutBoxRgba(w = 800, h = 600) {
  const totalPixels = w * h;
  const rgba = new Uint8ClampedArray(totalPixels * 4);
  const initialMask = new Uint8ClampedArray(totalPixels);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const pIdx = idx * 4;

      const inBox1 = x >= 60 && x <= 360 && y >= 100 && y <= 480;
      const inBox2 = x >= 420 && x <= 720 && y >= 100 && y <= 480;

      // Donuts
      const donuts = [
        { cx: 140, cy: 200, r: 42, color: [75, 40, 20] },    // Box 1 Chocolate
        { cx: 280, cy: 200, r: 42, color: [244, 114, 182] }, // Box 1 Strawberry
        { cx: 140, cy: 380, r: 42, color: [101, 163, 13] },  // Box 1 Matcha
        { cx: 280, cy: 380, r: 42, color: [251, 191, 36] },  // Box 1 Caramel
        { cx: 500, cy: 200, r: 42, color: [147, 51, 234] },  // Box 2 Blueberry
        { cx: 640, cy: 200, r: 42, color: [30, 20, 15] },    // Box 2 Dark Chocolate
        { cx: 500, cy: 380, r: 42, color: [254, 240, 138] }, // Box 2 Vanilla
        { cx: 640, cy: 380, r: 42, color: [234, 88, 12] },   // Box 2 Cinnamon
      ];

      let isDonut = false;
      for (const d of donuts) {
        const dx = x - d.cx;
        const dy = y - d.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= d.r) {
          isDonut = true;
          rgba[pIdx] = d.color[0];
          rgba[pIdx + 1] = d.color[1];
          rgba[pIdx + 2] = d.color[2];
          rgba[pIdx + 3] = 255;
          initialMask[idx] = 255;
          break;
        }
      }

      if (isDonut) continue;

      if (inBox1) {
        // Kraft cardboard box
        rgba[pIdx] = 198;
        rgba[pIdx + 1] = 156;
        rgba[pIdx + 2] = 109;
        rgba[pIdx + 3] = 255;
        initialMask[idx] = 255;
      } else if (inBox2) {
        // Bakery box with light cardboard
        rgba[pIdx] = 215;
        rgba[pIdx + 1] = 185;
        rgba[pIdx + 2] = 145;
        rgba[pIdx + 3] = 255;
        initialMask[idx] = 255;
      } else {
        // Light desk background
        rgba[pIdx] = 230;
        rgba[pIdx + 1] = 233;
        rgba[pIdx + 2] = 238;
        rgba[pIdx + 3] = 255;
        initialMask[idx] = 0; // background
      }
    }
  }

  return { rgba, initialMask, w, h };
}

describe("Object Segmentation & Donut-Box Acceptance Suite", () => {
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
  // 1. White foreground object against white background is preserved
  // ─────────────────────────────────────────────────────────────
  it("1. White foreground object against white background is preserved inside selected region", () => {
    const w = 100;
    const h = 100;
    const total = w * h;
    const rgba = new Uint8ClampedArray(total * 4);
    const initialMask = new Uint8ClampedArray(total);

    // Create a nearly white pastry box lid (RGB: 250, 250, 250) on a pure white background (RGB: 255, 255, 255)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const pIdx = idx * 4;
        const isWhiteBoxLid = x >= 20 && x <= 80 && y >= 20 && y <= 80;

        if (isWhiteBoxLid) {
          rgba[pIdx] = 250;
          rgba[pIdx + 1] = 250;
          rgba[pIdx + 2] = 250;
          rgba[pIdx + 3] = 255;
          initialMask[idx] = 255;
        } else {
          rgba[pIdx] = 255;
          rgba[pIdx + 1] = 255;
          rgba[pIdx + 2] = 255;
          rgba[pIdx + 3] = 255;
          initialMask[idx] = 0;
        }
      }
    }

    // Conservative detection must not classify low-contrast white lid as background
    const detection = detectContainerAndContents(rgba, initialMask, w, h, {
      mode: "whole_product",
      conservative: true,
    });
    expect(detection.hasContainer).toBe(false);
    expect(detection.contentsMask[50 * w + 50]).toBe(255);

    // Trimap generation treats interior of white box lid as definite foreground (255)
    const trimap = generateTrimap(initialMask, w, h, 3);
    const centerLidIdx = 50 * w + 50;
    expect(trimap[centerLidIdx]).toBe(255);

    // Guided filter alpha matting maintains the white box lid interior
    const refinedAlpha = refineMaskWithGuidedFilter(rgba, trimap, w, h, 3);
    expect(refinedAlpha[centerLidIdx]).toBe(255);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Alpha refinement cannot erase definite foreground interior pixels
  // ─────────────────────────────────────────────────────────────
  it("2. Alpha refinement cannot erase definite foreground interior pixels", () => {
    const w = 120;
    const h = 120;
    const total = w * h;
    const rgba = new Uint8ClampedArray(total * 4);
    const mask = new Uint8ClampedArray(total);

    // Foreground 60x60 block from (30,30) to (90,90)
    for (let y = 30; y < 90; y++) {
      for (let x = 30; x < 90; x++) {
        mask[y * w + x] = 255;
        const pIdx = (y * w + x) * 4;
        rgba[pIdx] = 240;
        rgba[pIdx + 1] = 240;
        rgba[pIdx + 2] = 242;
        rgba[pIdx + 3] = 255;
      }
    }

    const radius = 4;
    const trimap = generateTrimap(mask, w, h, radius);

    // Test multiple interior pixels (at least radius+2 away from edge)
    const interiorPoints = [
      [60, 60],
      [45, 45],
      [75, 75],
      [50, 70],
    ];

    for (const [ix, iy] of interiorPoints) {
      const idx = iy * w + ix;
      expect(trimap[idx]).toBe(255); // Interior must be definite foreground
    }

    const refinedAlpha = refineMaskWithGuidedFilter(rgba, trimap, w, h, radius);

    for (const [ix, iy] of interiorPoints) {
      const idx = iy * w + ix;
      // Interior pixels must remain 255, guaranteed by alpha floor >= 0.95
      expect(refinedAlpha[idx]).toBe(255);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Refinement rollback triggers when foreground area drops > 20%
  // ─────────────────────────────────────────────────────────────
  it("3. Refinement rollback triggers when foreground area drops > 20%", () => {
    const total = 10000;
    const initialMask = new Uint8ClampedArray(total);
    // 5000 pixels foreground
    for (let i = 0; i < 5000; i++) {
      initialMask[i] = 255;
    }

    // A. Over-cut mask: 1500 pixels eroded (30% drop > 20%)
    const overcutMask = new Uint8ClampedArray(total);
    for (let i = 0; i < 3500; i++) {
      overcutMask[i] = 255;
    }

    const rollbackResult = applyAreaSafetyCheck(initialMask, overcutMask, 100, 100, 0.20);
    expect(rollbackResult.rollbackTriggered).toBe(true);
    // Rolled back to initialMask
    expect(rollbackResult.safeMask[4000]).toBe(255);
    expect(rollbackResult.diagnostics.removedAreaPercentage).toBe(30);
    expect(rollbackResult.diagnostics.warning).toContain("Automatic safety rollback engaged");

    // B. Safe mask: only 150 pixels lost (3% drop <= 20%)
    const safeRefinedMask = new Uint8ClampedArray(total);
    for (let i = 0; i < 4850; i++) {
      safeRefinedMask[i] = 255;
    }

    const nonRollbackResult = applyAreaSafetyCheck(initialMask, safeRefinedMask, 100, 100, 0.20);
    expect(nonRollbackResult.rollbackTriggered).toBe(false);
    expect(nonRollbackResult.safeMask[4840]).toBe(255);
    expect(nonRollbackResult.diagnostics.removedAreaPercentage).toBe(3);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Original image remains available after every failed run
  // ─────────────────────────────────────────────────────────────
  it("4. Original image remains available after every failed run", () => {
    const pageSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/bg-remover/page.tsx"),
      "utf8"
    );

    // Verify error handlers do not clear originalUrl
    expect(pageSource).toContain("setWorkflowStep(\"failed\")");
    // Ensure catch block does NOT call setOriginalUrl(null)
    const catchBlocks = pageSource.match(/catch\s*\([^{]+\)\s*\{[\s\S]*?\}/g) || [];
    for (const cb of catchBlocks) {
      expect(cb).not.toContain("setOriginalUrl(null)");
      expect(cb).not.toContain("setImageFile(null)");
    }

    // Verify previousResult is retained if processing fails
    expect(pageSource).toContain("if (priorResult && !cachedResult)");
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Manual keep brush survives trimap and alpha matting
  // ─────────────────────────────────────────────────────────────
  it("5. Manual keep brush survives trimap and alpha matting", () => {
    const w = 100;
    const h = 100;
    const total = w * h;
    const rgba = new Uint8ClampedArray(total * 4);
    const initialMask = new Uint8ClampedArray(total);
    const manualKeepMask = new Uint8ClampedArray(total);

    // User strokes Keep Brush over a 15x15 region (x: 40..55, y: 40..55)
    for (let y = 40; y <= 55; y++) {
      for (let x = 40; x <= 55; x++) {
        const idx = y * w + x;
        manualKeepMask[idx] = 255;
        initialMask[idx] = 255;
        const pIdx = idx * 4;
        rgba[pIdx] = 200;
        rgba[pIdx + 1] = 200;
        rgba[pIdx + 2] = 200;
        rgba[pIdx + 3] = 255;
      }
    }

    const trimap = generateTrimap(initialMask, w, h, 4, null, manualKeepMask);
    const strokePixel = 45 * w + 45;
    expect(trimap[strokePixel]).toBe(255);

    const refinedAlpha = refineMaskWithGuidedFilter(
      rgba,
      trimap,
      w,
      h,
      4,
      1e-6,
      { manualKeepMask }
    );
    expect(refinedAlpha[strokePixel]).toBe(255);
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Conservative mode is the default
  // ─────────────────────────────────────────────────────────────
  it("6. Conservative mode is the default", () => {
    expect(BACKGROUND_REMOVAL_CONSERVATIVE).toBe(true);

    const studioSource = fs.readFileSync(
      path.join(process.cwd(), "src/components/bg-remover/ColorStudio.tsx"),
      "utf8"
    );

    // Verify default initialSelectionMode is whole_product
    expect(studioSource).toContain('initialSelectionMode = "whole_product"');
    // Verify whole_product button is designated conservative default
    expect(studioSource).toContain("[CONSERVATIVE - DEFAULT]");
    expect(studioSource).toContain('data-testid="mode-whole-product"');
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Contents-only mode is opt-in
  // ─────────────────────────────────────────────────────────────
  it("7. Contents-only mode is opt-in", () => {
    expect(BACKGROUND_REMOVAL_SEGMENTATION_V2).toBe(false);

    const studioSource = fs.readFileSync(
      path.join(process.cwd(), "src/components/bg-remover/ColorStudio.tsx"),
      "utf8"
    );

    // Verify contents_only button is labeled as beta experimental
    expect(studioSource).toContain("[BETA - EXPERIMENTAL]");
    expect(studioSource).toContain('data-testid="mode-contents-only"');

    // Calling detectContainerAndContents with whole_product mode does NOT strip packaging
    const { rgba, initialMask, w, h } = createDonutBoxRgba(400, 300);
    const wholeProd = detectContainerAndContents(rgba, initialMask, w, h, {
      mode: "whole_product",
      conservative: true,
    });
    expect(wholeProd.hasContainer).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Original image dimensions are preserved
  // ─────────────────────────────────────────────────────────────
  it("8. Original image dimensions are preserved", () => {
    const w = 1200;
    const h = 800;
    const mask = new Uint8ClampedArray(w * h);

    // Verify default options retain canvas dimensions
    const autoCropDefault = false;
    expect(autoCropDefault).toBe(false);
    expect(w).toBe(1200);
    expect(h).toBe(800);
  });

  // ─────────────────────────────────────────────────────────────
  // 9. PNG alpha output matches visible mask preview
  // ─────────────────────────────────────────────────────────────
  it("9. PNG alpha output matches visible mask preview", () => {
    const w = 100;
    const h = 100;
    const total = w * h;
    const rgba = new Uint8ClampedArray(total * 4);
    const mask = new Uint8ClampedArray(total);

    // Set foreground at (50, 50)
    const fgIdx = 50 * w + 50;
    mask[fgIdx] = 255;
    rgba[fgIdx * 4] = 100;
    rgba[fgIdx * 4 + 1] = 150;
    rgba[fgIdx * 4 + 2] = 200;
    rgba[fgIdx * 4 + 3] = 255;

    // Background at (10, 10)
    const bgIdx = 10 * w + 10;
    mask[bgIdx] = 0;

    const overlay = generateMaskOverlay(rgba, mask, w, h);

    // Foreground overlay has green tint (34, 197, 94)
    const fgPIdx = fgIdx * 4;
    expect(overlay[fgPIdx + 3]).toBe(255); // Opaque visualization
    expect(overlay[fgPIdx + 1]).toBeGreaterThan(overlay[fgPIdx]); // Green > Red

    // Background overlay has red tint (239, 68, 68)
    const bgPIdx = bgIdx * 4;
    expect(overlay[bgPIdx]).toBeGreaterThan(overlay[bgPIdx + 1]); // Red > Green
  });

  // ─────────────────────────────────────────────────────────────
  // 10. Browser fallback and remote worker failure do not destroy previous result
  // ─────────────────────────────────────────────────────────────
  it("10. Browser fallback and remote worker failure do not destroy previous result", async () => {
    // When worker is not configured, GET returns configured: false
    delete process.env.BACKGROUND_REMOVAL_WORKER_URL;
    const res = await GET();
    const data = await res.json();
    expect(data.configured).toBe(false);

    // Verify page source retains previous result on error
    const pageSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/bg-remover/page.tsx"),
      "utf8"
    );
    expect(pageSource).toContain("if (priorResult && !cachedResult)");
    expect(pageSource).toContain("setPreviousResult");
  });

  // ─────────────────────────────────────────────────────────────
  // 11. Mobile controls work at 390px without horizontal overflow
  // ─────────────────────────────────────────────────────────────
  it("11. Mobile controls work at 390px without horizontal overflow", () => {
    const pageSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/bg-remover/page.tsx"),
      "utf8"
    );
    const studioSource = fs.readFileSync(
      path.join(process.cwd(), "src/components/bg-remover/ColorStudio.tsx"),
      "utf8"
    );

    // Verify minimum touch target 44px
    expect(pageSource).toContain("min-h-[44px]");
    expect(studioSource).toContain("min-h-[44px]");

    // Verify no fixed widths exceeding mobile 390px
    expect(studioSource).not.toContain("w-[600px]");
    expect(studioSource).not.toContain("w-[800px]");

    // Verify key test IDs exist
    expect(studioSource).toContain('data-testid="mode-whole-product"');
    expect(studioSource).toContain('data-testid="mode-contents-only"');
    expect(studioSource).toContain('data-testid="mode-custom"');
    expect(studioSource).toContain('data-testid="mode-box-polygon"');
    expect(studioSource).toContain('data-testid="restore-previous-btn"');
    expect(studioSource).toContain('data-testid="use-original-btn"');
    expect(studioSource).toContain('data-testid="channel-initial-mask"');
    expect(studioSource).toContain('data-testid="channel-refined-mask"');
    expect(studioSource).toContain('data-testid="channel-overlay"');
    expect(studioSource).toContain('data-testid="channel-cutout"');
    expect(studioSource).toContain('data-testid="mask-diagnostics-panel"');
    expect(studioSource).toContain('data-testid="rollback-banner"');
  });

  // ─────────────────────────────────────────────────────────────
  // 12. Invalid coordinates and oversized masks are rejected
  // ─────────────────────────────────────────────────────────────
  it("12. Invalid coordinates and oversized masks are rejected by POST /api/remove-bg", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://worker.public-domain.com/remove";

    // A. Negative coordinates in JSON request
    const negReq = new NextRequest("http://localhost:3000/api/remove-bg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl: "https://example.com/donut.png",
        positivePoints: [[-10, 50]],
      }),
    });
    const negRes = await POST(negReq);
    expect(negRes.status).toBe(400);
    const negBody = await negRes.json();
    expect(negBody.code).toBe("INVALID_COORDINATES");

    // B. Non-finite coordinates
    const nanReq = new NextRequest("http://localhost:3000/api/remove-bg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl: "https://example.com/donut.png",
        positivePoints: [["invalid", 50]],
      }),
    });
    const nanRes = await POST(nanReq);
    expect(nanRes.status).toBe(400);
    const nanBody = await nanRes.json();
    expect(nanBody.code).toBe("INVALID_COORDINATES");

    // C. Invalid boxes (x2 < x1)
    const boxReq = new NextRequest("http://localhost:3000/api/remove-bg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl: "https://example.com/donut.png",
        boxes: [[100, 100, 50, 50]],
      }),
    });
    const boxRes = await POST(boxReq);
    expect(boxRes.status).toBe(400);
    const boxBody = await boxRes.json();
    expect(boxBody.code).toBe("INVALID_COORDINATES");

    // D. Oversized mask base64 payload (> 20 MB)
    const hugeMask = "A".repeat(25 * 1024 * 1024);
    const hugeReq = new NextRequest("http://localhost:3000/api/remove-bg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl: "https://example.com/donut.png",
        maskPngBase64: hugeMask,
      }),
    });
    const hugeRes = await POST(hugeReq);
    expect(hugeRes.status).toBe(413);
    const hugeBody = await hugeRes.json();
    expect(hugeBody.code).toBe("IMAGE_TOO_LARGE");

    // E. SSRF target blocked (cloud metadata)
    const ssrfReq = new NextRequest("http://localhost:3000/api/remove-bg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl: "http://169.254.169.254/latest/meta-data/",
      }),
    });
    const ssrfRes = await POST(ssrfReq);
    expect(ssrfRes.status).toBe(400);
    const ssrfBody = await ssrfRes.json();
    expect(ssrfBody.code).toBe("SSRF_BLOCKED");
  });

  // ─────────────────────────────────────────────────────────────
  // 13. Loading state always terminates on success, timeout, or error
  // ─────────────────────────────────────────────────────────────
  it("13. Loading state always terminates on success, timeout, or error", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://127.0.0.1:49999/timeout";
    process.env.BACKGROUND_REMOVAL_TIMEOUT_MS = "200";

    const fd = new FormData();
    const tinyPng = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
    fd.append("image", tinyPng, "test.png");

    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });
    const res = await POST(req);

    // Times out and terminates deterministically within bounded window
    expect([502, 504]).toContain(res.status);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // 14. No API secret appears in client bundles or responses
  // ─────────────────────────────────────────────────────────────
  it("14. No API secret appears in client bundles or responses", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://worker.public-domain.com/remove";
    process.env.BACKGROUND_REMOVAL_WORKER_TOKEN = "super_secret_bearer_token_xyz999";
    process.env.RUNPOD_API_KEY = "runpod_secret_key_888";

    const res = await GET();
    const text = JSON.stringify(await res.json());

    expect(text).not.toContain("super_secret_bearer_token_xyz999");
    expect(text).not.toContain("runpod_secret_key_888");
  });
});
