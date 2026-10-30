import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import {
  ONNX_UPSCALE_CONFIG,
  computeOverlappingTiles,
  downscaleRgb4xTo2x,
} from "../src/lib/onnx-super-resolution";
import {
  getServerOnnxSession,
  runServerOnnxSuperResolution,
} from "../src/lib/server-onnx-upscaler";
import { compareAiVsSharpUpscale } from "../src/lib/upscale-comparator";
import { POST as upscalePostHandler } from "../src/app/api/upscale/route";
import { NextRequest } from "next/server";

describe("Local AI Super-Resolution Architecture (Real-ESRGAN Compact ONNX)", () => {
  const modelPath = path.resolve(process.cwd(), "public", "models", ONNX_UPSCALE_CONFIG.modelName);
  const khmerFixturePath = path.resolve(process.cwd(), "test/fixtures/khmer-benchmark-640x480.png");

  it("1. Verifies model file exists, is bundled in public/models, and matches verified SHA256", () => {
    expect(fs.existsSync(modelPath)).toBe(true);
    const data = fs.readFileSync(modelPath);
    expect(data.length).toBeGreaterThan(4_500_000); // ~4.87 MB

    const hash = crypto.createHash("sha256").update(data).digest("hex");
    expect(hash.toLowerCase()).toBe(ONNX_UPSCALE_CONFIG.modelSha256.toLowerCase());
  });

  it("2. Verifies ONNX runtime session initializes with correct input/output tensor contract", async () => {
    const session = await getServerOnnxSession();
    expect(session).toBeDefined();
    expect(session.inputNames).toContain("input");
    expect(session.outputNames).toContain("output");
  });

  it("3. Verifies overlapping patch tiling grid partitions image cleanly without gaps", () => {
    const tiles = computeOverlappingTiles(640, 480, 256, 16);
    expect(tiles.length).toBeGreaterThan(1);

    // Verify first tile starts at 0,0 and covers full extent
    expect(tiles[0].x0).toBe(0);
    expect(tiles[0].y0).toBe(0);

    const lastTile = tiles[tiles.length - 1];
    expect(lastTile.x1).toBe(640);
    expect(lastTile.y1).toBe(480);
  });

  it("4. Downscaling 4x to 2x produces exact mathematical half dimensions", () => {
    const dummy4x = new Uint8ClampedArray(80 * 80 * 3);
    dummy4x.fill(128);
    const downscaled = downscaleRgb4xTo2x(dummy4x, 80, 80);
    expect(downscaled.length).toBe(40 * 40 * 3);
  });

  it("5. Executes real neural inference on low-resolution Khmer text fixture producing exact 4x output", async () => {
    expect(fs.existsSync(khmerFixturePath)).toBe(true);
    const khmerBuffer = fs.readFileSync(khmerFixturePath);

    const result = await runServerOnnxSuperResolution(khmerBuffer, 4);

    expect(result.scale).toBe(4);
    expect(result.outputWidth).toBe(2560);
    expect(result.outputHeight).toBe(1920);
    expect(result.isAiInference).toBe(true);
    expect(result.backend).toBe("Local ONNX Neural Engine");
    expect(result.model).toContain("Real-ESRGAN");

    // Verify the output buffer is a valid PNG
    const meta = await sharp(result.outputBuffer).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(2560);
    expect(meta.height).toBe(1920);
  }, 90000);

  it("6. Executes real neural inference on low-resolution Khmer text fixture with 2x scale", async () => {
    const khmerBuffer = fs.readFileSync(khmerFixturePath);
    const result = await runServerOnnxSuperResolution(khmerBuffer, 2);

    expect(result.scale).toBe(2);
    expect(result.outputWidth).toBe(1280);
    expect(result.outputHeight).toBe(960);
    expect(result.isAiInference).toBe(true);

    const meta = await sharp(result.outputBuffer).metadata();
    expect(meta.width).toBe(1280);
    expect(meta.height).toBe(960);
  }, 90000);

  it("7. Quantitatively compares AI output against classical Sharp Lanczos-3", async () => {
    // Generate small 120x80 test image with text
    const testBuffer = await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="120" height="80"><text x="10" y="45" font-family="sans-serif" font-size="20" font-weight="bold" fill="#0f172a">វិញ្ញាសា</text></svg>'
          ),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

  // 1. AI Real-ESRGAN Upscale (4x)
  const aiResult = await runServerOnnxSuperResolution(testBuffer, 4);

  // 2. Classical Sharp Lanczos-3 Upscale (4x)
  const sharpBuffer = await sharp(testBuffer)
    .resize(480, 320, { kernel: "lanczos3" })
    .sharpen()
    .png()
    .toBuffer();

  // 3. Quantitative Comparison
  const comparison = await compareAiVsSharpUpscale(aiResult.outputBuffer, sharpBuffer);

  expect(comparison.width).toBe(480);
  expect(comparison.height).toBe(320);
  expect(comparison.psnr).toBeGreaterThan(15);
  expect(comparison.ssim).toBeGreaterThan(0.5);
  expect(comparison.verdict).toBeDefined();

  console.log("=== QUANTITATIVE UPSCALE COMPARISON ===");
  console.log(`Resolution:    ${comparison.width}x${comparison.height}`);
  console.log(`PSNR:          ${comparison.psnr} dB`);
  console.log(`SSIM:          ${comparison.ssim}`);
  console.log(`AI Edge Energy:    ${comparison.aiEdgeEnergy}`);
  console.log(`Sharp Edge Energy: ${comparison.sharpEdgeEnergy}`);
  console.log(`Verdict:       ${comparison.verdict}`);
}, 90000);

  it("8. Route POST /api/upscale runs Real-ESRGAN ONNX and returns truthful neural headers", async () => {
    const khmerBuffer = fs.readFileSync(khmerFixturePath);
    const formData = new FormData();
    const blob = new Blob([khmerBuffer], { type: "image/png" });
    formData.append("image", blob, "khmer-text.png");
    formData.append("scale", "4");

    const req = new NextRequest("http://localhost:3000/api/upscale", {
      method: "POST",
      headers: {
        "x-raw-response": "true",
      },
      body: formData,
    });

    const res = await upscalePostHandler(req);
    expect(res.status).toBe(200);

    const modelUsed = res.headers.get("X-Model-Used");
    const processingSource = res.headers.get("X-Processing-Source");

    expect(modelUsed).toContain("Real-ESRGAN");
    expect(processingSource).toBe("Local ONNX Neural Engine");
    expect(res.headers.get("X-Output-Width")).toBe("2560");
    expect(res.headers.get("X-Output-Height")).toBe("1920");
  }, 90000);
});
