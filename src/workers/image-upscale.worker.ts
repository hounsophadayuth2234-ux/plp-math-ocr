/**
 * Web Worker for Studio Image Super-Resolution & Restoration Pipeline
 * Runs heavy pixel array math off the main thread with transferable ArrayBuffers.
 * Imports ONLY pure algorithms from image-upscale-engine with zero circular dependencies.
 */

import {
  runImageUpscalePipeline,
  UpscaleOptions,
  UpscaleProgress,
} from "../lib/image-upscale-engine";

let isAborted = false;

self.onmessage = async (e: MessageEvent) => {
  const data = e.data;
  if (!data) return;

  if (data.type === "ABORT") {
    isAborted = true;
    return;
  }

  if (data.type === "START") {
    isAborted = false;
    const { jobId, buffer, width, height, options, config } = data;
    try {
      const srcArray = new Uint8ClampedArray(buffer);

      const abortSignal = {
        get aborted() {
          return isAborted;
        },
      } as unknown as AbortSignal;

      const requestedScale = config?.factor ?? options?.scale ?? 2;
      const pipelineOptions: UpscaleOptions = {
        ...options,
        scale: requestedScale,
        signal: abortSignal,
        jobId,
        config,
        onProgress: (progress: UpscaleProgress) => {
          self.postMessage({
            type: "PROGRESS",
            jobId,
            progress,
          });
        },
      };

      const result = await runImageUpscalePipeline(
        { data: srcArray, width, height },
        pipelineOptions
      );

      if (isAborted) {
        self.postMessage({ type: "ERROR", jobId, error: "Upscaling aborted by user." });
        return;
      }

      // Calculate actual factor produced by the pipeline
      const actualFactor = Math.round(result.width / width);

      // Transfer ArrayBuffer back to main thread for zero-copy performance
      const outBuffer = result.data.buffer;
      self.postMessage(
        {
          type: "SUCCESS",
          jobId,
          buffer: outBuffer,
          width: result.width,
          height: result.height,
          factor: actualFactor,
          requestedFactor: requestedScale,
          engine: "Browser resize/sharpen",
          diagnostics: {
            ...result.diagnostics,
            actualEngine: "Browser resize/sharpen",
          },
        },
        // @ts-expect-error Transferable postMessage
        [outBuffer]
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({
        type: "ERROR",
        jobId,
        error: message,
      });
    }
  }
};
