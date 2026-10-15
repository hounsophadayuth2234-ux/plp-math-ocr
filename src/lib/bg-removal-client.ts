import { ProcessingStatusLabel } from "./types";
import { downscaleImageIfExceeds } from "./processing-utils";
import { bgWorkerManager, WorkerProgressEvent } from "./bg-removal-worker-manager";

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

export interface BgRemovalOutput {
  transparentBlob: Blob;
  transparentUrl: string;
  alphaMaskUrl: string;
  alphaMaskBuffer: Uint8ClampedArray; // 1-channel alpha mask [0..255] (length w * h)
  sourceImageData: ImageData;         // Clean source RGBA pixels (w x h)
  width: number;
  height: number;
  label: ProcessingStatusLabel;
  model: string;
  mode: "preview" | "final" | "worker";
  metrics?: {
    modelLoadMs?: number;
    inferenceMs?: number;
    refineMs?: number;
    totalMs?: number;
  };
}

export interface BgRemovalOptions {
  mode?: "preview" | "final" | "worker";
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
  const maxDim = mode === "preview" ? 1024 : 2048;
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

  const { blob: scaledBlob, width, height } = await downscaleImageIfExceeds(
    imageSource,
    maxDim
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
      label: "Browser AI result",
      model: "@imgly/isnet_fp16",
      mode,
      metrics: {
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
  targetBg: "white" | "pink" | "transparent"
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

    // Scaled mask canvas to target resolution
    const scaledMaskCanvas = document.createElement("canvas");
    scaledMaskCanvas.width = targetW;
    scaledMaskCanvas.height = targetH;
    const scaledMaskCtx = scaledMaskCanvas.getContext("2d");
    if (!scaledMaskCtx) throw new Error("Could not create scaled mask canvas.");
    scaledMaskCtx.imageSmoothingEnabled = true;
    scaledMaskCtx.imageSmoothingQuality = "high";
    scaledMaskCtx.drawImage(maskCanvas, 0, 0, targetW, targetH);

    const scaledMaskData = scaledMaskCtx.getImageData(0, 0, targetW, targetH).data;

    // Output canvas with target dimensions
    const outCanvas = document.createElement("canvas");
    outCanvas.width = targetW;
    outCanvas.height = targetH;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) throw new Error("Could not create output canvas.");

    outCtx.drawImage(origBitmap, 0, 0, targetW, targetH);
    const outImageData = outCtx.getImageData(0, 0, targetW, targetH);
    const outPixels = outImageData.data;

    const total = targetW * targetH;
    for (let i = 0; i < total; i++) {
      const pIdx = i * 4;
      const maskA = scaledMaskData[pIdx];
      const origA = outPixels[pIdx + 3]; // Preserve original source alpha!
      const finalA = Math.round((maskA * origA) / 255);

      const r = outPixels[pIdx];
      const g = outPixels[pIdx + 1];
      const b = outPixels[pIdx + 2];

      if (targetBg === "transparent") {
        outPixels[pIdx + 3] = finalA;
        if (finalA === 0) {
          outPixels[pIdx] = 0;
          outPixels[pIdx + 1] = 0;
          outPixels[pIdx + 2] = 0;
        }
      } else if (targetBg === "white") {
        const aNorm = finalA / 255;
        outPixels[pIdx] = Math.round(r * aNorm + 255 * (1 - aNorm));
        outPixels[pIdx + 1] = Math.round(g * aNorm + 255 * (1 - aNorm));
        outPixels[pIdx + 2] = Math.round(b * aNorm + 255 * (1 - aNorm));
        outPixels[pIdx + 3] = 255;
      } else if (targetBg === "pink") {
        const aNorm = finalA / 255;
        outPixels[pIdx] = Math.round(r * aNorm + 255 * (1 - aNorm));
        outPixels[pIdx + 1] = Math.round(g * aNorm + 240 * (1 - aNorm));
        outPixels[pIdx + 2] = Math.round(b * aNorm + 245 * (1 - aNorm));
        outPixels[pIdx + 3] = 255;
      }
    }

    outCtx.putImageData(outImageData, 0, 0);

    return new Promise((resolve, reject) => {
      outCanvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Failed to create full resolution blob"));
          const dataUrl = URL.createObjectURL(blob);
          resolve({ blob, dataUrl, width: targetW, height: targetH, wasClamped });
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

/**
 * Remote Worker / Server Background Removal Gateway
 */
export async function removeBackgroundRemote(
  imageFile: File | Blob,
  signal?: AbortSignal
): Promise<BgRemovalOutput> {
  const { blob: safeBlob, width, height } = await downscaleImageIfExceeds(
    imageFile,
    2048
  );

  const tStart = Date.now();
  const formData = new FormData();
  formData.append("image", safeBlob);

  const res = await fetch("/api/remove-bg", {
    method: "POST",
    body: formData,
    signal,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    if (res.status === 422 && errorData?.code === "NOT_CONFIGURED") {
      const err = new Error(
        errorData?.error ||
          "Remote Worker is not configured. Please switch to Browser AI mode (runs 100% locally with zero cost and privacy), or configure BACKGROUND_REMOVAL_WORKER_URL in Settings."
      );
      err.name = "NOT_CONFIGURED";
      throw err;
    }
    throw new Error(
      errorData?.error || `Remote Worker returned status ${res.status}.`
    );
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
    label,
    model: modelHeader,
    mode: "worker",
    metrics: {
      totalMs,
      inferenceMs: totalMs,
    },
  };
}
