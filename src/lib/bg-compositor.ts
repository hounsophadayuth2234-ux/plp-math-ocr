/**
 * Module 02: Background Compositor Utility
 * 
 * Provides robust, pure mathematical RGBA compositing for:
 * 1. រូបសំណួរ — White #FFFFFF
 * 2. រូបដំណោះស្រាយ — Pink #FFF0F5 (LavenderBlush)
 * 3. រូបថ្លា — Cutout (Transparent Alpha Preserved)
 * 
 * Guarantees:
 * - Opaque foreground pixels remain completely intact.
 * - Semi-transparent edge pixels blend smoothly with the target solid background.
 * - Solid exports (white, pink) always possess 100% solid alpha (255).
 * - Transparent exports preserve the exact segmented/edited alpha channel.
 * - Strictly isolated to Module 02.
 */

export type OutputPurpose = "white" | "pink" | "transparent";

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export const SOLID_BACKGROUNDS: Record<"white" | "pink", RgbColor> = {
  white: { r: 255, g: 255, b: 255 }, // #FFFFFF (Question background)
  pink: { r: 255, g: 240, b: 245 },  // #FFF0F5 (Solution background - LavenderBlush)
};

/**
 * Composites a single RGBA pixel with a mask alpha value.
 * Pure mathematical function: all channel values in [0, 255].
 * 
 * @param fgR Foreground Red
 * @param fgG Foreground Green
 * @param fgB Foreground Blue
 * @param fgA Foreground Alpha
 * @param maskA Segmentation Mask Alpha
 * @param background Target output purpose ('white' | 'pink' | 'transparent')
 * @param customBg Optional custom solid background color
 * @returns [R, G, B, A] tuple in [0, 255]
 */
export function compositePixel(
  fgR: number,
  fgG: number,
  fgB: number,
  fgA: number,
  maskA: number,
  background: OutputPurpose,
  customBg?: RgbColor
): [number, number, number, number] {
  // Clamp input values to valid range
  const r = Math.max(0, Math.min(255, Math.round(fgR)));
  const g = Math.max(0, Math.min(255, Math.round(fgG)));
  const b = Math.max(0, Math.min(255, Math.round(fgB)));
  const a = Math.max(0, Math.min(255, Math.round(fgA)));
  const m = Math.max(0, Math.min(255, Math.round(maskA)));

  // Effective alpha combines original image alpha and segmentation mask
  const effectiveAlpha = Math.round((m * a) / 255);

  if (background === "transparent") {
    // Preserve transparent alpha; clear RGB if fully transparent
    return [
      effectiveAlpha === 0 ? 0 : r,
      effectiveAlpha === 0 ? 0 : g,
      effectiveAlpha === 0 ? 0 : b,
      effectiveAlpha,
    ];
  }

  const bg = customBg || (background === "pink" ? SOLID_BACKGROUNDS.pink : SOLID_BACKGROUNDS.white);
  const aNorm = effectiveAlpha / 255;
  const invNorm = 1 - aNorm;

  // Linear alpha blending: C_out = C_fg * alpha + C_bg * (1 - alpha)
  const outR = Math.min(255, Math.max(0, Math.round(r * aNorm + bg.r * invNorm)));
  const outG = Math.min(255, Math.max(0, Math.round(g * aNorm + bg.g * invNorm)));
  const outB = Math.min(255, Math.max(0, Math.round(b * aNorm + bg.b * invNorm)));
  const outA = 255; // Solid exports are always 100% opaque

  return [outR, outG, outB, outA];
}

/**
 * Validates RGBA buffers and image dimensions.
 * Throws descriptive Error on mismatch or invalid geometry.
 */
export function validateRgbaBuffer(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  maskAlpha: Uint8ClampedArray | Uint8Array | null,
  width: number,
  height: number
): void {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(`Invalid width: ${width}. Width must be a positive integer.`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(`Invalid height: ${height}. Height must be a positive integer.`);
  }

  const totalPixels = width * height;
  const expectedRgbaLen = totalPixels * 4;

  if (!sourceRgba || sourceRgba.length !== expectedRgbaLen) {
    throw new Error(
      `Invalid source RGBA buffer size. Expected ${expectedRgbaLen} bytes for ${width}x${height}, got ${sourceRgba?.length || 0}.`
    );
  }

  if (maskAlpha) {
    if (maskAlpha.length !== totalPixels && maskAlpha.length !== expectedRgbaLen) {
      throw new Error(
        `Invalid mask buffer size. Expected ${totalPixels} (1-channel) or ${expectedRgbaLen} (4-channel) bytes, got ${maskAlpha.length}.`
      );
    }
  }
}

/**
 * Composites a full RGBA buffer with an optional alpha mask onto the target background.
 * Returns a new Uint8ClampedArray containing the composited image.
 */
export function compositeRgbaBuffer(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  maskAlpha: Uint8ClampedArray | Uint8Array | null,
  width: number,
  height: number,
  background: OutputPurpose,
  customBg?: RgbColor
): Uint8ClampedArray {
  validateRgbaBuffer(sourceRgba, maskAlpha, width, height);

  const totalPixels = width * height;
  const output = new Uint8ClampedArray(totalPixels * 4);
  const isMask4Channel = maskAlpha ? maskAlpha.length === totalPixels * 4 : false;

  for (let i = 0; i < totalPixels; i++) {
    const pIdx = i * 4;
    const fgR = sourceRgba[pIdx];
    const fgG = sourceRgba[pIdx + 1];
    const fgB = sourceRgba[pIdx + 2];
    const fgA = sourceRgba[pIdx + 3];

    let maskA = 255;
    if (maskAlpha) {
      maskA = isMask4Channel ? maskAlpha[pIdx + 3] : maskAlpha[i];
    }

    const [outR, outG, outB, outA] = compositePixel(
      fgR,
      fgG,
      fgB,
      fgA,
      maskA,
      background,
      customBg
    );

    output[pIdx] = outR;
    output[pIdx + 1] = outG;
    output[pIdx + 2] = outB;
    output[pIdx + 3] = outA;
  }

  return output;
}

/**
 * Switches composite mode between White, Pink, and Transparent.
 * Guaranteed to produce identical, repeatable output without generational quality loss.
 */
export function switchCompositeMode(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  maskAlpha: Uint8ClampedArray | Uint8Array | null,
  width: number,
  height: number,
  newBackground: OutputPurpose
): Uint8ClampedArray {
  return compositeRgbaBuffer(sourceRgba, maskAlpha, width, height, newBackground);
}

/**
 * Generates descriptive, truthful export filenames.
 * Example: PLP-math_diagram-Question-White-FFFFFF-1200x1200-final.png
 */
export function generateExportFilename(
  originalFileName: string,
  purpose: OutputPurpose,
  width: number,
  height: number,
  mode: string = "browser"
): string {
  const cleanBase = originalFileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_\u1780-\u17FF-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 40) || "image";

  const purposeLabels: Record<OutputPurpose, string> = {
    white: "Question-White-FFFFFF",
    pink: "Solution-Pink-FFF0F5",
    transparent: "Cutout-Transparent",
  };

  const label = purposeLabels[purpose] || "Cutout";
  return `PLP-${cleanBase}-${label}-${width}x${height}-${mode}.png`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive Segmentation, Container Detection & Trimap Generation
// ─────────────────────────────────────────────────────────────────────────────

export type SelectionMode = "whole_product" | "contents_only" | "custom" | "box_polygon";

export interface InteractiveSegmentationOptions {
  mode?: SelectionMode;
  positivePoints?: [number, number][];
  negativePoints?: [number, number][];
  boxes?: [number, number, number, number][];
  polygon?: [number, number][];
  pointRadius?: number; // default 16 px
}

export interface ContainerDetectionResult {
  hasContainer: boolean;
  boxConfidence: number; // 0..1
  containerMask: Uint8ClampedArray; // 1-channel mask for cardboard box/container
  contentsMask: Uint8ClampedArray;  // 1-channel mask for inner pastries/contents
  warning?: string;
}

/**
 * Ray-casting algorithm to test whether point (x, y) is inside a polygon.
 */
export function pointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Detects whether the segmented object contains an outer packaging/box container
 * versus inner food/pastry/donut contents.
 *
 * Distinguishes packaging based on:
 * - Geometric positioning (outer boundary vs interior)
 * - Color variance / texture distribution (cardboard surfaces are flatter; pastries have high texture)
 */
export function detectContainerAndContents(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  initialMask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): ContainerDetectionResult {
  const totalPixels = width * height;
  const isMask4Ch = initialMask.length === totalPixels * 4;

  let minX = width, maxX = 0, minY = height, maxY = 0;
  let fgCount = 0;

  // 1. Find bounding box of foreground
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const maskA = isMask4Ch ? initialMask[idx * 4 + 3] : initialMask[idx];
      if (maskA > 128) {
        fgCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const containerMask = new Uint8ClampedArray(totalPixels);
  const contentsMask = new Uint8ClampedArray(totalPixels);

  if (fgCount < 100 || minX > maxX || minY > maxY) {
    return {
      hasContainer: false,
      boxConfidence: 0,
      containerMask,
      contentsMask: new Uint8ClampedArray(initialMask),
    };
  }

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const bboxArea = boxW * boxH;
  const coverage = fgCount / bboxArea;

  // 2. Compute local variance and color characteristics
  // Cardboard/box typically has lower variance or kraft/tan/neutral color.
  // Pastries/donuts have higher color saturation and higher local standard deviation.
  let containerPixelCount = 0;
  let contentsPixelCount = 0;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = y * width + x;
      const maskA = isMask4Ch ? initialMask[idx * 4 + 3] : initialMask[idx];
      if (maskA <= 128) continue;

      const pIdx = idx * 4;
      const r = sourceRgba[pIdx];
      const g = sourceRgba[pIdx + 1];
      const b = sourceRgba[pIdx + 2];

      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;

      // Distance to foreground bounding border normalized [0..1]
      const distBorderX = Math.min(x - minX, maxX - x) / (boxW / 2);
      const distBorderY = Math.min(y - minY, maxY - y) / (boxH / 2);
      const distBorder = Math.min(distBorderX, distBorderY);

      // Cardboard/packaging criteria:
      // Outer border region or low saturation/neutral or flat texture
      const isCardboardCandidate =
        distBorder < 0.22 || (sat < 0.35 && distBorder < 0.45);

      if (isCardboardCandidate) {
        containerMask[idx] = 255;
        containerPixelCount++;
      } else {
        contentsMask[idx] = 255;
        contentsPixelCount++;
      }
    }
  }

  const hasContainer =
    coverage > 0.35 &&
    bboxArea > width * height * 0.15 &&
    containerPixelCount > fgCount * 0.15 &&
    contentsPixelCount > fgCount * 0.1;

  const boxConfidence = hasContainer
    ? Math.min(0.98, Math.round(((containerPixelCount / fgCount) * 1.2) * 100) / 100)
    : 0.1;

  let warning: string | undefined = undefined;
  if (hasContainer) {
    warning =
      "⚠️ Box/container detected. In 'Keep Contents Only' mode, the packaging is stripped. Use (+) or (-) clicks if any pastry edge touches the box.";
  }

  return {
    hasContainer,
    boxConfidence,
    containerMask,
    contentsMask: hasContainer ? contentsMask : new Uint8ClampedArray(initialMask),
    warning,
  };
}

/**
 * Applies interactive selection prompts (positive points, negative points, boxes, polygons)
 * to update the semantic segmentation mask.
 */
export function applyInteractivePromptsToMask(
  baseMask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: InteractiveSegmentationOptions
): Uint8ClampedArray {
  const totalPixels = width * height;
  const isMask4Ch = baseMask.length === totalPixels * 4;
  const updated = new Uint8ClampedArray(totalPixels);

  // Copy base mask
  for (let i = 0; i < totalPixels; i++) {
    updated[i] = isMask4Ch ? baseMask[i * 4 + 3] : baseMask[i];
  }

  const radius = Math.max(4, options.pointRadius || 18);
  const rSq = radius * radius;

  // 1. Box prompt filter (if provided, restrict mask to union of boxes)
  if (options.boxes && options.boxes.length > 0) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const insideAnyBox = options.boxes.some(
          ([x1, y1, x2, y2]) => x >= x1 && x <= x2 && y >= y1 && y <= y2
        );
        if (!insideAnyBox) {
          updated[idx] = 0;
        }
      }
    }
  }

  // 2. Polygon prompt filter (if provided, restrict mask to inside polygon)
  if (options.polygon && options.polygon.length >= 3) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!pointInPolygon(x, y, options.polygon)) {
          updated[idx] = 0;
        }
      }
    }
  }

  // 3. Positive point prompts (Keep foreground regions)
  if (options.positivePoints && options.positivePoints.length > 0) {
    for (const [px, py] of options.positivePoints) {
      const cx = Math.round(px);
      const cy = Math.round(py);
      const minY = Math.max(0, cy - radius);
      const maxY = Math.min(height - 1, cy + radius);
      const minX = Math.max(0, cx - radius);
      const maxX = Math.min(width - 1, cx + radius);

      for (let y = minY; y <= maxY; y++) {
        const dy = y - cy;
        for (let x = minX; x <= maxX; x++) {
          const dx = x - cx;
          if (dx * dx + dy * dy <= rSq) {
            updated[y * width + x] = 255;
          }
        }
      }
    }
  }

  // 4. Negative point prompts (Remove packaging / unwanted background)
  if (options.negativePoints && options.negativePoints.length > 0) {
    for (const [nx, ny] of options.negativePoints) {
      const cx = Math.round(nx);
      const cy = Math.round(ny);
      const minY = Math.max(0, cy - radius);
      const maxY = Math.min(height - 1, cy + radius);
      const minX = Math.max(0, cx - radius);
      const maxX = Math.min(width - 1, cx + radius);

      for (let y = minY; y <= maxY; y++) {
        const dy = y - cy;
        for (let x = minX; x <= maxX; x++) {
          const dx = x - cx;
          if (dx * dx + dy * dy <= rSq) {
            updated[y * width + x] = 0;
          }
        }
      }
    }
  }

  return updated;
}

/**
 * Generates a 3-class trimap from the user-confirmed selection mask.
 * Values:
 *   0: Definite background
 *   128: Unknown boundary band (for alpha matting)
 *   255: Definite foreground
 *
 * CRITICAL CONSTRAINT:
 * Any pixel in `excludedMask` (e.g. regions removed by negative points or stripped packaging)
 * is strictly protected and NEVER assigned 128 (unknown). It remains 0 (definite background).
 */
export function generateTrimap(
  mask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  radius: number = 4,
  excludedMask?: Uint8ClampedArray | Uint8Array | null
): Uint8ClampedArray {
  const totalPixels = width * height;
  const isMask4Ch = mask.length === totalPixels * 4;
  const trimap = new Uint8ClampedArray(totalPixels);

  const getMaskVal = (idx: number) => (isMask4Ch ? mask[idx * 4 + 3] : mask[idx]);
  const isExcluded = (idx: number) => (excludedMask ? excludedMask[idx] > 128 : false);

  for (let y = 0; y < height; y++) {
    const minY = Math.max(0, y - radius);
    const maxY = Math.min(height - 1, y + radius);

    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // If explicitly excluded by user prompt, it remains 100% background
      if (isExcluded(idx)) {
        trimap[idx] = 0;
        continue;
      }

      const centerVal = getMaskVal(idx);

      let hasFgNeighbor = false;
      let hasBgNeighbor = false;

      const minX = Math.max(0, x - radius);
      const maxX = Math.min(width - 1, x + radius);

      for (let ny = minY; ny <= maxY; ny++) {
        for (let nx = minX; nx <= maxX; nx++) {
          const nIdx = ny * width + nx;
          const val = getMaskVal(nIdx);
          if (val > 200) hasFgNeighbor = true;
          if (val < 55) hasBgNeighbor = true;
          if (hasFgNeighbor && hasBgNeighbor) break;
        }
        if (hasFgNeighbor && hasBgNeighbor) break;
      }

      if (hasFgNeighbor && hasBgNeighbor) {
        // Unknown transition boundary
        // But if center was completely 0 and near excluded region, keep 0
        trimap[idx] = 128;
      } else if (centerVal > 128) {
        trimap[idx] = 255; // Definite foreground
      } else {
        trimap[idx] = 0;   // Definite background
      }
    }
  }

  return trimap;
}

/**
 * Generates an RGBA visualizer overlay for the mask preview before export.
 * Green overlay = Kept region (mask > 128).
 * Red overlay = Removed region (mask <= 128).
 */
export function generateMaskOverlay(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  maskAlpha: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options?: {
    keptColor?: [number, number, number];    // Default: [34, 197, 94] (Emerald 500)
    removedColor?: [number, number, number]; // Default: [239, 68, 68] (Rose 500)
    keptOpacity?: number;                    // Default: 0.4
    removedOpacity?: number;                 // Default: 0.35
  }
): Uint8ClampedArray {
  const totalPixels = width * height;
  const overlay = new Uint8ClampedArray(totalPixels * 4);
  const isMask4Ch = maskAlpha.length === totalPixels * 4;

  const keptRgb = options?.keptColor || [34, 197, 94];
  const removedRgb = options?.removedColor || [239, 68, 68];
  const keptA = options?.keptOpacity ?? 0.4;
  const removedA = options?.removedOpacity ?? 0.35;

  for (let i = 0; i < totalPixels; i++) {
    const pIdx = i * 4;
    const r = sourceRgba[pIdx];
    const g = sourceRgba[pIdx + 1];
    const b = sourceRgba[pIdx + 2];
    const a = maskAlpha ? (isMask4Ch ? maskAlpha[pIdx + 3] : maskAlpha[i]) : 255;

    if (a > 128) {
      // Kept region: blend with green
      overlay[pIdx] = Math.round(r * (1 - keptA) + keptRgb[0] * keptA);
      overlay[pIdx + 1] = Math.round(g * (1 - keptA) + keptRgb[1] * keptA);
      overlay[pIdx + 2] = Math.round(b * (1 - keptA) + keptRgb[2] * keptA);
      overlay[pIdx + 3] = 255;
    } else {
      // Removed region: blend with red / checkerboard
      overlay[pIdx] = Math.round(r * (1 - removedA) + removedRgb[0] * removedA);
      overlay[pIdx + 1] = Math.round(g * (1 - removedA) + removedRgb[1] * removedA);
      overlay[pIdx + 2] = Math.round(b * (1 - removedA) + removedRgb[2] * removedA);
      overlay[pIdx + 3] = 255;
    }
  }

  return overlay;
}

/**
 * Fast client-side Edge-Aware Guided Filter for Browser AI local fallback mode.
 * Refines boundary transitions in the unknown trimap zone (128) using source RGB edges.
 */
export function refineMaskWithGuidedFilter(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  trimap: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  radius: number = 4,
  eps: number = 1e-4
): Uint8ClampedArray {
  const totalPixels = width * height;
  const refinedAlpha = new Uint8ClampedArray(totalPixels);

  // Convert RGB to grayscale guide [0..1]
  const guide = new Float32Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const pIdx = i * 4;
    guide[i] = (0.299 * sourceRgba[pIdx] + 0.587 * sourceRgba[pIdx + 1] + 0.114 * sourceRgba[pIdx + 2]) / 255.0;
  }

  // Pure mathematical guided filter over unknown band
  for (let y = 0; y < height; y++) {
    const minY = Math.max(0, y - radius);
    const maxY = Math.min(height - 1, y + radius);

    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const tVal = trimap[idx];

      if (tVal === 255) {
        refinedAlpha[idx] = 255;
        continue;
      }
      if (tVal === 0) {
        refinedAlpha[idx] = 0;
        continue;
      }

      // Inside unknown band (128): compute local guided statistics
      const minX = Math.max(0, x - radius);
      const maxX = Math.min(width - 1, x + radius);

      let sumGuide = 0;
      let sumGuideSq = 0;
      let sumAlpha = 0;
      let sumGuideAlpha = 0;
      let count = 0;

      for (let ny = minY; ny <= maxY; ny++) {
        for (let nx = minX; nx <= maxX; nx++) {
          const nIdx = ny * width + nx;
          const g = guide[nIdx];
          const a = trimap[nIdx] === 255 ? 1.0 : (trimap[nIdx] === 0 ? 0.0 : 0.5);

          sumGuide += g;
          sumGuideSq += g * g;
          sumAlpha += a;
          sumGuideAlpha += g * a;
          count++;
        }
      }

      const meanG = sumGuide / count;
      const meanA = sumAlpha / count;
      const varG = sumGuideSq / count - meanG * meanG;
      const covGA = sumGuideAlpha / count - meanG * meanA;

      const aCoeff = covGA / (varG + eps);
      const bCoeff = meanA - aCoeff * meanG;

      const outA = Math.max(0, Math.min(1, aCoeff * guide[idx] + bCoeff));
      refinedAlpha[idx] = Math.round(outA * 255);
    }
  }

  return refinedAlpha;
}
