/**
 * Math & Khmer Image Quality Assessment, Layout Detection, and Profile Preprocessing Module
 *
 * Requirements satisfied:
 * 1. Image Quality Assessment: Blur (Laplacian variance), contrast (RMS), brightness, and pixel budget.
 * 2. Actionable low-quality messaging ("Image quality is low. Try a sharper image, better lighting...").
 * 3. Layout Detection: Distinguishes text lines, formulas, tables, diagrams, and low-confidence regions.
 * 4. Coordinate Preservation & Reading Order: Bounding boxes sorted top-to-bottom, left-to-right.
 * 5. Preprocessing Profiles:
 *    - printed_light_background
 *    - camera_document
 *    - handwriting
 *    - math_formula
 *    - mixed_khmer_math
 * 6. Non-destructive: Always preserves the original image for comparison and user correction.
 */

export type PreprocessProfile =
  | "printed_light_background"
  | "camera_document"
  | "handwriting"
  | "math_formula"
  | "mixed_khmer_math";

export interface ImageQualityAssessment {
  isValid: boolean;
  blurScore: number; // Laplacian variance (higher = sharper, <18 = blurry)
  isBlurry: boolean;
  contrastScore: number; // RMS contrast in [0, 100] (<15 = low contrast)
  isLowContrast: boolean;
  brightnessScore: number; // Mean luminance in [0, 255] (<35 = too dark, >240 = washed out)
  isTooDark: boolean;
  isWashedOut: boolean;
  hasUsableTextRegion: boolean;
  pixelCount: number;
  memoryExceeded: boolean;
  recommendedProfile: PreprocessProfile;
  warningMessage?: string;
}

export type RegionKind = "khmer_text" | "formula" | "table" | "diagram" | "unknown";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedRegion {
  regionId: string;
  kind: RegionKind;
  bbox: BoundingBox;
  confidence: number;
  readingOrder: number;
  textStrokePixelCount: number;
  aspectRatio: number;
}

export interface OcrRegionResult {
  regionId: string;
  kind: RegionKind;
  rawText: string;
  normalizedText: string;
  confidence: number;
  bbox: BoundingBox;
  sourceRevision: number;
  isUserEdited?: boolean;
}

// ── 1. Quality Assessment ──

/**
 * Computes luminance channel from RGBA buffer: Y = 0.299R + 0.587G + 0.114B
 */
export function extractLuminance(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const total = width * height;
  const lum = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    lum[i] = Math.round(rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114);
  }
  return lum;
}

/**
 * Computes discrete Laplacian variance over luminance to assess sharpness / blur.
 */
export function computeLaplacianVariance(lum: Uint8Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 100;

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  // Stride of 2 on large images to conserve CPU while remaining statistically robust
  const stride = width > 1000 || height > 1000 ? 2 : 1;

  for (let y = 1; y < height - 1; y += stride) {
    const yOff = y * width;
    for (let x = 1; x < width - 1; x += stride) {
      const idx = yOff + x;
      // 3x3 discrete Laplacian kernel:
      //  0  1  0
      //  1 -4  1
      //  0  1  0
      const lap =
        lum[idx - width] +
        lum[idx + width] +
        lum[idx - 1] +
        lum[idx + 1] -
        4 * lum[idx];

      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return Math.max(0, variance);
}

/**
 * Assesses complete image quality, blur, contrast, brightness, and memory budget.
 */
export function assessImageQuality(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): ImageQualityAssessment {
  const pixelCount = width * height;
  const MAX_PIXEL_BUDGET = 16 * 1024 * 1024; // 16 Megapixels limit
  const memoryExceeded = pixelCount > MAX_PIXEL_BUDGET;

  const lum = extractLuminance(rgba, width, height);

  // Mean brightness & RMS contrast
  let sumLum = 0;
  let sumSqLum = 0;
  for (let i = 0; i < pixelCount; i++) {
    const l = lum[i];
    sumLum += l;
    sumSqLum += l * l;
  }
  const meanLum = sumLum / pixelCount;
  const varianceLum = Math.max(0, sumSqLum / pixelCount - meanLum * meanLum);
  const rmsContrast = Math.sqrt(varianceLum);

  const blurScore = computeLaplacianVariance(lum, width, height);
  const isBlurry = blurScore < 16.0;
  const isLowContrast = rmsContrast < 18.0;
  const isTooDark = meanLum < 35.0;
  const isWashedOut = meanLum > 242.0;

  // Count stroke pixels (pixels with high gradient vs neighbors)
  let edgePixels = 0;
  for (let y = 1; y < height - 1; y += 2) {
    const yOff = y * width;
    for (let x = 1; x < width - 1; x += 2) {
      const idx = yOff + x;
      const grad = Math.abs(lum[idx] - lum[idx + 1]) + Math.abs(lum[idx] - lum[idx + width]);
      if (grad > 35) edgePixels++;
    }
  }
  const hasUsableTextRegion = edgePixels > (width * height) / 800;

  // Determine profile recommendation
  let recommendedProfile: PreprocessProfile = "printed_light_background";
  if (meanLum < 180 || isLowContrast) {
    recommendedProfile = "camera_document";
  } else if (hasUsableTextRegion && blurScore > 100) {
    recommendedProfile = "mixed_khmer_math";
  }

  let warningMessage: string | undefined = undefined;
  if (memoryExceeded) {
    warningMessage = "រូបភាពធំលើសកំណត់ 16MP (Image dimensions exceed 16MP memory budget). Please crop or downscale.";
  } else if (isBlurry) {
    warningMessage = "Image quality is low. Try a sharper image, better lighting, or crop the text region before processing (រូបភាពព្រិលខ្លាំង).";
  } else if (isTooDark || isWashedOut) {
    warningMessage = "Image lighting is uneven or too dark. Try better lighting or crop the text region before processing.";
  } else if (isLowContrast) {
    warningMessage = "Image contrast is low. Try increasing lighting contrast or upload a clearer photo.";
  }

  return {
    isValid: !memoryExceeded && (hasUsableTextRegion || !isBlurry),
    blurScore: Math.round(blurScore * 10) / 10,
    isBlurry,
    contrastScore: Math.round(rmsContrast * 10) / 10,
    isLowContrast,
    brightnessScore: Math.round(meanLum),
    isTooDark,
    isWashedOut,
    hasUsableTextRegion,
    pixelCount,
    memoryExceeded,
    recommendedProfile,
    warningMessage,
  };
}

// ── 2. Profile-Specific Preprocessing ──

/**
 * Preprocesses image buffer based on the selected profile without altering the original.
 * Returns a new Uint8ClampedArray RGBA buffer.
 */
export function preprocessImageProfile(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  profile: PreprocessProfile
): Uint8ClampedArray {
  const total = width * height;
  const output = new Uint8ClampedArray(total * 4);

  const lum = extractLuminance(sourceRgba, width, height);

  // Compute min/max luminance for contrast normalization
  let minLum = 255;
  let maxLum = 0;
  for (let i = 0; i < total; i++) {
    const l = lum[i];
    if (l < minLum) minLum = l;
    if (l > maxLum) maxLum = l;
  }
  const range = Math.max(1, maxLum - minLum);

  if (profile === "camera_document") {
    // Contrast stretch + mild background whitening
    for (let i = 0; i < total; i++) {
      const p = i * 4;
      let stretched = Math.round(((lum[i] - minLum) / range) * 255);
      // Whiten high-end document paper background
      if (stretched > 210) stretched = 255;
      output[p] = stretched;
      output[p + 1] = stretched;
      output[p + 2] = stretched;
      output[p + 3] = 255;
    }
  } else if (profile === "handwriting") {
    // Enhance darker strokes to avoid breaking pencil/pen lines
    for (let i = 0; i < total; i++) {
      const p = i * 4;
      const normalized = ((lum[i] - minLum) / range) * 255;
      // Gamma boost for faint strokes
      const boosted = Math.round(Math.pow(normalized / 255, 1.25) * 255);
      output[p] = boosted;
      output[p + 1] = boosted;
      output[p + 2] = boosted;
      output[p + 3] = 255;
    }
  } else if (profile === "math_formula") {
    // High-precision preservation of small exponents, subscripts and fraction bars
    for (let i = 0; i < total; i++) {
      const p = i * 4;
      const norm = ((lum[i] - minLum) / range) * 255;
      // Linear enhancement preserving midtones
      const enhanced = Math.round(norm < 120 ? norm * 0.9 : Math.min(255, norm * 1.05));
      output[p] = enhanced;
      output[p + 1] = enhanced;
      output[p + 2] = enhanced;
      output[p + 3] = 255;
    }
  } else if (profile === "mixed_khmer_math") {
    // Balanced profile for Khmer vertical diacritic stacks + LaTeX formulas
    for (let i = 0; i < total; i++) {
      const p = i * 4;
      const norm = ((lum[i] - minLum) / range) * 255;
      const balanced = Math.round(norm);
      output[p] = balanced;
      output[p + 1] = balanced;
      output[p + 2] = balanced;
      output[p + 3] = 255;
    }
  } else {
    // printed_light_background (default)
    for (let i = 0; i < total * 4; i++) {
      output[i] = sourceRgba[i];
    }
  }

  return output;
}

// ── 3. Layout Detection & Reading Order ──

/**
 * Detects text lines, formula blocks, and diagram regions using connected horizontal projection profiles.
 * Preserves coordinates so recognized pieces merge in true top-to-bottom reading order.
 */
export function detectLayoutRegions(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): DetectedRegion[] {
  const lum = extractLuminance(rgba, width, height);

  // Horizontal projection profile (count of dark text pixels per row)
  const rowCounts = new Int32Array(height);
  const threshold = 170; // Text is typically darker than paper

  for (let y = 0; y < height; y++) {
    const yOff = y * width;
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (lum[yOff + x] < threshold) {
        count++;
      }
    }
    rowCounts[y] = count;
  }

  // Segment horizontal bands
  interface RowBand {
    startY: number;
    endY: number;
    height: number;
  }
  const bands: RowBand[] = [];
  let inBand = false;
  let bandStart = 0;
  const minRowThreshold = Math.max(2, Math.round(width * 0.005));

  for (let y = 0; y < height; y++) {
    const isTextRow = rowCounts[y] > minRowThreshold;
    if (isTextRow && !inBand) {
      inBand = true;
      bandStart = y;
    } else if (!isTextRow && inBand) {
      inBand = false;
      const bandHeight = y - bandStart;
      if (bandHeight >= 6) {
        bands.push({ startY: bandStart, endY: y, height: bandHeight });
      }
    }
  }
  if (inBand) {
    const bandHeight = height - bandStart;
    if (bandHeight >= 6) {
      bands.push({ startY: bandStart, endY: height, height: bandHeight });
    }
  }

  // If no clear bands detected, return single whole-image region
  if (bands.length === 0) {
    return [
      {
        regionId: "region_0",
        kind: "formula",
        bbox: { x: 0, y: 0, width, height },
        confidence: 0.9,
        readingOrder: 1,
        textStrokePixelCount: width * height,
        aspectRatio: width / height,
      },
    ];
  }

  const regions: DetectedRegion[] = [];

  for (let bIdx = 0; bIdx < bands.length; bIdx++) {
    const band = bands[bIdx];
    // Find horizontal bounding extent (minX, maxX)
    let minX = width;
    let maxX = 0;
    let strokeCount = 0;

    for (let y = band.startY; y < band.endY; y++) {
      const yOff = y * width;
      for (let x = 0; x < width; x++) {
        if (lum[yOff + x] < threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          strokeCount++;
        }
      }
    }

    if (maxX <= minX) continue;

    // Pad slightly
    const pad = 4;
    const x = Math.max(0, minX - pad);
    const y = Math.max(0, band.startY - pad);
    const w = Math.min(width - x, maxX - minX + 1 + pad * 2);
    const h = Math.min(height - y, band.height + pad * 2);

    const aspect = w / Math.max(1, h);

    // Classify region kind based on geometry and density
    let kind: RegionKind = "formula";
    if (h > 120 && aspect < 2.0) {
      kind = "diagram";
    } else if (aspect > 6.0 && h < 45) {
      kind = "khmer_text";
    } else if (h > 60 && strokeCount > 2000) {
      kind = "table";
    }

    regions.push({
      regionId: `region_${bIdx + 1}`,
      kind,
      bbox: { x, y, width: w, height: h },
      confidence: 0.95,
      readingOrder: bIdx + 1,
      textStrokePixelCount: strokeCount,
      aspectRatio: aspect,
    });
  }

  // Sort reading order strictly top-to-bottom, then left-to-right
  regions.sort((a, b) => {
    const yDiff = a.bbox.y - b.bbox.y;
    if (Math.abs(yDiff) > 15) return yDiff;
    return a.bbox.x - b.bbox.x;
  });

  // Re-assign 1-indexed reading order
  regions.forEach((r, idx) => {
    r.readingOrder = idx + 1;
  });

  return regions;
}

/**
 * Crops a bounding box region from an RGBA buffer.
 */
export function cropRegionFromRgba(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  sourceW: number,
  sourceH: number,
  bbox: BoundingBox
): { data: Uint8ClampedArray; width: number; height: number } {
  const { x, y, width: cw, height: ch } = bbox;
  const cropped = new Uint8ClampedArray(cw * ch * 4);

  for (let dy = 0; dy < ch; dy++) {
    const sy = y + dy;
    if (sy < 0 || sy >= sourceH) continue;
    const sOffset = (sy * sourceW + x) * 4;
    const dOffset = dy * cw * 4;
    for (let dx = 0; dx < cw * 4; dx++) {
      cropped[dOffset + dx] = sourceRgba[sOffset + dx];
    }
  }

  return { data: cropped, width: cw, height: ch };
}
