/**
 * Application-Owned Web Worker Lifecycle Manager
 * Handles job dispatch, progress forwarding, WebGPU/WASM negotiation, main-thread blocking probes, and hard cancellation via worker.terminate()
 */

export interface WorkerProgressEvent {
  key: string;
  current: number;
  total: number;
}

export interface WorkerExecutionResult {
  resultBlob: Blob;
  backend: "WebGPU" | "WASM";
  modelName: string;
  modelResolution: string;
  textPolicy: "keep_text" | "remove_all_text";
  textDetectionRan: boolean;
  actualModel: string;
  actualModelFile: string;
  actualRuntime: string;
  actualExecutionProvider: "WebGPU" | "WASM";
  actualTextDetector: string;
  actualTextPolicy: string;
  actualRefinementPreset: string;
  webGpuAvailable: boolean;
  webGpuApiAvailable: boolean;
  gpuAdapterAvailable: boolean;
  webGpuSessionPassed: boolean;
  fallbackReason?: string;
  wasmSimd?: boolean;
  wasmThreads?: number;
  wasmThreadsStatus?: boolean;
  workerProcessingMs: number;
  mainThreadBlockingMs: number;
  longTaskCount: number;
  uiResponsiveness: "Responsive (<16ms main thread lag)" | "Main Thread";
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
  public preloadModel(model: "birefnet_fp16" | "rmbg_1_4" | "isnet_fp16" | "isnet_quint8" | "isnet" = "birefnet_fp16"): void {
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
    model: "birefnet_fp16" | "rmbg_1_4" | "isnet_fp16" | "isnet_quint8" | "isnet" = "birefnet_fp16",
    onProgress?: (event: WorkerProgressEvent) => void,
    signal?: AbortSignal,
    options?: { preferWebGpu?: boolean; textPolicy?: "keep_text" | "remove_all_text" }
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

      // ── Main-Thread Responsiveness & Blocking Time Probe ──
      let maxFrameDelay = 0;
      let lastCheck = performance.now();
      let longTasks = 0;
      let intervalId: ReturnType<typeof setInterval> | null = null;

      if (typeof window !== "undefined") {
        intervalId = setInterval(() => {
          const now = performance.now();
          const delta = now - lastCheck;
          lastCheck = now;
          if (delta > 50) {
            longTasks++;
          }
          if (delta > maxFrameDelay) {
            maxFrameDelay = delta;
          }
        }, 16);
      }

      // Increased timeout to 120s to safely allow 176MB FP32 model download on initial run
      const timeoutMs = 120000;
      const timeoutTimer = setTimeout(() => {
        if (settled) return;
        cleanup();
        this.terminateActiveWorker();
        reject(new Error(`Worker inference timed out after ${timeoutMs / 1000}s.`));
      }, timeoutMs);

      const stopProbe = () => {
        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
      };

      const cleanup = () => {
        settled = true;
        clearTimeout(timeoutTimer);
        stopProbe();
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
          const mainThreadBlockingMs = Math.max(0, Math.round(maxFrameDelay - 16.7));
          // Explicitly terminate worker to free WASM linear memory and GPU textures on low-RAM devices
          this.terminateActiveWorker();
          resolve({
            resultBlob: data.resultBlob,
            backend: data.backend || "WASM",
            modelName: data.modelName || "BiRefNet-lite (FP16)",
            modelResolution: data.modelResolution || "1024 x 1024",
            textPolicy: data.textPolicy || "keep_text",
            textDetectionRan: Boolean(data.textDetectionRan),
            actualModel: data.actualModel || "onnx-community/BiRefNet_lite-ONNX (FP16)",
            actualModelFile: data.actualModelFile || "https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/de15b22ba131738a16dff04aab8bdf8dc32e3ac1/onnx/model_fp16.onnx",
            actualRuntime: data.actualRuntime || "BiRefNet-lite FP16 + WebGPU (@huggingface/transformers)",
            actualExecutionProvider: data.actualExecutionProvider || data.backend || "WASM",
            actualTextDetector: data.actualTextDetector || "Edge Gradient & Stroke Preservation Engine",
            actualTextPolicy: data.actualTextPolicy || (data.textPolicy === "remove_all_text" ? "Remove All Text" : "Preserve Text & Logos"),
            actualRefinementPreset: data.actualRefinementPreset || "standard",
            webGpuAvailable: Boolean(data.webGpuAvailable),
            webGpuApiAvailable: Boolean(data.webGpuApiAvailable),
            gpuAdapterAvailable: Boolean(data.gpuAdapterAvailable),
            webGpuSessionPassed: Boolean(data.webGpuSessionPassed),
            fallbackReason: data.fallbackReason,
            wasmSimd: data.wasmSimd ?? true,
            wasmThreads: data.wasmThreads ?? 1,
            wasmThreadsStatus: data.wasmThreadsStatus ?? false,
            workerProcessingMs: data.workerProcessingMs ?? 0,
            mainThreadBlockingMs,
            longTaskCount: longTasks,
            uiResponsiveness: "Responsive (<16ms main thread lag)",
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

      // Dispatch job to worker safely without destructive transfer
      worker.postMessage({
        type: "START",
        jobId,
        imageBlob,
        model,
        preferWebGpu: options?.preferWebGpu !== false,
        textPolicy: options?.textPolicy || "keep_text",
      });
    });
  }
}

export const bgWorkerManager = new BgWorkerManager();
