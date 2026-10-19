/**
 * Application-Owned Web Worker Lifecycle Manager
 * Handles job dispatch, progress forwarding, WebGPU/WASM negotiation, and hard cancellation via worker.terminate()
 */

export interface WorkerProgressEvent {
  key: string;
  current: number;
  total: number;
}

export interface WorkerExecutionResult {
  resultBlob: Blob;
  backend: "WebGPU" | "WASM";
  webGpuAvailable: boolean;
  fallbackReason?: string;
  wasmSimd?: boolean;
  wasmThreads?: number;
}

class BgWorkerManager {
  private worker: Worker | null = null;
  private activeJobId: string | null = null;
  private jobCounter = 0;

  /**
   * Spawns or returns existing Web Worker
   */
  private getWorker(): Worker {
    if (!this.worker) {
      if (typeof window === "undefined" || typeof Worker === "undefined") {
        throw new Error("Web Workers are not supported in this environment.");
      }
      this.worker = new Worker(
        new URL("../workers/bg-remover.worker.ts", import.meta.url),
        { type: "module" }
      );
    }
    return this.worker;
  }

  private isPreloaded = false;

  /**
   * Preloads AI model weights and WASM runtime into idle worker
   */
  public preloadModel(model: "isnet_fp16" | "isnet_quint8" | "isnet" = "isnet_fp16"): void {
    if (this.isPreloaded) return;
    try {
      const worker = this.getWorker();
      worker.postMessage({
        type: "PRELOAD",
        model,
      });
      this.isPreloaded = true;
    } catch (err) {
      console.warn("[bgWorkerManager] Preload postMessage skipped:", err);
    }
  }

  /**
   * Returns true if worker instance is active and warm in memory
   */
  public isModelCached(): boolean {
    return this.worker !== null;
  }

  /**
   * Terminate active worker to immediately abort running inference on CPU/WASM
   */
  public terminateActiveWorker(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (err) {
        console.warn("Worker termination error:", err);
      }
      this.worker = null;
      this.activeJobId = null;
      this.isPreloaded = false;
    }
  }

  /**
   * Run background removal inference inside the application worker with WebGPU detection and WASM fallback
   */
  public async executeJob(
    imageBlob: Blob,
    model: "isnet_fp16" | "isnet_quint8" | "isnet",
    onProgress?: (event: WorkerProgressEvent) => void,
    signal?: AbortSignal,
    options?: { preferWebGpu?: boolean }
  ): Promise<WorkerExecutionResult> {
    if (signal?.aborted) {
      const err = new Error("Aborted by user.");
      err.name = "AbortError";
      throw err;
    }

    // Terminate any running worker job to prevent concurrency overlap, but preserve idle worker for model cache
    if (this.activeJobId) {
      this.terminateActiveWorker();
    }

    const jobId = `job_${Date.now()}_${++this.jobCounter}`;
    this.activeJobId = jobId;

    const worker = this.getWorker();

    return new Promise<WorkerExecutionResult>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        settled = true;
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
        if (this.activeJobId === jobId) {
          this.activeJobId = null;
        }
      };

      const onAbort = () => {
        if (settled) return;
        cleanup();
        this.terminateActiveWorker();
        const err = new Error("Aborted by user.");
        err.name = "AbortError";
        reject(err);
      };

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      worker.onmessage = (e: MessageEvent) => {
        if (settled) return;
        const data = e.data;
        if (data.jobId !== jobId) return;

        if (data.type === "PROGRESS") {
          onProgress?.({
            key: data.key,
            current: data.current,
            total: data.total,
          });
        } else if (data.type === "COMPLETE") {
          cleanup();
          resolve({
            resultBlob: data.resultBlob,
            backend: data.backend || "WASM",
            webGpuAvailable: Boolean(data.webGpuAvailable),
            fallbackReason: data.fallbackReason,
            wasmSimd: data.wasmSimd ?? true,
            wasmThreads: data.wasmThreads ?? 1,
          });
        } else if (data.type === "ERROR") {
          cleanup();
          this.terminateActiveWorker();
          reject(new Error(data.error || "Worker inference error."));
        }
      };

      worker.onerror = (err: ErrorEvent) => {
        if (settled) return;
        cleanup();
        this.terminateActiveWorker();
        reject(new Error(`Worker execution failed: ${err.message || "Unknown error"}`));
      };

      // Dispatch job to worker
      worker.postMessage({
        type: "START",
        jobId,
        imageBlob,
        model,
        preferWebGpu: options?.preferWebGpu !== false,
      });
    });
  }
}

export const bgWorkerManager = new BgWorkerManager();
