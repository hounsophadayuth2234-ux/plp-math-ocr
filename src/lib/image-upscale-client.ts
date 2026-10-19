/**
 * Studio Image Upscale Client & Web Worker Bridge
 * Re-exports all core algorithms from image-upscale-engine
 * Dispatches work to image-upscale.worker.ts with seamless main-thread fallback.
 */

import {
  calculateImageDiagnostics,
  runImageUpscalePipeline,
  UpscaleOptions,
  UpscaleResult,
  ImageDiagnostics,
} from "./image-upscale-engine";

export * from "./image-upscale-engine";

// ---------------------------------------------------------------------------
// CLIENT STUDIO INTERFACE (WORKER WITH SEAMLESS MAIN-THREAD FALLBACK)
// ---------------------------------------------------------------------------

export async function upscaleImageStudio(
  imageSource: File | Blob,
  options: UpscaleOptions
): Promise<UpscaleResult> {
  const startTime = performance.now();

  // Load image to HTML5 Image
  const imgUrl = URL.createObjectURL(imageSource);
  const img = new Image();

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Unable to decode input image."));
    img.src = imgUrl;
  });

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  // Extract source ImageData
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
  if (!srcCtx) {
    URL.revokeObjectURL(imgUrl);
    throw new Error("Failed to initialize 2D canvas context.");
  }

  srcCtx.drawImage(img, 0, 0);
  const srcImageData = srcCtx.getImageData(0, 0, srcW, srcH);
  URL.revokeObjectURL(imgUrl);

  let outputData: Uint8ClampedArray = srcImageData.data;
  let outW = srcW * options.scale;
  let outH = srcH * options.scale;
  let diagnostics: ImageDiagnostics | null = null;

  // Try Web Worker first
  let workerSucceeded = false;
  if (typeof Worker !== "undefined" && typeof window !== "undefined") {
    try {
      const workerResult = await executeInWorker(srcImageData, options);
      outputData = workerResult.data;
      outW = workerResult.width;
      outH = workerResult.height;
      diagnostics = workerResult.diagnostics;
      workerSucceeded = true;
    } catch (workerErr) {
      if (options.signal?.aborted) {
        throw workerErr;
      }
      console.warn(
        "[image-upscale-client] Web Worker failed or interrupted; falling back to main-thread execution:",
        workerErr
      );
    }
  }

  // Fallback to main-thread pipeline if worker failed or unavailable
  if (!workerSucceeded) {
    const pipelineResult = await runImageUpscalePipeline(srcImageData, options);
    outputData = pipelineResult.data;
    outW = pipelineResult.width;
    outH = pipelineResult.height;
    diagnostics = pipelineResult.diagnostics;
  }

  // Export to Canvas & Blob
  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) {
    throw new Error("Failed to initialize output 2D canvas context.");
  }

  const finalImgData = outCtx.createImageData(outW, outH);
  finalImgData.data.set(outputData);
  outCtx.putImageData(finalImgData, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    outCanvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to export output image to Blob."));
      },
      "image/png",
      0.95
    );
  });

  const outputUrl = URL.createObjectURL(blob);
  const elapsedMs = Math.round(performance.now() - startTime);

  return {
    outputUrl,
    blob,
    srcWidth: srcW,
    srcHeight: srcH,
    outputWidth: outW,
    outputHeight: outH,
    scale: options.scale,
    diagnostics: diagnostics || calculateImageDiagnostics(srcImageData),
    elapsedMs,
    label: "Studio Super-Resolution Engine",
    model: `Studio Super-Resolution (${options.scale}x · PDE Shock · Stepped Pyramid)`,
  };
}

// ---------------------------------------------------------------------------
// WEB WORKER DISPATCHER
// ---------------------------------------------------------------------------

function executeInWorker(
  srcImageData: ImageData,
  options: UpscaleOptions
): Promise<{
  data: Uint8ClampedArray;
  width: number;
  height: number;
  diagnostics: ImageDiagnostics;
}> {
  return new Promise((resolve, reject) => {
    let worker: Worker | null = null;

    try {
      worker = new Worker(new URL("../workers/image-upscale.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch (e) {
      reject(e);
      return;
    }

    const cleanup = () => {
      if (worker) {
        worker.terminate();
        worker = null;
      }
    };

    if (options.signal) {
      if (options.signal.aborted) {
        cleanup();
        reject(new Error("Upscaling aborted by user."));
        return;
      }
      options.signal.addEventListener(
        "abort",
        () => {
          if (worker) {
            worker.postMessage({ type: "ABORT" });
          }
          cleanup();
          reject(new Error("Upscaling aborted by user."));
        },
        { once: true }
      );
    }

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg) return;

      if (msg.type === "PROGRESS") {
        options.onProgress?.(msg.progress);
      } else if (msg.type === "SUCCESS") {
        cleanup();
        resolve({
          data: new Uint8ClampedArray(msg.buffer),
          width: msg.width,
          height: msg.height,
          diagnostics: msg.diagnostics,
        });
      } else if (msg.type === "ERROR") {
        cleanup();
        reject(new Error(msg.error || "Web Worker execution failed."));
      }
    };

    worker.onerror = (errEvent) => {
      cleanup();
      reject(new Error(errEvent.message || "Web Worker runtime error."));
    };

    // Send transferable array buffer to worker
    const buffer = srcImageData.data.buffer.slice(0);
    worker.postMessage(
      {
        type: "START",
        buffer,
        width: srcImageData.width,
        height: srcImageData.height,
        options: {
          scale: options.scale,
          preset: options.preset,
          faceEnhance: options.faceEnhance,
          sharpness: options.sharpness,
          denoise: options.denoise,
          clarity: options.clarity,
          shockFilterStrength: options.shockFilterStrength,
          ultraReconstruction: options.ultraReconstruction,
        },
      },
      [buffer]
    );
  });
}
