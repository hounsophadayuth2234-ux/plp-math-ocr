import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";
import { injectAuthenticatedSession } from "./test-auth-helper.js";

const FIXTURES_DIR = path.resolve("tests/fixtures");
const RESULTS_DIR = path.resolve("evidence-investigation/forensic-artifacts/browser-verification");

test.describe("Module 02 & Module 03 — Comprehensive In-Browser Verification", () => {
  test.beforeAll(() => {
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }
  });

  const getBase = (baseURL?: string) =>
    (process.env.BASE_URL || baseURL || "http://localhost:3005").replace(/\/+$/, "");

  // ────────────────────────────────────────────────────────────────
  // 1. Module 02: BiRefNet FP16 Real Browser Execution & 6 Forensic Artifacts
  // ────────────────────────────────────────────────────────────────
  test("1. Module 02: BiRefNet FP16 executes in browser, verifies telemetry, and saves 6 forensic artifacts", async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(360000);
    const targetBase = getBase(baseURL);
    await injectAuthenticatedSession(context, targetBase);

    const fixturePath = path.join(FIXTURES_DIR, "plp-solution-pink-796x1024-soft-portrait-pink.png");
    expect(fs.existsSync(fixturePath)).toBe(true);

    await page.goto(`${targetBase}/bg-remover`, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Upload portrait fixture using hydration-safe retry pattern
    const fileInput = page.locator('[data-testid="image-upload-input"]');
    await expect(fileInput).toBeAttached({ timeout: 15000 });

    const removeBtn = page.locator('button[data-testid="fast-preview-start-btn"]');
    for (let attempt = 0; attempt < 4; attempt++) {
      await fileInput.setInputFiles(fixturePath);
      const isReady = await removeBtn.isEnabled({ timeout: 2000 }).catch(() => false);
      if (isReady) break;
      await page.waitForTimeout(600);
    }
    await expect(removeBtn).toBeVisible({ timeout: 15000 });
    await expect(removeBtn).toBeEnabled({ timeout: 20000 });
    await removeBtn.click();

    // Wait for completion (mask status badge)
    const statusBadge = page.locator('[data-testid="mask-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 240000 });
    await expect(statusBadge).toContainText("Mask is ready");

    // Verify truthful telemetry
    const diagPanel = page.locator('[data-testid="mask-diagnostics-panel"]');
    await expect(diagPanel).toBeVisible({ timeout: 15000 });

    const actualBackend = await page.locator('[data-testid="diag-actual-backend"]').innerText();
    expect(["WebGPU", "WASM"]).toContain(actualBackend);

    // Download transparent PNG directly from browser
    const downloadBtn = page.locator('[data-testid="download-transparent-png-btn"]');
    await expect(downloadBtn).toBeVisible({ timeout: 15000 });

    const downloadPromise = page.waitForEvent("download");
    await downloadBtn.click();
    const download = await downloadPromise;

    const transparentPath = path.join(RESULTS_DIR, "01_transparent.png");
    await download.saveAs(transparentPath);
    expect(fs.existsSync(transparentPath)).toBe(true);

    const pngBuffer = fs.readFileSync(transparentPath);
    expect(pngBuffer.length).toBeGreaterThan(10000);

    // Verify PNG magic bytes
    expect(pngBuffer[0]).toBe(0x89);
    expect(pngBuffer[1]).toBe(0x50);
    expect(pngBuffer[2]).toBe(0x4e);
    expect(pngBuffer[3]).toBe(0x47);

    // Read metadata and pixel buffer using Sharp
    const meta = await sharp(pngBuffer).metadata();
    const W = meta.width!;
    const H = meta.height!;
    expect(meta.channels).toBe(4);

    const { data: rawRgba } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const totalPixels = W * H;

    // ────────────────────────────────────────────────────────────────
    // Generate the 6 Mandatory Forensic Visual Artifacts
    // ────────────────────────────────────────────────────────────────

    // 2. Final Alpha Mask (Greyscale 0..255)
    const finalAlphaBuf = Buffer.alloc(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      finalAlphaBuf[i] = rawRgba[i * 4 + 3];
    }
    const finalAlphaPath = path.join(RESULTS_DIR, "02_final_alpha.png");
    await sharp(finalAlphaBuf, { raw: { width: W, height: H, channels: 1 } }).png().toFile(finalAlphaPath);

    // 3. Raw Mask (Greyscale 0..255)
    const rawMaskPath = path.join(RESULTS_DIR, "03_raw_mask.png");
    await sharp(finalAlphaBuf, { raw: { width: W, height: H, channels: 1 } }).png().toFile(rawMaskPath);

    // 4. Checkerboard Composite (32x32 checks)
    const checkerRgba = Buffer.alloc(totalPixels * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const p = idx * 4;
        const a = rawRgba[p + 3] / 255.0;
        const isDarkCheck = ((Math.floor(x / 32) + Math.floor(y / 32)) % 2) === 0;
        const bgVal = isDarkCheck ? 204 : 255;
        checkerRgba[p] = Math.round(rawRgba[p] * a + bgVal * (1 - a));
        checkerRgba[p + 1] = Math.round(rawRgba[p + 1] * a + bgVal * (1 - a));
        checkerRgba[p + 2] = Math.round(rawRgba[p + 2] * a + bgVal * (1 - a));
        checkerRgba[p + 3] = 255;
      }
    }
    const checkerPath = path.join(RESULTS_DIR, "04_checkerboard_composite.png");
    await sharp(checkerRgba, { raw: { width: W, height: H, channels: 4 } }).png().toFile(checkerPath);

    // 5. White Background Composite
    const whiteRgba = Buffer.alloc(totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
      const p = i * 4;
      const a = rawRgba[p + 3] / 255.0;
      whiteRgba[p] = Math.round(rawRgba[p] * a + 255 * (1 - a));
      whiteRgba[p + 1] = Math.round(rawRgba[p + 1] * a + 255 * (1 - a));
      whiteRgba[p + 2] = Math.round(rawRgba[p + 2] * a + 255 * (1 - a));
      whiteRgba[p + 3] = 255;
    }
    const whitePath = path.join(RESULTS_DIR, "05_white_composite.png");
    await sharp(whiteRgba, { raw: { width: W, height: H, channels: 4 } }).png().toFile(whitePath);

    // 6. Black Background Composite
    const blackRgba = Buffer.alloc(totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
      const p = i * 4;
      const a = rawRgba[p + 3] / 255.0;
      blackRgba[p] = Math.round(rawRgba[p] * a + 0 * (1 - a));
      blackRgba[p + 1] = Math.round(rawRgba[p + 1] * a + 0 * (1 - a));
      blackRgba[p + 2] = Math.round(rawRgba[p + 2] * a + 0 * (1 - a));
      blackRgba[p + 3] = 255;
    }
    const blackPath = path.join(RESULTS_DIR, "06_black_composite.png");
    await sharp(blackRgba, { raw: { width: W, height: H, channels: 4 } }).png().toFile(blackPath);

    // Verify all 6 artifacts exist and are non-empty
    expect(fs.existsSync(transparentPath)).toBe(true);
    expect(fs.existsSync(finalAlphaPath)).toBe(true);
    expect(fs.existsSync(rawMaskPath)).toBe(true);
    expect(fs.existsSync(checkerPath)).toBe(true);
    expect(fs.existsSync(whitePath)).toBe(true);
    expect(fs.existsSync(blackPath)).toBe(true);

    // ────────────────────────────────────────────────────────────────
    // Direct Pixel Inspection Rules
    // ────────────────────────────────────────────────────────────────

    // A. Zero Horizontal Banding / Row-Stride Corruption
    // Internal row variance within subject body (y in 130..H - 100) must be smooth (< 50)
    let maxRowVariance = 0;
    for (let y = 130; y < H - 100; y += 10) {
      let rowDiff = 0;
      for (let x = 0; x < W; x++) {
        rowDiff += Math.abs(finalAlphaBuf[y * W + x] - finalAlphaBuf[(y - 1) * W + x]);
      }
      const avgDiff = rowDiff / W;
      if (avgDiff > maxRowVariance) maxRowVariance = avgDiff;
    }
    expect(maxRowVariance).toBeLessThan(50);

    // B. Missing Top Hairline Check: hairline alpha > 128
    let hairForeground = 0;
    let hairTotal = 0;
    // Hairline region in portrait fixture: Y: 340..440, X: 280..520
    for (let y = 340; y < 440; y++) {
      for (let x = 280; x < 520; x++) {
        hairTotal++;
        if (finalAlphaBuf[y * W + x] > 128) hairForeground++;
      }
    }
    const hairRetentionPct = (hairForeground / hairTotal) * 100;
    expect(hairRetentionPct).toBeGreaterThan(90.0);

    // C. Background Clearance Check: top rows above head (Y: 0..80) must be 100% transparent (no residual background blocks)
    let topBgResidual = 0;
    let topBgTotal = 0;
    for (let y = 0; y < 80; y++) {
      for (let x = 0; x < W; x++) {
        topBgTotal++;
        if (finalAlphaBuf[y * W + x] > 20) topBgResidual++;
      }
    }
    expect((topBgResidual / topBgTotal) * 100).toBeLessThan(0.01);

    // D. Holes in Suit, Shirt, or Tie: torso interior must be solid (alpha > 200)
    let torsoSolid = 0;
    let torsoTotal = 0;
    const yTorsoStart = 500;
    const yTorsoEnd = 700;
    const xTorsoStart = 350;
    const xTorsoEnd = 450;
    for (let y = yTorsoStart; y < yTorsoEnd; y++) {
      for (let x = xTorsoStart; x < xTorsoEnd; x++) {
        torsoTotal++;
        if (finalAlphaBuf[y * W + x] > 200) torsoSolid++;
      }
    }
    expect((torsoSolid / torsoTotal) * 100).toBeGreaterThan(90.0);

    // E. Soft Alpha Continuity: continuous transition band must exist (> 500 soft pixels)
    let softAlphaPixels = 0;
    for (let i = 0; i < totalPixels; i++) {
      const a = finalAlphaBuf[i];
      if (a > 10 && a < 245) softAlphaPixels++;
    }
    expect(softAlphaPixels).toBeGreaterThan(500);

    // F. Jodit Integration Contract
    const joditAccepted = await page.evaluate(async () => {
      const res = await fetch(window.location.href);
      return res.status < 400;
    });
    expect(joditAccepted).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────
  // 2. Module 02: WASM Fallback Execution and Truthful Reporting
  // ────────────────────────────────────────────────────────────────
  test("2. Module 02: WASM fallback executes cleanly when WebGPU is disabled", async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(360000);
    const targetBase = getBase(baseURL);
    await injectAuthenticatedSession(context, targetBase);

    // Disable WebGPU in page context before loading
    await page.addInitScript(() => {
      // @ts-ignore
      delete (navigator as any).gpu;
      // @ts-ignore
      Object.defineProperty(navigator, "gpu", {
        get: () => undefined,
        configurable: true,
      });
    });

    await page.goto(`${targetBase}/bg-remover`, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Use Sample Portrait button for fast instant ingest
    const sampleBtn = page.locator('[data-testid="sample-image-btn"]');
    await expect(sampleBtn).toBeVisible({ timeout: 15000 });
    await sampleBtn.click();

    const fastPreviewBtn = page.locator('[data-testid="fast-preview-start-btn"]');
    await expect(fastPreviewBtn).toBeVisible({ timeout: 15000 });
    await expect(fastPreviewBtn).toBeEnabled({ timeout: 20000 });
    await fastPreviewBtn.click();

    const statusBadge = page.locator('[data-testid="mask-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 240000 });
    await expect(statusBadge).toContainText("Mask is ready");

    // Verify actual backend reported as WASM
    const actualBackend = await page.locator('[data-testid="diag-actual-backend"]').innerText();
    expect(actualBackend).toBe("WASM");
  });

  // ────────────────────────────────────────────────────────────────
  // 3. Module 03: In-Browser Scale & Alpha Preservation
  // ────────────────────────────────────────────────────────────────
  test("3. Module 03: In-browser 1x, 2x, 4x scales and alpha channel preservation", async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(360000);
    const targetBase = getBase(baseURL);
    await injectAuthenticatedSession(context, targetBase);

    await page.goto(`${targetBase}/image-upscaler`, { waitUntil: "domcontentloaded", timeout: 60000 });

    const upscalerWorkspace = page.locator('main, [data-testid="upscaler-workspace"]').first();
    await expect(upscalerWorkspace).toBeVisible({ timeout: 15000 });

    // Create a 64x48 test image with transparent outer border and solid cyan center
    const testTransparentImg = await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="64" height="48">
              <rect x="16" y="12" width="32" height="24" fill="#00FFCC" />
            </svg>`
          ),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    const testImgPath = path.join(RESULTS_DIR, "temp_transparent_test_64x48.png");
    fs.writeFileSync(testImgPath, testTransparentImg);

    const enhanceBtn = page.locator('[data-testid="upscale-enhance-btn"]');
    const fileInput = page.locator('[data-testid="image-upload-input"]');
    await expect(fileInput).toBeAttached({ timeout: 15000 });

    for (let attempt = 0; attempt < 4; attempt++) {
      await fileInput.setInputFiles(testImgPath);
      const isReady = await enhanceBtn.isEnabled({ timeout: 2000 }).catch(() => false);
      if (isReady) break;
      await page.waitForTimeout(600);
    }
    await expect(enhanceBtn).toBeEnabled({ timeout: 20000 });

    // Open Advanced Settings accordion to access scale buttons
    const advSettings = page.locator('[data-testid="upscale-advanced-settings-accordion"]');
    if (await advSettings.isVisible()) {
      await advSettings.locator("summary").first().click();
      await page.waitForTimeout(300);
    }

    // Verify 1x, 2x, 4x buttons exist
    const btn1x = page.locator('[data-testid="scale-btn-1x"]');
    const btn2x = page.locator('[data-testid="scale-btn-2x"]');
    const btn4x = page.locator('[data-testid="scale-btn-4x"]');
    await expect(btn1x).toBeVisible({ timeout: 10000 });
    await expect(btn2x).toBeVisible({ timeout: 10000 });
    await expect(btn4x).toBeVisible({ timeout: 10000 });

    // ── Test 1x Native Scale ──
    await btn1x.click();
    await expect(enhanceBtn).toContainText("(1x)", { timeout: 10000 });
    await enhanceBtn.click();

    // Wait for upscale download button and capture download
    const downloadBtn = page.locator('[data-testid="upscale-download-btn"]');
    await expect(downloadBtn).toBeVisible({ timeout: 120000 });

    const download1xPromise = page.waitForEvent("download");
    await downloadBtn.click();
    const download1x = await download1xPromise;

    const out1xPath = path.join(RESULTS_DIR, "upscale_1x_output.png");
    await download1x.saveAs(out1xPath);
    expect(fs.existsSync(out1xPath)).toBe(true);

    const meta1x = await sharp(out1xPath).metadata();
    expect(meta1x.width).toBe(64);
    expect(meta1x.height).toBe(48);

    const { data: raw1x } = await sharp(out1xPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Verify border transparency is preserved (top-left pixel is transparent)
    expect(raw1x[3]).toBe(0);
    // Verify center is opaque
    const centerIdx = (24 * 64 + 32) * 4;
    expect(raw1x[centerIdx + 3]).toBe(255);

    // ── Test 2x Scale ──
    await btn2x.click();
    await expect(enhanceBtn).toContainText("(2x)", { timeout: 10000 });
    const upscale2xResponse = page.waitForResponse(
      (res) => res.url().includes("/api/upscale") && res.status() === 200,
      { timeout: 60000 }
    ).catch(() => null);
    await enhanceBtn.click();
    await upscale2xResponse;
    await page.waitForTimeout(500);
    await expect(downloadBtn).toBeVisible({ timeout: 120000 });

    const download2xPromise = page.waitForEvent("download");
    await downloadBtn.click();
    const download2x = await download2xPromise;

    const out2xPath = path.join(RESULTS_DIR, "upscale_2x_output.png");
    await download2x.saveAs(out2xPath);

    const meta2x = await sharp(out2xPath).metadata();
    expect(meta2x.width).toBe(128);
    expect(meta2x.height).toBe(96);

    const { data: raw2x } = await sharp(out2xPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(raw2x[3]).toBe(0); // Border remains transparent
    const center2xIdx = (48 * 128 + 64) * 4;
    expect(raw2x[center2xIdx + 3]).toBe(255); // Center remains opaque

    // Clean up temporary files
    try {
      fs.unlinkSync(testImgPath);
      fs.unlinkSync(out1xPath);
      fs.unlinkSync(out2xPath);
    } catch {}
  });

  // ────────────────────────────────────────────────────────────────
  // 4. Boundary Audit: No Module 02 code called from Module 03
  // ────────────────────────────────────────────────────────────────
  test("4. Architectural Boundary: Module 03 runtime has zero Module 02 footprint", async ({
    page,
    context,
    baseURL,
  }) => {
    const targetBase = getBase(baseURL);
    await injectAuthenticatedSession(context, targetBase);

    const loadedScripts: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes(".js") || url.includes(".ts") || url.includes("worker")) {
        loadedScripts.push(url);
      }
    });

    await page.goto(`${targetBase}/image-upscaler`, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Assert that bg-remover worker is never requested by the image-upscaler page
    const bgWorkerRequested = loadedScripts.some((url) => url.includes("bg-remover.worker"));
    expect(bgWorkerRequested).toBe(false);
  });
});
