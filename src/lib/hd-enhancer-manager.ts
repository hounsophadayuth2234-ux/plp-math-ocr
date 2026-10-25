/**
 * HD Resize & Sharpen Web Worker Manager
 * Offloads heavy Float32 Lanczos-3, Kuwahara, and Curvature Flow calculations to Web Worker.
 * Completely eliminates main-thread UI lag and browser freezing.
 */

import { UpscaleOptions, ImageDiagnostics } from "./image-upscale-engine";

class HdEnhancerWorkerManager {
  private worker: Worker | null = null;
  private activeJobId: string | null = null;

  private getWorker(): Worker {
    if (!this.worker) {
      if (typeof window === "undefined" || typeof Worker === "undefined") {
        throw new Error("Web Workers not supported in this environment.");
      }
      this.worker = new Worker(
        new URL("../workers/hd-enhancer.worker.ts", import.meta.url),
        { type: "module" }
      );
    }
    return this.worker;
  }

  public terminateActiveWorker(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {}
      this.worker = null;
      this.activeJobId = null;
    }
  }

  public async runInWorker(
    imageData: ImageData,
    options: UpscaleOptions
  ): Promise<{
    data: Uint8ClampedArray;
    width: number;
    height: number;
    diagnostics: ImageDiagnostics;
    backend?: string;
    model?: string;
    isNeuralAi?: boolean;
  }> {
    const worker = this.getWorker();
    const jobId = options.jobId || `hd_${Date.now()}`;
    this.activeJobId = jobId;

    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        settled = true;
        if (options.signal) {
          options.signal.removeEventListener("abort", onAbort);
        }
        if (this.activeJobId === jobId) {
          this.activeJobId = null;
        }
      };

      const onAbort = () => {
        if (settled) return;
        cleanup();
        this.terminateActiveWorker();
        const err = new Error("Enhancement aborted by user.");
        err.name = "AbortError";
        reject(err);
      };

      if (options.signal) {
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      worker.onmessage = (e: MessageEvent) => {
        if (settled) return;
        const msg = e.data;
        if (msg.jobId !== jobId) return;

        if (msg.type === "PROGRESS") {
          options.onProgress?.({
            stage: msg.stage,
            totalStages: msg.totalStages,
            stageName: msg.stageName,
            stageNameKh: msg.stageNameKh,
            percent: msg.percent,
          });
        } else if (msg.type === "COMPLETE") {
          cleanup();
          resolve({
            data: msg.data,
            width: msg.width,
            height: msg.height,
            diagnostics: msg.diagnostics,
            backend: msg.backend,
            model: msg.model,
            isNeuralAi: msg.isNeuralAi,
          });
        } else if (msg.type === "ERROR") {
          cleanup();
          this.terminateActiveWorker();
          reject(new Error(msg.error || "Enhancement failed in Web Worker."));
        }
      };

      worker.onerror = (err) => {
        if (settled) return;
        cleanup();
        this.terminateActiveWorker();
        reject(new Error(`Enhancer worker crashed: ${err.message || "Unknown error"}`));
      };

      const copy = new Uint8ClampedArray(imageData.data);
      worker.postMessage(
        {
          type: "START",
          jobId,
          data: copy,
          width: imageData.width,
          height: imageData.height,
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
        [copy.buffer]
      );
    });
  }
}

export const hdEnhancerWorkerManager = new HdEnhancerWorkerManager();
