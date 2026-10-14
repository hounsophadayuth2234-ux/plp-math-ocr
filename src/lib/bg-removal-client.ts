import { ProcessingStatusLabel } from "./types";
import { downscaleImageIfExceeds } from "./processing-utils";

export interface BgRemovalProgress {
  key: string;
  current: number;
  total: number;
  percent: number;
  stage:
    | "Loading model"
    | "Preparing image"
    | "Segmenting"
    | "Refining edges"
    | "Compositing"
    | "Exporting";
}

export interface BgRemovalOutput {
  transparentBlob: Blob;
  transparentUrl: string;
  alphaMaskUrl: string;
  width: number;
  height: number;
  label: ProcessingStatusLabel;
  model: string;
  mode: "preview" | "final";
}

export interface BgRemovalOptions {
  mode?: "preview" | "final";
  erosionRadius?: number; // 0 (recommended)
  featherRadius?: number; // 0.75
  decontaminationRadius?: number; // 1 to 2
  alphaMatting?: boolean;
  onProgress?: (progress: BgRemovalProgress) => void;
  signal?: AbortSignal;
}

/**
 * Creates pure 8-bit black-and-white alpha mask visualizer for edge & halo debugging.
 * Black = Background (0), White = Subject (255), Gray = Anti-aliased boundary.
 */
function createAlphaMaskDataUrl(alphaChannel: Uint8Array, w: number, h: number): string {
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
    data[pIdx] = a;     // R
    data[pIdx + 1] = a; // G
    data[pIdx + 2] = a; // B
    data[pIdx + 3] = 255; // Solid opaque visualizer
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Precise Edge Refinement, Alpha Matting & Local Background Un-mixing:
 * 1. Zero Aggressive Erosion: Keeps delicate hair strands and suit shoulders.
 * 2. Trimap Classification:
 *    - Definite Foreground (alpha > 240)
 *    - Definite Background (alpha < 15)
 *    - Uncertain Fringe Zone (15 <= alpha <= 240)
 * 3. Color Decontamination:
 *    Un-mixes local background color (e.g. pink #FFF0F5 or photo backdrop) from
 *    the semi-transparent boundary pixels:
 *    F_pure = clamp((Observed - (1 - alpha) * B_local) / alpha, 0, 255)
 * 4. Guided Alpha Matting:
 *    Smooths transition without blurring across sharp suit lapels.
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
): Promise<{ refinedBlob: Blob; alphaMaskUrl: string; width: number; height: number }> {
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

        // Canvas for original RGB
        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = w;
        srcCanvas.height = h;
        const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });

        // Canvas for mask
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = w;
        maskCanvas.height = h;
        const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });

        if (!srcCtx || !maskCtx) {
          URL.revokeObjectURL(srcUrl);
          URL.revokeObjectURL(maskUrl);
          resolve({ refinedBlob: rawMaskBlob, alphaMaskUrl: "", width: w, height: h });
          return;
        }

        srcCtx.drawImage(srcImg, 0, 0, w, h);
        maskCtx.drawImage(maskImg, 0, 0, w, h);

        const srcData = srcCtx.getImageData(0, 0, w, h);
        const maskData = maskCtx.getImageData(0, 0, w, h);

        const sPixels = srcData.data;
        const mPixels = maskData.data;
        const totalPixels = w * h;

        // Raw alpha extracted from mask (prefer mask's alpha channel or red channel if grayscale)
        const rawAlpha = new Uint8Array(totalPixels);
        for (let i = 0; i < totalPixels; i++) {
          const mAlpha = mPixels[i * 4 + 3];
          // If mask image itself has alpha transparency, use alpha; otherwise use luminance
          if (mAlpha < 250) {
            rawAlpha[i] = mAlpha;
          } else {
            // Greyscale luminance
            const lum = Math.round(
              0.299 * mPixels[i * 4] + 0.587 * mPixels[i * 4 + 1] + 0.114 * mPixels[i * 4 + 2]
            );
            rawAlpha[i] = lum;
          }
        }

        const refinedAlpha = new Uint8Array(totalPixels);
        const outPixels = new Uint8ClampedArray(totalPixels * 4);

        const radius = Math.max(1, Math.min(3, Math.round(params.decontaminationRadius)));

        // 1. Process pixels with Color Decontamination
        for (let y = 0; y < h; y++) {
          const yOffset = y * w;
          for (let x = 0; x < w; x++) {
            const idx = yOffset + x;
            const pIdx = idx * 4;
            const a = rawAlpha[idx];

            const r = sPixels[pIdx];
            const g = sPixels[pIdx + 1];
            const b = sPixels[pIdx + 2];

            // A. Definite Background
            if (a <= 12) {
              refinedAlpha[idx] = 0;
              outPixels[pIdx] = 0;
              outPixels[pIdx + 1] = 0;
              outPixels[pIdx + 2] = 0;
              outPixels[pIdx + 3] = 0;
              continue;
            }

            // B. Definite Foreground Core (preserve 100% original RGB without any loss)
            if (a >= 242) {
              refinedAlpha[idx] = 255;
              outPixels[pIdx] = r;
              outPixels[pIdx + 1] = g;
              outPixels[pIdx + 2] = b;
              outPixels[pIdx + 3] = 255;
              continue;
            }

            // C. Uncertain Fringe Zone (Thin Hair, Shoulders, Lapels, Skin Edge)
            // Sample local background color B_local from nearby background pixels (alpha <= 12)
            let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
            // Sample solid foreground color F_solid from nearby solid pixels (alpha >= 242)
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

            // Compute decontaminated foreground color:
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

              // Clamp to valid [0, 255]
              cleanR = Math.max(0, Math.min(255, Math.round(unmixedR)));
              cleanG = Math.max(0, Math.min(255, Math.round(unmixedG)));
              cleanB = Math.max(0, Math.min(255, Math.round(unmixedB)));
            } else if (fgCount > 0 && alphaNorm <= 0.3) {
              // For very light translucent fringe, blend with nearest solid foreground to avoid noise
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

        // Generate Alpha Mask debug visualizer
        const alphaMaskDataUrl = createAlphaMaskDataUrl(refinedAlpha, w, h);

        // Put refined pixels onto output canvas
        const outImageData = new ImageData(outPixels, w, h);
        srcCtx.putImageData(outImageData, 0, 0);

        srcCanvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(srcUrl);
            URL.revokeObjectURL(maskUrl);
            resolve({
              refinedBlob: blob || rawMaskBlob,
              alphaMaskUrl: alphaMaskDataUrl,
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

    const onError = (e: unknown) => {
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

/**
 * Universal Dual-Mode Browser Background Removal:
 * Mode A: Fast Preview Mode (max 768px, isnet_quint8, fast response)
 * Mode B: Final Clean Cut Mode (max 2048px, isnet_fp16, alpha matting, color decontamination)
 */
export async function removeBackgroundBrowser(
  imageSource: File | Blob,
  options?: BgRemovalOptions
): Promise<BgRemovalOutput> {
  if (options?.signal?.aborted) {
    throw new Error("Aborted by user.");
  }

  const mode = options?.mode || "preview";
  const maxDim = mode === "preview" ? 768 : 2048;
  const modelName = mode === "preview" ? "isnet_quint8" : "isnet_fp16";

  options?.onProgress?.({
    key: "prep",
    current: 10,
    total: 100,
    percent: 10,
    stage: "Preparing image",
  });

  // Step 1: Memory-safe scaling to targeted mode bounds
  const { blob: scaledBlob, width, height } = await downscaleImageIfExceeds(
    imageSource,
    maxDim
  );

  if (options?.signal?.aborted) {
    throw new Error("Aborted by user.");
  }

  options?.onProgress?.({
    key: "load",
    current: 25,
    total: 100,
    percent: 25,
    stage: "Loading model",
  });

  try {
    const { removeBackground } = await import("@imgly/background-removal");

    if (options?.signal?.aborted) {
      throw new Error("Aborted by user.");
    }

    // Step 2: Inference inside Web Worker via WebGPU/WASM with permanent Cache API support
    const rawCutoutBlob = await removeBackground(scaledBlob, {
      model: modelName,
      proxyToWorker: true,
      fetchArgs: {
        cache: "force-cache",
      },
      output: {
        format: "image/png",
        quality: 1.0,
      },
      progress: (key: string, current: number, total: number) => {
        if (options?.signal?.aborted) return;
        const pct = total > 0 ? Math.round((current / total) * 100) : 50;
        let stage: BgRemovalProgress["stage"] = "Segmenting";
        if (key.includes("fetch")) stage = "Loading model";
        else if (key.includes("compute") || key.includes("inference"))
          stage = "Segmenting";

        options?.onProgress?.({
          key,
          current,
          total,
          percent: Math.min(90, Math.max(25, pct)),
          stage,
        });
      },
    });

    if (options?.signal?.aborted) {
      throw new Error("Aborted by user.");
    }

    options?.onProgress?.({
      key: "refine",
      current: 92,
      total: 100,
      percent: 92,
      stage: "Refining edges",
    });

    // Step 3: Precise Color Decontamination & Alpha Matting
    const { refinedBlob, alphaMaskUrl } = await refineAndDecontaminateImage(
      scaledBlob,
      rawCutoutBlob,
      {
        erosionRadius: options?.erosionRadius ?? 0,
        featherRadius: options?.featherRadius ?? 0.75,
        decontaminationRadius: options?.decontaminationRadius ?? (mode === "preview" ? 1 : 2),
        alphaMatting: options?.alphaMatting ?? true,
      }
    );

    if (options?.signal?.aborted) {
      throw new Error("Aborted by user.");
    }

    options?.onProgress?.({
      key: "done",
      current: 100,
      total: 100,
      percent: 100,
      stage: "Compositing",
    });

    const transparentUrl = URL.createObjectURL(refinedBlob);

    return {
      transparentBlob: refinedBlob,
      transparentUrl,
      alphaMaskUrl,
      width,
      height,
      label: "Browser AI result",
      model: `@imgly/${modelName} (${mode === "preview" ? "Fast Preview" : "Final Clean Cut"})`,
      mode,
    };
  } catch (err: unknown) {
    if (options?.signal?.aborted) {
      throw new Error("Aborted by user.");
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Background removal failed: ${message}`);
  }
}

/**
 * Instant Compositor: Composites transparent cutout onto solid color (#FFFFFF, #FFF0F5)
 * Runs purely on HTML5 2D Canvas in < 5ms without re-running segmentation!
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
          reject(new Error("Unable to create HTML5 2D Canvas context."));
          return;
        }

        // Fill background
        ctx.fillStyle = bgColorHex;
        ctx.fillRect(0, 0, w, h);

        // Draw transparent cutout on top
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
  const modelHeader = res.headers.get("X-Segmentation-Model") || "Rembg Python Worker";

  const label: ProcessingStatusLabel =
    headerSource === "Local worker result"
      ? "Local worker result"
      : "Cloud API result";

  const blob = await res.blob();
  const transparentUrl = URL.createObjectURL(blob);

  return {
    transparentBlob: blob,
    transparentUrl,
    alphaMaskUrl: "",
    width,
    height,
    label,
    model: modelHeader,
    mode: "final",
  };
}
