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
  UpscaleScale,
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

  const requestedFactor = options.config?.factor ?? options.scale ?? 2;
  const normalizedOptions: UpscaleOptions = {
    ...options,
    scale: requestedFactor,
  };

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
  let outW = srcW * requestedFactor;
  let outH = srcH * requestedFactor;
  let diagnostics: ImageDiagnostics | null = null;
  let actualFactor: UpscaleScale = requestedFactor as UpscaleScale;

  // Try Web Worker first
  let workerSucceeded = false;
  if (typeof Worker !== "undefined" && typeof window !== "undefined") {
    try {
      const workerResult = await executeInWorker(srcImageData, normalizedOptions);
      outputData = workerResult.data;
      outW = workerResult.width;
      outH = workerResult.height;
      actualFactor = (workerResult.factor ?? Math.round(outW / srcW)) as UpscaleScale;
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
    const pipelineResult = await runImageUpscalePipeline(srcImageData, normalizedOptions);
    outputData = pipelineResult.data;
    outW = pipelineResult.width;
    outH = pipelineResult.height;
    actualFactor = Math.round(outW / srcW) as UpscaleScale;
    diagnostics = pipelineResult.diagnostics;
  }

  // Detect fallback condition
  const isFallback = actualFactor !== requestedFactor;
  const fallbackReason = isFallback
    ? `${requestedFactor}x unavailable — output generated at ${actualFactor}x`
    : undefined;

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

  const finalDiagnostics: ImageDiagnostics = diagnostics || calculateImageDiagnostics(srcImageData);
  finalDiagnostics.actualEngine = "Browser resize/sharpen";

  return {
    outputUrl,
    blob,
    srcWidth: srcW,
    srcHeight: srcH,
    outputWidth: outW,
    outputHeight: outH,
    scale: actualFactor, // Actual factor returned by the engine
    requestedScale: requestedFactor,
    isFallback,
    fallbackReason,
    diagnostics: finalDiagnostics,
    elapsedMs,
    label: "HD Resize & Sharpen",
    model: `HD Resize & Sharpen (${actualFactor}x · Lanczos-3 · PDE Shock)`,
    engine: "Browser resize/sharpen",
    jobId: options.jobId,
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
  factor: number;
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
            worker.postMessage({ type: "ABORT", jobId: options.jobId });
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

      // Ignore stale worker results from an earlier job
      if (options.jobId && msg.jobId && msg.jobId !== options.jobId) {
        console.warn(`[image-upscale-client] Discarding stale worker result from earlier job ${msg.jobId} (current: ${options.jobId})`);
        return;
      }

      if (msg.type === "PROGRESS") {
        options.onProgress?.(msg.progress);
      } else if (msg.type === "SUCCESS") {
        cleanup();
        resolve({
          data: new Uint8ClampedArray(msg.buffer),
          width: msg.width,
          height: msg.height,
          factor: msg.factor ?? Math.round(msg.width / srcImageData.width),
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
        jobId: options.jobId,
        buffer,
        width: srcImageData.width,
        height: srcImageData.height,
        config: options.config,
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
