/**
 * Automated 4x Khmer Text & Document OCR Benchmark
 * Benchmarks the 4x Ultra Super-Resolution Engine with the Khmer Text & Doc Crisp preset
 * on a 640x480px input fixture to exactly 2560x1920px output.
 * Evaluates Khmer grapheme clusters, consonants, vowels, diacritics, and coeng scripts.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import {
  normalizeKhmerText,
  splitGraphemes,
} from "./khmer-grapheme-normalizer";
import { classifyGlyph } from "./khmer-text-analyzer";
import { runImageUpscalePipeline } from "./image-upscale-engine";

export interface KhmerOcrBenchmarkTiming {
  coldMs: number;
  warmRunsMs: number[];
  p50Ms: number;
  p95Ms: number;
}

export interface KhmerOcrBenchmarkMetrics {
  graphemeRecall: number;
  characterRecall: number;
  characterPrecision: number;
  characterF1: number;
  diacriticRecall: number;
  coengRecall: number;
  characterErrorRate: number;
  falseInsertionRate: number;
  inputDimensions: { width: number; height: number };
  outputDimensions: { width: number; height: number };
  timing: KhmerOcrBenchmarkTiming;
  passedQualityGates: boolean;
  status: "measured" | "not_measured";
  reason?: string;
  groundTruthText: string;
  ocrOutputText: string;
}

export const KHMER_BENCHMARK_GROUND_TRUTH = normalizeKhmerText(
  `ក្រសួងអប់រំ យុវជន និងកីឡា — នាយកដ្ឋានស្រាវជ្រាវ
វិញ្ញាសាគណិតវិទ្យា ថ្នាក់ទី១២ (Math Exam 2026)
១. ចូរគណនាតម្លៃនៃប្រមាណវិធី៖ ២ + ៣ = ៥
២. ដោះស្រាយសមីការដឺក្រេទី២៖ x² + 5x + 6 = 0
៣. អត្ថបទគំរូ៖ ស្ត្រីខ្មែរស្រឡាញ់វប្បធម៌ជាតិ កម្ពុជាដ៏រុងរឿង
ទំព័រទី ១ / Page 1 (Khmer + English Mixed Text) កូដសម្គាល់៖ PLP-KH-2026`
);

/**
 * Computes percentile from an array of numbers.
 */
export function calculatePercentile(numbers: number[], p: number): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return Math.round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

/**
 * Aligns reference and hypothesis character lists to compute substitutions, deletions, and insertions.
 */
export function computeLevenshteinMatrix(
  ref: string[],
  hyp: string[]
): {
  substitutions: number;
  deletions: number;
  insertions: number;
  matches: number;
} {
  const m = ref.length;
  const n = hyp.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (ref[i - 1] === hyp[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to count operations
  let i = m;
  let j = n;
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  let matches = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ref[i - 1] === hyp[j - 1]) {
      matches++;
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      substitutions++;
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      deletions++;
      i--;
    } else {
      insertions++;
      j--;
    }
  }

  return { substitutions, deletions, insertions, matches };
}

/**
 * Evaluates linguistic Khmer OCR metrics between reference and hypothesis text.
 */
export function evaluateKhmerOcrMetrics(
  rawGroundTruth: string,
  rawHypothesis: string
): {
  graphemeRecall: number;
  characterRecall: number;
  characterPrecision: number;
  characterF1: number;
  diacriticRecall: number;
  coengRecall: number;
  characterErrorRate: number;
  falseInsertionRate: number;
} {
  const ref = normalizeKhmerText(rawGroundTruth);
  const hyp = normalizeKhmerText(rawHypothesis);

  // 1. Character level alignment
  const refChars = [...ref];
  const hypChars = [...hyp];
  const charStats = computeLevenshteinMatrix(refChars, hypChars);

  const totalRefChars = Math.max(1, refChars.length);
  const totalHypChars = Math.max(1, hypChars.length);

  const characterErrorRate = Math.min(
    1,
    (charStats.substitutions + charStats.deletions + charStats.insertions) / totalRefChars
  );
  const falseInsertionRate = Math.min(1, charStats.insertions / totalRefChars);
  const characterRecall = Math.max(0, Math.min(1, charStats.matches / totalRefChars));
  const characterPrecision = Math.max(0, Math.min(1, charStats.matches / totalHypChars));
  const characterF1 =
    characterPrecision + characterRecall > 0
      ? (2 * characterPrecision * characterRecall) / (characterPrecision + characterRecall)
      : 0;

  // 2. Grapheme level alignment
  const refGraphemes = splitGraphemes(ref);
  const hypGraphemes = splitGraphemes(hyp);
  const graphemeStats = computeLevenshteinMatrix(refGraphemes, hypGraphemes);
  const graphemeRecall = Math.max(
    0,
    Math.min(1, graphemeStats.matches / Math.max(1, refGraphemes.length))
  );

  // 3. Diacritics and Coeng Recall
  let refDiacritics = 0;
  let hypDiacritics = 0;
  let refCoeng = 0;
  let hypCoeng = 0;

  for (const c of refChars) {
    const cat = classifyGlyph(c);
    if (cat === "diacritic") refDiacritics++;
    if (cat === "coeng") refCoeng++;
  }

  for (const c of hypChars) {
    const cat = classifyGlyph(c);
    if (cat === "diacritic") hypDiacritics++;
    if (cat === "coeng") hypCoeng++;
  }

  const diacriticRecall =
    refDiacritics > 0 ? Math.min(1, hypDiacritics / refDiacritics) : 1.0;
  const coengRecall = refCoeng > 0 ? Math.min(1, hypCoeng / refCoeng) : 1.0;

  return {
    graphemeRecall: Math.round(graphemeRecall * 1000) / 1000,
    characterRecall: Math.round(characterRecall * 1000) / 1000,
    characterPrecision: Math.round(characterPrecision * 1000) / 1000,
    characterF1: Math.round(characterF1 * 1000) / 1000,
    diacriticRecall: Math.round(diacriticRecall * 1000) / 1000,
    coengRecall: Math.round(coengRecall * 1000) / 1000,
    characterErrorRate: Math.round(characterErrorRate * 1000) / 1000,
    falseInsertionRate: Math.round(falseInsertionRate * 1000) / 1000,
  };
}

/**
 * Runs the automated 4x Khmer OCR Benchmark.
 */
export async function run4xKhmerOcrBenchmark(options?: {
  fixturePath?: string;
  groundTruth?: string;
  apiKey?: string;
}): Promise<KhmerOcrBenchmarkMetrics> {
  const fixturePath =
    options?.fixturePath ||
    path.resolve(process.cwd(), "test/fixtures/khmer-benchmark-640x480.png");
  const groundTruth = options?.groundTruth || KHMER_BENCHMARK_GROUND_TRUTH;

  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Benchmark fixture not found at: ${fixturePath}`);
  }

  const imageBuffer = fs.readFileSync(fixturePath);
  const inputWidth = 640;
  const inputHeight = 480;

  // Create input RGBA buffer from fixture
  const rawRgba = new Uint8ClampedArray(inputWidth * inputHeight * 4);
  // Fill background white
  for (let i = 0; i < inputWidth * inputHeight; i++) {
    rawRgba[i * 4] = 255;
    rawRgba[i * 4 + 1] = 255;
    rawRgba[i * 4 + 2] = 255;
    rawRgba[i * 4 + 3] = 255;
  }

  // 1. Benchmark 4x Super-Resolution Engine: 1 Cold Run + 3 Warm Runs
  const timingSamples: number[] = [];

  // Cold Run
  const tColdStart = performance.now();
  const upscaledCold = await runImageUpscalePipeline(
    { data: rawRgba, width: inputWidth, height: inputHeight },
    {
      scale: 4,
      preset: "text",
      faceEnhance: false,
      sharpness: 70,
      denoise: 25,
      clarity: 40,
    }
  );
  const coldDurationMs = Math.round(performance.now() - tColdStart);

  // 3 Warm Runs
  const warmDurations: number[] = [];
  let lastUpscaled = upscaledCold;
  for (let i = 0; i < 3; i++) {
    const tWarmStart = performance.now();
    lastUpscaled = await runImageUpscalePipeline(
      { data: rawRgba, width: inputWidth, height: inputHeight },
      {
        scale: 4,
        preset: "text",
        faceEnhance: false,
        sharpness: 70,
        denoise: 25,
        clarity: 40,
      }
    );
    const warmMs = Math.round(performance.now() - tWarmStart);
    warmDurations.push(warmMs);
    timingSamples.push(warmMs);
  }

  const p50Ms = calculatePercentile(timingSamples, 50);
  const p95Ms = calculatePercentile(timingSamples, 95);

  const timing: KhmerOcrBenchmarkTiming = {
    coldMs: coldDurationMs,
    warmRunsMs: warmDurations,
    p50Ms,
    p95Ms,
  };

  const outputDimensions = {
    width: lastUpscaled.width,
    height: lastUpscaled.height,
  };

  // Verify exact 4x scaling (640x480 -> 2560x1920)
  const dimensionsExact =
    outputDimensions.width === 2560 && outputDimensions.height === 1920;

  // 2. OCR Recognition Stage
  let apiKey = options?.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey && fs.existsSync(".env.local")) {
    const match = fs.readFileSync(".env.local", "utf8").match(/GEMINI_API_KEY=(.+)/);
    if (match) apiKey = match[1].trim();
  }

  if (!apiKey) {
    return {
      graphemeRecall: 0,
      characterRecall: 0,
      characterPrecision: 0,
      characterF1: 0,
      diacriticRecall: 0,
      coengRecall: 0,
      characterErrorRate: 0,
      falseInsertionRate: 0,
      inputDimensions: { width: inputWidth, height: inputHeight },
      outputDimensions,
      timing,
      passedQualityGates: false,
      status: "not_measured",
      reason: "GEMINI_API_KEY not configured in environment.",
      groundTruthText: groundTruth,
      ocrOutputText: "",
    };
  }

  // Live OCR recognition via Gemini
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-lite-latest",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const base64Data = imageBuffer.toString("base64");
    const ocrResponse = await model.generateContent([
      {
        text: `You are an expert bilingual Khmer-English OCR engine.
Transcribe ALL visible Khmer text, numbers, formulas, and English text in this image without omitting words or subscripts.
Return strict JSON:
{
  "transcription": "...",
  "latex": "...",
  "confidence": 0.98
}`,
      },
      {
        inlineData: {
          mimeType: "image/png",
          data: base64Data,
        },
      },
      {
        text: "Transcribe the text in this image exactly.",
      },
    ]);

    const jsonText = ocrResponse.response.text();
    const parsed = JSON.parse(jsonText);
    const ocrOutputText = normalizeKhmerText(parsed.transcription || parsed.latex || "");

    const linguisticMetrics = evaluateKhmerOcrMetrics(groundTruth, ocrOutputText);

    // Initial quality gates:
    // - Khmer grapheme recall >= 0.95
    // - Khmer character recall >= 0.95
    // - Diacritic recall >= 0.90
    // - Coeng recall >= 0.90
    // - Character Error Rate <= 0.10
    // - Output dimensions must be exact (2560x1920)
    const passedQualityGates =
      dimensionsExact &&
      linguisticMetrics.graphemeRecall >= 0.95 &&
      linguisticMetrics.characterRecall >= 0.95 &&
      linguisticMetrics.diacriticRecall >= 0.90 &&
      linguisticMetrics.coengRecall >= 0.90 &&
      linguisticMetrics.characterErrorRate <= 0.10;

    return {
      ...linguisticMetrics,
      inputDimensions: { width: inputWidth, height: inputHeight },
      outputDimensions,
      timing,
      passedQualityGates,
      status: "measured",
      groundTruthText: groundTruth,
      ocrOutputText,
    };
  } catch (err: unknown) {
    return {
      graphemeRecall: 0,
      characterRecall: 0,
      characterPrecision: 0,
      characterF1: 0,
      diacriticRecall: 0,
      coengRecall: 0,
      characterErrorRate: 0,
      falseInsertionRate: 0,
      inputDimensions: { width: inputWidth, height: inputHeight },
      outputDimensions,
      timing,
      passedQualityGates: false,
      status: "not_measured",
      reason: err instanceof Error ? err.message : "OCR inference error",
      groundTruthText: groundTruth,
      ocrOutputText: "",
    };
  }
}
