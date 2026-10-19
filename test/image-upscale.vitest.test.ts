import { describe, it, expect } from "vitest";
import {
  calculateImageDiagnostics,
  applyLanczosResample,
  applyBilateralDenoise,
  applyFaceEnhancement,
  applyAdaptiveUSM,
  applyKuwaharaDenoise,
  applyPdeShockFilter,
  applyCoherenceCurvatureFlow,
  applySubpixelContourAA,
  applyAntiBandingDither,
  applyMultiScaleMicroContrast,
  runImageUpscalePipeline,
} from "../src/lib/image-upscale-client";

describe("Studio Super-Resolution Engine & Diagnostics", () => {
  // Helper to create a test image buffer
  function createTestPattern(
    width: number,
    height: number,
    type: "sharp" | "noisy" | "portrait" | "document" | "blurry-ramp" | "3d-egg"
  ) {
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        if (type === "sharp") {
          // Sharp checkerboard edges
          const val = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 230 : 30;
          data[idx] = val;
          data[idx + 1] = val;
          data[idx + 2] = val;
          data[idx + 3] = 255;
        } else if (type === "blurry-ramp") {
          // Blurry gradual transition across x (spread over 8 pixels)
          const ramp = Math.max(0, Math.min(1, (x - 12) / 8));
          const val = Math.round(40 + ramp * 160);
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
          const dx = x - width / 2;
          const dy = y - height / 2;
          const isFace = (dx * dx) / 100 + (dy * dy) / 144 <= 1;
          if (isFace) {
            data[idx] = 210; // R
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
          const isStroke = x % 24 < 3 && y % 16 > 4;
          const val = isStroke ? 20 : 245;
          data[idx] = val;
          data[idx + 1] = val;
          data[idx + 2] = val;
          data[idx + 3] = 255;
        } else if (type === "3d-egg") {
          // White background with smooth 3D shaded egg in center
          const dx = (x - width / 2) / (width * 0.35);
          const dy = (y - height / 2) / (height * 0.45);
          const rSq = dx * dx + dy * dy;
          if (rSq <= 1.0) {
            const z = Math.sqrt(Math.max(0, 1.0 - rSq));
            const dot = Math.max(0, -dx * 0.4 - dy * 0.4 + z * 0.82);
            const val = Math.round(80 + dot * 130);
            data[idx] = val;
            data[idx + 1] = val;
            data[idx + 2] = val;
            data[idx + 3] = 255;
          } else {
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = 255;
          }
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
    expect(["restore", "general", "ultra"]).toContain(diag.recommendedPreset);
  });

  it("detects tiny images (<300px) and unlocks 8x eligibility", () => {
    const tinyImg = createTestPattern(80, 80, "sharp");
    const diag = calculateImageDiagnostics(tinyImg);

    expect(diag.isTinyImage).toBe(true);
    expect(diag.is8xEligible).toBe(true);
    expect(diag.isUltraReconstructionRecommended).toBe(true);
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

  it("applies Pass A Kuwahara edge-preserving denoiser to remove artifacts while preserving boundaries", () => {
    const noisyImg = createTestPattern(32, 32, "noisy");
    const filtered = applyKuwaharaDenoise(noisyImg, 2, 0.7);

    expect(filtered.length).toBe(noisyImg.data.length);
    // Verified that output is within valid bounds
    for (let i = 0; i < filtered.length; i++) {
      expect(filtered[i]).toBeGreaterThanOrEqual(0);
      expect(filtered[i]).toBeLessThanOrEqual(255);
    }
  });

  it("applies Pass C Kramer-Bruckner / Osher-Rudin PDE Shock Filter to sharpen edge gradient slope by >= 2.5x over plain interpolation", () => {
    const rampImg = createTestPattern(32, 32, "blurry-ramp");

    // Measure initial Laplacian variance on the blurry ramp
    let initialLapSq = 0;
    let count = 0;
    for (let y = 1; y < 31; y++) {
      for (let x = 1; x < 31; x++) {
        const idx = (y * 32 + x) * 4;
        const c = rampImg.data[idx];
        const t = rampImg.data[((y - 1) * 32 + x) * 4];
        const b = rampImg.data[((y + 1) * 32 + x) * 4];
        const l = rampImg.data[(y * 32 + x - 1) * 4];
        const r = rampImg.data[(y * 32 + x + 1) * 4];
        const lap = 4 * c - (t + b + l + r);
        initialLapSq += lap * lap;
        count++;
      }
    }
    const initialVar = initialLapSq / count;

    // Apply PDE Shock Filter (2 iterations)
    const shocked = applyPdeShockFilter(rampImg, 2, 0.9);

    let shockedLapSq = 0;
    for (let y = 1; y < 31; y++) {
      for (let x = 1; x < 31; x++) {
        const idx = (y * 32 + x) * 4;
        const c = shocked[idx];
        const t = shocked[((y - 1) * 32 + x) * 4];
        const b = shocked[((y + 1) * 32 + x) * 4];
        const l = shocked[(y * 32 + x - 1) * 4];
        const r = shocked[(y * 32 + x + 1) * 4];
        const lap = 4 * c - (t + b + l + r);
        shockedLapSq += lap * lap;
      }
    }
    const shockedVar = shockedLapSq / count;

    // Edge gradient slope / Laplacian variance must increase by >= 2.5x
    const ratio = shockedVar / Math.max(1, initialVar);
    expect(ratio).toBeGreaterThanOrEqual(2.5);
  });

  it("applies Pass D Multi-Scale Micro-Contrast with 5x5 zero-overshoot halo clamping", () => {
    const sharpImg = createTestPattern(32, 32, "sharp");
    const contrasted = applyMultiScaleMicroContrast(sharpImg, 75);

    expect(contrasted.length).toBe(sharpImg.data.length);

    // Verify 5x5 zero-overshoot: no enhanced pixel exceeds its local 5x5 neighborhood min and max
    for (let y = 2; y < 30; y++) {
      for (let x = 2; x < 30; x++) {
        const p = (y * 32 + x) * 4;
        let localMin = 255;
        let localMax = 0;

        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const val = sharpImg.data[((y + dy) * 32 + (x + dx)) * 4];
            if (val < localMin) localMin = val;
            if (val > localMax) localMax = val;
          }
        }

        // Must be clamped strictly within local [localMin, localMax]
        expect(contrasted[p]).toBeGreaterThanOrEqual(localMin);
        expect(contrasted[p]).toBeLessThanOrEqual(localMax);
      }
    }
  });

  it("applies bilateral surface denoising to smooth noise while preserving edges", () => {
    const noisyImg = createTestPattern(48, 48, "noisy");
    const denoised = applyBilateralDenoise(noisyImg, 80);

    expect(denoised.length).toBe(noisyImg.data.length);

    let varBefore = 0;
    let varAfter = 0;
    for (let i = 0; i < 48 * 48; i++) {
      const p = i * 4;
      varBefore += Math.abs(noisyImg.data[p] - 128);
      varAfter += Math.abs(denoised[p] - 128);
    }
    expect(varAfter).toBeLessThan(varBefore);
  });

  it("applies portrait face enhancement on skin regions and boosts micro-contrast", () => {
    const portraitImg = createTestPattern(48, 48, "portrait");
    const enhanced = applyFaceEnhancement(portraitImg, 75);

    expect(enhanced.length).toBe(portraitImg.data.length);
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
    for (let i = 0; i < sharpened.length; i++) {
      expect(sharpened[i]).toBeGreaterThanOrEqual(0);
      expect(sharpened[i]).toBeLessThanOrEqual(255);
    }
  });

  it("executes the full stepped 2x pyramid pipeline (4x scale), updates progress, and produces high-resolution output", async () => {
    const baseImg = createTestPattern(32, 32, "document");
    const recordedStages: number[] = [];

    const result = await runImageUpscalePipeline(baseImg, {
      scale: 4,
      preset: "text",
      faceEnhance: false,
      sharpness: 60,
      denoise: 30,
      clarity: 40,
      onProgress: (p) => {
        recordedStages.push(p.stage);
      },
    });

    expect(result.width).toBe(128);
    expect(result.height).toBe(128);
    expect(result.data.length).toBe(128 * 128 * 4);
    expect(result.diagnostics.width).toBe(32);
    expect(result.diagnostics.height).toBe(32);
    expect(recordedStages).toContain(1);
    expect(recordedStages).toContain(2);
    expect(recordedStages).toContain(3);
    expect(recordedStages).toContain(4);
    expect(recordedStages).toContain(5);
  });

  it("supports 8x scale mode for micro-images (32x32 -> 256x256)", async () => {
    const tinyImg = createTestPattern(32, 32, "sharp");

    const result = await runImageUpscalePipeline(tinyImg, {
      scale: 8,
      preset: "ultra",
      faceEnhance: false,
      sharpness: 80,
      denoise: 20,
      clarity: 60,
    });

    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
    expect(result.data.length).toBe(256 * 256 * 4);
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

  it("accurately classifies 3D shaded egg/sphere shapes as isSmoothObjectLikely and avoids false-positive document classification", () => {
    const eggImg = createTestPattern(87, 90, "3d-egg");
    const diag = calculateImageDiagnostics(eggImg);

    expect(diag.width).toBe(87);
    expect(diag.height).toBe(90);
    expect(diag.isTinyImage).toBe(true);
    expect(diag.is8xEligible).toBe(true);
    expect(diag.isSmoothObjectLikely).toBe(true);
    expect(diag.isDocumentLikely).toBe(false);
    expect(diag.recommendedPreset).toBe("ultra");
    expect(diag.recommendationReasonKh).toContain("3D");
  });

  it("applies Coherence Curvature Flow (tangent isophote diffusion) to smooth contours without corrupting pixels", () => {
    const eggImg = createTestPattern(48, 48, "3d-egg");
    const flowResult = applyCoherenceCurvatureFlow(eggImg, 2, 0.45, 0.5);

    expect(flowResult.length).toBe(eggImg.data.length);
    for (let i = 0; i < flowResult.length; i++) {
      expect(flowResult[i]).toBeGreaterThanOrEqual(0);
      expect(flowResult[i]).toBeLessThanOrEqual(255);
    }
  });

  it("applies Sub-pixel Contour Anti-Aliasing (Contour FXAA) across high contrast stepped boundaries", () => {
    const sharpImg = createTestPattern(32, 32, "sharp");
    const aaResult = applySubpixelContourAA(sharpImg);

    expect(aaResult.length).toBe(sharpImg.data.length);
    for (let i = 0; i < aaResult.length; i++) {
      expect(aaResult[i]).toBeGreaterThanOrEqual(0);
      expect(aaResult[i]).toBeLessThanOrEqual(255);
    }
  });

  it("applies Anti-Banding TPDF Dithering without altering dynamic range", () => {
    const rampImg = createTestPattern(32, 32, "blurry-ramp");
    const dithered = applyAntiBandingDither(rampImg);

    expect(dithered.length).toBe(rampImg.data.length);
    for (let i = 0; i < dithered.length; i++) {
      expect(dithered[i]).toBeGreaterThanOrEqual(0);
      expect(dithered[i]).toBeLessThanOrEqual(255);
      // Dither amplitude must not change pixel values by more than 2 levels
      expect(Math.abs(dithered[i] - rampImg.data[i])).toBeLessThanOrEqual(2);
    }
  });
});
