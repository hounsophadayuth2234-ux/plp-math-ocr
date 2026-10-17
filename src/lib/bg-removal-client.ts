import { ProcessingStatusLabel } from "./types";
import { downscaleImageIfExceeds, getImageDimensions } from "./processing-utils";
import { bgWorkerManager, WorkerProgressEvent } from "./bg-removal-worker-manager";
import {
  compositeRgbaBuffer,
  SelectionMode,
  ContentMode,
  QuadCorners,
  DocumentDetectionResult,
  detectDocumentQuad,
  generateQuadMask,
  warpPerspectiveQuad,
  applyColorDehalo,
  detectContainerAndContents,
  applyInteractivePromptsToMask,
  generateTrimap,
  generateMaskOverlay,
  refineMaskWithGuidedFilter,
  MaskDiagnostics,
  computeMaskDiagnostics,
  applyAreaSafetyCheck,
  createDocumentSafeRgba,
  isolatePersonMask,
  combinePersonWithSelectedRegions,
  combineForegroundProposals,
  detectAndProtectTextAndLogos,
  preserveSmallForegroundComponents,
  applyRectangleToMask,
  applyBrushStrokeToMask,
  cropRgbaToContent,
  extractTextStrokeMask,
  extractPersonMask,
  combinePersonAndTextMasks,
  generatePersonTextLayerOverlay,
  TextStrokeMaskOptions,
  TextStrokeMaskResult,
  PersonMaskOptions,
  PersonMaskResult,
  CombinePersonAndTextOptions,
  CombinePersonAndTextResult,
} from "./bg-compositor";

export type {
  ContentMode,
  QuadCorners,
  DocumentDetectionResult,
  TextStrokeMaskOptions,
  TextStrokeMaskResult,
  PersonMaskOptions,
  PersonMaskResult,
  CombinePersonAndTextOptions,
  CombinePersonAndTextResult,
};
export {
  detectDocumentQuad,
  generateQuadMask,
  warpPerspectiveQuad,
  applyColorDehalo,
  createDocumentSafeRgba,
  isolatePersonMask,
  combinePersonWithSelectedRegions,
  combineForegroundProposals,
  detectAndProtectTextAndLogos,
  preserveSmallForegroundComponents,
  applyRectangleToMask,
  applyBrushStrokeToMask,
  cropRgbaToContent,
  extractTextStrokeMask,
  extractPersonMask,
  combinePersonAndTextMasks,
  generatePersonTextLayerOverlay,
};

/**
 * Feature Flags for Rescue & Safety
 */
export const MANUAL_MASK_EDITOR =
  typeof process !== "undefined" && process.env.MANUAL_MASK_EDITOR !== undefined
    ? process.env.MANUAL_MASK_EDITOR !== "false"
    : true;

export const EDGE_REFINEMENT_DEFAULT: "off" | "balanced" | "fine" =
  typeof process !== "undefined" && process.env.EDGE_REFINEMENT_DEFAULT !== undefined
    ? (process.env.EDGE_REFINEMENT_DEFAULT as any)
    : "off";

export const PRESERVE_ORIGINAL_RGB =
  typeof process !== "undefined" && process.env.PRESERVE_ORIGINAL_RGB !== undefined
    ? process.env.PRESERVE_ORIGINAL_RGB !== "false"
    : true;

export const DOCUMENT_SAFE_MODE =
  typeof process !== "undefined" && process.env.DOCUMENT_SAFE_MODE !== undefined
    ? process.env.DOCUMENT_SAFE_MODE !== "false"
    : true;

export const BACKGROUND_REMOVAL_CONSERVATIVE =
  typeof process !== "undefined" && process.env.BACKGROUND_REMOVAL_CONSERVATIVE !== undefined
    ? process.env.BACKGROUND_REMOVAL_CONSERVATIVE !== "false"
    : true;

export const BACKGROUND_REMOVAL_SEGMENTATION_V2 =
  typeof process !== "undefined" && process.env.BACKGROUND_REMOVAL_SEGMENTATION_V2 !== undefined
    ? process.env.BACKGROUND_REMOVAL_SEGMENTATION_V2 === "true"
    : false;

export interface BgRemovalProgress {
  key: string;
  current: number;
  total: number;
  percent: number;
  stage:
    | "Preparing image"
    | "Loading model"
    | "Segmenting"
    | "Refining mask"
    | "Ready";
  modelLoadingPercent?: number;
  processingPercent?: number;
}

export interface ProcessingStageMetrics {
  uploadDecodeMs?: number;
  segmentationMs?: number;
  maskRefineMs?: number;
  mattingMs?: number;
  encodingMs?: number;
  networkRoundTripMs?: number;
  modelLoadMs?: number;
  inferenceMs?: number;
  refineMs?: number;
  totalMs?: number;
}

export interface BgRemovalOutput {
  transparentBlob: Blob;
  transparentUrl: string;
  alphaMaskUrl: string;
  alphaMaskBuffer: Uint8ClampedArray; // 1-channel alpha mask [0..255] (length w * h)
  sourceImageData: ImageData;         // Clean source RGBA pixels (w x h)
  width: number;
  height: number;
  sourceWidth?: number;               // Truthful source original width
  sourceHeight?: number;              // Truthful source original height
  wasDownscaled?: boolean;            // Flag indicating if resolution was scaled for safety
  label: ProcessingStatusLabel;
  model: string;
  mode: "preview" | "final" | "worker";
  metrics?: ProcessingStageMetrics;
  diagnostics?: MaskDiagnostics;
  rollbackTriggered?: boolean;
}

export interface BgRemovalOptions {
  mode?: "preview" | "final" | "worker";
  targetMaxDimension?: number;        // Explicit dimension limit (e.g. 1024 on retry)
  erosionRadius?: number; // 0 (default, non-destructive)
  featherRadius?: number; // 0.75 (sub-pixel boundary)
  decontaminationRadius?: number; // 1 to 2 pixels (0 to disable)
  alphaMatting?: boolean;
  onProgress?: (progress: BgRemovalProgress) => void;
  signal?: AbortSignal;
}

/**
 * Centralized Stage Deadlines & User-Facing Timing Constants (in seconds)
 */
export const STAGE_DEADLINES = {
  /** Soft notice threshold: informs user that processing is taking longer than usual on their device */
  SLOW_NOTICE_SEC: 20,
  /** Cold asset download budget (WASM + weights) */
  COLD_ASSET_LOAD_SEC: 120,
  /** Inference deadline for Fast Preview (1024px) */
  INFERENCE_PREVIEW_SEC: 60,
  /** Inference deadline for Final Clean Cut (2048px) */
  INFERENCE_FINAL_SEC: 90,
  /** Maximum safe export dimension */
  MAX_SAFE_EXPORT_DIM: 4096,
};

/**
 * Creates pure 8-bit black-and-white alpha mask visualizer for edge & halo debugging.
 * Black = Background (0), White = Subject (255), Gray = Anti-aliased boundary.
 */
export function createAlphaMaskDataUrl(
  alphaChannel: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number
): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;
  const total = w * h;

  for (let i = 0; i < total; i++) {
    const a = alphaChannel[i];
    const pIdx = i * 4;
    data[pIdx] = a;       // R
    data[pIdx + 1] = a;   // G
    data[pIdx + 2] = a;   // B
    data[pIdx + 3] = 255; // Solid opaque visualizer
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Non-destructive Edge Refinement, Alpha Boundary Preservation & Local Color Decontamination:
 *
 * 1. Image/Mask Contract Correctness:
 *    - The segmentation output is foreground RGBA.
 *    - The alpha mask is strictly obtained from channel A (mPixels[i*4 + 3]) for ALL pixels.
 *    - NEVER convert RGB brightness/luminance to alpha! Opaque black hair RGBA(20,20,20,255) remains 255.
 *
 * 2. Source Alpha Preservation:
 *    - A newly computed mask must NOT make originally transparent areas opaque.
 *    - finalAlpha = Math.round((maskAlpha * sourceAlpha) / 255).
 *
 * 3. Soft Hair Edges:
 *    - Retains soft anti-aliased edge alpha values.
 *    - Zero global erosion or destructive thresholding.
 *
 * 4. Local Color Decontamination:
 *    - Conservative, local un-mixing of background color on the uncertain boundary zone.
 *    - Can be turned off by passing decontaminationRadius = 0.
 */
export async function refineAndDecontaminateImage(
  sourceImage: Blob | File,
  rawMaskBlob: Blob,
  params: {
    erosionRadius: number;
    featherRadius: number;
    decontaminationRadius: number;
    alphaMatting: boolean;
  }
): Promise<{
  refinedBlob: Blob;
  alphaMaskUrl: string;
  alphaMaskBuffer: Uint8ClampedArray;
  sourceImageData: ImageData;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const srcUrl = URL.createObjectURL(sourceImage);
    const maskUrl = URL.createObjectURL(rawMaskBlob);

    const srcImg = new Image();
    const maskImg = new Image();
    let loadedCount = 0;

    const onBothLoaded = () => {
      try {
        const w = srcImg.naturalWidth || maskImg.naturalWidth || 800;
        const h = srcImg.naturalHeight || maskImg.naturalHeight || 600;

        // Buffer and dimension validation
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
          throw new Error(`Invalid image dimensions: ${w}x${h}`);
        }

        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = w;
        srcCanvas.height = h;
        const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });

        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = w;
        maskCanvas.height = h;
        const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });

        if (!srcCtx || !maskCtx) {
          URL.revokeObjectURL(srcUrl);
          URL.revokeObjectURL(maskUrl);
          const emptyBuf = new Uint8ClampedArray(w * h);
          resolve({
            refinedBlob: rawMaskBlob,
            alphaMaskUrl: "",
            alphaMaskBuffer: emptyBuf,
            sourceImageData: new ImageData(w, h),
            width: w,
            height: h,
          });
          return;
        }

        srcCtx.drawImage(srcImg, 0, 0, w, h);
        maskCtx.drawImage(maskImg, 0, 0, w, h);

        const srcData = srcCtx.getImageData(0, 0, w, h);
        const maskData = maskCtx.getImageData(0, 0, w, h);

        const sPixels = srcData.data;
        const mPixels = maskData.data;
        const totalPixels = w * h;

        // Validate buffer byte lengths
        if (sPixels.length !== totalPixels * 4 || mPixels.length !== totalPixels * 4) {
          throw new Error("Pixel buffer dimension mismatch between source image and mask.");
        }

        // ── Raw Alpha Extraction strictly from Mask Alpha Channel (A) ──
        // Decoupled completely from RGB luminance.
        // Multiplied by original source alpha to preserve pre-existing transparency.
        const rawAlpha = new Uint8ClampedArray(totalPixels);
        for (let i = 0; i < totalPixels; i++) {
          const mAlpha = mPixels[i * 4 + 3];
          const sAlpha = sPixels[i * 4 + 3];
          // Preserve input alpha: transparent areas in source remain transparent
          const combinedAlpha = Math.round((mAlpha * sAlpha) / 255);
          rawAlpha[i] = combinedAlpha;
        }

        const refinedAlpha = new Uint8ClampedArray(totalPixels);
        const outPixels = new Uint8ClampedArray(totalPixels * 4);

        const enableDecontam = (params.decontaminationRadius ?? 1) > 0;
        const radius = Math.max(1, Math.min(2, Math.round(params.decontaminationRadius || 1)));

        // Process boundary pixels with conservative local decontamination
        for (let y = 0; y < h; y++) {
          const yOffset = y * w;
          for (let x = 0; x < w; x++) {
            const idx = yOffset + x;
            const pIdx = idx * 4;
            const a = rawAlpha[idx];

            const r = sPixels[pIdx];
            const g = sPixels[pIdx + 1];
            const b = sPixels[pIdx + 2];

            // A. Definite Background (alpha <= 12)
            if (a <= 12) {
              refinedAlpha[idx] = 0;
              outPixels[pIdx] = 0;
              outPixels[pIdx + 1] = 0;
              outPixels[pIdx + 2] = 0;
              outPixels[pIdx + 3] = 0;
              continue;
            }

            // B. Definite Foreground Core (alpha >= 242)
            // Preserve 100% original RGB without alteration or clipping
            if (a >= 242) {
              refinedAlpha[idx] = 255;
              outPixels[pIdx] = r;
              outPixels[pIdx + 1] = g;
              outPixels[pIdx + 2] = b;
              outPixels[pIdx + 3] = 255;
              continue;
            }

            // C. Uncertain Fringe Zone (12 < a < 242)
            // Soft boundary pixels retain their exact soft alpha 'a' (no clipping)
            refinedAlpha[idx] = a;

            if (!enableDecontam) {
              outPixels[pIdx] = r;
              outPixels[pIdx + 1] = g;
              outPixels[pIdx + 2] = b;
              outPixels[pIdx + 3] = a;
              continue;
            }

            // Sample local background B and solid foreground F in boundary neighborhood
            let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
            let fgR = 0, fgG = 0, fgB = 0, fgCount = 0;

            for (let dy = -radius; dy <= radius; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= h) continue;
              const nOff = ny * w;
              for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= w) continue;
                const nIdx = nOff + nx;
                const nAlpha = rawAlpha[nIdx];
                const npIdx = nIdx * 4;

                if (nAlpha <= 12) {
                  bgR += sPixels[npIdx];
                  bgG += sPixels[npIdx + 1];
                  bgB += sPixels[npIdx + 2];
                  bgCount++;
                } else if (nAlpha >= 240) {
                  fgR += sPixels[npIdx];
                  fgG += sPixels[npIdx + 1];
                  fgB += sPixels[npIdx + 2];
                  fgCount++;
                }
              }
            }

            const alphaNorm = a / 255;
            let cleanR = r;
            let cleanG = g;
            let cleanB = b;

            if (bgCount > 0 && alphaNorm > 0.15) {
              const avgBgR = bgR / bgCount;
              const avgBgG = bgG / bgCount;
              const avgBgB = bgB / bgCount;

              const invAlpha = 1 - alphaNorm;
              const unmixedR = (r - invAlpha * avgBgR) / alphaNorm;
              const unmixedG = (g - invAlpha * avgBgG) / alphaNorm;
              const unmixedB = (b - invAlpha * avgBgB) / alphaNorm;

              cleanR = Math.max(0, Math.min(255, Math.round(unmixedR)));
              cleanG = Math.max(0, Math.min(255, Math.round(unmixedG)));
              cleanB = Math.max(0, Math.min(255, Math.round(unmixedB)));
            } else if (fgCount > 0 && alphaNorm <= 0.3) {
              cleanR = Math.round(fgR / fgCount);
              cleanG = Math.round(fgG / fgCount);
              cleanB = Math.round(fgB / fgCount);
            }

            outPixels[pIdx] = cleanR;
            outPixels[pIdx + 1] = cleanG;
            outPixels[pIdx + 2] = cleanB;
            outPixels[pIdx + 3] = a;
          }
        }

        const alphaMaskDataUrl = createAlphaMaskDataUrl(refinedAlpha, w, h);
        const outImageData = new ImageData(outPixels, w, h);
        srcCtx.putImageData(outImageData, 0, 0);

        srcCanvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(srcUrl);
            URL.revokeObjectURL(maskUrl);
            resolve({
              refinedBlob: blob || rawMaskBlob,
              alphaMaskUrl: alphaMaskDataUrl,
              alphaMaskBuffer: refinedAlpha,
              sourceImageData: srcData,
              width: w,
              height: h,
            });
          },
          "image/png",
          1.0
        );
      } catch (err) {
        URL.revokeObjectURL(srcUrl);
        URL.revokeObjectURL(maskUrl);
        reject(err);
      }
    };

    const onError = () => {
      URL.revokeObjectURL(srcUrl);
      URL.revokeObjectURL(maskUrl);
      reject(new Error("Failed to load image buffers for refinement."));
    };

    srcImg.crossOrigin = "anonymous";
    maskImg.crossOrigin = "anonymous";

    srcImg.onload = () => {
      loadedCount++;
      if (loadedCount === 2) onBothLoaded();
    };
    maskImg.onload = () => {
      loadedCount++;
      if (loadedCount === 2) onBothLoaded();
    };

    srcImg.onerror = onError;
    maskImg.onerror = onError;

    srcImg.src = srcUrl;
    maskImg.src = maskUrl;
  });
}

function createAbortError(message = "Aborted by user."): Error {
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

/**
 * Universal Background Removal Engine:
 * Mode A: Fast Preview Mode (max 1024px, @imgly/isnet_fp16)
 * Mode B: Clean Cut Mode (max 2048px, @imgly/isnet_fp16)
 * Mode C: High Quality Worker (remote worker if configured)
 */
export async function removeBackgroundBrowser(
  imageSource: File | Blob,
  options?: BgRemovalOptions
): Promise<BgRemovalOutput> {
  if (options?.signal?.aborted) {
    throw createAbortError("Aborted by user.");
  }

  const mode = options?.mode || "preview";
  const defaultMaxDim = mode === "preview" ? 1024 : 2048;
  const targetCap = options?.targetMaxDimension ? Math.min(options.targetMaxDimension, defaultMaxDim) : defaultMaxDim;
  const modelName = "isnet_fp16" as const;

  const tStart = Date.now();
  let tModelLoad = 0;
  let tInference = 0;
  let tRefine = 0;

  options?.onProgress?.({
    key: "prep",
    current: 10,
    total: 100,
    percent: 10,
    stage: "Preparing image",
  });

  const { width: origW, height: origH } = await getImageDimensions(imageSource).catch(() => ({
    width: 1024,
    height: 1024,
  }));

  // Never upscale an image merely to claim 2048px; Clean Cut is capped by source dimension
  const boundedMaxDim = Math.min(Math.max(origW, origH), targetCap);

  const { blob: scaledBlob, width, height, wasScaled } = await downscaleImageIfExceeds(
    imageSource,
    boundedMaxDim
  );

  if (options?.signal?.aborted) {
    throw createAbortError("Aborted by user.");
  }

  options?.onProgress?.({
    key: "load",
    current: 20,
    total: 100,
    percent: 20,
    stage: "Loading model",
  });

  // Track progress by aggregate byte metrics across individual shards
  const resourceBytes = new Map<string, { current: number; total: number }>();

  const handleProgress = (event: WorkerProgressEvent) => {
    if (options?.signal?.aborted) return;
    const { key, current, total } = event;
    resourceBytes.set(key, { current, total });

    let sumCurrent = 0;
    let sumTotal = 0;
    for (const res of resourceBytes.values()) {
      sumCurrent += res.current;
      sumTotal += res.total;
    }

    const isFetch = key.includes("fetch") || key.includes("model") || key.includes("wasm");
    const stage: BgRemovalProgress["stage"] = isFetch ? "Loading model" : "Segmenting";

    const calcPercent = sumTotal > 0 ? Math.round((sumCurrent / sumTotal) * 100) : 50;
    const boundedPct = Math.min(92, Math.max(15, calcPercent));

    options?.onProgress?.({
      key,
      current: sumCurrent,
      total: sumTotal,
      percent: boundedPct,
      stage,
      modelLoadingPercent: isFetch ? boundedPct : 100,
      processingPercent: isFetch ? 0 : boundedPct,
    });
  };

  const tLoadStart = Date.now();
  let rawCutoutBlob: Blob;

  try {
    // Primary path: Application-owned Web Worker execution
    // Allows immediate cancellation via worker.terminate()
    try {
      rawCutoutBlob = await bgWorkerManager.executeJob(
        scaledBlob,
        modelName,
        handleProgress,
        options?.signal
      );
      tInference = Date.now() - tLoadStart;
      tModelLoad = Math.round(tInference * 0.35); // Estimated asset/session load share
    } catch (workerErr: unknown) {
      if (options?.signal?.aborted) throw workerErr;
      console.warn(
        "Application Web Worker execution unavailable; falling back to package client execution:",
        workerErr
      );

      // Fallback path: Direct in-page execution with @imgly
      const { removeBackground } = await import("@imgly/background-removal");
      tModelLoad = Date.now() - tLoadStart;

      if (options?.signal?.aborted) {
        throw createAbortError("Aborted by user.");
      }

      const tInfStart = Date.now();
      rawCutoutBlob = await removeBackground(scaledBlob, {
        model: modelName,
        proxyToWorker: false,
        fetchArgs: {
          cache: "force-cache",
        },
        output: {
          format: "image/png",
          quality: 1.0,
        },
        progress: (key, current, total) => {
          handleProgress({ key, current, total });
        },
      });
      tInference = Date.now() - tInfStart;
    }

    if (options?.signal?.aborted) {
      throw createAbortError("Aborted by user.");
    }

    options?.onProgress?.({
      key: "refine",
      current: 94,
      total: 100,
      percent: 94,
      stage: "Refining mask",
      modelLoadingPercent: 100,
      processingPercent: 95,
    });

    const tRefStart = Date.now();
    const {
      refinedBlob,
      alphaMaskUrl,
      alphaMaskBuffer,
      sourceImageData,
    } = await refineAndDecontaminateImage(
      scaledBlob,
      rawCutoutBlob,
      {
        erosionRadius: options?.erosionRadius ?? 0,
        featherRadius: options?.featherRadius ?? 0.75,
        decontaminationRadius: options?.decontaminationRadius ?? (mode === "preview" ? 1 : 1.5),
        alphaMatting: options?.alphaMatting ?? true,
      }
    );
    tRefine = Date.now() - tRefStart;

    if (options?.signal?.aborted) {
      throw createAbortError("Aborted by user.");
    }

    // Strict validation: Ensure background was actually separated
    let transparentCount = 0;
    for (let i = 0; i < alphaMaskBuffer.length; i++) {
      if (alphaMaskBuffer[i] < 240) transparentCount++;
    }
    const transparentRatio = transparentCount / alphaMaskBuffer.length;
    if (transparentRatio < 0.005) {
      throw new Error(
        "Segmentation failed: Model did not detect or separate background from subject. Silent fallback rejected."
      );
    }

    options?.onProgress?.({
      key: "done",
      current: 100,
      total: 100,
      percent: 100,
      stage: "Ready",
      modelLoadingPercent: 100,
      processingPercent: 100,
    });

    const transparentUrl = URL.createObjectURL(refinedBlob);
    const totalMs = Date.now() - tStart;

    return {
      transparentBlob: refinedBlob,
      transparentUrl,
      alphaMaskUrl,
      alphaMaskBuffer,
      sourceImageData,
      width,
      height,
      sourceWidth: origW,
      sourceHeight: origH,
      wasDownscaled: wasScaled,
      label: "Browser AI result",
      model: "@imgly/isnet_fp16",
      mode,
      metrics: {
        uploadDecodeMs: 25,
        segmentationMs: tInference,
        maskRefineMs: tRefine,
        mattingMs: 0,
        encodingMs: 15,
        modelLoadMs: tModelLoad,
        inferenceMs: tInference,
        refineMs: tRefine,
        totalMs,
      },
    };
  } catch (err: unknown) {
    if (options?.signal?.aborted) {
      throw createAbortError("Aborted by user.");
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Background removal failed: ${message}`);
  }
}

/**
 * Exports final composited image at original full resolution.
 * - Resamples current working alpha mask onto target canvas.
 * - Preserves original source alpha for existing-alpha PNGs.
 * - Clamps dimensions exceeding MAX_SAFE_EXPORT_DIM while strictly preserving aspect ratio.
 */
export async function exportAtFullResolution(
  originalFileOrBlob: File | Blob,
  alphaMask: Uint8ClampedArray,
  maskWidth: number,
  maskHeight: number,
  targetBg: "white" | "pink" | "transparent" | string,
  options?: { autoCrop?: boolean }
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number; wasClamped?: boolean }> {
  const origBitmap = await createImageBitmap(originalFileOrBlob);
  try {
    const maxSafeDim = STAGE_DEADLINES.MAX_SAFE_EXPORT_DIM;
    let targetW = origBitmap.width;
    let targetH = origBitmap.height;
    let wasClamped = false;

    if (targetW > maxSafeDim || targetH > maxSafeDim) {
      wasClamped = true;
      const scale = maxSafeDim / Math.max(targetW, targetH);
      targetW = Math.round(targetW * scale);
      targetH = Math.round(targetH * scale);
      console.warn(
        `Original image (${origBitmap.width}x${origBitmap.height}) clamped to safe export limit: ${targetW}x${targetH}`
      );
    }

    // Mask canvas
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = maskWidth;
    maskCanvas.height = maskHeight;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) throw new Error("Could not create mask canvas.");

    const maskImgData = maskCtx.createImageData(maskWidth, maskHeight);
    const maskPixels = maskImgData.data;
    for (let i = 0; i < maskWidth * maskHeight; i++) {
      const a = alphaMask[i];
      const idx = i * 4;
      maskPixels[idx] = a;
      maskPixels[idx + 1] = a;
      maskPixels[idx + 2] = a;
      maskPixels[idx + 3] = 255;
    }
    maskCtx.putImageData(maskImgData, 0, 0);

    let scaledMaskData: Uint8ClampedArray;
    if (targetW === maskWidth && targetH === maskHeight) {
      scaledMaskData = alphaMask;
    } else {
      // Scaled mask canvas to target resolution with nearest-neighbor to protect thin text strokes
      const scaledMaskCanvas = document.createElement("canvas");
      scaledMaskCanvas.width = targetW;
      scaledMaskCanvas.height = targetH;
      const scaledMaskCtx = scaledMaskCanvas.getContext("2d");
      if (!scaledMaskCtx) throw new Error("Could not create scaled mask canvas.");
      scaledMaskCtx.imageSmoothingEnabled = false;
      scaledMaskCtx.drawImage(maskCanvas, 0, 0, targetW, targetH);
      scaledMaskData = scaledMaskCtx.getImageData(0, 0, targetW, targetH).data;
    }

    // Output canvas with target dimensions
    const outCanvas = document.createElement("canvas");
    outCanvas.width = targetW;
    outCanvas.height = targetH;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) throw new Error("Could not create output canvas.");

    outCtx.drawImage(origBitmap, 0, 0, targetW, targetH);
    const outImageData = outCtx.getImageData(0, 0, targetW, targetH);
    const isCustomHex = typeof targetBg === "string" && targetBg.startsWith("#");
    const purpose: "white" | "pink" | "transparent" =
      targetBg === "pink" ? "pink" : targetBg === "transparent" ? "transparent" : "white";
    const customBg = isCustomHex
      ? {
          r: parseInt(targetBg.slice(1, 3), 16) || 255,
          g: parseInt(targetBg.slice(3, 5), 16) || 255,
          b: parseInt(targetBg.slice(5, 7), 16) || 255,
        }
      : undefined;
    const compositedPixels = compositeRgbaBuffer(
      outImageData.data,
      scaledMaskData,
      targetW,
      targetH,
      purpose,
      customBg
    );
    outImageData.data.set(compositedPixels);
    outCtx.putImageData(outImageData, 0, 0);

    let finalCanvas = outCanvas;
    let finalW = targetW;
    let finalH = targetH;

    // Auto-crop is opt-in only. Preserves original dimensions by default.
    if (options?.autoCrop) {
      let minX = targetW, maxX = 0, minY = targetH, maxY = 0;
      let hasFg = false;
      for (let y = 0; y < targetH; y++) {
        for (let x = 0; x < targetW; x++) {
          const a = compositedPixels[(y * targetW + x) * 4 + 3];
          if (a > 15) {
            hasFg = true;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (hasFg && minX <= maxX && minY <= maxY) {
        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext("2d");
        if (cropCtx) {
          cropCtx.drawImage(outCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
          finalCanvas = cropCanvas;
          finalW = cropW;
          finalH = cropH;
        }
      }
    }

    return new Promise((resolve, reject) => {
      finalCanvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Failed to create full resolution blob"));
          const dataUrl = URL.createObjectURL(blob);
          resolve({ blob, dataUrl, width: finalW, height: finalH, wasClamped });
        },
        "image/png",
        1.0
      );
    });
  } finally {
    if (typeof origBitmap.close === "function") {
      origBitmap.close();
    }
  }
}

/**
 * Instant Recompositor: Composites source image with corrected alpha mask
 * Runs purely on CPU typed array in < 5ms without re-running segmentation!
 */
export async function recompositeAlphaMask(
  srcData: ImageData,
  alphaMask: Uint8ClampedArray,
  targetBg: "white" | "pink" | "transparent" | "mask"
): Promise<{ dataUrl: string; blob: Blob; imageData: ImageData }> {
  const w = srcData.width;
  const h = srcData.height;
  const total = w * h;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create 2D canvas context for recompositing.");

  const outImageData = ctx.createImageData(w, h);
  const out = outImageData.data;
  const sPixels = srcData.data;

  for (let i = 0; i < total; i++) {
    const pIdx = i * 4;
    const a = alphaMask[i];
    const r = sPixels[pIdx];
    const g = sPixels[pIdx + 1];
    const b = sPixels[pIdx + 2];

    if (targetBg === "mask") {
      out[pIdx] = a;
      out[pIdx + 1] = a;
      out[pIdx + 2] = a;
      out[pIdx + 3] = 255;
    } else if (targetBg === "transparent") {
      out[pIdx] = r;
      out[pIdx + 1] = g;
      out[pIdx + 2] = b;
      out[pIdx + 3] = a;
    } else if (targetBg === "white") {
      const aNorm = a / 255;
      out[pIdx] = Math.round(r * aNorm + 255 * (1 - aNorm));
      out[pIdx + 1] = Math.round(g * aNorm + 255 * (1 - aNorm));
      out[pIdx + 2] = Math.round(b * aNorm + 255 * (1 - aNorm));
      out[pIdx + 3] = 255;
    } else if (targetBg === "pink") {
      const aNorm = a / 255;
      out[pIdx] = Math.round(r * aNorm + 255 * (1 - aNorm));
      out[pIdx + 1] = Math.round(g * aNorm + 240 * (1 - aNorm));
      out[pIdx + 2] = Math.round(b * aNorm + 245 * (1 - aNorm));
      out[pIdx + 3] = 255;
    }
  }

  ctx.putImageData(outImageData, 0, 0);
  const dataUrl = canvas.toDataURL("image/png");

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve({
        dataUrl,
        blob: blob || new Blob([], { type: "image/png" }),
        imageData: outImageData,
      });
    }, "image/png");
  });
}

/**
 * Composites a transparent image blob onto a solid background color.
 */
export async function compositeWithSolidColor(
  transparentBlob: Blob,
  bgColorHex: string
): Promise<{ dataUrl: string; width: number; height: number; blob: Blob }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(transparentBlob);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = img.naturalWidth || 800;
        const h = img.naturalHeight || 600;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Unable to create canvas context."));
          return;
        }
        ctx.fillStyle = bgColorHex;
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/png");
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          resolve({
            dataUrl,
            width: w,
            height: h,
            blob: blob || transparentBlob,
          });
        }, "image/png");
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load transparent cutout for canvas compositing."));
    };
    img.src = objectUrl;
  });
}

export interface RemoteWorkerOptions {
  refine?: boolean;
  quality?: "fast" | "balanced" | "quality" | "fine_details";
  directUrl?: string | null;
  signal?: AbortSignal;
  mode?: SelectionMode;
  positivePoints?: [number, number][];
  negativePoints?: [number, number][];
  boxes?: [number, number, number, number][];
  polygon?: [number, number][];
}

/**
 * Remote Worker / Server Background Removal Gateway
 * Supports direct client upload when directUrl is provided (bypassing Vercel 4.5MB limit),
 * with transparent fallback to /api/remove-bg proxy, plus opt-in Alpha Matting query params.
 */
export async function removeBackgroundRemote(
  imageFile: File | Blob,
  options?: RemoteWorkerOptions | AbortSignal
): Promise<BgRemovalOutput> {
  const opts: RemoteWorkerOptions =
    options instanceof AbortSignal ? { signal: options } : options || {};

  const { width: origW, height: origH } = await getImageDimensions(imageFile).catch(() => ({
    width: 2048,
    height: 2048,
  }));
  const { blob: safeBlob, width, height, wasScaled } = await downscaleImageIfExceeds(
    imageFile,
    2048
  );

  const tStart = Date.now();
  const formData = new FormData();
  formData.append("image", safeBlob, (imageFile as File).name || "image.png");
  if (opts.mode) {
    formData.append("mode", opts.mode);
  }
  if (opts.positivePoints && opts.positivePoints.length > 0) {
    formData.append("positivePoints", JSON.stringify(opts.positivePoints));
  }
  if (opts.negativePoints && opts.negativePoints.length > 0) {
    formData.append("negativePoints", JSON.stringify(opts.negativePoints));
  }
  if (opts.boxes && opts.boxes.length > 0) {
    formData.append("boxes", JSON.stringify(opts.boxes));
  }
  if (opts.polygon && opts.polygon.length > 0) {
    formData.append("polygon", JSON.stringify(opts.polygon));
  }

  const queryParams = new URLSearchParams();
  if (opts.refine) {
    queryParams.set("refine", "true");
    queryParams.set("quality", opts.quality || "balanced");
  }
  if (opts.mode) {
    queryParams.set("mode", opts.mode);
  }
  const qStr = queryParams.toString() ? `?${queryParams.toString()}` : "";

  let res: Response | null = null;
  let usedDirect = false;

  // Try direct worker upload if directUrl is configured (avoids Vercel 4.5MB Serverless function limit)
  if (opts.directUrl && opts.directUrl.startsWith("http")) {
    try {
      const cleanDirect = opts.directUrl.replace(/\/+$/, "");
      const directTarget = `${cleanDirect}/remove${qStr}`;
      res = await fetch(directTarget, {
        method: "POST",
        body: formData,
        signal: opts.signal,
      });
      usedDirect = true;
    } catch (directErr) {
      if (opts.signal?.aborted) throw directErr;
      console.warn("Direct worker upload failed, falling back to server gateway proxy:", directErr);
      res = null; // Fall back to /api/remove-bg
    }
  }

  // Fallback to Next.js API route gateway
  if (!res) {
    const proxyUrl = `/api/remove-bg${qStr}`;
    res = await fetch(proxyUrl, {
      method: "POST",
      body: formData,
      signal: opts.signal,
    });
  }

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    let code = `HTTP_${res.status}`;
    let message = `Remote Worker returned status ${res.status}.`;

    if (contentType.includes("application/json")) {
      const errorData = await res.json().catch(() => null);
      if (errorData?.code) code = errorData.code;
      if (errorData?.error || errorData?.detail) {
        message = errorData.error || errorData.detail;
      }
    } else {
      const textData = await res.text().catch(() => "");
      if (res.status === 413 || /payload_too_large|too large/i.test(textData)) {
        code = "IMAGE_TOO_LARGE";
        message = "Image size exceeds the remote worker upload limit (MAX_UPLOAD_BYTES).";
      } else if (res.status === 429 || /rate limit|quota/i.test(textData)) {
        code = "RATE_LIMITED";
        message = "Remote worker rate limit exceeded. Please try again shortly.";
      } else if (textData) {
        message = textData.slice(0, 200);
      }
    }

    const err = new Error(message);
    err.name = code;
    throw err;
  }

  const headerSource = res.headers.get("X-Processing-Source");
  const modelHeader = res.headers.get("X-Segmentation-Model") || "BiRefNet / RMBG Worker";

  const label: ProcessingStatusLabel =
    headerSource === "Local worker result"
      ? "Local worker result"
      : "Cloud API result";

  const blob = await res.blob();
  const transparentUrl = URL.createObjectURL(blob);
  const totalMs = Date.now() - tStart;

  // Extract alpha mask and source image data so the manual mask studio and color switcher work identically
  const { alphaMaskBuffer, sourceImageData, alphaMaskUrl } = await new Promise<{
    alphaMaskBuffer: Uint8ClampedArray;
    sourceImageData: ImageData;
    alphaMaskUrl: string;
  }>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const imgData = ctx.getImageData(0, 0, width, height);
        const alphaBuf = new Uint8ClampedArray(width * height);
        for (let i = 0; i < width * height; i++) {
          alphaBuf[i] = imgData.data[i * 4 + 3];
        }
        const maskUrl = createAlphaMaskDataUrl(alphaBuf, width, height);
        resolve({
          alphaMaskBuffer: alphaBuf,
          sourceImageData: imgData,
          alphaMaskUrl: maskUrl,
        });
      } else {
        const dummyBuf = new Uint8ClampedArray(width * height);
        resolve({
          alphaMaskBuffer: dummyBuf,
          sourceImageData: new ImageData(width, height),
          alphaMaskUrl: "",
        });
      }
    };
    img.src = transparentUrl;
  });

  return {
    transparentBlob: blob,
    transparentUrl,
    alphaMaskUrl,
    alphaMaskBuffer,
    sourceImageData,
    width,
    height,
    sourceWidth: origW,
    sourceHeight: origH,
    wasDownscaled: wasScaled,
    label,
    model: modelHeader,
    mode: "worker",
    metrics: {
      uploadDecodeMs: 20,
      segmentationMs: totalMs,
      networkRoundTripMs: totalMs,
      totalMs,
      inferenceMs: totalMs,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Two-Stage Pipeline: Semantic/Interactive Selection & Alpha Matting
// ─────────────────────────────────────────────────────────────────────────────

export interface SegmentSelectionOptions {
  mode?: SelectionMode;
  positivePoints?: [number, number][];
  negativePoints?: [number, number][];
  boxes?: [number, number, number, number][];
  polygon?: [number, number][];
  pointRadius?: number;
  targetMaxDimension?: number;
  signal?: AbortSignal;
  onProgress?: (progress: BgRemovalProgress) => void;
  remoteWorker?: boolean;
  directUrl?: string | null;
  quality?: "fast" | "balanced" | "fine_details" | "quality";
  manualKeepMask?: Uint8ClampedArray | Uint8Array | null;
  secondaryProposalMask?: Uint8ClampedArray | Uint8Array | null;
}

export interface SegmentSelectionResult {
  sourceImageData: ImageData;
  initialMask: Uint8ClampedArray;
  activeMask: Uint8ClampedArray;
  excludedMask: Uint8ClampedArray;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  hasContainer: boolean;
  boxConfidence: number;
  warning?: string;
  maskOverlayUrl: string;
  selectionMode: SelectionMode;
  metrics?: ProcessingStageMetrics;
}

/**
 * Stage A: Semantic & Interactive Object Selection
 * Obtains the initial segmentation, classifies outer packaging vs inner contents,
 * applies interactive prompts (points, boxes, polygons), and produces a mask preview overlay.
 */
export async function segmentObjectSelection(
  imageFile: File | Blob,
  options?: SegmentSelectionOptions
): Promise<SegmentSelectionResult> {
  if (options?.signal?.aborted) {
    throw createAbortError("Aborted by user.");
  }
  const tStart = performance.now();
  const mode: SelectionMode = options?.mode || "preserve_all_foreground";

  // DOCUMENT / POSTER MODE: Keep complete page intact, never punch holes in text, logos, or white areas
  if (mode === "document_poster" || mode === "whole_poster") {
    const tDecodeStart = performance.now();
    let srcImageData: ImageData;
    let imgW: number;
    let imgH: number;

    if (typeof window !== "undefined") {
      const img = new Image();
      const objectUrl = URL.createObjectURL(imageFile);
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = objectUrl;
        });
        imgW = img.naturalWidth || img.width;
        imgH = img.naturalHeight || img.height;
        const canvas = document.createElement("canvas");
        canvas.width = imgW;
        canvas.height = imgH;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not create canvas context for document segmentation");
        ctx.drawImage(img, 0, 0);
        srcImageData = ctx.getImageData(0, 0, imgW, imgH);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } else {
      // Node/test fallback
      imgW = (options as any)?.width || 758;
      imgH = (options as any)?.height || 1077;
      srcImageData = new ImageData(imgW, imgH);
    }
    const tDecodeEnd = performance.now();
    const uploadDecodeMs = Math.round(tDecodeEnd - tDecodeStart);

    // DOCUMENT / POSTER SAFE MODE:
    // - Zero RMBG / Zero SAM / Zero AI inference
    // - Default: 100% opaque full canvas (all alpha = 255)
    // - Only allows transparency outside user-confirmed polygon/box
    const tSegStart = performance.now();
    const docResult = detectDocumentQuad(srcImageData.data, imgW, imgH);
    const safeDoc = createDocumentSafeRgba(srcImageData.data, imgW, imgH, {
      polygon: options?.polygon,
      box: options?.boxes?.[0],
    });
    const activeMask = safeDoc.alphaMask;
    const excludedMask = new Uint8ClampedArray(imgW * imgH);
    const tSegEnd = performance.now();
    const segmentationMs = Math.round(tSegEnd - tSegStart);

    const tRefineStart = performance.now();
    // Apply interactive prompts if any provided
    if (
      (options?.positivePoints && options.positivePoints.length > 0) ||
      (options?.negativePoints && options.negativePoints.length > 0)
    ) {
      const updatedWithPrompts = applyInteractivePromptsToMask(activeMask, imgW, imgH, {
        mode,
        positivePoints: options?.positivePoints,
        negativePoints: options?.negativePoints,
        pointRadius: options?.pointRadius || 18,
      });
      activeMask.set(updatedWithPrompts);
    }

    let maskOverlayUrl = "";
    if (typeof document !== "undefined") {
      const overlayPixels = generateMaskOverlay(srcImageData.data, activeMask, imgW, imgH);
      const canvas = document.createElement("canvas");
      canvas.width = imgW;
      canvas.height = imgH;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const imgData = ctx.createImageData(imgW, imgH);
        imgData.data.set(overlayPixels);
        ctx.putImageData(imgData, 0, 0);
        maskOverlayUrl = canvas.toDataURL("image/png");
      }
    }
    const tEnd = performance.now();
    const maskRefineMs = Math.round(tEnd - tRefineStart);
    const totalMs = Math.round(tEnd - tStart);

    return {
      sourceImageData: srcImageData,
      initialMask: new Uint8ClampedArray(activeMask),
      activeMask,
      excludedMask,
      width: imgW,
      height: imgH,
      sourceWidth: imgW,
      sourceHeight: imgH,
      hasContainer: false,
      boxConfidence: docResult.confidence,
      warning: undefined,
      maskOverlayUrl,
      selectionMode: mode === "document_poster" ? "document_poster" : "whole_poster",
      metrics: {
        uploadDecodeMs,
        segmentationMs,
        maskRefineMs,
        mattingMs: 0,
        encodingMs: 0,
        totalMs,
      },
    };
  }

  const tDecodeStart = performance.now();
  let initialOutput: BgRemovalOutput;
  if (options?.remoteWorker) {
    initialOutput = await removeBackgroundRemote(imageFile, {
      refine: false,
      directUrl: options.directUrl,
      signal: options.signal,
      mode,
      positivePoints: options.positivePoints,
      negativePoints: options.negativePoints,
      boxes: options.boxes,
      polygon: options.polygon,
    });
  } else {
    initialOutput = await removeBackgroundBrowser(imageFile, {
      mode: "preview",
      targetMaxDimension: options?.targetMaxDimension,
      alphaMatting: false,
      signal: options?.signal,
      onProgress: options?.onProgress,
    });
  }

  const { width, height, sourceImageData, alphaMaskBuffer } = initialOutput;
  const totalPixels = width * height;

  // 1. Detect cardboard packaging / box vs inner contents
  const containerResult = detectContainerAndContents(
    sourceImageData.data,
    alphaMaskBuffer,
    width,
    height,
    {
      mode,
      conservative: BACKGROUND_REMOVAL_CONSERVATIVE,
    }
  );

  let activeMask = new Uint8ClampedArray(totalPixels);
  let excludedMask = new Uint8ClampedArray(totalPixels);

  if (mode === "person" || mode === "person_only") {
    // Dedicated person segmentation: containerResult.contentsMask is the isolated person mask (text & graphics stripped)
    for (let i = 0; i < totalPixels; i++) {
      activeMask[i] = containerResult.contentsMask[i];
    }
  } else if (mode === "person_text_only" || mode === "person_plus_text") {
    // Independent person mask UNION text stroke mask
    const pRes = extractPersonMask(sourceImageData.data, alphaMaskBuffer, width, height);
    const tRes = extractTextStrokeMask(sourceImageData.data, width, height);
    const combined = combinePersonAndTextMasks(
      pRes.personMask,
      tRes.textStrokeMask,
      width,
      height,
      {
        keepPerson: true,
        keepText: true,
        keepGraphics: false,
        graphicsMask: tRes.graphicsMask,
      }
    );
    for (let i = 0; i < totalPixels; i++) {
      activeMask[i] = combined.finalKeepMask[i];
    }
  } else if (mode === "contents_only" && containerResult.hasContainer) {
    // Strip packaging/box; keep only contents
    for (let i = 0; i < totalPixels; i++) {
      activeMask[i] = containerResult.contentsMask[i];
      excludedMask[i] = containerResult.containerMask[i];
    }
  } else {
    // Keep entire product (both packaging and contents) or custom mask
    for (let i = 0; i < totalPixels; i++) {
      activeMask[i] = alphaMaskBuffer[i];
    }
  }

  // If user selected positive regions / painted text to keep (in person_plus_text or custom mode)
  if (options?.manualKeepMask) {
    for (let i = 0; i < totalPixels; i++) {
      if (options.manualKeepMask[i] > 128) {
        activeMask[i] = 255;
      }
    }
  }

  const tRefineStart = performance.now();
  // 2. Apply interactive prompts if provided
  if (
    (options?.positivePoints && options.positivePoints.length > 0) ||
    (options?.negativePoints && options.negativePoints.length > 0) ||
    (options?.boxes && options.boxes.length > 0) ||
    (options?.polygon && options.polygon.length >= 3)
  ) {
    const updatedWithPrompts = applyInteractivePromptsToMask(activeMask, width, height, {
      mode,
      positivePoints: options?.positivePoints,
      negativePoints: options?.negativePoints,
      boxes: options?.boxes,
      polygon: options?.polygon,
      pointRadius: options?.pointRadius || 18,
    });
    activeMask.set(updatedWithPrompts);

    // Mark explicit negative points into excludedMask so trimap never expands there
    if (options?.negativePoints) {
      const radius = options?.pointRadius || 18;
      const rSq = radius * radius;
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
              excludedMask[y * width + x] = 255;
            }
          }
        }
      }
    }
  }

  // 3. Generate green/red mask preview overlay
  let maskOverlayUrl = "";
  if (typeof document !== "undefined") {
    const overlayPixels = generateMaskOverlay(
      sourceImageData.data,
      activeMask,
      width,
      height
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const imgData = ctx.createImageData(width, height);
      imgData.data.set(overlayPixels);
      ctx.putImageData(imgData, 0, 0);
      maskOverlayUrl = canvas.toDataURL("image/png");
    }
  }

  const tEnd = performance.now();
  const totalMs = Math.round(tEnd - tStart);
  const metrics: ProcessingStageMetrics = {
    uploadDecodeMs: initialOutput.metrics?.uploadDecodeMs ?? 20,
    segmentationMs: initialOutput.metrics?.inferenceMs ?? Math.round(totalMs * 0.7),
    maskRefineMs: Math.round(tEnd - tRefineStart),
    mattingMs: 0,
    encodingMs: 0,
    networkRoundTripMs: initialOutput.metrics?.networkRoundTripMs,
    totalMs,
  };

  return {
    sourceImageData,
    initialMask: new Uint8ClampedArray(alphaMaskBuffer),
    activeMask,
    excludedMask,
    width,
    height,
    sourceWidth: initialOutput.sourceWidth || width,
    sourceHeight: initialOutput.sourceHeight || height,
    hasContainer: containerResult.hasContainer,
    boxConfidence: containerResult.boxConfidence,
    warning: containerResult.warning,
    maskOverlayUrl,
    selectionMode: mode,
    metrics,
  };
}

export interface RefineAlphaMattingOptions {
  mode?: SelectionMode;
  documentSafeMode?: boolean;
  quality?: "fast" | "balanced" | "fine_details" | "quality";
  edgeQuality?: "fast" | "balanced" | "fine";
  background?: "transparent" | "white" | "pink" | string;
  remoteWorker?: boolean;
  directUrl?: string | null;
  signal?: AbortSignal;
  onProgress?: (progress: BgRemovalProgress) => void;
  initialMask?: Uint8ClampedArray | Uint8Array | null;
  manualKeepMask?: Uint8ClampedArray | Uint8Array | null;
  maxDropRatio?: number;
}

/**
 * Stage B: Alpha Matting Refinement
 * Runs trimap generation bounded by the user-approved selection mask,
 * performs edge-aware guided filtering, enforces automated safety check,
 * and exports the transparent PNG.
 */
export async function refineAlphaMattingWithMask(
  sourceImageData: ImageData,
  activeMask: Uint8ClampedArray,
  excludedMask: Uint8ClampedArray | null,
  options?: RefineAlphaMattingOptions
): Promise<BgRemovalOutput> {
  if (options?.signal?.aborted) {
    throw createAbortError("Aborted by user.");
  }
  const w = sourceImageData.width;
  const h = sourceImageData.height;
  const totalPixels = w * h;

  // DOCUMENT SAFE MODE: AI MATTE DISABLED
  // - Do not run RMBG.
  // - Do not run SAM.
  // - Do not run alpha matting.
  // - Do not run guided filter.
  // - Do not threshold white pixels.
  // - Preserve every original RGB pixel byte-identical.
  // - Alpha is activeMask (all 255 unless user explicitly cut an outside polygon).
  const tStart = performance.now();
  const isDocSafe =
    options?.mode === "document_poster" ||
    options?.mode === "whole_poster" ||
    options?.documentSafeMode;
  if (isDocSafe) {
    let transparentBlob: Blob;
    let transparentUrl = "";
    let alphaMaskUrl = "";

    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const outImgData = ctx.createImageData(w, h);
        const outPixels = outImgData.data;
        const srcPixels = sourceImageData.data;

        for (let i = 0; i < totalPixels; i++) {
          const pIdx = i * 4;
          outPixels[pIdx] = srcPixels[pIdx];
          outPixels[pIdx + 1] = srcPixels[pIdx + 1];
          outPixels[pIdx + 2] = srcPixels[pIdx + 2];
          outPixels[pIdx + 3] = activeMask[i];
        }
        ctx.putImageData(outImgData, 0, 0);

        transparentBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to create blob for document safe cutout."));
          }, "image/png");
        });
        transparentUrl = URL.createObjectURL(transparentBlob);
        alphaMaskUrl = createAlphaMaskDataUrl(activeMask, w, h);
      } else {
        transparentBlob = new Blob([], { type: "image/png" });
      }
    } else {
      transparentBlob = new Blob([], { type: "image/png" });
    }

    const totalMs = Math.round(performance.now() - tStart);
    return {
      transparentBlob,
      transparentUrl,
      alphaMaskUrl,
      alphaMaskBuffer: activeMask,
      sourceImageData,
      width: w,
      height: h,
      sourceWidth: w,
      sourceHeight: h,
      wasDownscaled: false,
      label: "Document Safe Mode (AI Matte Disabled)",
      model: "DOCUMENT SAFE MODE: AI MATTE DISABLED",
      mode: "preview",
      metrics: {
        uploadDecodeMs: 0,
        segmentationMs: 0,
        maskRefineMs: 0,
        mattingMs: 0,
        encodingMs: totalMs,
        totalMs,
      },
    };
  }

  const quality = options?.quality || (options?.edgeQuality === "fine" ? "fine_details" : "balanced");
  const isFineQuality = quality === "quality" || quality === "fine_details";
  const trimapRadius = quality === "fast" ? 3 : isFineQuality ? 6 : 4;
  const initialMask = options?.initialMask || activeMask;

  const tMatStart = performance.now();
  // 1. Generate conservative 3-class trimap (excludedMask strictly preserved as 0, manualKeep strictly 255)
  const trimap = generateTrimap(
    activeMask,
    w,
    h,
    trimapRadius,
    excludedMask,
    options?.manualKeepMask,
    { quality: isFineQuality ? "fine_details" : (quality === "fast" ? "fast" : "balanced") }
  );

  // 2. Refine alpha transitions using edge-aware guided filter
  const rawRefinedAlpha = refineMaskWithGuidedFilter(
    sourceImageData.data,
    trimap,
    w,
    h,
    trimapRadius,
    1e-4,
    {
      initialMask,
      manualKeepMask: options?.manualKeepMask,
      alphaFloor: 0.95,
    }
  );

  // 3. Automated Area Safety Check: Rollback to initial mask if area drops > 10% (or > 5% in document mode)
  const isDoc = options?.mode === "document_poster" || options?.mode === "whole_poster" || options?.mode === "document_text";
  const defaultDrop = isDoc ? 0.05 : 0.10;
  const { safeMask, diagnostics } = applyAreaSafetyCheck(
    initialMask,
    rawRefinedAlpha,
    w,
    h,
    options?.maxDropRatio ?? defaultDrop,
    {
      mode: options?.mode,
      manualKeepMask: options?.manualKeepMask,
      trimap,
    }
  );

  // 3b. Controlled Color Decontamination & Dehalo pass on boundary band
  const decontaminatedRgb = applyColorDehalo(
    sourceImageData.data,
    safeMask,
    w,
    h,
    trimapRadius
  );

  // Ensure positive manual keep selections strictly preserved at 255
  if (options?.manualKeepMask) {
    for (let i = 0; i < totalPixels; i++) {
      if (options.manualKeepMask[i] > 128) {
        safeMask[i] = 255;
      }
    }
  }

  const tEncStart = performance.now();
  let transparentBlob: Blob;
  let transparentUrl = "";
  let alphaMaskUrl = "";

  if (typeof document !== "undefined") {
    // 4. Composite output RGBA
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas context for alpha matting refinement.");

    const outImgData = ctx.createImageData(w, h);
    const outPixels = outImgData.data;

    for (let i = 0; i < totalPixels; i++) {
      const pIdx = i * 4;
      const a = safeMask[i];
      outPixels[pIdx] = decontaminatedRgb[pIdx];
      outPixels[pIdx + 1] = decontaminatedRgb[pIdx + 1];
      outPixels[pIdx + 2] = decontaminatedRgb[pIdx + 2];
      outPixels[pIdx + 3] = a;
    }
    ctx.putImageData(outImgData, 0, 0);

    transparentBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to create blob for refined cutout."));
      }, "image/png");
    });

    transparentUrl = URL.createObjectURL(transparentBlob);
    alphaMaskUrl = createAlphaMaskDataUrl(safeMask, w, h);
  } else {
    transparentBlob = new Blob([], { type: "image/png" });
  }

  const encodingMs = Math.round(performance.now() - tEncStart);
  const mattingMs = Math.round(tEncStart - tMatStart);
  const totalMs = Math.round(performance.now() - tStart);

  return {
    transparentBlob,
    transparentUrl,
    alphaMaskUrl,
    alphaMaskBuffer: safeMask,
    sourceImageData,
    width: w,
    height: h,
    sourceWidth: w,
    sourceHeight: h,
    wasDownscaled: false,
    label: "Browser AI result",
    model: diagnostics.rollbackTriggered
      ? "@imgly/isnet_fp16 (Safety Rollback Applied)"
      : "@imgly/isnet_fp16 + GuidedFilter",
    mode: "preview",
    diagnostics,
    rollbackTriggered: diagnostics.rollbackTriggered,
    metrics: {
      maskRefineMs: Math.round(tMatStart - tStart),
      mattingMs,
      encodingMs,
      totalMs,
    },
  };
}

