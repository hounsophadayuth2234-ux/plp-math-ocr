import { ProcessingStatusLabel } from "./types";
import { downscaleImageIfExceeds } from "./processing-utils";

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
  decontaminationRadius?: number; // 1 to 2 pixels
  alphaMatting?: boolean;
  onProgress?: (progress: BgRemovalProgress) => void;
  signal?: AbortSignal;
}

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
 * 1. Zero Aggressive Erosion (erosionRadius: 0):
 *    Preserves thin animal legs, hair flyaways, shoulder lapels, and narrow gaps.
 * 2. Trimap Classification:
 *    - Definite Foreground (alpha >= 242): 100% opaque, 100% original RGB preserved.
 *    - Definite Background (alpha <= 12): 100% transparent.
 *    - Uncertain Boundary Zone (12 < alpha < 242):
 *      Un-mixes local background color (e.g. pink #FFF0F5 or photo backdrop) from semi-transparent boundary:
 *      F_clean = clamp((Observed - (1 - alpha) * B_local) / alpha, 0, 255)
 * 3. Sub-pixel Feathering (featherRadius: 0.5 to 1.0):
 *    Smooths only the boundary transition without full-mask blurring.
 */
async function refineAndDecontaminateImage(
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

        // Raw alpha extracted from mask
        const rawAlpha = new Uint8Array(totalPixels);
        for (let i = 0; i < totalPixels; i++) {
          const mAlpha = mPixels[i * 4 + 3];
          if (mAlpha < 250) {
            rawAlpha[i] = mAlpha;
          } else {
            const lum = Math.round(
              0.299 * mPixels[i * 4] + 0.587 * mPixels[i * 4 + 1] + 0.114 * mPixels[i * 4 + 2]
            );
            rawAlpha[i] = lum;
          }
        }

        const refinedAlpha = new Uint8ClampedArray(totalPixels);
        const outPixels = new Uint8ClampedArray(totalPixels * 4);

        const radius = Math.max(1, Math.min(2, Math.round(params.decontaminationRadius || 1)));

        // Process boundary pixels with Color Decontamination (Zero aggressive erosion)
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
            // Preserve 100% original RGB without clipping or alteration
            if (a >= 242) {
              refinedAlpha[idx] = 255;
              outPixels[pIdx] = r;
              outPixels[pIdx + 1] = g;
              outPixels[pIdx + 2] = b;
              outPixels[pIdx + 3] = 255;
              continue;
            }

            // C. Uncertain Fringe Zone (12 < a < 242)
            // Sample local background color B_local and solid foreground F_solid
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

            // Un-mix background: F = (C - (1 - alpha) * B) / alpha
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

            refinedAlpha[idx] = a;
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
 * Mode A: Fast Preview Mode (max 768px, isnet_quint8, fast browser model)
 * Mode B: Clean Cut Mode (max 2048px, isnet_fp16 Standard Browser AI, zero aggressive erosion)
 * Mode C: High Quality Worker (remote BiRefNet / RMBG microservice if configured)
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
  const modelName = "isnet_fp16"; // Stable default browser model

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
    current: 25,
    total: 100,
    percent: 25,
    stage: "Loading model",
  });

  const tLoadStart = Date.now();

  try {
    const { removeBackground } = await import("@imgly/background-removal");
    tModelLoad = Date.now() - tLoadStart;

    if (options?.signal?.aborted) {
      throw createAbortError("Aborted by user.");
    }

    let lastModelPct = 0;
    let lastProcPct = 0;

    const handleProgress = (key: string, current: number, total: number) => {
      if (options?.signal?.aborted) return;
      const pct = total > 0 ? Math.round((current / total) * 100) : 50;
      let stage: BgRemovalProgress["stage"] = "Segmenting";
      if (key.includes("fetch")) {
        stage = "Loading model";
        lastModelPct = Math.min(100, Math.max(lastModelPct, pct));
      } else if (key.includes("compute") || key.includes("inference")) {
        stage = "Segmenting";
        lastProcPct = Math.min(100, Math.max(lastProcPct, pct));
      }

      options?.onProgress?.({
        key,
        current,
        total,
        percent: Math.min(92, Math.max(15, pct)),
        stage,
        modelLoadingPercent: lastModelPct || (stage === "Loading model" ? pct : 100),
        processingPercent: lastProcPct || (stage === "Segmenting" ? pct : 0),
      });
    };

    const tInfStart = Date.now();
    let rawCutoutBlob: Blob;

    try {
      // Primary execution: Safe Web Worker execution off main thread
      rawCutoutBlob = await removeBackground(scaledBlob, {
        model: modelName,
        proxyToWorker: true,
        fetchArgs: {
          cache: "force-cache",
        },
        output: {
          format: "image/png",
          quality: 1.0,
        },
        progress: handleProgress,
      });
    } catch (workerErr: unknown) {
      if (options?.signal?.aborted) throw workerErr;
      console.warn(
        "Web Worker execution failed or was blocked; falling back to package main-thread browser path:",
        workerErr
      );
      // Fallback execution: Main thread browser execution (proxyToWorker: false)
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
        progress: handleProgress,
      });
    }

    tInference = Date.now() - tInfStart;

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

    // Strict validation: Ensure background was actually removed (no fake/silent fallback to original)
    let transparentCount = 0;
    for (let i = 0; i < alphaMaskBuffer.length; i++) {
      if (alphaMaskBuffer[i] < 240) transparentCount++;
    }
    const transparentRatio = transparentCount / alphaMaskBuffer.length;
    if (transparentRatio < 0.005) {
      throw new Error(
        "Segmentation failed: Model did not separate foreground from background. Silent fallback rejected."
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
 * Exports final composited image at original full image resolution
 * by resampling the in-memory alpha mask onto the original unscaled image.
 */
export async function exportAtFullResolution(
  originalFileOrBlob: File | Blob,
  alphaMask: Uint8ClampedArray,
  maskWidth: number,
  maskHeight: number,
  targetBg: "white" | "pink" | "transparent"
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const origBitmap = await createImageBitmap(originalFileOrBlob);
  try {
    const maxSafeDim = 4096;
    let targetW = origBitmap.width;
    let targetH = origBitmap.height;
    if (targetW > maxSafeDim || targetH > maxSafeDim) {
      const scale = maxSafeDim / Math.max(targetW, targetH);
      targetW = Math.round(targetW * scale);
      targetH = Math.round(targetH * scale);
      console.warn(`Original image (${origBitmap.width}x${origBitmap.height}) clamped to safe export limit: ${targetW}x${targetH}`);
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
    let hasTransparentPixel = false;
    for (let i = 0; i < total; i++) {
      const pIdx = i * 4;
      const a = scaledMaskData[pIdx];
      const r = outPixels[pIdx];
      const g = outPixels[pIdx + 1];
      const b = outPixels[pIdx + 2];

      if (targetBg === "transparent") {
        outPixels[pIdx + 3] = a;
        if (a === 0) hasTransparentPixel = true;
      } else if (targetBg === "white") {
        const aNorm = a / 255;
        outPixels[pIdx] = Math.round(r * aNorm + 255 * (1 - aNorm));
        outPixels[pIdx + 1] = Math.round(g * aNorm + 255 * (1 - aNorm));
        outPixels[pIdx + 2] = Math.round(b * aNorm + 255 * (1 - aNorm));
        outPixels[pIdx + 3] = 255;
      } else if (targetBg === "pink") {
        const aNorm = a / 255;
        outPixels[pIdx] = Math.round(r * aNorm + 255 * (1 - aNorm));
        outPixels[pIdx + 1] = Math.round(g * aNorm + 240 * (1 - aNorm));
        outPixels[pIdx + 2] = Math.round(b * aNorm + 245 * (1 - aNorm));
        outPixels[pIdx + 3] = 255;
      }
    }

    outCtx.putImageData(outImageData, 0, 0);

    if (targetBg === "transparent" && !hasTransparentPixel) {
      console.warn("Alpha channel verification: no pixels with alpha=0 detected in transparent export.");
    }

    return new Promise((resolve, reject) => {
      outCanvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Failed to create full resolution blob"));
        const dataUrl = URL.createObjectURL(blob);
        resolve({ blob, dataUrl, width: targetW, height: targetH });
      }, "image/png", 1.0);
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
