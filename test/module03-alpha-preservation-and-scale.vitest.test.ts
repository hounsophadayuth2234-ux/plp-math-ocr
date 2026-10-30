import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { applyLanczosResample } from "../src/lib/image-upscale-engine";

describe("Module 03 — Alpha Channel Preservation and Scale Invariants", () => {
  const rootDir = process.cwd();

  it("1. Worker source code verifies alpha detection and eliminates hardcoded 255 alpha", () => {
    const workerPath = path.join(rootDir, "src/workers/hd-enhancer.worker.ts");
    const workerContent = fs.readFileSync(workerPath, "utf8");

    // Must not contain the hardcoded bug: finalRgba[i * 4 + 3] = 255 unconditionally
    expect(workerContent).not.toMatch(/finalRgba\[i\s*\*\s*4\s*\+\s*3\]\s*=\s*255;\s*\}/);

    // Must contain bilinear alpha resampling function
    expect(workerContent).toContain("resampleAlphaBilinear");

    // Must detect whether input is opaque or transparent
    expect(workerContent).toContain("let isOpaque = true;");
    expect(workerContent).toContain("isOpaque = false;");

    // Must handle 1x pass-through explicitly preserving dimensions
    expect(workerContent).toContain("if (options.scale === 1)");
    expect(workerContent).toContain("1x Pass-through (Original Dimensions Preserved)");
  });

  it("2. Opaque input preserves 100% opacity without unintended transparency", () => {
    const width = 32;
    const height = 24;
    const opaqueData = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      opaqueData[i * 4] = 200;
      opaqueData[i * 4 + 1] = 100;
      opaqueData[i * 4 + 2] = 50;
      opaqueData[i * 4 + 3] = 255; // 100% opaque
    }

    // 2x upscale via Lanczos resampler
    const res2x = applyLanczosResample({ data: opaqueData, width, height }, 2);
    expect(res2x.width).toBe(64);
    expect(res2x.height).toBe(48);

    // All alpha values must remain strictly 255
    let hasTransparency = false;
    for (let i = 0; i < res2x.width * res2x.height; i++) {
      if (res2x.data[i * 4 + 3] < 255) {
        hasTransparency = true;
        break;
      }
    }
    expect(hasTransparency).toBe(false);
  });

  it("3. Transparent input preserves alpha channel and resamples smoothly", () => {
    const width = 32;
    const height = 24;
    const transData = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        transData[idx] = 100;
        transData[idx + 1] = 150;
        transData[idx + 2] = 200;
        // Center region is opaque, outer border is transparent (alpha = 0)
        const isCenter = x >= 8 && x < 24 && y >= 6 && y < 18;
        transData[idx + 3] = isCenter ? 255 : 0;
      }
    }

    // 2x upscale
    const res2x = applyLanczosResample({ data: transData, width, height }, 2);
    expect(res2x.width).toBe(64);
    expect(res2x.height).toBe(48);

    // Border corners must remain transparent (0 or near 0)
    expect(res2x.data[3]).toBe(0); // Top-left corner alpha
    // Center must remain opaque
    const centerIdx = (24 * 64 + 32) * 4;
    expect(res2x.data[centerIdx + 3]).toBe(255);
  });

  it("4. Architectural boundary: Module 03 worker has zero dependencies on Module 02", () => {
    const workerPath = path.join(rootDir, "src/workers/hd-enhancer.worker.ts");
    const managerPath = path.join(rootDir, "src/lib/hd-enhancer-manager.ts");
    const workerContent = fs.readFileSync(workerPath, "utf8");
    const managerContent = fs.readFileSync(managerPath, "utf8");

    expect(workerContent).not.toContain("bg-remover");
    expect(workerContent).not.toContain("birefnet");
    expect(workerContent).not.toContain("rmbg");
    expect(workerContent).not.toContain("isnet");
    expect(workerContent).not.toContain("bgWorkerManager");

    expect(managerContent).not.toContain("bg-remover");
    expect(managerContent).not.toContain("birefnet");
    expect(managerContent).not.toContain("rmbg");
    expect(managerContent).not.toContain("bgWorkerManager");
  });

  it("5. Architectural boundary: Module 02 worker has zero dependencies on Module 03", () => {
    const workerPath = path.join(rootDir, "src/workers/bg-remover.worker.ts");
    const managerPath = path.join(rootDir, "src/lib/bg-removal-worker-manager.ts");
    const workerContent = fs.readFileSync(workerPath, "utf8");
    const managerContent = fs.readFileSync(managerPath, "utf8");

    expect(workerContent).not.toContain("hd-enhancer");
    expect(workerContent).not.toContain("realesr");
    expect(workerContent).not.toContain("hdEnhancerWorkerManager");
    expect(workerContent).not.toContain("onnx-super-resolution");

    expect(managerContent).not.toContain("hd-enhancer");
    expect(managerContent).not.toContain("realesr");
    expect(managerContent).not.toContain("hdEnhancerWorkerManager");
  });
});

