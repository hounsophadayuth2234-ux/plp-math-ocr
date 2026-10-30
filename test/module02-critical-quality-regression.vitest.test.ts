import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { edgeAwareHairFurRefinement } from "../src/lib/bg-compositor";

describe("Module 02 Critical Quality Regression Test", () => {
  const fixturePath = path.resolve(__dirname, "../evidence-investigation/forensic-artifacts/00_original_preserved.png");

  it("1. preserves original input file intact and unchanged", () => {
    expect(fs.existsSync(fixturePath)).toBe(true);
    const stat = fs.statSync(fixturePath);
    expect(stat.size).toBe(751323);
  });

  it("2. verifies alpha continuity, hairline retention, foreground integrity, zero shoulder blocks, and transparent PNG validity", async () => {
    const inputBuffer = fs.readFileSync(fixturePath);
    const meta = await sharp(inputBuffer).metadata();
    expect(meta.width).toBe(796);
    expect(meta.height).toBe(1024);

    const { data: origRgba } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = meta.width!;
    const H = meta.height!;
    const totalPixels = W * H;

    // Load the verified RMBG-1.4 model mask
    const maskFile = path.resolve(__dirname, "../evidence-investigation/forensic-artifacts/02_resized_continuous_alpha_mask_796x1024.png");
    expect(fs.existsSync(maskFile)).toBe(true);

    const maskContinuous = await sharp(maskFile).toColourspace("b-w").raw().toBuffer();
    expect(maskContinuous.length).toBe(totalPixels);

    // Apply clean edge hair refinement and decontamination
    const refined = edgeAwareHairFurRefinement(origRgba, maskContinuous, W, H, {
      preset: "fine_hair",
      alphaChoke: 0.0,
      decontaminateBg: true,
    });

    const finalRgba = Buffer.alloc(totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
      const p = i * 4;
      finalRgba[p] = refined.decontaminatedRgba[p];
      finalRgba[p + 1] = refined.decontaminatedRgba[p + 1];
      finalRgba[p + 2] = refined.decontaminatedRgba[p + 2];
      finalRgba[p + 3] = refined.refinedAlpha[i];
    }

    // 1. Transparent PNG validity
    const outPng = await sharp(finalRgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    expect(outPng.length).toBeGreaterThan(10000);
    // PNG magic bytes
    expect(outPng[0]).toBe(0x89);
    expect(outPng[1]).toBe(0x50);
    expect(outPng[2]).toBe(0x4e);
    expect(outPng[3]).toBe(0x47);

    // 2. Alpha continuity: soft edge pixels must remain (continuous, non-binary)
    expect(refined.softAlphaPixelCount).toBeGreaterThan(500);

    // 3. Foreground hole percentage inside core torso (Y: 700..950, X: 200..600)
    let coreSubjectHoles = 0;
    let coreSubjectTotal = 0;
    for (let y = 700; y < 950; y++) {
      for (let x = 200; x < 600; x++) {
        const idx = y * W + x;
        coreSubjectTotal++;
        if (refined.refinedAlpha[idx] < 200) {
          coreSubjectHoles++;
        }
      }
    }
    const holePercentage = (coreSubjectHoles / coreSubjectTotal) * 100;
    expect(holePercentage).toBeLessThan(0.01); // 0 holes inside clothing/torso

    // 4. Hairline retention at top hairline (Y: 80..200, X: 300..500)
    let hairForeground = 0;
    let hairTotal = 0;
    for (let y = 80; y < 200; y++) {
      for (let x = 300; x < 500; x++) {
        const idx = y * W + x;
        hairTotal++;
        if (refined.refinedAlpha[idx] > 128) {
          hairForeground++;
        }
      }
    }
    const hairRetentionPercentage = (hairForeground / hairTotal) * 100;
    expect(hairRetentionPercentage).toBeGreaterThan(95.0); // Full hair preserved

    // 5. Outer top background clearance (top 35 rows must be completely transparent)
    let topBgResidual = 0;
    let topBgTotal = 0;
    for (let y = 0; y < 35; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        topBgTotal++;
        if (refined.refinedAlpha[idx] > 20) {
          topBgResidual++;
        }
      }
    }
    const topBgResidualPct = (topBgResidual / topBgTotal) * 100;
    expect(topBgResidualPct).toBe(0.0);

    // 6. Zero blue background blocks beside neck and shoulders
    let lShoulderResidual = 0;
    let lShoulderTotal = 0;
    for (let y = 450; y < 550; y++) {
      for (let x = 0; x < 200; x++) {
        lShoulderTotal++;
        if (refined.refinedAlpha[y * W + x] > 20) lShoulderResidual++;
      }
    }
    expect(lShoulderResidual / lShoulderTotal).toBe(0.0);

    let rShoulderResidual = 0;
    let rShoulderTotal = 0;
    for (let y = 450; y < 550; y++) {
      for (let x = 550; x < W; x++) {
        rShoulderTotal++;
        if (refined.refinedAlpha[y * W + x] > 20) rShoulderResidual++;
      }
    }
    expect(rShoulderResidual / rShoulderTotal).toBe(0.0);
  });
});
