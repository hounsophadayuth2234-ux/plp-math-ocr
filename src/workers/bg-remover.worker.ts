// Application-owned Web Worker for @imgly/background-removal
// Allows immediate cancellation via worker.terminate() without leaving heavy computation running.

import { removeBackground } from "@imgly/background-removal";

export interface WorkerJobRequest {
  type: "START";
  jobId: string;
  imageBlob: Blob;
  model: "isnet_fp16" | "isnet_quint8" | "isnet";
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
  jobId: string;
  error: string;
}

self.onmessage = async (e: MessageEvent<WorkerJobRequest>) => {
  const { type, jobId, imageBlob, model } = e.data;
  if (type === "START") {
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
