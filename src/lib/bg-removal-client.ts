import { ProcessingStatusLabel, AppError } from "./types";
import { downscaleImageIfExceeds } from "./processing-utils";

export interface BgRemovalProgress {
  key: string;
  current: number;
  total: number;
  percent: number;
  stage: string;
}

export interface BgRemovalOutput {
  transparentBlob: Blob;
  width: number;
  height: number;
  label: ProcessingStatusLabel;
  model: string;
}

/**
 * 2-Pass Edge Refinement & Color Decontamination:
 * Removes fringing/halo from segment boundary by decontaminating semi-transparent
 * pixels with color bled from solid interior pixels.
 */
async function refineForegroundEdges(rawBlob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(rawBlob);
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(rawBlob);
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        const totalPixels = w * h;

        const originalAlpha = new Uint8Array(totalPixels);
        for (let i = 0; i < totalPixels; i++) {
          originalAlpha[i] = data[i * 4 + 3];
        }

        // Color decontamination for fringe pixels (alpha between 15 and 240)
        for (let y = 0; y < h; y++) {
          const yOffset = y * w;
          for (let x = 0; x < w; x++) {
            const idx = yOffset + x;
            const a = originalAlpha[idx];

            if (a > 15 && a < 240) {
              let sR = 0;
              let sG = 0;
              let sB = 0;
              let sCount = 0;

              for (let dy = -2; dy <= 2; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= h) continue;
                const nOffset = ny * w;
                for (let dx = -2; dx <= 2; dx++) {
                  const nx = x + dx;
                  if (nx < 0 || nx >= w) continue;
                  const nIdx = nOffset + nx;
                  if (originalAlpha[nIdx] >= 240) {
                    sR += data[nIdx * 4];
                    sG += data[nIdx * 4 + 1];
                    sB += data[nIdx * 4 + 2];
                    sCount++;
                  }
                }
              }

              if (sCount > 0) {
                const avgR = sR / sCount;
                const avgG = sG / sCount;
                const avgB = sB / sCount;
                const blend = Math.pow(1 - a / 255, 1.2);
                data[idx * 4] = Math.round(data[idx * 4] * (1 - blend) + avgR * blend);
                data[idx * 4 + 1] = Math.round(data[idx * 4 + 1] * (1 - blend) + avgG * blend);
                data[idx * 4 + 2] = Math.round(data[idx * 4 + 2] * (1 - blend) + avgB * blend);
              }
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          resolve(blob || rawBlob);
        }, "image/png");
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve(rawBlob);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(rawBlob);
    };

    img.src = objectUrl;
  });
}

/**
 * Browser-First Background Removal using @imgly/background-removal:
 * - Runs 100% locally in-browser via WebGPU/WASM Web Worker.
 * - Zero server cost and zero third-party API dependencies.
 * - Automatically downscales large images (> 1200px) to memory-safe bounds to prevent browser crashes.
 * - Refines mask edges with color decontamination.
 */
export async function removeBackgroundBrowser(
  imageSource: File | Blob,
  options?: {
    onProgress?: (progress: BgRemovalProgress) => void;
    signal?: AbortSignal;
  }
): Promise<BgRemovalOutput> {
  if (options?.signal?.aborted) {
    throw new Error("Aborted by user.");
  }

  // 1. Memory-safe downscaling before sending into Web Worker / WASM
  const { blob: safeBlob, width, height } = await downscaleImageIfExceeds(
    imageSource,
    1200
  );

  if (options?.signal?.aborted) {
    throw new Error("Aborted by user.");
  }

  options?.onProgress?.({
    key: "init",
    current: 10,
    total: 100,
    percent: 10,
    stage: "INITIALIZING BROWSER NEURAL RUNTIME...",
  });

  try {
    const { removeBackground } = await import("@imgly/background-removal");

    if (options?.signal?.aborted) {
      throw new Error("Aborted by user.");
    }

    const rawBlob = await removeBackground(safeBlob, {
      model: "isnet_quint8",
      proxyToWorker: true,
      output: {
        format: "image/png",
        quality: 0.95,
      },
      progress: (key: string, current: number, total: number) => {
        if (options?.signal?.aborted) return;
        const pct = total > 0 ? Math.round((current / total) * 100) : 50;
        let stage = "PROCESSING INFERENCE...";
        if (key.includes("fetch")) stage = `DOWNLOADING MODEL WEIGHTS (${pct}%)...`;
        else if (key.includes("compute") || key.includes("inference"))
          stage = `RUNNING LOCAL SEGMENTATION (${pct}%)...`;

        options?.onProgress?.({
          key,
          current,
          total,
          percent: pct,
          stage,
        });
      },
    });

    if (options?.signal?.aborted) {
      throw new Error("Aborted by user.");
    }

    options?.onProgress?.({
      key: "refine",
      current: 95,
      total: 100,
      percent: 95,
      stage: "REFINING MASK EDGES & ALPHA DECONTAMINATION...",
    });

    // 2. Refine edges
    const refinedBlob = await refineForegroundEdges(rawBlob);

    return {
      transparentBlob: refinedBlob,
      width,
      height,
      label: "Browser AI result",
      model: "@imgly/isnet_quint8 (Browser WebGPU/WASM)",
    };
  } catch (err: unknown) {
    if (options?.signal?.aborted) {
      throw new Error("Aborted by user.");
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Browser AI segmentation failed: ${message}. If your device has limited memory, try a smaller image or use Remote Worker mode.`
    );
  }
}

/**
 * Remote Worker / Server Background Removal:
 * Sends image to /api/remove-bg which proxies to custom Rembg Space or local worker.
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

  return {
    transparentBlob: blob,
    width,
    height,
    label,
    model: modelHeader,
  };
}

/**
 * Composites the transparent cutout blob onto an HTML5 Canvas:
 * 1. Sets canvas to natural dimensions.
 * 2. Fills solid background with either #FFFFFF (Question) or #FFF0F5 (Solution).
 * 3. Draws the transparent cutout subject on top.
 * 4. Exports high-resolution composite dataUrl and Blob for direct download.
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

        // 1. Fill solid background color (#FFFFFF or #FFF0F5)
        ctx.fillStyle = bgColorHex;
        ctx.fillRect(0, 0, w, h);

        // 2. Draw the transparent cutout subject on top
        ctx.drawImage(img, 0, 0, w, h);

        // 3. Export high-resolution PNG with solid color baked into the pixels
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
