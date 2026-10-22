// Web Worker for HD Resize & Sharpen (On-Device TypedArray Pipeline)
// Runs Lanczos-3, Kuwahara Denoise, Curvature Flow & Khmer Text Protection
// off the main thread to completely prevent UI lag or browser tab freezing.

import { runImageUpscalePipeline, UpscaleOptions, ImageDiagnostics } from "../lib/image-upscale-engine";

export interface EnhancerWorkerStartRequest {
  type: "START";
  jobId: string;
  data: Uint8ClampedArray;
  width: number;
  height: number;
  options: UpscaleOptions;
}

export interface EnhancerWorkerProgressMessage {
  type: "PROGRESS";
  jobId: string;
  stage: number;
  totalStages: number;
  stageName: string;
  stageNameKh: string;
  percent: number;
}

export interface EnhancerWorkerCompleteMessage {
  type: "COMPLETE";
  jobId: string;
  data: Uint8ClampedArray;
  width: number;
  height: number;
  diagnostics: ImageDiagnostics;
}

export interface EnhancerWorkerErrorMessage {
  type: "ERROR";
  jobId: string;
  error: string;
}

self.onmessage = async (e: MessageEvent<EnhancerWorkerStartRequest>) => {
  const msg = e.data;
  if (!msg || msg.type !== "START") return;

  const { jobId, data, width, height, options } = msg;

  try {
    const result = await runImageUpscalePipeline(
      { data, width, height },
      {
        ...options,
        onProgress: (p) => {
          const progressMsg: EnhancerWorkerProgressMessage = {
            type: "PROGRESS",
            jobId,
            stage: p.stage,
            totalStages: p.totalStages,
            stageName: p.stageName,
            stageNameKh: p.stageNameKh,
            percent: p.percent,
          };
          self.postMessage(progressMsg);
        },
      }
    );

    const completeMsg: EnhancerWorkerCompleteMessage = {
      type: "COMPLETE",
      jobId,
      data: result.data,
      width: result.width,
      height: result.height,
      diagnostics: result.diagnostics,
    };

    // Post completed result to main thread
    self.postMessage(completeMsg);
  } catch (err: unknown) {
    const errorMsg: EnhancerWorkerErrorMessage = {
      type: "ERROR",
      jobId,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(errorMsg);
  }
};
