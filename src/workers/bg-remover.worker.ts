// Application-owned Web Worker for @imgly/background-removal
// Supports safe WebGPU detection with non-crashing fallback to WASM (SIMD + multi-threading).

import { removeBackground, preload } from "@imgly/background-removal";

export interface WorkerJobRequest {
  type: "START";
  jobId: string;
  imageBlob: Blob;
  model: "isnet_fp16" | "isnet_quint8" | "isnet";
  preferWebGpu?: boolean;
}

export interface WorkerPreloadRequest {
  type: "PRELOAD";
  model?: "isnet_fp16" | "isnet_quint8" | "isnet";
}

export interface WorkerProgressMessage {
  type: "PROGRESS";
  jobId: string;
  key: string;
  current: number;
  total: number;
}

export interface WorkerCompleteMessage {
  type: "COMPLETE";
  jobId: string;
  resultBlob: Blob;
  backend: "WebGPU" | "WASM";
  webGpuAvailable: boolean;
  webGpuApiAvailable: boolean;
  gpuAdapterAvailable: boolean;
  webGpuSessionPassed: boolean;
  fallbackReason?: string;
  wasmSimd?: boolean;
  wasmThreads?: number;
  wasmThreadsStatus?: boolean;
  workerProcessingMs: number;
}

export interface WorkerErrorMessage {
  type: "ERROR";
  jobId?: string;
  error: string;
}

export interface WorkerPreloadCompleteMessage {
  type: "PRELOAD_COMPLETE";
  model: string;
}

export type WorkerIncomingMessage = WorkerJobRequest | WorkerPreloadRequest;

self.onmessage = async (e: MessageEvent<WorkerIncomingMessage>) => {
  const data = e.data;
  if (data.type === "PRELOAD") {
    try {
      await preload({
        model: data.model || "isnet_fp16",
        fetchArgs: {
          cache: "force-cache",
        },
      });
      self.postMessage({
        type: "PRELOAD_COMPLETE",
        model: data.model || "isnet_fp16",
      });
    } catch (err: unknown) {
      console.warn("[bg-remover-worker] Preload skipped or failed:", err);
    }
    return;
  }

  if (data.type === "START") {
    const tWorkerStart = performance.now();
    const { jobId, imageBlob, model, preferWebGpu } = data;
    let resultBlob: Blob | null = null;
    let actualBackend: "WebGPU" | "WASM" = "WASM";
    let webGpuAvailable = false;
    let webGpuSessionPassed = false;
    let fallbackReason: string | undefined = undefined;

    // Check if worker environment has navigator.gpu
    const hasWorkerGpu =
      typeof navigator !== "undefined" &&
      "gpu" in navigator &&
      Boolean((navigator as unknown as { gpu?: unknown }).gpu);

    let gpuAdapterAvailable = false;
    const tryWebGpu = preferWebGpu !== false && hasWorkerGpu;

    // 1. Attempt WebGPU execution if supported
    if (tryWebGpu) {
      gpuAdapterAvailable = true;
      try {
        resultBlob = await removeBackground(imageBlob, {
          model: model || "isnet_fp16",
          device: "gpu",
          output: {
            format: "image/png",
            quality: 1.0,
          },
          fetchArgs: {
            cache: "force-cache",
          },
          progress: (key: string, current: number, total: number) => {
            const msg: WorkerProgressMessage = {
              type: "PROGRESS",
              jobId,
              key,
              current,
              total,
            };
            self.postMessage(msg);
          },
        });
        actualBackend = "WebGPU";
        webGpuAvailable = true;
        webGpuSessionPassed = true;
      } catch (gpuErr: unknown) {
        console.warn("[bg-remover-worker] WebGPU execution failed; safely falling back to WASM:", gpuErr);
        webGpuSessionPassed = false;
        const errMsg = gpuErr instanceof Error ? gpuErr.message : String(gpuErr);
        if (errMsg.includes("Adapter") || errMsg.includes("adapter")) {
          fallbackReason = "Adapter unavailable";
        } else if (errMsg.includes("device") || errMsg.includes("Device")) {
          fallbackReason = "Device creation failed";
        } else if (errMsg.includes("session") || errMsg.includes("Session")) {
          fallbackReason = "WebGPU session initialization failed";
        } else {
          fallbackReason = "Model/runtime does not support WebGPU";
        }
      }
    } else if (!hasWorkerGpu) {
      fallbackReason = "WebGPU API unavailable";
    }

    // 2. Safe WASM fallback
    if (!resultBlob || actualBackend !== "WebGPU") {
      try {
        resultBlob = await removeBackground(imageBlob, {
          model: model || "isnet_fp16",
          device: "cpu",
          output: {
            format: "image/png",
            quality: 1.0,
          },
          fetchArgs: {
            cache: "force-cache",
          },
          progress: (key: string, current: number, total: number) => {
            const msg: WorkerProgressMessage = {
              type: "PROGRESS",
              jobId,
              key,
              current,
              total,
            };
            self.postMessage(msg);
          },
        });
        actualBackend = "WASM";
        if (!fallbackReason) {
          fallbackReason = "WASM fallback selected";
        }
      } catch (wasmErr: unknown) {
        const msg: WorkerErrorMessage = {
          type: "ERROR",
          jobId,
          error: wasmErr instanceof Error ? wasmErr.message : String(wasmErr),
        };
        self.postMessage(msg);
        return;
      }
    }

    const isIsolated = typeof self !== "undefined" ? Boolean((self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated) : false;
    const hw = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
    const wasmThreads = isIsolated ? Math.min(4, Math.max(1, hw > 2 ? hw - 1 : 1)) : 1;
    const wasmThreadsStatus = isIsolated && typeof SharedArrayBuffer !== "undefined";
    const wasmSimd =
      typeof WebAssembly !== "undefined" && typeof WebAssembly.validate === "function"
        ? WebAssembly.validate(
            new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 26, 11])
          )
        : false;

    const workerProcessingMs = Math.round(performance.now() - tWorkerStart);

    const completeMsg: WorkerCompleteMessage = {
      type: "COMPLETE",
      jobId,
      resultBlob,
      backend: actualBackend,
      webGpuAvailable,
      webGpuApiAvailable: hasWorkerGpu,
      gpuAdapterAvailable,
      webGpuSessionPassed,
      fallbackReason,
      wasmSimd,
      wasmThreads,
      wasmThreadsStatus,
      workerProcessingMs,
    };
    self.postMessage(completeMsg);
  }
};
