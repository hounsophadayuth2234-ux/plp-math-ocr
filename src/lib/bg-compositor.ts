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

export type ContentMode = "document_poster" | "person" | "whole_product" | "custom";

export type SelectionMode =
  | "document_poster"
  | "person"
  | "whole_product"
  | "contents_only"
  | "custom"
  | "box_polygon";

export interface QuadCorners {
  topLeft: [number, number];
  topRight: [number, number];
  bottomRight: [number, number];
  bottomLeft: [number, number];
}

export interface DocumentDetectionResult {
  hasDocumentBoundary: boolean;
  confidence: number;
  corners: QuadCorners;
  isFullImage: boolean;
  aspectRatio: number;
}

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
 * Detects page/poster boundary in an image.
 * If the image is a poster/document with margins on a table or wall, identifies the 4 corners.
 * If no clear page boundary exists (or the poster fills >= 90% of the canvas), keeps the full canvas.
 */
export function detectDocumentQuad(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): DocumentDetectionResult {
  const fullCorners: QuadCorners = {
    topLeft: [0, 0],
    topRight: [width - 1, 0],
    bottomRight: [width - 1, height - 1],
    bottomLeft: [0, height - 1],
  };

  if (width < 20 || height < 20) {
    return {
      hasDocumentBoundary: true,
      confidence: 1.0,
      corners: fullCorners,
      isFullImage: true,
      aspectRatio: width / Math.max(1, height),
    };
  }

  // Sample luminosity/contrast along borders to see if there is an outer margin
  const maxSearchX = Math.floor(width * 0.12);
  const maxSearchY = Math.floor(height * 0.12);

  const getLum = (x: number, y: number) => {
    const pIdx = (y * width + x) * 4;
    return 0.299 * sourceRgba[pIdx] + 0.587 * sourceRgba[pIdx + 1] + 0.114 * sourceRgba[pIdx + 2];
  };

  // Find left border: scan inward from left margin
  let bestLeft = 0;
  for (let x = 1; x < maxSearchX; x++) {
    let diffSum = 0;
    const step = Math.max(1, Math.floor(height / 20));
    let samples = 0;
    for (let y = step; y < height - step; y += step) {
      diffSum += Math.abs(getLum(x, y) - getLum(x - 1, y));
      samples++;
    }
    const avgDiff = samples > 0 ? diffSum / samples : 0;
    if (avgDiff > 20) {
      let peakX = x;
      let maxDiff = avgDiff;
      for (let px = x + 1; px <= Math.min(x + 4, maxSearchX); px++) {
        let pDiffSum = 0;
        for (let y = step; y < height - step; y += step) {
          pDiffSum += Math.abs(getLum(px, y) - getLum(px - 1, y));
        }
        const pAvg = samples > 0 ? pDiffSum / samples : 0;
        if (pAvg > maxDiff) {
          maxDiff = pAvg;
          peakX = px;
        }
      }
      bestLeft = peakX;
      break;
    }
  }

  // Find right border: scan inward from right margin
  let bestRight = width - 1;
  for (let x = width - 2; x > width - 1 - maxSearchX; x--) {
    let diffSum = 0;
    const step = Math.max(1, Math.floor(height / 20));
    let samples = 0;
    for (let y = step; y < height - step; y += step) {
      diffSum += Math.abs(getLum(x, y) - getLum(x + 1, y));
      samples++;
    }
    const avgDiff = samples > 0 ? diffSum / samples : 0;
    if (avgDiff > 20) {
      let peakX = x;
      let maxDiff = avgDiff;
      for (let px = x - 1; px >= Math.max(x - 4, width - 1 - maxSearchX); px--) {
        let pDiffSum = 0;
        for (let y = step; y < height - step; y += step) {
          pDiffSum += Math.abs(getLum(px, y) - getLum(px + 1, y));
        }
        const pAvg = samples > 0 ? pDiffSum / samples : 0;
        if (pAvg > maxDiff) {
          maxDiff = pAvg;
          peakX = px;
        }
      }
      bestRight = peakX;
      break;
    }
  }

  // Find top border: scan inward from top margin
  let bestTop = 0;
  for (let y = 1; y < maxSearchY; y++) {
    let diffSum = 0;
    const step = Math.max(1, Math.floor(width / 20));
    let samples = 0;
    for (let x = step; x < width - step; x += step) {
      diffSum += Math.abs(getLum(x, y) - getLum(x, y - 1));
      samples++;
    }
    const avgDiff = samples > 0 ? diffSum / samples : 0;
    if (avgDiff > 20) {
      let peakY = y;
      let maxDiff = avgDiff;
      for (let py = y + 1; py <= Math.min(y + 4, maxSearchY); py++) {
        let pDiffSum = 0;
        for (let x = step; x < width - step; x += step) {
          pDiffSum += Math.abs(getLum(x, py) - getLum(x, py - 1));
        }
        const pAvg = samples > 0 ? pDiffSum / samples : 0;
        if (pAvg > maxDiff) {
          maxDiff = pAvg;
          peakY = py;
        }
      }
      bestTop = peakY;
      break;
    }
  }

  // Find bottom border: scan inward from bottom margin
  let bestBottom = height - 1;
  for (let y = height - 2; y > height - 1 - maxSearchY; y--) {
    let diffSum = 0;
    const step = Math.max(1, Math.floor(width / 20));
    let samples = 0;
    for (let x = step; x < width - step; x += step) {
      diffSum += Math.abs(getLum(x, y) - getLum(x, y + 1));
      samples++;
    }
    const avgDiff = samples > 0 ? diffSum / samples : 0;
    if (avgDiff > 20) {
      let peakY = y;
      let maxDiff = avgDiff;
      for (let py = y - 1; py >= Math.max(y - 4, height - 1 - maxSearchY); py--) {
        let pDiffSum = 0;
        for (let x = step; x < width - step; x += step) {
          pDiffSum += Math.abs(getLum(x, py) - getLum(x, py + 1));
        }
        const pAvg = samples > 0 ? pDiffSum / samples : 0;
        if (pAvg > maxDiff) {
          maxDiff = pAvg;
          peakY = py;
        }
      }
      bestBottom = peakY;
      break;
    }
  }

  // A document surrounded by background margins must have margins on at least 2 sides.
  // If fewer than 2 margins were found, any single transition is an internal section/graphic, not an outer boundary.
  const marginsFound =
    (bestLeft > 3 ? 1 : 0) +
    (bestRight < width - 4 ? 1 : 0) +
    (bestTop > 3 ? 1 : 0) +
    (bestBottom < height - 4 ? 1 : 0);

  if (marginsFound < 2) {
    bestLeft = 0;
    bestRight = width - 1;
    bestTop = 0;
    bestBottom = height - 1;
  }

  const quadW = bestRight - bestLeft + 1;
  const quadH = bestBottom - bestTop + 1;
  const quadArea = quadW * quadH;
  const totalArea = width * height;

  const isFullImage =
    quadArea >= totalArea * 0.90 ||
    (bestLeft <= 3 && bestRight >= width - 4 && bestTop <= 3 && bestBottom >= height - 4);

  if (isFullImage) {
    return {
      hasDocumentBoundary: true,
      confidence: 1.0,
      corners: fullCorners,
      isFullImage: true,
      aspectRatio: width / Math.max(1, height),
    };
  }

  const detectedCorners: QuadCorners = {
    topLeft: [bestLeft, bestTop],
    topRight: [bestRight, bestTop],
    bottomRight: [bestRight, bestBottom],
    bottomLeft: [bestLeft, bestBottom],
  };

  return {
    hasDocumentBoundary: true,
    confidence: 0.92,
    corners: detectedCorners,
    isFullImage: false,
    aspectRatio: quadW / Math.max(1, quadH),
  };
}

/**
 * Generates a 1-channel binary mask from 4 corner points.
 * Inside the quadrilateral = 255 (solid foreground).
 * Outside the quadrilateral = 0 (background).
 */
export function generateQuadMask(
  corners: QuadCorners,
  width: number,
  height: number
): Uint8ClampedArray {
  const totalPixels = width * height;
  const mask = new Uint8ClampedArray(totalPixels);

  const isFull =
    corners.topLeft[0] <= 1 &&
    corners.topLeft[1] <= 1 &&
    corners.topRight[0] >= width - 2 &&
    corners.topRight[1] <= 1 &&
    corners.bottomRight[0] >= width - 2 &&
    corners.bottomRight[1] >= height - 2 &&
    corners.bottomLeft[0] <= 1 &&
    corners.bottomLeft[1] >= height - 2;

  if (isFull) {
    mask.fill(255);
    return mask;
  }

  const polygon: [number, number][] = [
    corners.topLeft,
    corners.topRight,
    corners.bottomRight,
    corners.bottomLeft,
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pointInPolygon(x, y, polygon)) {
        mask[y * width + x] = 255;
      } else {
        mask[y * width + x] = 0;
      }
    }
  }

  return mask;
}

/**
 * Rectifies / warps a 4-point quadrilateral document region into an upright rectangle.
 */
export function warpPerspectiveQuad(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  srcWidth: number,
  srcHeight: number,
  corners: QuadCorners,
  targetWidth?: number,
  targetHeight?: number
): {
  warpedRgba: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const [tlX, tlY] = corners.topLeft;
  const [trX, trY] = corners.topRight;
  const [brX, brY] = corners.bottomRight;
  const [blX, blY] = corners.bottomLeft;

  const topW = Math.hypot(trX - tlX, trY - tlY);
  const bottomW = Math.hypot(brX - blX, brY - blY);
  const leftH = Math.hypot(blX - tlX, blY - tlY);
  const rightH = Math.hypot(brX - trX, brY - trY);

  const dstW = Math.max(10, targetWidth || Math.round((topW + bottomW) / 2));
  const dstH = Math.max(10, targetHeight || Math.round((leftH + rightH) / 2));

  const warped = new Uint8ClampedArray(dstW * dstH * 4);

  for (let dy = 0; dy < dstH; dy++) {
    const v = dstH > 1 ? dy / (dstH - 1) : 0;
    for (let dx = 0; dx < dstW; dx++) {
      const u = dstW > 1 ? dx / (dstW - 1) : 0;

      const sx = (1 - u) * (1 - v) * tlX + u * (1 - v) * trX + u * v * brX + (1 - u) * v * blX;
      const sy = (1 - u) * (1 - v) * tlY + u * (1 - v) * trY + u * v * brY + (1 - u) * v * blY;

      const dIdx = (dy * dstW + dx) * 4;
      const cSx = Math.max(0, Math.min(srcWidth - 1, Math.round(sx)));
      const cSy = Math.max(0, Math.min(srcHeight - 1, Math.round(sy)));
      const sIdx = (cSy * srcWidth + cSx) * 4;

      warped[dIdx] = sourceRgba[sIdx];
      warped[dIdx + 1] = sourceRgba[sIdx + 1];
      warped[dIdx + 2] = sourceRgba[sIdx + 2];
      warped[dIdx + 3] = sourceRgba[sIdx + 3];
    }
  }

  return { warpedRgba: warped, width: dstW, height: dstH };
}

/**
 * Controlled Color Decontamination & Dehalo Pass for Person and Product modes.
 *
 * Removes background color bleed (e.g. white fringes, pink/light glow) along semi-transparent
 * boundary edges (alpha in [1, 254]).
 *
 * Guarantees:
 * - Definite foreground interior pixels (alpha === 255) remain 100% UNCHANGED.
 * - Definite background pixels (alpha === 0) remain 100% UNCHANGED.
 * - Only modifies the RGB color of edge pixels in the narrow boundary band.
 * - Alpha mask transparency values are NEVER modified.
 */
export function applyColorDehalo(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  alphaMask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  radius: number = 3
): Uint8ClampedArray {
  const totalPixels = width * height;
  const isMask4Ch = alphaMask.length === totalPixels * 4;
  const decontaminated = new Uint8ClampedArray(sourceRgba);

  const safeRadius = Math.max(1, Math.min(6, Math.round(radius)));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const alpha = isMask4Ch ? alphaMask[idx * 4 + 3] : alphaMask[idx];

      // Only process semi-transparent edge pixels
      if (alpha === 0 || alpha === 255) continue;

      // Search for the nearest solid foreground pixel (alpha === 255)
      let nearestDistSq = Infinity;
      let fgR = 0, fgG = 0, fgB = 0;
      let foundFg = false;

      const minY = Math.max(0, y - safeRadius);
      const maxY = Math.min(height - 1, y + safeRadius);
      const minX = Math.max(0, x - safeRadius);
      const maxX = Math.min(width - 1, x + safeRadius);

      for (let ny = minY; ny <= maxY; ny++) {
        const dy = ny - y;
        for (let nx = minX; nx <= maxX; nx++) {
          const dx = nx - x;
          const distSq = dx * dx + dy * dy;
          if (distSq > safeRadius * safeRadius) continue;

          const nIdx = ny * width + nx;
          const nAlpha = isMask4Ch ? alphaMask[nIdx * 4 + 3] : alphaMask[nIdx];
          if (nAlpha === 255) {
            if (distSq < nearestDistSq) {
              nearestDistSq = distSq;
              const nPIdx = nIdx * 4;
              fgR = sourceRgba[nPIdx];
              fgG = sourceRgba[nPIdx + 1];
              fgB = sourceRgba[nPIdx + 2];
              foundFg = true;
            }
          }
        }
      }

      if (foundFg) {
        const pIdx = idx * 4;
        const origR = sourceRgba[pIdx];
        const origG = sourceRgba[pIdx + 1];
        const origB = sourceRgba[pIdx + 2];

        // Alpha blend edge color toward nearest solid interior color
        const weight = alpha / 255;
        decontaminated[pIdx] = Math.round(origR * weight + fgR * (1 - weight));
        decontaminated[pIdx + 1] = Math.round(origG * weight + fgG * (1 - weight));
        decontaminated[pIdx + 2] = Math.round(origB * weight + fgB * (1 - weight));
      }
    }
  }

  return decontaminated;
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
  height: number,
  options?: {
    mode?: SelectionMode;
    conservative?: boolean;
  }
): ContainerDetectionResult {
  const totalPixels = width * height;
  const isMask4Ch = initialMask.length === totalPixels * 4;

  const mode = options?.mode;
  const isConservative = options?.conservative ?? (mode === "whole_product" || !mode);

  // DOCUMENT / POSTER MODE: Never remove internal white areas, text, logos, or printed person.
  if (mode === "document_poster") {
    const fullMask = new Uint8ClampedArray(totalPixels);
    fullMask.fill(255);
    return {
      hasContainer: false,
      boxConfidence: 0,
      containerMask: new Uint8ClampedArray(totalPixels),
      contentsMask: fullMask,
    };
  }

  // PERSON MODE: Isolated person portrait does not have a cardboard box / container.
  if (mode === "person") {
    const personMask = new Uint8ClampedArray(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      personMask[i] = isMask4Ch ? initialMask[i * 4 + 3] : initialMask[i];
    }
    return {
      hasContainer: false,
      boxConfidence: 0,
      containerMask: new Uint8ClampedArray(totalPixels),
      contentsMask: personMask,
      warning: undefined,
    };
  }

  // CONSERVATIVE DEFAULT: When mode is "whole_product" or conservative is requested,
  // NEVER classify bright or low-saturation pixels as background by color alone.
  // The complete connected product, packaging, white lid/shell, and contents are preserved.
  if (isConservative && (mode === "whole_product" || !mode)) {
    const emptyContainer = new Uint8ClampedArray(totalPixels);
    const wholeProductMask = new Uint8ClampedArray(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      wholeProductMask[i] = isMask4Ch ? initialMask[i * 4 + 3] : initialMask[i];
    }
    return {
      hasContainer: false,
      boxConfidence: 0,
      containerMask: emptyContainer,
      contentsMask: wholeProductMask,
      warning: undefined,
    };
  }

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
 * Generates a conservative 3-class trimap from the selection mask.
 * Values:
 *   0: Definite background
 *   128: Unknown boundary band (for alpha matting, strictly bounded to narrow 2-8px band)
 *   255: Definite foreground
 *
 * CRITICAL SAFETY CONSTRAINTS:
 * 1. Any pixel in `excludedMask` (e.g. regions removed by negative points) is strictly locked to 0.
 * 2. Any pixel in `manualKeepMask` (e.g. manual Keep brush strokes) is strictly locked to 255.
 * 3. Interior foreground pixels > radius away from background are strictly locked to 255 and NEVER assigned 128.
 */
export function generateTrimap(
  mask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  radius: number = 3,
  excludedMask?: Uint8ClampedArray | Uint8Array | null,
  manualKeepMask?: Uint8ClampedArray | Uint8Array | null
): Uint8ClampedArray {
  const totalPixels = width * height;
  const isMask4Ch = mask.length === totalPixels * 4;
  const trimap = new Uint8ClampedArray(totalPixels);

  const getMaskVal = (idx: number) => (isMask4Ch ? mask[idx * 4 + 3] : mask[idx]);
  const isExcluded = (idx: number) => (excludedMask ? excludedMask[idx] > 128 : false);
  const isManualKeep = (idx: number) => (manualKeepMask ? manualKeepMask[idx] > 128 : false);

  // Safe bounded radius: 2 to 8 px
  const safeRadius = Math.max(2, Math.min(8, Math.round(radius)));

  for (let y = 0; y < height; y++) {
    const minY = Math.max(0, y - safeRadius);
    const maxY = Math.min(height - 1, y + safeRadius);

    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // Manual keep stroke strictly preserved as definite foreground (255)
      if (isManualKeep(idx)) {
        trimap[idx] = 255;
        continue;
      }

      // Explicitly excluded pixel strictly preserved as definite background (0)
      if (isExcluded(idx)) {
        trimap[idx] = 0;
        continue;
      }

      const centerVal = getMaskVal(idx);

      const minX = Math.max(0, x - safeRadius);
      const maxX = Math.min(width - 1, x + safeRadius);

      let hasFgNeighbor = false;
      let hasBgNeighbor = false;

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
        // Unknown transition boundary band (strictly narrow)
        trimap[idx] = 128;
      } else if (centerVal > 128) {
        // Definite interior foreground: NEVER eroded
        trimap[idx] = 255;
      } else {
        // Definite exterior background
        trimap[idx] = 0;
      }
    }
  }

  return trimap;
}

/**
 * Generates an RGBA visualizer overlay for mask diagnostics and preview before export:
 * • Green overlay = Definite foreground (mask > 200)
 * • Yellow overlay = Uncertain transition edge (55 <= mask <= 200)
 * • Red overlay = Removed background (mask < 55)
 */
export function generateMaskOverlay(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  maskAlpha: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options?: {
    keptColor?: [number, number, number];    // Default: [34, 197, 94] (Green)
    edgeColor?: [number, number, number];    // Default: [234, 179, 8] (Yellow)
    removedColor?: [number, number, number]; // Default: [239, 68, 68] (Red)
    keptOpacity?: number;                    // Default: 0.45
    edgeOpacity?: number;                    // Default: 0.50
    removedOpacity?: number;                 // Default: 0.35
  }
): Uint8ClampedArray {
  const totalPixels = width * height;
  const overlay = new Uint8ClampedArray(totalPixels * 4);
  const isMask4Ch = maskAlpha.length === totalPixels * 4;

  const keptRgb = options?.keptColor || [34, 197, 94];      // Green
  const edgeRgb = options?.edgeColor || [234, 179, 8];      // Yellow
  const removedRgb = options?.removedColor || [239, 68, 68];// Red
  const keptA = options?.keptOpacity ?? 0.45;
  const edgeA = options?.edgeOpacity ?? 0.50;
  const removedA = options?.removedOpacity ?? 0.35;

  for (let i = 0; i < totalPixels; i++) {
    const pIdx = i * 4;
    const r = sourceRgba[pIdx];
    const g = sourceRgba[pIdx + 1];
    const b = sourceRgba[pIdx + 2];
    const a = maskAlpha ? (isMask4Ch ? maskAlpha[pIdx + 3] : maskAlpha[i]) : 255;

    if (a > 200) {
      // Definite Foreground: Green
      overlay[pIdx] = Math.round(r * (1 - keptA) + keptRgb[0] * keptA);
      overlay[pIdx + 1] = Math.round(g * (1 - keptA) + keptRgb[1] * keptA);
      overlay[pIdx + 2] = Math.round(b * (1 - keptA) + keptRgb[2] * keptA);
      overlay[pIdx + 3] = 255;
    } else if (a >= 55) {
      // Uncertain Edge: Yellow
      overlay[pIdx] = Math.round(r * (1 - edgeA) + edgeRgb[0] * edgeA);
      overlay[pIdx + 1] = Math.round(g * (1 - edgeA) + edgeRgb[1] * edgeA);
      overlay[pIdx + 2] = Math.round(b * (1 - edgeA) + edgeRgb[2] * edgeA);
      overlay[pIdx + 3] = 255;
    } else {
      // Removed Background: Red
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
 * Refines boundary transitions ONLY in the unknown trimap zone (128).
 *
 * Guarantees:
 * - Never modifies definite foreground (255) or definite background (0).
 * - Enforces an alpha floor (default >= 0.95) for initial foreground pixels touching the edge.
 * - Respects manual keep strokes unconditionally.
 */
export function refineMaskWithGuidedFilter(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  trimap: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  radius: number = 3,
  eps: number = 1e-4,
  options?: {
    initialMask?: Uint8ClampedArray | Uint8Array | null;
    manualKeepMask?: Uint8ClampedArray | Uint8Array | null;
    alphaFloor?: number; // default 0.95 (242) for interior definite foreground
  }
): Uint8ClampedArray {
  const totalPixels = width * height;
  const refinedAlpha = new Uint8ClampedArray(totalPixels);
  const safeRadius = Math.max(2, Math.min(8, Math.round(radius)));
  const minAlphaFloor = Math.round(255 * (options?.alphaFloor ?? 0.95));

  const isInit4Ch = options?.initialMask ? options.initialMask.length === totalPixels * 4 : false;
  const getInitVal = (idx: number) => {
    if (!options?.initialMask) return 0;
    return isInit4Ch ? options.initialMask[idx * 4 + 3] : options.initialMask[idx];
  };

  // Convert RGB to grayscale guide [0..1]
  const guide = new Float32Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const pIdx = i * 4;
    guide[i] = (0.299 * sourceRgba[pIdx] + 0.587 * sourceRgba[pIdx + 1] + 0.114 * sourceRgba[pIdx + 2]) / 255.0;
  }

  // Refine ONLY pixels in unknown band (128). Never touch 255 or 0!
  for (let y = 0; y < height; y++) {
    const minY = Math.max(0, y - safeRadius);
    const maxY = Math.min(height - 1, y + safeRadius);

    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // Manual keep is strictly locked to 255
      if (options?.manualKeepMask && options.manualKeepMask[idx] > 128) {
        refinedAlpha[idx] = 255;
        continue;
      }

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
      const minX = Math.max(0, x - safeRadius);
      const maxX = Math.min(width - 1, x + safeRadius);

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

      let outA = Math.max(0, Math.min(1, aCoeff * guide[idx] + bCoeff));
      let outByte = Math.round(outA * 255);

      // If this pixel was strong foreground (> 200) in initial mask, enforce alpha floor
      if (getInitVal(idx) > 200) {
        outByte = Math.max(minAlphaFloor, outByte);
      }

      refinedAlpha[idx] = outByte;
    }
  }

  return refinedAlpha;
}

export interface MaskDiagnostics {
  initialForegroundArea: number;
  refinedForegroundArea: number;
  areaRetentionRatio: number;
  removedAreaPercentage: number;
  connectedComponentCount: number;
  largestComponentArea: number;
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  boundingBoxArea: number;
  interiorHoleCount: number;
  isAreaDropExcessive: boolean;
  warning?: string;
  rollbackTriggered: boolean;
}

/**
 * Computes deep mask diagnostics before export:
 * - Foreground area before and after refinement
 * - Percentage of alpha pixels removed by refinement
 * - Connected-component count (components > 20px)
 * - Bounding box area and dimensions
 * - Largest component area
 * - Number of large interior holes (> 50px)
 * - Automated safety threshold: triggers rollback when refined area < 80% of initial area
 */
export function computeMaskDiagnostics(
  initialMask: Uint8ClampedArray | Uint8Array,
  refinedMask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  maxDropRatio: number = 0.20
): MaskDiagnostics {
  const totalPixels = width * height;
  const isInit4Ch = initialMask.length === totalPixels * 4;
  const isRef4Ch = refinedMask.length === totalPixels * 4;

  let initialArea = 0;
  let refinedArea = 0;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    const yOff = y * width;
    for (let x = 0; x < width; x++) {
      const idx = yOff + x;
      const initA = isInit4Ch ? initialMask[idx * 4 + 3] : initialMask[idx];
      const refA = isRef4Ch ? refinedMask[idx * 4 + 3] : refinedMask[idx];

      if (initA > 128) {
        initialArea++;
      }
      if (refA > 128) {
        refinedArea++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If refined is empty but initial had pixels, use initial bounding box
  if (minX > maxX || minY > maxY) {
    minX = 0;
    maxX = 0;
    minY = 0;
    maxY = 0;
  }
  const bbW = maxX >= minX ? maxX - minX + 1 : 0;
  const bbH = maxY >= minY ? maxY - minY + 1 : 0;
  const boundingBoxArea = bbW * bbH;

  const areaRetentionRatio = initialArea > 0 ? refinedArea / initialArea : 1.0;
  const removedAreaPercentage =
    initialArea > 0 ? Math.round(Math.max(0, (1 - areaRetentionRatio) * 100) * 100) / 100 : 0;

  // 1. Connected Components of refined foreground (> 128) using flood fill
  const visited = new Uint8Array(totalPixels);
  let connectedComponentCount = 0;
  let largestComponentArea = 0;

  const queue = new Int32Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const a = isRef4Ch ? refinedMask[i * 4 + 3] : refinedMask[i];
    if (a > 128 && visited[i] === 0) {
      let head = 0;
      let tail = 0;
      queue[tail++] = i;
      visited[i] = 1;
      let compSize = 0;

      while (head < tail) {
        const cur = queue[head++];
        compSize++;
        const cy = Math.floor(cur / width);
        const cx = cur % width;

        // 4 neighbors
        if (cx > 0) {
          const left = cur - 1;
          const leftA = isRef4Ch ? refinedMask[left * 4 + 3] : refinedMask[left];
          if (leftA > 128 && visited[left] === 0) {
            visited[left] = 1;
            queue[tail++] = left;
          }
        }
        if (cx < width - 1) {
          const right = cur + 1;
          const rightA = isRef4Ch ? refinedMask[right * 4 + 3] : refinedMask[right];
          if (rightA > 128 && visited[right] === 0) {
            visited[right] = 1;
            queue[tail++] = right;
          }
        }
        if (cy > 0) {
          const top = cur - width;
          const topA = isRef4Ch ? refinedMask[top * 4 + 3] : refinedMask[top];
          if (topA > 128 && visited[top] === 0) {
            visited[top] = 1;
            queue[tail++] = top;
          }
        }
        if (cy < height - 1) {
          const bottom = cur + width;
          const bottomA = isRef4Ch ? refinedMask[bottom * 4 + 3] : refinedMask[bottom];
          if (bottomA > 128 && visited[bottom] === 0) {
            visited[bottom] = 1;
            queue[tail++] = bottom;
          }
        }
      }

      if (compSize > 20) {
        connectedComponentCount++;
        if (compSize > largestComponentArea) {
          largestComponentArea = compSize;
        }
      }
    }
  }

  // 2. Interior holes: Background pixels (<= 128) that are NOT reachable from outer image borders
  const exteriorBg = new Uint8Array(totalPixels);
  let head = 0;
  let tail = 0;

  // Enqueue all outer border background pixels
  for (let x = 0; x < width; x++) {
    const topIdx = x;
    const botIdx = (height - 1) * width + x;
    const topA = isRef4Ch ? refinedMask[topIdx * 4 + 3] : refinedMask[topIdx];
    const botA = isRef4Ch ? refinedMask[botIdx * 4 + 3] : refinedMask[botIdx];
    if (topA <= 128 && exteriorBg[topIdx] === 0) {
      exteriorBg[topIdx] = 1;
      queue[tail++] = topIdx;
    }
    if (botA <= 128 && exteriorBg[botIdx] === 0) {
      exteriorBg[botIdx] = 1;
      queue[tail++] = botIdx;
    }
  }
  for (let y = 0; y < height; y++) {
    const leftIdx = y * width;
    const rightIdx = y * width + (width - 1);
    const leftA = isRef4Ch ? refinedMask[leftIdx * 4 + 3] : refinedMask[leftIdx];
    const rightA = isRef4Ch ? refinedMask[rightIdx * 4 + 3] : refinedMask[rightIdx];
    if (leftA <= 128 && exteriorBg[leftIdx] === 0) {
      exteriorBg[leftIdx] = 1;
      queue[tail++] = leftIdx;
    }
    if (rightA <= 128 && exteriorBg[rightIdx] === 0) {
      exteriorBg[rightIdx] = 1;
      queue[tail++] = rightIdx;
    }
  }

  while (head < tail) {
    const cur = queue[head++];
    const cy = Math.floor(cur / width);
    const cx = cur % width;

    if (cx > 0) {
      const left = cur - 1;
      const leftA = isRef4Ch ? refinedMask[left * 4 + 3] : refinedMask[left];
      if (leftA <= 128 && exteriorBg[left] === 0) {
        exteriorBg[left] = 1;
        queue[tail++] = left;
      }
    }
    if (cx < width - 1) {
      const right = cur + 1;
      const rightA = isRef4Ch ? refinedMask[right * 4 + 3] : refinedMask[right];
      if (rightA <= 128 && exteriorBg[right] === 0) {
        exteriorBg[right] = 1;
        queue[tail++] = right;
      }
    }
    if (cy > 0) {
      const top = cur - width;
      const topA = isRef4Ch ? refinedMask[top * 4 + 3] : refinedMask[top];
      if (topA <= 128 && exteriorBg[top] === 0) {
        exteriorBg[top] = 1;
        queue[tail++] = top;
      }
    }
    if (cy < height - 1) {
      const bottom = cur + width;
      const bottomA = isRef4Ch ? refinedMask[bottom * 4 + 3] : refinedMask[bottom];
      if (bottomA <= 128 && exteriorBg[bottom] === 0) {
        exteriorBg[bottom] = 1;
        queue[tail++] = bottom;
      }
    }
  }

  // Any background pixel (<= 128) where exteriorBg[i] === 0 is an interior hole!
  const holeVisited = new Uint8Array(totalPixels);
  let interiorHoleCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const a = isRef4Ch ? refinedMask[i * 4 + 3] : refinedMask[i];
    if (a <= 128 && exteriorBg[i] === 0 && holeVisited[i] === 0) {
      head = 0;
      tail = 0;
      queue[tail++] = i;
      holeVisited[i] = 1;
      let holeSize = 0;

      while (head < tail) {
        const cur = queue[head++];
        holeSize++;
        const cy = Math.floor(cur / width);
        const cx = cur % width;

        if (cx > 0) {
          const left = cur - 1;
          const leftA = isRef4Ch ? refinedMask[left * 4 + 3] : refinedMask[left];
          if (leftA <= 128 && exteriorBg[left] === 0 && holeVisited[left] === 0) {
            holeVisited[left] = 1;
            queue[tail++] = left;
          }
        }
        if (cx < width - 1) {
          const right = cur + 1;
          const rightA = isRef4Ch ? refinedMask[right * 4 + 3] : refinedMask[right];
          if (rightA <= 128 && exteriorBg[right] === 0 && holeVisited[right] === 0) {
            holeVisited[right] = 1;
            queue[tail++] = right;
          }
        }
        if (cy > 0) {
          const top = cur - width;
          const topA = isRef4Ch ? refinedMask[top * 4 + 3] : refinedMask[top];
          if (topA <= 128 && exteriorBg[top] === 0 && holeVisited[top] === 0) {
            holeVisited[top] = 1;
            queue[tail++] = top;
          }
        }
        if (cy < height - 1) {
          const bottom = cur + width;
          const bottomA = isRef4Ch ? refinedMask[bottom * 4 + 3] : refinedMask[bottom];
          if (bottomA <= 128 && exteriorBg[bottom] === 0 && holeVisited[bottom] === 0) {
            holeVisited[bottom] = 1;
            queue[tail++] = bottom;
          }
        }
      }

      if (holeSize > 50) {
        interiorHoleCount++;
      }
    }
  }

  // 3. Excessive drop check: If refined area dropped by more than maxDropRatio (e.g. 20%)
  const isAreaDropExcessive = initialArea > 100 && areaRetentionRatio < (1 - maxDropRatio);
  const rollbackTriggered = isAreaDropExcessive;
  let warning: string | undefined = undefined;

  if (rollbackTriggered) {
    warning = `⚠️ Refinement removed ${removedAreaPercentage.toFixed(1)}% of foreground (> 20%). Automatic safety rollback engaged to prevent over-cutting white lids/boxes.`;
  }

  return {
    initialForegroundArea: initialArea,
    refinedForegroundArea: refinedArea,
    areaRetentionRatio,
    removedAreaPercentage,
    connectedComponentCount,
    largestComponentArea,
    boundingBox: {
      minX,
      minY,
      maxX,
      maxY,
      width: bbW,
      height: bbH,
    },
    boundingBoxArea,
    interiorHoleCount,
    isAreaDropExcessive,
    warning,
    rollbackTriggered,
  };
}

/**
 * Validates refined mask against initial mask. If area drop exceeds maxDropRatio (20%),
 * automatically reverts to initial mask to ensure white lids/shells are never lost.
 */
export function applyAreaSafetyCheck(
  initialMask: Uint8ClampedArray | Uint8Array,
  refinedMask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  maxDropRatio: number = 0.20
): {
  safeMask: Uint8ClampedArray;
  diagnostics: MaskDiagnostics;
  rollbackTriggered: boolean;
} {
  const diagnostics = computeMaskDiagnostics(
    initialMask,
    refinedMask,
    width,
    height,
    maxDropRatio
  );

  let safeMask: Uint8ClampedArray;
  if (diagnostics.rollbackTriggered) {
    safeMask = new Uint8ClampedArray(initialMask);
  } else {
    safeMask = new Uint8ClampedArray(refinedMask);
  }

  return {
    safeMask,
    diagnostics,
    rollbackTriggered: Boolean(diagnostics.rollbackTriggered),
  };
}
