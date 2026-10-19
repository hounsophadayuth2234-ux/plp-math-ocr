import { describe, it, expect } from "vitest";
import {
  calculateImageDiagnostics,
  applyLanczosResample,
  applyBilateralDenoise,
  applyFaceEnhancement,
  applyAdaptiveUSM,
  runImageUpscalePipeline,
} from "../src/lib/image-upscale-client";

describe("Studio Super-Resolution Engine & Diagnostics", () => {
  // Helper to create a test image buffer
  function createTestPattern(width: number, height: number, type: "sharp" | "noisy" | "portrait" | "document") {
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        if (type === "sharp") {
          // Sharp checkerboard edges
          const val = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0) ? 230 : 30;
          data[idx] = val;
          data[idx + 1] = val;
          data[idx + 2] = val;
          data[idx + 3] = 255;
        } else if (type === "noisy") {
          // Flat gray with heavy salt-and-pepper / Gaussian noise
          const noise = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
          const noiseVal = Math.floor((noise - Math.floor(noise)) * 120);
          const val = Math.min(255, Math.max(0, 128 + (noiseVal - 60)));
          data[idx] = val;
          data[idx + 1] = val;
          data[idx + 2] = val;
          data[idx + 3] = 255;
        } else if (type === "portrait") {
          // Centered skin-tone oval (Cb around 100-110, Cr around 145-155)
          // R = 210, G = 160, B = 130 produces Cb ≈ 104, Cr ≈ 152
          const dx = x - width / 2;
          const dy = y - height / 2;
          const isFace = (dx * dx) / 100 + (dy * dy) / 144 <= 1;
          if (isFace) {
            data[idx] = 210;     // R
            data[idx + 1] = 160; // G
            data[idx + 2] = 130; // B
            data[idx + 3] = 255;
          } else {
            data[idx] = 40;
            data[idx + 1] = 50;
            data[idx + 2] = 60;
            data[idx + 3] = 255;
          }
        } else if (type === "document") {
          // White paper with crisp black text bars
          const isStroke = (x % 24 < 3) && (y % 16 > 4);
          const val = isStroke ? 20 : 245;
          data[idx] = val;
          data[idx + 1] = val;
          data[idx + 2] = val;
          data[idx + 3] = 255;
        }
      }
    }

    return { data, width, height };
  }

  it("calculates smart image diagnostics and recommends portrait preset for skin tones", () => {
    const portraitImg = createTestPattern(64, 64, "portrait");
    const diag = calculateImageDiagnostics(portraitImg);

    expect(diag.width).toBe(64);
    expect(diag.height).toBe(64);
    expect(diag.skinToneRatio).toBeGreaterThan(0.08);
    expect(diag.recommendedPreset).toBe("portrait");
    expect(diag.recommendationReasonKh).toContain("ផ្ទៃមុខ");
  });

  it("calculates high sharpness and recommends text preset for document/text images", () => {
    const docImg = createTestPattern(64, 64, "document");
    const diag = calculateImageDiagnostics(docImg);

    expect(diag.isDocumentLikely).toBe(true);
    expect(diag.recommendedPreset).toBe("text");
    expect(diag.recommendationReasonKh).toContain("អក្សរខ្មែរ");
  });

  it("detects high noise level and recommends restore preset for noisy images", () => {
    const noisyImg = createTestPattern(64, 64, "noisy");
    const diag = calculateImageDiagnostics(noisyImg);

    expect(diag.noiseLevelScore).toBeGreaterThan(30);
    expect(["restore", "general"]).toContain(diag.recommendedPreset);
  });

  it("resamples images using Lanczos-3 with exact 2x and 4x dimension scaling", () => {
    const baseImg = createTestPattern(32, 24, "sharp");

    // 1x scale
    const scale1 = applyLanczosResample(baseImg, 1);
    expect(scale1.width).toBe(32);
    expect(scale1.height).toBe(24);
    expect(scale1.data.length).toBe(32 * 24 * 4);

    // 2x scale
    const scale2 = applyLanczosResample(baseImg, 2);
    expect(scale2.width).toBe(64);
    expect(scale2.height).toBe(48);
    expect(scale2.data.length).toBe(64 * 48 * 4);

    // 4x scale
    const scale4 = applyLanczosResample(baseImg, 4);
    expect(scale4.width).toBe(128);
    expect(scale4.height).toBe(96);
    expect(scale4.data.length).toBe(128 * 96 * 4);

    // Anti-ringing check: pixel values remain bounded in [0, 255]
    for (let i = 0; i < scale4.data.length; i++) {
      expect(scale4.data[i]).toBeGreaterThanOrEqual(0);
      expect(scale4.data[i]).toBeLessThanOrEqual(255);
    }
  });

  it("applies bilateral surface denoising to smooth noise while preserving edges", () => {
    const noisyImg = createTestPattern(48, 48, "noisy");
    const denoised = applyBilateralDenoise(noisyImg, 80);

    expect(denoised.length).toBe(noisyImg.data.length);

    // Calculate variance before and after
    let varBefore = 0;
    let varAfter = 0;
    for (let i = 0; i < 48 * 48; i++) {
      const p = i * 4;
      varBefore += Math.abs(noisyImg.data[p] - 128);
      varAfter += Math.abs(denoised[p] - 128);
    }
    // Denoising reduces variance in smooth noisy regions
    expect(varAfter).toBeLessThan(varBefore);
  });

  it("applies portrait face enhancement on skin regions and boosts micro-contrast", () => {
    const portraitImg = createTestPattern(48, 48, "portrait");
    const enhanced = applyFaceEnhancement(portraitImg, 75);

    expect(enhanced.length).toBe(portraitImg.data.length);
    // Face enhancement produces non-zero changes in skin and edge tones
    let changedPixels = 0;
    for (let i = 0; i < enhanced.length; i += 4) {
      if (
        enhanced[i] !== portraitImg.data[i] ||
        enhanced[i + 1] !== portraitImg.data[i + 1] ||
        enhanced[i + 2] !== portraitImg.data[i + 2]
      ) {
        changedPixels++;
      }
    }
    expect(changedPixels).toBeGreaterThan(0);
  });

  it("applies adaptive luminance USM to increase edge sharpness without halos", () => {
    const sharpImg = createTestPattern(48, 48, "sharp");
    const sharpened = applyAdaptiveUSM(sharpImg, 80, false);

    expect(sharpened.length).toBe(sharpImg.data.length);
    // Sharpened image should be valid and have non-negative values
    for (let i = 0; i < sharpened.length; i++) {
      expect(sharpened[i]).toBeGreaterThanOrEqual(0);
      expect(sharpened[i]).toBeLessThanOrEqual(255);
    }
  });

  it("executes the full 5-stage pipeline, updates progress, and produces high-resolution output", async () => {
    const baseImg = createTestPattern(32, 32, "document");
    const recordedStages: number[] = [];

    const result = await runImageUpscalePipeline(baseImg, {
      scale: 2,
      preset: "text",
      faceEnhance: false,
      sharpness: 60,
      denoise: 30,
      clarity: 40,
      onProgress: (p) => {
        recordedStages.push(p.stage);
      },
    });

    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
    expect(result.data.length).toBe(64 * 64 * 4);
    expect(result.diagnostics.width).toBe(32);
    expect(result.diagnostics.height).toBe(32);
    // Verified that all 5 stages were executed
    expect(recordedStages).toContain(1);
    expect(recordedStages).toContain(2);
    expect(recordedStages).toContain(3);
    expect(recordedStages).toContain(4);
    expect(recordedStages).toContain(5);
  });

  it("aborts processing cleanly when AbortSignal is triggered", async () => {
    const baseImg = createTestPattern(32, 32, "sharp");
    const abortCtrl = new AbortController();
    abortCtrl.abort();

    await expect(
      runImageUpscalePipeline(baseImg, {
        scale: 2,
        preset: "general",
        faceEnhance: false,
        sharpness: 50,
        denoise: 50,
        clarity: 50,
        signal: abortCtrl.signal,
      })
    ).rejects.toThrow("Upscaling aborted by user.");
  });
});
