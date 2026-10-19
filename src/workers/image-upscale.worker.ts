/**
 * Web Worker for Studio Image Super-Resolution & Restoration Pipeline
 * Runs heavy pixel array math off the main thread with transferable ArrayBuffers.
 */

import {
  runImageUpscalePipeline,
  UpscaleOptions,
  UpscaleProgress,
} from "../lib/image-upscale-client";

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
    try {
      const { buffer, width, height, options } = data;
      const srcArray = new Uint8ClampedArray(buffer);

      const abortSignal = {
        get aborted() {
          return isAborted;
        },
      } as unknown as AbortSignal;

      const pipelineOptions: UpscaleOptions = {
        ...options,
        signal: abortSignal,
        onProgress: (progress: UpscaleProgress) => {
          self.postMessage({
            type: "PROGRESS",
            progress,
          });
        },
      };

      const result = await runImageUpscalePipeline(
        { data: srcArray, width, height },
        pipelineOptions
      );

      if (isAborted) {
        self.postMessage({ type: "ERROR", error: "Upscaling aborted by user." });
        return;
      }

      // Transfer ArrayBuffer back to main thread for zero-copy performance
      const outBuffer = result.data.buffer;
      self.postMessage(
        {
          type: "SUCCESS",
          buffer: outBuffer,
          width: result.width,
          height: result.height,
          diagnostics: result.diagnostics,
        },
        // @ts-expect-error Transferable postMessage
        [outBuffer]
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({
        type: "ERROR",
        error: message,
      });
    }
  }
};
