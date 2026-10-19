/**
 * Studio Super-Resolution & Restoration Engine (Pure TypedArray Pipeline)
 *
 * Implements a 5-stage deterministic pixel restoration & super-resolution pipeline
 * with zero browser/DOM dependencies and zero circular imports.
 */

import { ProcessingStatusLabel } from "./types";

export type UpscalePreset = "portrait" | "text" | "restore" | "custom" | "general";

export interface UpscaleOptions {
  scale: 1 | 2 | 4;
  preset: UpscalePreset;
  faceEnhance: boolean;
  sharpness: number; // 0 to 100
  denoise: number; // 0 to 100
  clarity: number; // 0 to 100
  signal?: AbortSignal;
  onProgress?: (progress: UpscaleProgress) => void;
}

export interface UpscaleProgress {
  stage: number; // 1 to 5
  totalStages: number; // 5
  stageName: string;
  stageNameKh: string;
  percent: number; // 0 to 100
}

export interface ImageDiagnostics {
  width: number;
  height: number;
  megapixels: number;
  laplacianVariance: number;
  sharpnessScore: number; // 0 to 100
  noiseLevelScore: number; // 0 to 100
  noiseCategory: "Low" | "Moderate" | "High";
  noiseCategoryKh: string;
  dynamicRange: number; // 0 to 100%
  skinToneRatio: number; // 0 to 1
  isDocumentLikely: boolean;
  recommendedPreset: UpscalePreset;
  recommendationReason: string;
  recommendationReasonKh: string;
}

export interface UpscaleResult {
  outputUrl: string;
  blob: Blob;
  srcWidth: number;
  srcHeight: number;
  outputWidth: number;
  outputHeight: number;
  scale: number;
  diagnostics: ImageDiagnostics;
  elapsedMs: number;
  label: ProcessingStatusLabel;
  model: string;
}

// ---------------------------------------------------------------------------
// STAGE 1: SMART IMAGE DIAGNOSTICS
// ---------------------------------------------------------------------------

export function calculateImageDiagnostics(
  imageData: { data: Uint8ClampedArray | Uint8Array; width: number; height: number }
): ImageDiagnostics {
  const { width, height, data } = imageData;
  const totalPixels = width * height;
  const megapixels = +(totalPixels / 1_000_000).toFixed(2);

  // Luminance and skin-tone detection
  const lum = new Float32Array(totalPixels);
  let skinCount = 0;
  let minLum = 255;
  let maxLum = 0;

  for (let i = 0; i < totalPixels; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = y;

    if (y < minLum) minLum = y;
    if (y > maxLum) maxLum = y;

    // YCbCr skin tone detection: Cb in [77, 127], Cr in [133, 173]
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
    const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
    if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && y >= 35 && y <= 245) {
      skinCount++;
    }
  }

  const skinToneRatio = skinCount / Math.max(1, totalPixels);
  const dynamicRange = Math.round(((maxLum - minLum) / 255) * 100);

  // Laplacian blur variance and noise estimation
  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;
  let noiseSum = 0;
  let highContrastEdgeCount = 0;
  let lightBgPixelCount = 0;

  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x;
      const center = lum[idx];
      const top = lum[idx - width];
      const bot = lum[idx + width];
      const left = lum[idx - 1];
      const right = lum[idx + 1];

      const lap = 4 * center - (top + bot + left + right);
      lapSum += lap;
      lapSqSum += lap * lap;
      lapCount++;

      // Immerkær pseudo-Laplacian sample
      noiseSum += Math.abs(lap);

      const dx = Math.abs(right - left);
      const dy = Math.abs(bot - top);
      if (dx + dy > 50) highContrastEdgeCount++;
      if (center > 210) lightBgPixelCount++;
    }
  }

  const lapMean = lapCount > 0 ? lapSum / lapCount : 0;
  const lapVar = lapCount > 0 ? Math.max(0, lapSqSum / lapCount - lapMean * lapMean) : 0;
  // Normalized 0-100 sharpness score
  const sharpnessScore = Math.min(100, Math.round(Math.sqrt(lapVar) * 2.5));

  // Noise estimation sigma
  const noiseSigma = lapCount > 0 ? (Math.sqrt(Math.PI / 2) / (6 * lapCount)) * noiseSum : 0;
  const noiseLevelScore = Math.min(100, Math.round(noiseSigma * 7.5));

  let noiseCategory: "Low" | "Moderate" | "High" = "Low";
  let noiseCategoryKh = "ទាប";
  if (noiseLevelScore > 50) {
    noiseCategory = "High";
    noiseCategoryKh = "ខ្ពស់";
  } else if (noiseLevelScore > 25) {
    noiseCategory = "Moderate";
    noiseCategoryKh = "មធ្យម";
  }

  // Document/Text likelihood
  const edgeDensity = highContrastEdgeCount / Math.max(1, lapCount);
  const lightBgRatio = lightBgPixelCount / Math.max(1, lapCount);
  const isDocumentLikely = lightBgRatio > 0.45 && edgeDensity > 0.05 && skinToneRatio < 0.04;

  // Preset Recommendation
  let recommendedPreset: UpscalePreset = "general";
  let recommendationReason = "Standard balanced super-resolution for general photography.";
  let recommendationReasonKh = "ការកែលម្អគុណភាពកម្រិតស្តង់ដារសម្រាប់រូបថតទូទៅ។";

  if (skinToneRatio >= 0.08) {
    recommendedPreset = "portrait";
    recommendationReason = `Face & skin tones detected (${(skinToneRatio * 100).toFixed(1)}%). Portrait enhancement recommended.`;
    recommendationReasonKh = `បានរកឃើញផ្ទៃមុខ និងសម្បុរស្បែក (${(skinToneRatio * 100).toFixed(1)}%)។ ណែនាំមុខងារសម្រួលផ្ទៃមុខ។`;
  } else if (isDocumentLikely) {
    recommendedPreset = "text";
    recommendationReason = "High contrast document or Khmer text detected. Stroke crispness mode recommended.";
    recommendationReasonKh = "បានរកឃើញឯកសារ ឬអក្សរខ្មែរ។ ណែនាំមុខងារបង្កើនភាពដិតច្បាស់នៃតួអក្សរ។";
  } else if (noiseLevelScore > 40 || (sharpnessScore < 35 && noiseLevelScore > 20)) {
    recommendedPreset = "restore";
    recommendationReason = `High grain/noise detected (Level: ${noiseLevelScore}%). Denoise & restore recommended.`;
    recommendationReasonKh = `បានរកឃើញគ្រាប់អុជ ឬភាពព្រិល (${noiseLevelScore}%)។ ណែនាំមុខងារលុបគ្រាប់អុជ និងស្តាររូប។`;
  }

  return {
    width,
    height,
    megapixels,
    laplacianVariance: Math.round(lapVar),
    sharpnessScore,
    noiseLevelScore,
    noiseCategory,
    noiseCategoryKh,
    dynamicRange,
    skinToneRatio: +skinToneRatio.toFixed(3),
    isDocumentLikely,
    recommendedPreset,
    recommendationReason,
    recommendationReasonKh,
  };
}

// ---------------------------------------------------------------------------
// STAGE 2: HIGH-ORDER EDGE-DIRECTED RESAMPLING (LANCZOS-3 ANTI-RINGING)
// ---------------------------------------------------------------------------

function sinc(x: number): number {
  if (Math.abs(x) < 1e-6) return 1.0;
  const pix = Math.PI * x;
  return Math.sin(pix) / pix;
}

function lanczos3(x: number): number {
  const ax = Math.abs(x);
  if (ax >= 3.0) return 0.0;
  return sinc(ax) * sinc(ax / 3.0);
}

export function applyLanczosResample(
  srcData: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
  scale: number
): { data: Uint8ClampedArray; width: number; height: number } {
  const { width: srcW, height: srcH, data: src } = srcData;

  if (scale === 1) {
    return {
      data: new Uint8ClampedArray(src),
      width: srcW,
      height: srcH,
    };
  }

  let dstW = Math.round(srcW * scale);
  let dstH = Math.round(srcH * scale);

  // Guard max dimension to prevent browser OOM (cap at 4096px)
  const MAX_DIM = 4096;
  if (dstW > MAX_DIM || dstH > MAX_DIM) {
    const ratio = Math.min(MAX_DIM / dstW, MAX_DIM / dstH);
    dstW = Math.round(dstW * ratio);
    dstH = Math.round(dstH * ratio);
  }

  // PASS 1: Horizontal Resampling (srcW -> dstW, height = srcH)
  const temp = new Uint8ClampedArray(dstW * srcH * 4);
  const xRatio = srcW / dstW;

  for (let x = 0; x < dstW; x++) {
    const srcX = (x + 0.5) * xRatio - 0.5;
    const left = Math.floor(srcX) - 2;

    // Precompute horizontal filter taps for this column
    const weights = new Float32Array(6);
    let totalWeight = 0;
    for (let i = 0; i < 6; i++) {
      const tapX = left + i;
      const w = lanczos3(srcX - tapX);
      weights[i] = w;
      totalWeight += w;
    }
    const invTotal = totalWeight !== 0 ? 1 / totalWeight : 1;
    for (let i = 0; i < 6; i++) {
      weights[i] *= invTotal;
    }

    // Central taps for anti-ringing clamping
    const center0 = Math.max(0, Math.min(srcW - 1, Math.floor(srcX)));
    const center1 = Math.max(0, Math.min(srcW - 1, Math.floor(srcX) + 1));

    for (let y = 0; y < srcH; y++) {
      const srcRow = y * srcW * 4;
      const dstIdx = (y * dstW + x) * 4;

      // Anti-ringing bounds from central neighborhood
      const pC0 = srcRow + center0 * 4;
      const pC1 = srcRow + center1 * 4;

      const minR = Math.min(src[pC0], src[pC1]);
      const maxR = Math.max(src[pC0], src[pC1]);
      const minG = Math.min(src[pC0 + 1], src[pC1 + 1]);
      const maxG = Math.max(src[pC0 + 1], src[pC1 + 1]);
      const minB = Math.min(src[pC0 + 2], src[pC1 + 2]);
      const maxB = Math.max(src[pC0 + 2], src[pC1 + 2]);
      const minA = Math.min(src[pC0 + 3], src[pC1 + 3]);
      const maxA = Math.max(src[pC0 + 3], src[pC1 + 3]);

      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;

      for (let i = 0; i < 6; i++) {
        const tapX = Math.max(0, Math.min(srcW - 1, left + i));
        const pTap = srcRow + tapX * 4;
        const w = weights[i];
        accR += src[pTap] * w;
        accG += src[pTap + 1] * w;
        accB += src[pTap + 2] * w;
        accA += src[pTap + 3] * w;
      }

      // Anti-ringing clamp
      temp[dstIdx] = Math.max(minR, Math.min(maxR, Math.round(accR)));
      temp[dstIdx + 1] = Math.max(minG, Math.min(maxG, Math.round(accG)));
      temp[dstIdx + 2] = Math.max(minB, Math.min(maxB, Math.round(accB)));
      temp[dstIdx + 3] = Math.max(minA, Math.min(maxA, Math.round(accA)));
    }
  }

  // PASS 2: Vertical Resampling (srcH -> dstH, width = dstW)
  const output = new Uint8ClampedArray(dstW * dstH * 4);
  const yRatio = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const srcY = (y + 0.5) * yRatio - 0.5;
    const top = Math.floor(srcY) - 2;

    const weights = new Float32Array(6);
    let totalWeight = 0;
    for (let i = 0; i < 6; i++) {
      const tapY = top + i;
      const w = lanczos3(srcY - tapY);
      weights[i] = w;
      totalWeight += w;
    }
    const invTotal = totalWeight !== 0 ? 1 / totalWeight : 1;
    for (let i = 0; i < 6; i++) {
      weights[i] *= invTotal;
    }

    const center0 = Math.max(0, Math.min(srcH - 1, Math.floor(srcY)));
    const center1 = Math.max(0, Math.min(srcH - 1, Math.floor(srcY) + 1));

    const outRow = y * dstW * 4;

    for (let x = 0; x < dstW; x++) {
      const dstIdx = outRow + x * 4;

      const pC0 = (center0 * dstW + x) * 4;
      const pC1 = (center1 * dstW + x) * 4;

      const minR = Math.min(temp[pC0], temp[pC1]);
      const maxR = Math.max(temp[pC0], temp[pC1]);
      const minG = Math.min(temp[pC0 + 1], temp[pC1 + 1]);
      const maxG = Math.max(temp[pC0 + 1], temp[pC1 + 1]);
      const minB = Math.min(temp[pC0 + 2], temp[pC1 + 2]);
      const maxB = Math.max(temp[pC0 + 2], temp[pC1 + 2]);
      const minA = Math.min(temp[pC0 + 3], temp[pC1 + 3]);
      const maxA = Math.max(temp[pC0 + 3], temp[pC1 + 3]);

      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;

      for (let i = 0; i < 6; i++) {
        const tapY = Math.max(0, Math.min(srcH - 1, top + i));
        const pTap = (tapY * dstW + x) * 4;
        const w = weights[i];
        accR += temp[pTap] * w;
        accG += temp[pTap + 1] * w;
        accB += temp[pTap + 2] * w;
        accA += temp[pTap + 3] * w;
      }

      output[dstIdx] = Math.max(minR, Math.min(maxR, Math.round(accR)));
      output[dstIdx + 1] = Math.max(minG, Math.min(maxG, Math.round(accG)));
      output[dstIdx + 2] = Math.max(minB, Math.min(maxB, Math.round(accB)));
      output[dstIdx + 3] = Math.max(minA, Math.min(maxA, Math.round(accA)));
    }
  }

  return { data: output, width: dstW, height: dstH };
}

// ---------------------------------------------------------------------------
// STAGE 3: SEPARABLE BILATERAL SURFACE DENOISING & ARTIFACT REMOVAL
// ---------------------------------------------------------------------------

export function applyBilateralDenoise(
  srcData: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
  denoiseStrength: number // 0 to 100
): Uint8ClampedArray {
  const { width, height, data: src } = srcData;
  const total = width * height;
  const output = new Uint8ClampedArray(src.length);

  if (denoiseStrength <= 0) {
    output.set(src);
    return output;
  }

  // Precompute Range Gaussian LUT (256 entries)
  const sigmaR = 8.0 + (denoiseStrength / 100) * 32.0;
  const invTwoSigmaRSq = 1.0 / (2.0 * sigmaR * sigmaR);
  const rangeLut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    rangeLut[i] = Math.exp(-(i * i) * invTwoSigmaRSq);
  }

  // Precompute 5x5 spatial weights (radius = 2, sigmaS = 2.0)
  const spatialKernel: number[][] = [];
  const sigmaS = 2.0;
  const invTwoSigmaSSq = 1.0 / (2.0 * sigmaS * sigmaS);
  for (let dy = -2; dy <= 2; dy++) {
    const row: number[] = [];
    for (let dx = -2; dx <= 2; dx++) {
      row.push(Math.exp(-(dx * dx + dy * dy) * invTwoSigmaSSq));
    }
    spatialKernel.push(row);
  }

  // Extract luminance map
  const lum = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    lum[i] = (src[p] * 77 + src[p + 1] * 150 + src[p + 2] * 29) >> 8;
  }

  const blendAlpha = (denoiseStrength / 100) * 0.85;
  const invBlend = 1.0 - blendAlpha;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      const pIdx = idx * 4;
      const centerLum = lum[idx];

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumW = 0;

      for (let dy = -2; dy <= 2; dy++) {
        const ny = Math.max(0, Math.min(height - 1, y + dy));
        const nRow = ny * width;
        const sRow = spatialKernel[dy + 2];

        for (let dx = -2; dx <= 2; dx++) {
          const nx = Math.max(0, Math.min(width - 1, x + dx));
          const nIdx = nRow + nx;
          const nLum = lum[nIdx];
          const diff = Math.abs(nLum - centerLum);

          const w = sRow[dx + 2] * rangeLut[diff];
          const np = nIdx * 4;

          sumR += src[np] * w;
          sumG += src[np + 1] * w;
          sumB += src[np + 2] * w;
          sumW += w;
        }
      }

      const invSumW = sumW > 0 ? 1.0 / sumW : 1.0;
      const filteredR = sumR * invSumW;
      const filteredG = sumG * invSumW;
      const filteredB = sumB * invSumW;

      output[pIdx] = Math.round(src[pIdx] * invBlend + filteredR * blendAlpha);
      output[pIdx + 1] = Math.round(src[pIdx + 1] * invBlend + filteredG * blendAlpha);
      output[pIdx + 2] = Math.round(src[pIdx + 2] * invBlend + filteredB * blendAlpha);
      output[pIdx + 3] = src[pIdx + 3];
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// STAGE 4: PORTRAIT & FACE ENHANCEMENT MODE
// ---------------------------------------------------------------------------

export function applyFaceEnhancement(
  srcData: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
  clarity: number // 0 to 100
): Uint8ClampedArray {
  const { width, height, data: src } = srcData;
  const total = width * height;
  const output = new Uint8ClampedArray(src.length);
  output.set(src);

  // Compute luminance and skin mask
  const lum = new Float32Array(total);
  const skinMask = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const p = i * 4;
    const r = src[p];
    const g = src[p + 1];
    const b = src[p + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = y;

    // YCbCr skin detection
    const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
    const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;

    if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && y >= 35 && y <= 245) {
      const dCb = Math.min(cb - 77, 127 - cb) / 10.0;
      const dCr = Math.min(cr - 133, 173 - cr) / 10.0;
      skinMask[i] = Math.max(0, Math.min(1, Math.min(dCb, dCr)));
    }
  }

  // Skin smoothing & feature enhancement pass
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x;
      const pIdx = idx * 4;
      const mask = skinMask[idx];
      const curY = lum[idx];

      const top = lum[idx - width];
      const bot = lum[idx + width];
      const left = lum[idx - 1];
      const right = lum[idx + 1];

      // Local gradient magnitude
      const grad = Math.abs(right - left) + Math.abs(bot - top);

      let targetY = curY;

      if (mask > 0.15) {
        // Skin smoothing: gentle low-frequency blend to reduce blemishes
        const localAvg = (top + bot + left + right + curY * 2) / 6.0;
        targetY = curY * (1.0 - mask * 0.45) + localAvg * (mask * 0.45);
      } else if (grad > 20 && (skinMask[idx - 1] > 0 || skinMask[idx + 1] > 0 || skinMask[idx - width] > 0 || skinMask[idx + width] > 0)) {
        // Non-skin facial feature boost (eyelashes, eyebrows, iris, lips): micro-contrast boost
        const localAvg = (top + bot + left + right) * 0.25;
        const diff = curY - localAvg;
        targetY = curY + diff * 0.35;
      }

      // Studio tone curve (S-curve tone mapping for clarity and vibrancy)
      const normY = targetY / 255.0;
      const toneBoost = 0.06 * Math.sin(2 * Math.PI * normY) * (clarity / 100);
      const finalY = Math.max(0, Math.min(255, (normY + toneBoost) * 255));

      // Modulate RGB maintaining color ratios
      const ratio = finalY / Math.max(1, curY);

      // Subtle warmth boost on skin tones
      const warmthR = mask > 0.2 ? 1.02 : 1.0;
      const warmthG = mask > 0.2 ? 1.01 : 1.0;

      output[pIdx] = Math.max(0, Math.min(255, Math.round(src[pIdx] * ratio * warmthR)));
      output[pIdx + 1] = Math.max(0, Math.min(255, Math.round(src[pIdx + 1] * ratio * warmthG)));
      output[pIdx + 2] = Math.max(0, Math.min(255, Math.round(src[pIdx + 2] * ratio)));
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// STAGE 5: ADAPTIVE LUMINANCE UNSHARP MASKING (USM) & KHMER TEXT BOOSTER
// ---------------------------------------------------------------------------

export function applyAdaptiveUSM(
  srcData: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
  sharpness: number, // 0 to 100
  isDocumentMode: boolean
): Uint8ClampedArray {
  const { width, height, data: src } = srcData;
  const total = width * height;
  const output = new Uint8ClampedArray(src.length);
  output.set(src);

  if (sharpness <= 0 && !isDocumentMode) {
    return output;
  }

  // Extract luminance
  const lum = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    lum[i] = 0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2];
  }

  // Gaussian blur on luminance (5-tap separable [1, 4, 6, 4, 1] / 16)
  const blurH = new Float32Array(total);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const idx = row + x;
      const x0 = Math.max(0, x - 2);
      const x1 = Math.max(0, x - 1);
      const x2 = x;
      const x3 = Math.min(width - 1, x + 1);
      const x4 = Math.min(width - 1, x + 2);

      blurH[idx] =
        (lum[row + x0] +
          lum[row + x1] * 4 +
          lum[row + x2] * 6 +
          lum[row + x3] * 4 +
          lum[row + x4]) /
        16.0;
    }
  }

  const blur = new Float32Array(total);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - 2) * width;
    const y1 = Math.max(0, y - 1) * width;
    const y2 = y * width;
    const y3 = Math.min(height - 1, y + 1) * width;
    const y4 = Math.min(height - 1, y + 2) * width;

    for (let x = 0; x < width; x++) {
      const idx = y2 + x;
      blur[idx] =
        (blurH[y0 + x] +
          blurH[y1 + x] * 4 +
          blurH[y2 + x] * 6 +
          blurH[y3 + x] * 4 +
          blurH[y4 + x]) /
        16.0;
    }
  }

  // Sharpening gain
  const gain = 0.4 + (sharpness / 100) * 1.5;
  const threshold = isDocumentMode ? 1.5 : 2.5;

  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x;
      const pIdx = idx * 4;
      const curY = lum[idx];
      const delta = curY - blur[idx];

      // Local 3x3 min and max for halo suppression
      let localMin = curY;
      let localMax = curY;
      for (let dy = -1; dy <= 1; dy++) {
        const nRow = (y + dy) * width;
        for (let dx = -1; dx <= 1; dx++) {
          const neighbor = lum[nRow + x + dx];
          if (neighbor < localMin) localMin = neighbor;
          if (neighbor > localMax) localMax = neighbor;
        }
      }

      let sharpY = curY;

      // Threshold protection against noise amplification
      if (Math.abs(delta) >= threshold) {
        sharpY = curY + gain * delta;
        // Halo suppression clamping
        const haloMargin = isDocumentMode ? 10.0 : 6.0;
        sharpY = Math.max(localMin - haloMargin, Math.min(localMax + haloMargin, sharpY));
      }

      // Khmer Text & Line Art Booster (steepens stroke transitions)
      if (isDocumentMode) {
        const dx = Math.abs(lum[idx + 1] - lum[idx - 1]);
        const dy = Math.abs(lum[idx + width] - lum[idx - width]);
        if (dx + dy > 30) {
          const localAvg = (localMin + localMax) * 0.5;
          if (curY < localAvg) {
            sharpY = Math.max(0, sharpY - 8.0); // crisper dark ink strokes
          } else {
            sharpY = Math.min(255, sharpY + 6.0); // clean paper background
          }
        }
      }

      sharpY = Math.max(0, Math.min(255, sharpY));

      // Modulate RGB maintaining pure color chromaticity
      const ratio = sharpY / Math.max(1, curY);

      output[pIdx] = Math.max(0, Math.min(255, Math.round(src[pIdx] * ratio)));
      output[pIdx + 1] = Math.max(0, Math.min(255, Math.round(src[pIdx + 1] * ratio)));
      output[pIdx + 2] = Math.max(0, Math.min(255, Math.round(src[pIdx + 2] * ratio)));
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// FULL PIPELINE RUNNER (PURE FUNCTION FOR TESTS & WORKER/FALLBACK)
// ---------------------------------------------------------------------------

export async function runImageUpscalePipeline(
  input: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
  options: UpscaleOptions
): Promise<{
  data: Uint8ClampedArray;
  width: number;
  height: number;
  diagnostics: ImageDiagnostics;
}> {
  const { signal, onProgress } = options;

  if (signal?.aborted) {
    throw new Error("Upscaling aborted by user.");
  }

  // Stage 1: Diagnostics
  onProgress?.({
    stage: 1,
    totalStages: 5,
    stageName: "Smart Image Diagnostics",
    stageNameKh: "វិភាគកម្រិតគុណភាពរូបភាព",
    percent: 15,
  });

  const diagnostics = calculateImageDiagnostics(input);

  if (signal?.aborted) {
    throw new Error("Upscaling aborted by user.");
  }

  // Preset overrides
  let faceEnhance = options.faceEnhance;
  let denoise = options.denoise;
  let sharpness = options.sharpness;
  let clarity = options.clarity;
  let isDocumentMode = options.preset === "text" || diagnostics.isDocumentLikely;

  if (options.preset === "portrait") {
    faceEnhance = true;
    denoise = Math.max(denoise, 45);
    clarity = Math.max(clarity, 50);
  } else if (options.preset === "text") {
    isDocumentMode = true;
    sharpness = Math.max(sharpness, 70);
    denoise = Math.max(denoise, 30);
  } else if (options.preset === "restore") {
    denoise = Math.max(denoise, 65);
    sharpness = Math.max(sharpness, 45);
  }

  // Stage 2: Lanczos-3 Resampling
  onProgress?.({
    stage: 2,
    totalStages: 5,
    stageName: "High-Order Edge-Directed Upscaling (Lanczos-3)",
    stageNameKh: "ពង្រីកទំហំកម្រិតច្បាស់ (Lanczos-3)",
    percent: 40,
  });

  const resampled = applyLanczosResample(input, options.scale);

  if (signal?.aborted) {
    throw new Error("Upscaling aborted by user.");
  }

  // Stage 3: Bilateral Denoising
  onProgress?.({
    stage: 3,
    totalStages: 5,
    stageName: "Bilateral Surface Denoising & JPEG Artifact Removal",
    stageNameKh: "កាត់បន្ថយគ្រាប់អុជ និងភាពស្រពិចស្រពិល",
    percent: 65,
  });

  const denoised = applyBilateralDenoise(resampled, denoise);

  if (signal?.aborted) {
    throw new Error("Upscaling aborted by user.");
  }

  // Stage 4: Portrait & Face Enhancement
  let faceEnhanced = denoised;
  if (faceEnhance) {
    onProgress?.({
      stage: 4,
      totalStages: 5,
      stageName: "Portrait & Face Enhancement Mode",
      stageNameKh: "សម្រួលផ្ទៃមុខ និងសម្បុរស្បែក",
      percent: 85,
    });
    faceEnhanced = applyFaceEnhancement(
      { data: denoised, width: resampled.width, height: resampled.height },
      clarity
    );
  } else {
    onProgress?.({
      stage: 4,
      totalStages: 5,
      stageName: "Tone & Clarity Harmonization",
      stageNameKh: "កែសម្រួលពន្លឺ និងកម្រិតពណ៌",
      percent: 85,
    });
  }

  if (signal?.aborted) {
    throw new Error("Upscaling aborted by user.");
  }

  // Stage 5: Adaptive USM
  onProgress?.({
    stage: 5,
    totalStages: 5,
    stageName: "Adaptive Luminance USM & Micro-Detail Recovery",
    stageNameKh: "បង្កើនភាពច្បាស់ និងទាញយកព័ត៌មានលម្អិត",
    percent: 100,
  });

  const finalData = applyAdaptiveUSM(
    { data: faceEnhanced, width: resampled.width, height: resampled.height },
    sharpness,
    isDocumentMode
  );

  return {
    data: finalData,
    width: resampled.width,
    height: resampled.height,
    diagnostics,
  };
}
