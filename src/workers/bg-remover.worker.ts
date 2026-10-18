// Application-owned Web Worker for @imgly/background-removal
// Allows immediate cancellation via worker.terminate() without leaving heavy computation running.

import { removeBackground, preload } from "@imgly/background-removal";

export interface WorkerJobRequest {
  type: "START";
  jobId: string;
  imageBlob: Blob;
  model: "isnet_fp16" | "isnet_quint8" | "isnet";
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
    const { jobId, imageBlob, model } = data;
    try {
      const resultBlob = await removeBackground(imageBlob, {
        model: model || "isnet_fp16",
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

      const msg: WorkerCompleteMessage = {
        type: "COMPLETE",
        jobId,
        resultBlob,
      };
      self.postMessage(msg);
    } catch (err: unknown) {
      const msg: WorkerErrorMessage = {
        type: "ERROR",
        jobId,
        error: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(msg);
    }
  }
};

