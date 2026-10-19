/**
 * Dedicated Math & Khmer OCR Preprocessing & Quality Assessment Worker
 *
 * Runs non-blocking image quality assessment, Laplacian variance blur detection,
 * profile preprocessing, and layout region detection off the main thread.
 */

import {
  assessImageQuality,
  preprocessImageProfile,
  detectLayoutRegions,
  PreprocessProfile,
} from "../lib/math-image-analyzer";

export interface WorkerOcrRequest {
  type: "ASSESS_AND_PREPROCESS";
  jobId: string;
  sourceRevision: number;
  width: number;
  height: number;
  profile: PreprocessProfile;
  rgbaBuffer: ArrayBuffer;
}

export interface WorkerOcrSuccessResponse {
  type: "SUCCESS";
  jobId: string;
  sourceRevision: number;
  quality: ReturnType<typeof assessImageQuality>;
  regions: ReturnType<typeof detectLayoutRegions>;
  preprocessedBuffer: ArrayBuffer;
  preprocessMs: number;
}

export interface WorkerOcrErrorResponse {
  type: "ERROR";
  jobId: string;
  error: string;
}

self.onmessage = (e: MessageEvent<WorkerOcrRequest>) => {
  const data = e.data;
  if (!data || data.type !== "ASSESS_AND_PREPROCESS") return;

  const { jobId, sourceRevision, width, height, profile, rgbaBuffer } = data;
  const startTime = performance.now();

  try {
    const uint8 = new Uint8ClampedArray(rgbaBuffer);

    // 1. Image Quality Assessment
    const quality = assessImageQuality(uint8, width, height);

    // 2. Profile Preprocessing
    const preprocessed = preprocessImageProfile(uint8, width, height, profile);

    // 3. Layout and Region Detection
    const regions = detectLayoutRegions(preprocessed, width, height);

    const preprocessMs = Math.round(performance.now() - startTime);

    const response: WorkerOcrSuccessResponse = {
      type: "SUCCESS",
      jobId,
      sourceRevision,
      quality,
      regions,
      preprocessedBuffer: preprocessed.buffer as ArrayBuffer,
      preprocessMs,
    };

    // Transfer preprocessed buffer back to main thread
    (self as unknown as Worker).postMessage(response, [preprocessed.buffer as ArrayBuffer]);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorResponse: WorkerOcrErrorResponse = {
      type: "ERROR",
      jobId,
      error: errorMsg,
    };
    (self as unknown as Worker).postMessage(errorResponse);
  }
};
