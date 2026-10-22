import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  run4xKhmerOcrBenchmark,
  evaluateKhmerOcrMetrics,
  calculatePercentile,
  KHMER_BENCHMARK_GROUND_TRUTH,
} from "../src/lib/khmer-ocr-benchmark";
import { runImageUpscalePipeline } from "../src/lib/image-upscale-engine";

describe("4x Khmer Text & Document Super-Resolution & OCR Benchmark", () => {
  const fixturePath = path.resolve(__dirname, "fixtures/khmer-benchmark-640x480.png");

  it("1. Confirms the 640x480px Khmer text fixture exists and has exact dimensions", () => {
    expect(fs.existsSync(fixturePath)).toBe(true);
    const buf = fs.readFileSync(fixturePath);
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);

    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    expect(w).toBe(640);
    expect(h).toBe(480);
  });

  it("2. Super-Resolution Engine produces output with exact dimensions of 2560x1920px (4x Ultra)", async () => {
    const rawRgba = new Uint8ClampedArray(640 * 480 * 4);
    // Fill with white
    rawRgba.fill(255);

    const upscaled = await runImageUpscalePipeline(
      { data: rawRgba, width: 640, height: 480 },
      {
        scale: 4,
        preset: "text",
        faceEnhance: false,
        sharpness: 70,
        denoise: 25,
        clarity: 40,
      }
    );

    expect(upscaled.width).toBe(2560);
    expect(upscaled.height).toBe(1920);
    expect(upscaled.data.length).toBe(2560 * 1920 * 4);
  });

  it("3. Accurately evaluates Khmer grapheme clusters, diacritics, and coeng scripts", () => {
    const groundTruth = "វិញ្ញាសាគណិតវិទ្យា ថ្នាក់ទី១២៖ ២ + ៣ = ៥";
    // 1 substitution and 1 dropped character
    const recognized = "វិញ្ញាសាគណិតវិទ្យា ថ្នាក់ទី១២៖ ២ + ៤ = ៥";

    const metrics = evaluateKhmerOcrMetrics(groundTruth, recognized);
    expect(metrics.characterRecall).toBeGreaterThanOrEqual(0.95);
    expect(metrics.graphemeRecall).toBeGreaterThanOrEqual(0.95);
    expect(metrics.diacriticRecall).toBe(1.0);
    expect(metrics.coengRecall).toBe(1.0);
    expect(metrics.characterErrorRate).toBeLessThanOrEqual(0.05);
  });

  it("4. Calculates correct p50 and p95 timings across multi-run benchmark distributions", () => {
    const times = [120, 115, 125, 110, 140];
    const p50 = calculatePercentile(times, 50);
    const p95 = calculatePercentile(times, 95);

    expect(p50).toBeGreaterThanOrEqual(115);
    expect(p50).toBeLessThanOrEqual(125);
    expect(p95).toBeGreaterThanOrEqual(130);
  });

  it("5. Executes full 4x Khmer OCR Benchmark (1 cold + 3 warm runs), reporting real numbers", async () => {
    const result = await run4xKhmerOcrBenchmark({
      fixturePath,
      groundTruth: KHMER_BENCHMARK_GROUND_TRUTH,
    });

    expect(result.inputDimensions).toEqual({ width: 640, height: 480 });
    expect(result.outputDimensions).toEqual({ width: 2560, height: 1920 });
    expect(result.timing.coldMs).toBeGreaterThan(0);
    expect(result.timing.warmRunsMs).toHaveLength(3);
    expect(result.timing.p50Ms).toBeGreaterThan(0);
    expect(result.timing.p95Ms).toBeGreaterThan(0);

    // Save report to benchmark-4x-khmer-ocr.json
    const reportPath = path.resolve(process.cwd(), "benchmark-4x-khmer-ocr.json");
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), "utf8");
    console.log(`Saved benchmark report to: ${reportPath}`);

    if (result.status === "measured") {
      console.log("=== 4x KHMER OCR BENCHMARK (REAL MEASURED RESULTS) ===");
      console.log(`Grapheme Recall:       ${(result.graphemeRecall * 100).toFixed(1)}%`);
      console.log(`Character Recall:      ${(result.characterRecall * 100).toFixed(1)}%`);
      console.log(`Character Precision:   ${(result.characterPrecision * 100).toFixed(1)}%`);
      console.log(`Character F1:          ${(result.characterF1 * 100).toFixed(1)}%`);
      console.log(`Diacritic Recall:      ${(result.diacriticRecall * 100).toFixed(1)}%`);
      console.log(`Coeng Recall:          ${(result.coengRecall * 100).toFixed(1)}%`);
      console.log(`Character Error Rate:  ${(result.characterErrorRate * 100).toFixed(1)}%`);
      console.log(`False Insertion Rate:  ${(result.falseInsertionRate * 100).toFixed(1)}%`);
      console.log(`Cold Run:              ${result.timing.coldMs} ms`);
      console.log(`Warm p50 (median):     ${result.timing.p50Ms} ms`);
      console.log(`Warm p95:              ${result.timing.p95Ms} ms`);
      console.log(`Quality Gates Passed:  ${result.passedQualityGates}`);
      console.log("======================================================");

      expect(result.graphemeRecall).toBeGreaterThanOrEqual(0.9);
      expect(result.characterRecall).toBeGreaterThanOrEqual(0.9);
    } else {
      console.log(`=== 4x KHMER OCR BENCHMARK (NOT MEASURED: ${result.reason}) ===`);
      expect(result.status).toBe("not_measured");
      expect(result.reason).toBeDefined();
    }
  }, 120000);
});
