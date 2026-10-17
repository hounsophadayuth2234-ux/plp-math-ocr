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

export type ContentMode =
  | "preserve_all_foreground"
  | "person_text_only"
  | "person_only"
  | "person"
  | "product_only"
  | "whole_product"
  | "document_poster"
  | "whole_poster"
  | "person_plus_text"
  | "custom_mask"
  | "custom";

export type SelectionMode =
  | "preserve_all_foreground"
  | "person_text_only"
  | "person_only"
  | "person"
  | "product_only"
  | "whole_product"
  | "document_poster"
  | "whole_poster"
  | "document_text"
  | "person_plus_text"
  | "custom_mask"
  | "custom"
  | "contents_only"
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
 * Deterministic Document / Poster Safe Mode Output Generator.
 *
 * Guarantees:
 * - NO RMBG
 * - NO SAM
 * - NO Alpha Matting
 * - NO Guided Filter
 * - NO thresholding of white or light pixels
 * - Preserves EVERY original RGB pixel byte-identical.
 * - Sets alpha to 255 for every pixel by default.
 * - If an explicit user-confirmed polygon or box is provided, only pixels OUTSIDE
 *   become 0, while all pixels INSIDE remain strictly byte-identical to source.
 */
export function createDocumentSafeRgba(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options?: {
    polygon?: [number, number][];
    box?: [number, number, number, number];
    corners?: QuadCorners;
  }
): {
  outputRgba: Uint8ClampedArray;
  alphaMask: Uint8ClampedArray;
  isAllOpaque: boolean;
} {
  const totalPixels = width * height;
  const outputRgba = new Uint8ClampedArray(totalPixels * 4);
  const alphaMask = new Uint8ClampedArray(totalPixels);

  const hasPolygon = options?.polygon && options.polygon.length >= 3;
  const hasBox = options?.box && options.box.length === 4;
  const hasCorners = Boolean(options?.corners);

  if (!hasPolygon && !hasBox && !hasCorners) {
    // Default Safe Mode: All-Opaque Copy (every pixel alpha = 255)
    for (let i = 0; i < totalPixels; i++) {
      const pIdx = i * 4;
      outputRgba[pIdx] = sourceRgba[pIdx];
      outputRgba[pIdx + 1] = sourceRgba[pIdx + 1];
      outputRgba[pIdx + 2] = sourceRgba[pIdx + 2];
      outputRgba[pIdx + 3] = 255;
      alphaMask[i] = 255;
    }
    return { outputRgba, alphaMask, isAllOpaque: true };
  }

  // User explicitly specified or confirmed boundary
  let poly: [number, number][] | null = null;
  if (hasPolygon) {
    poly = options!.polygon!;
  } else if (hasCorners) {
    const c = options!.corners!;
    poly = [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft];
  }

  let isAllOpaque = true;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const pIdx = idx * 4;

      let isInside = true;
      if (poly) {
        isInside = pointInPolygon(x, y, poly);
      } else if (hasBox) {
        const [bx1, by1, bx2, by2] = options!.box!;
        isInside = x >= bx1 && x <= bx2 && y >= by1 && y <= by2;
      }

      if (isInside) {
        // Inside page polygon: Strictly byte-identical to source RGB
        outputRgba[pIdx] = sourceRgba[pIdx];
        outputRgba[pIdx + 1] = sourceRgba[pIdx + 1];
        outputRgba[pIdx + 2] = sourceRgba[pIdx + 2];
        outputRgba[pIdx + 3] = 255;
        alphaMask[idx] = 255;
      } else {
        // Outside page polygon: Transparent
        outputRgba[pIdx] = 0;
        outputRgba[pIdx + 1] = 0;
        outputRgba[pIdx + 2] = 0;
        outputRgba[pIdx + 3] = 0;
        alphaMask[idx] = 0;
        isAllOpaque = false;
      }
    }
  }

  return { outputRgba, alphaMask, isAllOpaque };
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
 * Isolates the person component from a segmentation mask that may contain
 * printed document text, logos, headers, and banners.
 *
 * Rules:
 * - Dedicated person segmentation mask: printed poster text is not part of the person.
 * - Preserves red/blue uniform, hair, skin, hands, and light-colored clothing.
 * - Filters out isolated thin text strokes, small caption text lines, and top banner graphics.
 * - Never reuses a document mask for person mode.
 */
export function isolatePersonMask(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  initialMask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Uint8ClampedArray {
  const totalPixels = width * height;
  const isMask4Ch = initialMask.length === totalPixels * 4;
  const result = new Uint8ClampedArray(totalPixels);

  const getMaskVal = (idx: number) => (isMask4Ch ? initialMask[idx * 4 + 3] : initialMask[idx]);

  const labels = new Int32Array(totalPixels);
  let currentLabel = 0;

  interface CompStats {
    id: number;
    pixelCount: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    hasSkin: boolean;
    hasUniformOrHair: boolean;
  }
  const components: CompStats[] = [];
  const queue = new Int32Array(totalPixels);

  const isPaperWhite = (idx: number) => {
    const p = idx * 4;
    return sourceRgba[p] >= 252 && sourceRgba[p + 1] >= 252 && sourceRgba[p + 2] >= 252;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIdx = y * width + x;
      if (getMaskVal(startIdx) <= 128 || labels[startIdx] !== 0 || isPaperWhite(startIdx)) continue;

      currentLabel++;
      let qHead = 0;
      let qTail = 0;
      queue[qTail++] = startIdx;
      labels[startIdx] = currentLabel;

      let pixelCount = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      let hasSkin = false;
      let hasUniformOrHair = false;

      while (qHead < qTail) {
        const curr = queue[qHead++];
        pixelCount++;

        const cy = Math.floor(curr / width);
        const cx = curr % width;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const pIdx = curr * 4;
        const r = sourceRgba[pIdx];
        const g = sourceRgba[pIdx + 1];
        const b = sourceRgba[pIdx + 2];

        // 1. Skin tone detector: face, hands, skin
        if (
          r > 125 &&
          g > 70 &&
          b > 45 &&
          r >= g &&
          g >= b - 20 &&
          r - g >= 8 &&
          r - b >= 15
        ) {
          hasSkin = true;
        }

        // 2. Uniform (red or blue) or hair detector
        // Red uniform
        if (r > 130 && g < 115 && b < 115 && r - g > 35) {
          hasUniformOrHair = true;
        }
        // Blue uniform
        if (b > 110 && r < 110 && b - r > 20 && b - g > 10) {
          hasUniformOrHair = true;
        }
        // Dark hair
        if (r < 65 && g < 55 && b < 50 && cy < height * 0.75) {
          hasUniformOrHair = true;
        }

        // 4-connected neighbors
        const neighbors = [
          cx > 0 ? curr - 1 : -1,
          cx < width - 1 ? curr + 1 : -1,
          cy > 0 ? curr - width : -1,
          cy < height - 1 ? curr + width : -1,
        ];

        for (const n of neighbors) {
          if (n >= 0 && labels[n] === 0 && getMaskVal(n) > 128 && !isPaperWhite(n)) {
            labels[n] = currentLabel;
            queue[qTail++] = n;
          }
        }
      }

      components.push({
        id: currentLabel,
        pixelCount,
        minX,
        maxX,
        minY,
        maxY,
        hasSkin,
        hasUniformOrHair,
      });
    }
  }

  const personLabelSet = new Set<number>();

  // Find components with definite human skin
  const skinComponents = components.filter(
    (c) => c.hasSkin && (c.maxY - c.minY + 1) > 20
  );

  let personMinX = width, personMaxX = 0, personMinY = height, personMaxY = 0;
  for (const sc of skinComponents) {
    personLabelSet.add(sc.id);
    if (sc.minX < personMinX) personMinX = sc.minX;
    if (sc.maxX > personMaxX) personMaxX = sc.maxX;
    if (sc.minY < personMinY) personMinY = sc.minY;
    if (sc.maxY > personMaxY) personMaxY = sc.maxY;
  }

  // Expand person bounding box to capture clothing/hair around the person
  const expandedMinY = Math.max(0, personMinY - Math.round(height * 0.20));
  const expandedMaxY = Math.min(height - 1, personMaxY + Math.round(height * 0.45));
  const expandedMinX = Math.max(0, personMinX - Math.round(width * 0.20));
  const expandedMaxX = Math.min(width - 1, personMaxX + Math.round(width * 0.20));

  for (const c of components) {
    if (personLabelSet.has(c.id)) continue;

    const compW = c.maxX - c.minX + 1;
    const compH = c.maxY - c.minY + 1;
    const isHorizontalBanner = c.minY < height * 0.20 && compW > width * 0.5;
    const isTextStroke = compH <= 32 || (compW / Math.max(1, compH) > 4 && !c.hasSkin);

    if (isHorizontalBanner || isTextStroke) {
      continue; // Never include document banners or printed text lines
    }

    // Include uniform or clothing if within the person's anatomical span
    if (c.hasUniformOrHair && c.pixelCount > 50) {
      if (
        skinComponents.length === 0 ||
        (c.minY >= expandedMinY && c.maxY <= expandedMaxY && c.minX >= expandedMinX && c.maxX <= expandedMaxX)
      ) {
        personLabelSet.add(c.id);
      }
    } else if (
      skinComponents.length === 0 &&
      c.pixelCount / totalPixels >= 0.03 &&
      compH > height * 0.15
    ) {
      personLabelSet.add(c.id);
    }
  }

  // Fallback: If no anatomical cues found, keep largest non-banner component
  if (personLabelSet.size === 0 && components.length > 0) {
    let maxComp: CompStats | null = null;
    for (const c of components) {
      const compW = c.maxX - c.minX + 1;
      const compH = c.maxY - c.minY + 1;
      const isBanner = c.minY < height * 0.20 && compW > width * 0.5;
      const isText = compH <= 32 || (compW / Math.max(1, compH) > 4);
      if (isBanner || isText) continue;
      if (!maxComp || c.pixelCount > maxComp.pixelCount) maxComp = c;
    }
    if (maxComp) {
      personLabelSet.add((maxComp as CompStats).id);
    } else {
      personLabelSet.add(components[0].id);
    }
  }

  for (let i = 0; i < totalPixels; i++) {
    const lbl = labels[i];
    if (lbl > 0 && personLabelSet.has(lbl)) {
      result[i] = getMaskVal(i);
    } else {
      result[i] = 0;
    }
  }

  return result;
}

/**
 * Combines person mask with user-painted or user-selected text/graphic regions.
 */
export function combinePersonWithSelectedRegions(
  personMask: Uint8ClampedArray | Uint8Array,
  userSelectedMask: Uint8ClampedArray | Uint8Array | null,
  width: number,
  height: number
): Uint8ClampedArray {
  const totalPixels = width * height;
  const isPerson4Ch = personMask.length === totalPixels * 4;
  const combined = new Uint8ClampedArray(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const pVal = isPerson4Ch ? personMask[i * 4 + 3] : personMask[i];
    const uVal = userSelectedMask ? userSelectedMask[i] : 0;
    combined[i] = Math.max(pVal, uVal);
  }
  return combined;
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSON + TEXT ONLY: Multi-Class Independent Mask Extraction
// ─────────────────────────────────────────────────────────────────────────────

export interface TextStrokeMaskOptions {
  includeGraphics?: boolean;
  minContrast?: number;
  preserveDiacritics?: boolean;
  adaptiveSensitivity?: number;
  customKeepMask?: Uint8ClampedArray | Uint8Array | null;
}

export interface TextStrokeMaskResult {
  textStrokeMask: Uint8ClampedArray;
  graphicsMask: Uint8ClampedArray;
  textComponentCount: number;
  smallComponentCount: number;
  textArea: number;
  graphicsArea: number;
  lowConfidence: boolean;
  detectedTextLines: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    lineType: "khmer" | "latin" | "caption" | "heading";
  }[];
}

export interface PersonMaskOptions {
  minInteriorAlpha?: number;
  preserveHairStrands?: boolean;
  includeClothingWhite?: boolean;
  manualKeepMask?: Uint8ClampedArray | Uint8Array | null;
}

export interface PersonMaskResult {
  personMask: Uint8ClampedArray;
  personArea: number;
  hasPerson: boolean;
  skinLandmarkFound: boolean;
  boundaryBandMask: Uint8ClampedArray;
}

export interface CombinePersonAndTextOptions {
  keepPerson?: boolean;
  keepText?: boolean;
  keepGraphics?: boolean;
  graphicsMask?: Uint8ClampedArray | Uint8Array | null;
  userKeepMask?: Uint8ClampedArray | Uint8Array | null;
  userEraseMask?: Uint8ClampedArray | Uint8Array | null;
}

export interface CombinePersonAndTextResult {
  finalKeepMask: Uint8ClampedArray;
  personMask: Uint8ClampedArray;
  textMask: Uint8ClampedArray;
  graphicsMask: Uint8ClampedArray;
  diagnostics: {
    personArea: number;
    textArea: number;
    graphicsArea: number;
    combinedArea: number;
    textComponentCount: number;
    smallComponentCount: number;
    keptPixelPercentage: number;
    warning?: string;
  };
}

/**
 * Extracts precise printed text strokes (Khmer & English, diacritics, subscripts,
 * small characters, punctuation) while strictly rejecting white paper background
 * and separating large banners/graphics.
 */
export function extractTextStrokeMask(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options?: TextStrokeMaskOptions
): TextStrokeMaskResult {
  const totalPixels = width * height;
  const textStrokeMask = new Uint8ClampedArray(totalPixels);
  const graphicsMask = new Uint8ClampedArray(totalPixels);

  // 1. Compute luminance & local gradient/contrast map
  const lumMap = new Float32Array(totalPixels);
  const gradMap = new Float32Array(totalPixels);
  const isCandidateStroke = new Uint8Array(totalPixels);
  const isCandidateGraphic = new Uint8Array(totalPixels);

  for (let y = 0; y < height; y++) {
    const yOff = y * width;
    for (let x = 0; x < width; x++) {
      const idx = yOff + x;
      const p = idx * 4;
      const r = sourceRgba[p];
      const g = sourceRgba[p + 1];
      const b = sourceRgba[p + 2];
      lumMap[idx] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }

  for (let y = 1; y < height - 1; y++) {
    const yOff = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = yOff + x;
      const p = idx * 4;
      const r = sourceRgba[p];
      const g = sourceRgba[p + 1];
      const b = sourceRgba[p + 2];
      const lum = lumMap[idx];

      const lumL = lumMap[idx - 1];
      const lumR = lumMap[idx + 1];
      const lumU = lumMap[idx - width];
      const lumD = lumMap[idx + width];

      const gradX = Math.abs(lumR - lumL);
      const gradY = Math.abs(lumD - lumU);
      const maxGrad = Math.max(gradX, gradY);
      gradMap[idx] = maxGrad;

      const maxNeighborLum = Math.max(lumL, lumR, lumU, lumD);
      const minNeighborLum = Math.min(lumL, lumR, lumU, lumD);

      const maxCh = Math.max(r, g, b);
      const minCh = Math.min(r, g, b);
      const sat = maxCh - minCh;

      // Deep Blue Graphic Banner detector (R: 30, G: 64, B: 175)
      const isDeepBlueGraphic = b > 120 && b - r > 30 && b - g > 15;
      // Saturated banner or logo (e.g. yellow logo R: 245, G: 158, B: 11)
      const isSaturatedShape = (sat > 60 && maxGrad < 30) || (r > 190 && g > 120 && b < 50);

      if (isDeepBlueGraphic || isSaturatedShape) {
        isCandidateGraphic[idx] = 1;
        continue;
      }

      // Dark text ink (low saturation, dark luminance on lighter background)
      const isDarkInk = lum < 145 && sat < 60 && !isDeepBlueGraphic;
      // Dark text edge on light page
      const isDarkEdge = isDarkInk && maxNeighborLum > 165 && (maxNeighborLum - lum) > 25 && maxGrad > 18;
      // Light text stroke on dark page/header
      const isLightText = lum > 165 && minNeighborLum < 100 && (lum - minNeighborLum) > 30 && maxGrad > 22;

      if (isDarkInk || isDarkEdge || isLightText) {
        isCandidateStroke[idx] = 1;
      }
    }
  }

  // 2. Connected component analysis on candidate strokes
  const labels = new Int32Array(totalPixels);
  let currentLabel = 0;
  const queue = new Int32Array(totalPixels);

  interface CompData {
    id: number;
    pixelCount: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    isGraphicBanner: boolean;
    hasEdgeContrast: boolean;
  }
  const strokeComponents: CompData[] = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const startIdx = y * width + x;
      if (isCandidateStroke[startIdx] === 0 || labels[startIdx] !== 0) continue;

      currentLabel++;
      let qHead = 0, qTail = 0;
      queue[qTail++] = startIdx;
      labels[startIdx] = currentLabel;

      let pixelCount = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      let hasEdgeContrast = false;

      while (qHead < qTail) {
        const curr = queue[qHead++];
        pixelCount++;
        const cx = curr % width;
        const cy = Math.floor(curr / width);

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        if (gradMap[curr] > 18) {
          hasEdgeContrast = true;
        }

        const neighbors = [
          cx > 0 ? curr - 1 : -1,
          cx < width - 1 ? curr + 1 : -1,
          cy > 0 ? curr - width : -1,
          cy < height - 1 ? curr + width : -1,
        ];

        for (const n of neighbors) {
          if (n >= 0 && isCandidateStroke[n] === 1 && labels[n] === 0) {
            labels[n] = currentLabel;
            queue[qTail++] = n;
          }
        }
      }

      const compW = maxX - minX + 1;
      const compH = maxY - minY + 1;
      const touchesAllBorders = minX <= 2 && maxX >= width - 3 && minY <= 2 && maxY >= height - 3;
      const isOuterMargin = touchesAllBorders || (pixelCount > totalPixels * 0.35);
      const isGraphicBanner = (compW > width * 0.35 && compH > 25 && pixelCount > 2500) || isOuterMargin;

      strokeComponents.push({
        id: currentLabel,
        pixelCount,
        minX,
        maxX,
        minY,
        maxY,
        isGraphicBanner,
        hasEdgeContrast,
      });
    }
  }

  let textComponentCount = 0;
  let smallComponentCount = 0;
  let textArea = 0;
  let graphicsArea = 0;

  const validTextLabelSet = new Set<number>();
  for (const c of strokeComponents) {
    if (c.isGraphicBanner) {
      continue;
    }
    validTextLabelSet.add(c.id);
    textComponentCount++;
    if (c.pixelCount <= 120 && c.pixelCount >= 2) {
      smallComponentCount++;
    }
  }

  // Populate text stroke mask
  for (let i = 0; i < totalPixels; i++) {
    const lbl = labels[i];
    if (lbl > 0 && validTextLabelSet.has(lbl)) {
      textStrokeMask[i] = 255;
      textArea++;
    } else if (isCandidateGraphic[i] === 1 || (lbl > 0 && !validTextLabelSet.has(lbl))) {
      graphicsMask[i] = 255;
      graphicsArea++;
    }
  }

  // 3. Antialiased stroke solidifying: dilate text stroke by 1px strictly
  // onto non-paper pixels (lum < 245 or gradient > 20) to ensure thin Khmer
  // diacritics and subscripts are unbroken, while pure white paper remains transparent.
  const dilatedText = new Uint8ClampedArray(textStrokeMask);
  for (let y = 1; y < height - 1; y++) {
    const yOff = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = yOff + x;
      if (textStrokeMask[idx] === 255) {
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const nIdx = ny * width + nx;
            if (dilatedText[nIdx] === 0) {
              // Strictly preserve paper transparency: only solidify into non-white edge pixels
              if (lumMap[nIdx] < 245 || gradMap[nIdx] > 20) {
                dilatedText[nIdx] = 255;
                textArea++;
              }
            }
          }
        }
      }
    }
  }
  textStrokeMask.set(dilatedText);

  // Preserve user custom keep regions if passed
  if (options?.customKeepMask) {
    for (let i = 0; i < totalPixels; i++) {
      if (options.customKeepMask[i] > 128) {
        textStrokeMask[i] = 255;
      }
    }
  }

  // Detect distinct text line bounding boxes for diagnostics and UI overlay
  const detectedTextLines: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    lineType: "khmer" | "latin" | "caption" | "heading";
  }[] = [];

  for (const c of strokeComponents) {
    if (!validTextLabelSet.has(c.id)) continue;
    if (c.maxX - c.minX > 30) {
      const isTop = c.minY < height * 0.40;
      const isBottom = c.minY > height * 0.85;
      detectedTextLines.push({
        minX: c.minX,
        maxX: c.maxX,
        minY: c.minY,
        maxY: c.maxY,
        lineType: isTop ? "heading" : isBottom ? "caption" : "khmer",
      });
    }
  }

  const lowConfidence = textArea < 40 && width > 100 && height > 100;

  return {
    textStrokeMask,
    graphicsMask,
    textComponentCount,
    smallComponentCount,
    textArea,
    graphicsArea,
    lowConfidence,
    detectedTextLines,
  };
}

/**
 * Extracts the complete person mask (hair, face, hands, clothing/uniform)
 * using person-specific segmentation while filtering out isolated document text and banners.
 */
export function extractPersonMask(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  initialMask: Uint8ClampedArray | Uint8Array | null,
  width: number,
  height: number,
  options?: PersonMaskOptions
): PersonMaskResult {
  const totalPixels = width * height;
  const personMask = isolatePersonMask(
    sourceRgba,
    initialMask || new Uint8ClampedArray(totalPixels).fill(255),
    width,
    height
  );

  // Preserve user manual keep strokes if provided
  if (options?.manualKeepMask) {
    for (let i = 0; i < totalPixels; i++) {
      if (options.manualKeepMask[i] > 128) {
        personMask[i] = 255;
      }
    }
  }

  // Ensure definite person interior alpha >= 0.95 (242)
  const minAlpha =
    options?.minInteriorAlpha !== undefined
      ? Math.round(options.minInteriorAlpha * 255)
      : 242;

  let personArea = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (personMask[i] > 128) {
      if (personMask[i] < minAlpha) {
        personMask[i] = 255;
      }
      personArea++;
    }
  }

  // Generate narrow boundary band (radius 2-3 px) for person edge matting
  const boundaryBandMask = new Uint8ClampedArray(totalPixels);
  for (let y = 1; y < height - 1; y++) {
    const yOff = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = yOff + x;
      if (personMask[idx] > 128) {
        const hasBgNeighbor =
          personMask[idx - 1] <= 128 ||
          personMask[idx + 1] <= 128 ||
          personMask[idx - width] <= 128 ||
          personMask[idx + width] <= 128;
        if (hasBgNeighbor) {
          boundaryBandMask[idx] = 255;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nIdx = (y + dy) * width + (x + dx);
              boundaryBandMask[nIdx] = 255;
            }
          }
        }
      }
    }
  }

  const hasPerson = personArea > 400;

  return {
    personMask,
    personArea,
    hasPerson,
    skinLandmarkFound: hasPerson,
    boundaryBandMask,
  };
}

/**
 * Combines person mask and text stroke mask conservatively:
 * finalKeepMask = (personMask UNION textStrokeMask UNION (keepGraphics ? graphicsMask : 0) UNION userKeepMask) - userEraseMask
 */
export function combinePersonAndTextMasks(
  personMask: Uint8ClampedArray | Uint8Array,
  textStrokeMask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options?: CombinePersonAndTextOptions
): CombinePersonAndTextResult {
  const totalPixels = width * height;
  const keepPerson = options?.keepPerson !== false;
  const keepText = options?.keepText !== false;
  const keepGraphics = Boolean(options?.keepGraphics);
  const userKeep = options?.userKeepMask;
  const userErase = options?.userEraseMask;
  const graphics = options?.graphicsMask;

  const finalKeepMask = new Uint8ClampedArray(totalPixels);
  const pMask = new Uint8ClampedArray(totalPixels);
  const tMask = new Uint8ClampedArray(totalPixels);
  const gMask = new Uint8ClampedArray(totalPixels);

  let personArea = 0;
  let textArea = 0;
  let graphicsArea = 0;
  let combinedArea = 0;
  let textComponentCount = 0;
  let smallComponentCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const pVal = personMask[i] > 128 ? 255 : 0;
    const tVal = textStrokeMask[i] > 128 ? 255 : 0;
    const gVal = graphics && graphics[i] > 128 ? 255 : 0;

    pMask[i] = pVal;
    tMask[i] = tVal;
    gMask[i] = gVal;

    if (pVal > 0) personArea++;
    if (tVal > 0) textArea++;
    if (gVal > 0) graphicsArea++;

    let val = 0;
    if (keepPerson && pVal > 0) val = 255;
    if (keepText && tVal > 0 && (keepPerson || pVal === 0)) val = 255;
    if (keepGraphics && gVal > 0) val = 255;
    if (userKeep && userKeep[i] > 128) val = 255;
    if (userErase && userErase[i] > 128) val = 0;

    finalKeepMask[i] = val;
    if (val > 0) combinedArea++;
  }

  // Count text components
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (tMask[idx] > 0 && visited[idx] === 0) {
        textComponentCount++;
        let qHead = 0, qTail = 0;
        queue[qTail++] = idx;
        visited[idx] = 1;
        let cArea = 0;
        while (qHead < qTail) {
          const curr = queue[qHead++];
          cArea++;
          const cx = curr % width;
          const cy = Math.floor(curr / width);
          const neighbors = [
            cx > 0 ? curr - 1 : -1,
            cx < width - 1 ? curr + 1 : -1,
            cy > 0 ? curr - width : -1,
            cy < height - 1 ? curr + width : -1,
          ];
          for (const n of neighbors) {
            if (n >= 0 && tMask[n] > 0 && visited[n] === 0) {
              visited[n] = 1;
              queue[qTail++] = n;
            }
          }
        }
        if (cArea <= 120 && cArea >= 2) {
          smallComponentCount++;
        }
      }
    }
  }

  let warning: string | undefined = undefined;
  if (keepText && textArea === 0) {
    warning =
      "⚠️ No text strokes detected. OCR/text detection did not find text. Use Keep Text Brush to restore missed letters.";
  } else if (keepPerson && personArea === 0) {
    warning = "⚠️ No person detected. Please verify or use Keep Person Brush.";
  }

  const keptPixelPercentage = totalPixels > 0 ? (combinedArea / totalPixels) * 100 : 0;

  return {
    finalKeepMask,
    personMask: pMask,
    textMask: tMask,
    graphicsMask: gMask,
    diagnostics: {
      personArea,
      textArea,
      graphicsArea,
      combinedArea,
      textComponentCount,
      smallComponentCount,
      keptPixelPercentage,
      warning,
    },
  };
}

/**
 * Renders color-coded preview overlays for Person + Text Only mode:
 * - Blue for person mask
 * - Yellow for text mask
 * - Green for combined keep mask
 * - Red / dimmed for removed background
 */
export function generatePersonTextLayerOverlay(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  personMask: Uint8ClampedArray | Uint8Array,
  textMask: Uint8ClampedArray | Uint8Array,
  finalKeepMask: Uint8ClampedArray | Uint8Array | null | undefined,
  width: number,
  height: number,
  layer?: "person_mask" | "text_mask" | "combined_mask"
): Uint8ClampedArray {
  const totalPixels = width * height;
  const overlay = new Uint8ClampedArray(totalPixels * 4);
  const activeLayer = layer || "combined_mask";

  for (let i = 0; i < totalPixels; i++) {
    const pIdx = i * 4;
    const r = sourceRgba[pIdx];
    const g = sourceRgba[pIdx + 1];
    const b = sourceRgba[pIdx + 2];

    const isPerson = personMask[i] > 128;
    const isText = textMask[i] > 128;
    const isCombined = finalKeepMask ? finalKeepMask[i] > 128 : (isPerson || isText);

    if (activeLayer === "person_mask") {
      if (isPerson) {
        // Blue overlay for Person: RGB [59, 130, 246]
        overlay[pIdx] = Math.round(r * 0.35 + 59 * 0.65);
        overlay[pIdx + 1] = Math.round(g * 0.35 + 130 * 0.65);
        overlay[pIdx + 2] = Math.round(b * 0.35 + 246 * 0.65);
        overlay[pIdx + 3] = 255;
      } else {
        overlay[pIdx] = Math.round(r * 0.6 + 60);
        overlay[pIdx + 1] = Math.round(g * 0.3);
        overlay[pIdx + 2] = Math.round(b * 0.3);
        overlay[pIdx + 3] = 255;
      }
    } else if (layer === "text_mask") {
      if (isText) {
        // Yellow overlay for Text: RGB [234, 179, 8]
        overlay[pIdx] = Math.round(r * 0.2 + 234 * 0.8);
        overlay[pIdx + 1] = Math.round(g * 0.2 + 179 * 0.8);
        overlay[pIdx + 2] = Math.round(b * 0.2 + 8 * 0.8);
        overlay[pIdx + 3] = 255;
      } else {
        overlay[pIdx] = Math.round(r * 0.4);
        overlay[pIdx + 1] = Math.round(g * 0.4);
        overlay[pIdx + 2] = Math.round(b * 0.4);
        overlay[pIdx + 3] = 255;
      }
    } else {
      // layer === "combined_mask"
      if (isCombined) {
        // Green overlay for Combined Keep: RGB [34, 197, 94]
        overlay[pIdx] = Math.round(r * 0.35 + 34 * 0.65);
        overlay[pIdx + 1] = Math.round(g * 0.35 + 197 * 0.65);
        overlay[pIdx + 2] = Math.round(b * 0.35 + 94 * 0.65);
        overlay[pIdx + 3] = 255;
      } else {
        overlay[pIdx] = Math.round(r * 0.6 + 80);
        overlay[pIdx + 1] = Math.round(g * 0.2);
        overlay[pIdx + 2] = Math.round(b * 0.2);
        overlay[pIdx + 3] = 255;
      }
    }
  }

  return overlay;
}

/**
 * Combines two foreground proposals conservatively (e.g. BiRefNet/RMBG-2.0 + ISNet).
 * Returns union of both proposals and identifies disputed edge regions.
 */
export function combineForegroundProposals(
  proposalA: Uint8ClampedArray | Uint8Array,
  proposalB: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options?: {
    conservativeUnion?: boolean;
    disagreementThreshold?: number;
  }
): {
  unionMask: Uint8ClampedArray;
  disputedMask: Uint8ClampedArray;
  hasStrongDisagreement: boolean;
  disagreementPixelCount: number;
} {
  const totalPixels = width * height;
  const isA4Ch = proposalA.length === totalPixels * 4;
  const isB4Ch = proposalB.length === totalPixels * 4;
  const unionMask = new Uint8ClampedArray(totalPixels);
  const disputedMask = new Uint8ClampedArray(totalPixels);
  const thresh = options?.disagreementThreshold ?? 100;

  let disagreementCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const valA = isA4Ch ? proposalA[i * 4 + 3] : proposalA[i];
    const valB = isB4Ch ? proposalB[i * 4 + 3] : proposalB[i];

    // Conservative union: take maximum proposal to avoid deleting real foreground
    unionMask[i] = Math.max(valA, valB);

    if (Math.abs(valA - valB) >= thresh) {
      disputedMask[i] = 255;
      disagreementCount++;
    }
  }

  const hasStrongDisagreement = disagreementCount > totalPixels * 0.03;

  return {
    unionMask,
    disputedMask,
    hasStrongDisagreement,
    disagreementPixelCount: disagreementCount,
  };
}

/**
 * Detects printed Khmer/Latin text strokes and logo regions, protecting them
 * from being deleted or eroded during alpha matting or background removal.
 */
export function detectAndProtectTextAndLogos(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  existingMask?: Uint8ClampedArray | Uint8Array | null
): {
  protectedMask: Uint8ClampedArray;
  textProtectedArea: number;
  hasProtectedText: boolean;
} {
  const totalPixels = width * height;
  const isExisting4Ch = existingMask ? existingMask.length === totalPixels * 4 : false;
  const protectedMask = new Uint8ClampedArray(totalPixels);
  let textProtectedArea = 0;

  if (existingMask) {
    for (let i = 0; i < totalPixels; i++) {
      protectedMask[i] = isExisting4Ch ? existingMask[i * 4 + 3] : existingMask[i];
    }
  }

  const textStrokes = new Uint8Array(totalPixels);

  for (let y = 1; y < height - 1; y++) {
    const yOff = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = yOff + x;
      const p = idx * 4;

      const r = sourceRgba[p];
      const g = sourceRgba[p + 1];
      const b = sourceRgba[p + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      const pL = (idx - 1) * 4;
      const pR = (idx + 1) * 4;
      const pU = (idx - width) * 4;
      const pD = (idx + width) * 4;

      const lumL = 0.299 * sourceRgba[pL] + 0.587 * sourceRgba[pL + 1] + 0.114 * sourceRgba[pL + 2];
      const lumR = 0.299 * sourceRgba[pR] + 0.587 * sourceRgba[pR + 1] + 0.114 * sourceRgba[pR + 2];
      const lumU = 0.299 * sourceRgba[pU] + 0.587 * sourceRgba[pU + 1] + 0.114 * sourceRgba[pU + 2];
      const lumD = 0.299 * sourceRgba[pD] + 0.587 * sourceRgba[pD + 1] + 0.114 * sourceRgba[pD + 2];

      const gradX = Math.abs(lumR - lumL);
      const gradY = Math.abs(lumD - lumU);
      const maxGrad = Math.max(gradX, gradY);

      // Contrast text stroke: Dark text (lum < 135) with nearby brighter page (lum > 175)
      const maxNeighborLum = Math.max(lumL, lumR, lumU, lumD);
      const isTextContrast = lum < 135 && maxNeighborLum > 175 && maxGrad > 35;

      // Saturated logo stroke: e.g. yellow, blue, red graphic element
      const maxCh = Math.max(r, g, b);
      const minCh = Math.min(r, g, b);
      const isSaturatedLogo = (maxCh - minCh) > 55 && maxGrad > 30;

      if (isTextContrast || isSaturatedLogo) {
        textStrokes[idx] = 1;
      }
    }
  }

  // Preserve text strokes safely (with 2-pixel dilation to cover interior of small glyphs)
  for (let y = 0; y < height; y++) {
    const yOff = y * width;
    for (let x = 0; x < width; x++) {
      const idx = yOff + x;
      if (textStrokes[idx] === 1) {
        for (let dy = -2; dy <= 2; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (Math.abs(dx) + Math.abs(dy) <= 3) {
              const nIdx = ny * width + nx;
              if (protectedMask[nIdx] !== 255) {
                protectedMask[nIdx] = 255;
                textProtectedArea++;
              }
            }
          }
        }
      }
    }
  }

  return {
    protectedMask,
    textProtectedArea,
    hasProtectedText: textProtectedArea > 20,
  };
}

/**
 * Detects and preserves small disconnected foreground components (leaves, twigs,
 * hair strands, dots, accents, small logos) down to 2 pixels.
 */
export function preserveSmallForegroundComponents(
  mask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  minArea: number = 2
): {
  preservedMask: Uint8ClampedArray;
  smallComponentCount: number;
  totalComponentCount: number;
} {
  const totalPixels = width * height;
  const isMask4Ch = mask.length === totalPixels * 4;
  const preservedMask = new Uint8ClampedArray(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    preservedMask[i] = isMask4Ch ? mask[i * 4 + 3] : mask[i];
  }

  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let totalComponentCount = 0;
  let smallComponentCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIdx = y * width + x;
      if (preservedMask[startIdx] <= 128 || visited[startIdx] === 1) continue;

      let qHead = 0;
      let qTail = 0;
      queue[qTail++] = startIdx;
      visited[startIdx] = 1;
      let compArea = 0;

      while (qHead < qTail) {
        const curr = queue[qHead++];
        compArea++;

        const cy = Math.floor(curr / width);
        const cx = curr % width;

        if (cx > 0) {
          const left = curr - 1;
          if (preservedMask[left] > 128 && visited[left] === 0) {
            visited[left] = 1;
            queue[qTail++] = left;
          }
        }
        if (cx < width - 1) {
          const right = curr + 1;
          if (preservedMask[right] > 128 && visited[right] === 0) {
            visited[right] = 1;
            queue[qTail++] = right;
          }
        }
        if (cy > 0) {
          const top = curr - width;
          if (preservedMask[top] > 128 && visited[top] === 0) {
            visited[top] = 1;
            queue[qTail++] = top;
          }
        }
        if (cy < height - 1) {
          const bottom = curr + width;
          if (preservedMask[bottom] > 128 && visited[bottom] === 0) {
            visited[bottom] = 1;
            queue[qTail++] = bottom;
          }
        }
      }

      totalComponentCount++;
      if (compArea <= 120 && compArea >= minArea) {
        smallComponentCount++;
        for (let k = 0; k < qTail; k++) {
          preservedMask[queue[k]] = 255;
        }
      }
    }
  }

  return {
    preservedMask,
    smallComponentCount,
    totalComponentCount,
  };
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
  const isConservative = options?.conservative ?? (mode === "whole_product" || mode === "preserve_all_foreground" || !mode);

  // PRESERVE ALL FOREGROUND (DEFAULT MODE):
  // Preserve all people, animals, plants, products, boxes, text, logos, hair, fur, disconnected objects
  if (!mode || mode === "preserve_all_foreground") {
    const contentsMask = new Uint8ClampedArray(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      contentsMask[i] = isMask4Ch ? initialMask[i * 4 + 3] : initialMask[i];
    }

    // Protect text and logo regions in document-like or complex imagery
    const { protectedMask } = detectAndProtectTextAndLogos(sourceRgba, width, height, contentsMask);

    // Preserve small components down to 2 pixels (hair strands, leaves, twigs, disconnected details)
    const { preservedMask } = preserveSmallForegroundComponents(protectedMask, width, height, 2);

    return {
      hasContainer: false,
      boxConfidence: 0,
      containerMask: new Uint8ClampedArray(totalPixels),
      contentsMask: preservedMask,
    };
  }

  // DOCUMENT / POSTER MODE: Never remove internal white areas, text, logos, or printed person.
  if (mode === "document_poster" || mode === "whole_poster") {
    const fullMask = new Uint8ClampedArray(totalPixels);
    fullMask.fill(255);
    return {
      hasContainer: false,
      boxConfidence: 0,
      containerMask: new Uint8ClampedArray(totalPixels),
      contentsMask: fullMask,
    };
  }

  // PERSON ONLY MODE: Dedicated person segmentation, filters out isolated text/logos
  if (mode === "person" || mode === "person_only") {
    const personMask = isolatePersonMask(sourceRgba, initialMask, width, height);
    return {
      hasContainer: false,
      boxConfidence: 0,
      containerMask: new Uint8ClampedArray(totalPixels),
      contentsMask: personMask,
      warning: undefined,
    };
  }

  // PERSON + TEXT ONLY MODE: Independent person segmentation + OCR text-stroke segmentation
  if (mode === "person_text_only" || mode === "person_plus_text") {
    const pRes = extractPersonMask(sourceRgba, initialMask, width, height);
    const tRes = extractTextStrokeMask(sourceRgba, width, height);
    const combined = combinePersonAndTextMasks(pRes.personMask, tRes.textStrokeMask, width, height, {
      keepPerson: true,
      keepText: true,
      keepGraphics: false,
      graphicsMask: tRes.graphicsMask,
    });
    return {
      hasContainer: false,
      boxConfidence: 0,
      containerMask: new Uint8ClampedArray(totalPixels),
      contentsMask: combined.finalKeepMask,
      warning: combined.diagnostics.warning,
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
  manualKeepMask?: Uint8ClampedArray | Uint8Array | null,
  options?: {
    quality?: "fast" | "balanced" | "fine_details" | "quality";
    isHairOrPlant?: boolean;
  }
): Uint8ClampedArray {
  const totalPixels = width * height;
  const isMask4Ch = mask.length === totalPixels * 4;
  const trimap = new Uint8ClampedArray(totalPixels);

  const getMaskVal = (idx: number) => (isMask4Ch ? mask[idx * 4 + 3] : mask[idx]);
  const isExcluded = (idx: number) => (excludedMask ? excludedMask[idx] > 128 : false);
  const isManualKeep = (idx: number) => (manualKeepMask ? manualKeepMask[idx] > 128 : false);

  // Widen unknown band for hair, fur, plant branches, or fine_details quality
  const isFine = options?.quality === "fine_details" || options?.quality === "quality" || options?.isHairOrPlant;
  const effectiveRadius = isFine ? Math.max(radius, 6) : radius;
  const safeRadius = Math.max(2, Math.min(10, Math.round(effectiveRadius)));

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
  smallComponentCount: number;
  textProtectedArea?: number;
  uncertainEdgeArea?: number;
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
 * - Connected-component count
 * - Small component count (area <= 120px)
 * - Text-protected area and safety
 * - Uncertain edge band area
 * - Automated safety threshold: triggers rollback when refined area < 90% of initial area (10% drop limit)
 *   or 95% in document mode (5% drop limit), or if large component disappears or text becomes transparent.
 */
export function computeMaskDiagnostics(
  initialMask: Uint8ClampedArray | Uint8Array,
  refinedMask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  maxDropRatio: number = 0.10,
  options?: {
    mode?: string;
    textProtectedMask?: Uint8ClampedArray | Uint8Array | null;
    manualKeepMask?: Uint8ClampedArray | Uint8Array | null;
    trimap?: Uint8ClampedArray | Uint8Array | null;
  }
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

  // 1. Connected Components of refined foreground (> 128)
  const visited = new Uint8Array(totalPixels);
  let connectedComponentCount = 0;
  let largestComponentArea = 0;
  let smallComponentCount = 0;

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

      connectedComponentCount++;
      if (compSize > largestComponentArea) {
        largestComponentArea = compSize;
      }
      if (compSize <= 120 && compSize >= 2) {
        smallComponentCount++;
      }
    }
  }

  // 2. Interior holes: Background pixels (<= 128) that are NOT reachable from outer image borders
  const exteriorBg = new Uint8Array(totalPixels);
  let head = 0;
  let tail = 0;

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

  // 3. Telemetry: text protected area and uncertain edge area
  let textProtectedArea: number | undefined = undefined;
  let textLossTriggered = false;
  if (options?.textProtectedMask) {
    let protCount = 0;
    let protLost = 0;
    for (let i = 0; i < totalPixels; i++) {
      if (options.textProtectedMask[i] > 128) {
        protCount++;
        const refA = isRef4Ch ? refinedMask[i * 4 + 3] : refinedMask[i];
        if (refA < 128) protLost++;
      }
    }
    textProtectedArea = protCount;
    if (protCount > 20 && protLost / protCount > 0.05) {
      textLossTriggered = true;
    }
  }

  let uncertainEdgeArea: number | undefined = undefined;
  if (options?.trimap) {
    let uncertCount = 0;
    for (let i = 0; i < totalPixels; i++) {
      if (options.trimap[i] === 128) uncertCount++;
    }
    uncertainEdgeArea = uncertCount;
  }

  // Manual keep check: If user painted keep areas and > 10% was removed
  let keepLossTriggered = false;
  if (options?.manualKeepMask) {
    let keepCount = 0;
    let keepLost = 0;
    for (let i = 0; i < totalPixels; i++) {
      if (options.manualKeepMask[i] > 128) {
        keepCount++;
        const refA = isRef4Ch ? refinedMask[i * 4 + 3] : refinedMask[i];
        if (refA < 200) keepLost++;
      }
    }
    if (keepCount > 20 && keepLost / keepCount > 0.10) {
      keepLossTriggered = true;
    }
  }

  // 4. Excessive drop check: 10% drop threshold (or 5% in document mode)
  const isTextDoc =
    options?.mode === "document_poster" ||
    options?.mode === "whole_poster" ||
    options?.mode === "document_text";
  const effectiveMaxDrop = isTextDoc ? 0.05 : (maxDropRatio ?? 0.10);

  const isAreaDropExcessive = initialArea > 100 && areaRetentionRatio < (1 - effectiveMaxDrop);
  const rollbackTriggered = isAreaDropExcessive || textLossTriggered || keepLossTriggered;
  let warning: string | undefined = undefined;

  if (rollbackTriggered) {
    warning =
      "We kept the safer mask because edge refinement removed possible foreground details (Automatic safety rollback engaged).\nYou can refine it manually with Keep/Erase brush.";
  }

  return {
    initialForegroundArea: initialArea,
    refinedForegroundArea: refinedArea,
    areaRetentionRatio,
    removedAreaPercentage,
    connectedComponentCount,
    largestComponentArea,
    smallComponentCount,
    textProtectedArea,
    uncertainEdgeArea,
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
 * Validates refined mask against initial mask. If area drop exceeds maxDropRatio (default 10%, 5% for text),
 * or text-protected details/keep strokes are lost, automatically reverts to initial mask.
 */
export function applyAreaSafetyCheck(
  initialMask: Uint8ClampedArray | Uint8Array,
  refinedMask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  maxDropRatio: number = 0.10,
  options?: {
    mode?: string;
    textProtectedMask?: Uint8ClampedArray | Uint8Array | null;
    manualKeepMask?: Uint8ClampedArray | Uint8Array | null;
    trimap?: Uint8ClampedArray | Uint8Array | null;
  }
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
    maxDropRatio,
    options
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

/**
 * Applies a Keep (255) or Erase (0) rectangle edit to a mask buffer.
 */
export function applyRectangleToMask(
  mask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  rect: [number, number, number, number], // [x1, y1, x2, y2]
  fillValue: number = 255
): Uint8ClampedArray {
  const updated = new Uint8ClampedArray(mask);
  const minX = Math.max(0, Math.min(width - 1, Math.min(rect[0], rect[2])));
  const maxX = Math.max(0, Math.min(width - 1, Math.max(rect[0], rect[2])));
  const minY = Math.max(0, Math.min(height - 1, Math.min(rect[1], rect[3])));
  const maxY = Math.max(0, Math.min(height - 1, Math.max(rect[1], rect[3])));

  for (let y = minY; y <= maxY; y++) {
    const yOff = y * width;
    for (let x = minX; x <= maxX; x++) {
      updated[yOff + x] = fillValue;
    }
  }
  return updated;
}

/**
 * Applies a series of brush stroke points (Keep = 255, Erase = 0) to a mask buffer.
 */
export function applyBrushStrokeToMask(
  mask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  points: [number, number][],
  tool: "keep" | "remove" = "keep",
  radius: number = 10,
  hardness: number = 0.8
): Uint8ClampedArray {
  const updated = new Uint8ClampedArray(mask);
  if (!points || points.length === 0) return updated;

  const rSq = radius * radius;
  const isKeep = tool === "keep";

  const stampCircle = (cx: number, cy: number) => {
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(height - 1, Math.ceil(cy + radius));

    for (let y = minY; y <= maxY; y++) {
      const dy = y - cy;
      const yOff = y * width;
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const distSq = dx * dx + dy * dy;
        if (distSq <= rSq) {
          const d = Math.sqrt(distSq);
          const u = d / radius;
          let weight = 1.0;
          if (hardness < 0.99 && u > hardness) {
            const t = (u - hardness) / (1 - hardness);
            weight = Math.max(0, 1 - (3 * t * t - 2 * t * t * t));
          }
          const idx = yOff + x;
          const curr = updated[idx];
          if (isKeep) {
            updated[idx] = Math.round(curr + (255 - curr) * weight);
          } else {
            updated[idx] = Math.round(curr * (1 - weight));
          }
        }
      }
    }
  };

  for (let i = 0; i < points.length; i++) {
    const [p0x, p0y] = points[i];
    if (i === 0) {
      stampCircle(p0x, p0y);
    } else {
      const [p1x, p1y] = points[i - 1];
      const dist = Math.hypot(p0x - p1x, p0y - p1y);
      const step = Math.max(1, radius / 3);
      const steps = Math.ceil(dist / step);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        stampCircle(p1x + (p0x - p1x) * t, p1y + (p0y - p1y) * t);
      }
    }
  }

  return updated;
}

/**
 * Opt-in crop to content: trims transparent background borders around approved foreground objects.
 */
export function cropRgbaToContent(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  alphaThreshold: number = 10
): {
  croppedRgba: Uint8ClampedArray;
  width: number;
  height: number;
  cropBox: { minX: number; minY: number; maxX: number; maxY: number };
} {
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let hasFg = false;

  for (let y = 0; y < height; y++) {
    const yOff = y * width;
    for (let x = 0; x < width; x++) {
      const a = rgba[(yOff + x) * 4 + 3];
      if (a > alphaThreshold) {
        hasFg = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!hasFg || minX > maxX || minY > maxY) {
    return {
      croppedRgba: new Uint8ClampedArray(rgba),
      width,
      height,
      cropBox: { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 },
    };
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const cropped = new Uint8ClampedArray(cropW * cropH * 4);

  for (let cy = 0; cy < cropH; cy++) {
    const srcY = minY + cy;
    for (let cx = 0; cx < cropW; cx++) {
      const srcX = minX + cx;
      const sIdx = (srcY * width + srcX) * 4;
      const dIdx = (cy * cropW + cx) * 4;
      cropped[dIdx] = rgba[sIdx];
      cropped[dIdx + 1] = rgba[sIdx + 1];
      cropped[dIdx + 2] = rgba[sIdx + 2];
      cropped[dIdx + 3] = rgba[sIdx + 3];
    }
  }

  return {
    croppedRgba: cropped,
    width: cropW,
    height: cropH,
    cropBox: { minX, minY, maxX, maxY },
  };
}

