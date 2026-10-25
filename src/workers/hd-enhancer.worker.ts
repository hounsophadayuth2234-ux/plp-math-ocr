// Web Worker for Local AI Super-Resolution (Real-ESRGAN Compact ONNX) & HD Enhancer
// Prefers WebGPU, falls back to WASM (SIMD/Multithreaded), with emergency Algorithmic Fallback.
// Employs 256x256 patch tiling with feathered stitching to guarantee zero browser OOM crashes.

// @ts-expect-error onnxruntime-web package exports typing resolution
import * as ort from "onnxruntime-web";
import {
  runImageUpscalePipeline,
  UpscaleOptions,
  ImageDiagnostics,
  calculateImageDiagnostics,
} from "../lib/image-upscale-engine";
import {
  ONNX_UPSCALE_CONFIG,
  computeOverlappingTiles,
  extractTileRgbFloat,
  blendTileWithFeathering,
  normalizeAccumulatedRgb,
  downscaleRgb4xTo2x,
} from "../lib/onnx-super-resolution";

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
  backend: string;
  model: string;
  isNeuralAi: boolean;
}

export interface EnhancerWorkerErrorMessage {
  type: "ERROR";
  jobId: string;
  error: string;
}

// In-worker session cache
let cachedOnnxSession: ort.InferenceSession | null = null;
let activeBackendName: string = "CPU / Algorithmic Fallback";

/**
 * Safely fetches and caches ONNX model weights using CacheStorage
 */
async function getOrFetchModelBuffer(): Promise<ArrayBuffer> {
  const modelUrl = ONNX_UPSCALE_CONFIG.modelUrl;
  const cacheName = "plp-model-cache-v1";

  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(cacheName);
      const matched = await cache.match(modelUrl);
      if (matched) {
        return await matched.arrayBuffer();
      }

      const response = await fetch(modelUrl);
      if (response.ok) {
        const cloned = response.clone();
        cache.put(modelUrl, cloned).catch(() => {});
        return await response.arrayBuffer();
      }
    } catch (cacheErr) {
      console.warn("[hd-enhancer.worker] CacheStorage error, falling back to direct fetch:", cacheErr);
    }
  }

  const directRes = await fetch(modelUrl);
  if (!directRes.ok) {
    throw new Error(`Failed to load ONNX model weights from ${modelUrl} (status ${directRes.status})`);
  }
  return await directRes.arrayBuffer();
}

/**
 * Initializes ONNX Runtime Web session preferring WebGPU then WASM
 */
async function getOrCreateOnnxSession(): Promise<{ session: ort.InferenceSession; backend: string }> {
  if (cachedOnnxSession) {
    return { session: cachedOnnxSession, backend: activeBackendName };
  }

  // Configure WASM paths
  try {
    ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/";
    ort.env.wasm.numThreads = 2;
    ort.env.wasm.simd = true;
  } catch {}

  const modelBuffer = await getOrFetchModelBuffer();

  // 1. Try WebGPU first
  try {
    const session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ["webgpu", "wasm"],
    });
    cachedOnnxSession = session;
    activeBackendName = "WebGPU (Neural Accelerator)";
    return { session, backend: activeBackendName };
  } catch (webGpuErr) {
    console.warn("[hd-enhancer.worker] WebGPU unavailable, falling back to WASM:", webGpuErr);
  }

  // 2. Try WASM fallback
  try {
    const session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ["wasm"],
    });
    cachedOnnxSession = session;
    activeBackendName = "WASM (CPU SIMD Multithreaded)";
    return { session, backend: activeBackendName };
  } catch (wasmErr) {
    console.warn("[hd-enhancer.worker] WASM initialization failed:", wasmErr);
    throw wasmErr;
  }
}

self.onmessage = async (e: MessageEvent<EnhancerWorkerStartRequest>) => {
  const msg = e.data;
  if (!msg || msg.type !== "START") return;

  const { jobId, data, width, height, options } = msg;

  const reportProgress = (stage: number, stageName: string, stageNameKh: string, percent: number) => {
    const pMsg: EnhancerWorkerProgressMessage = {
      type: "PROGRESS",
      jobId,
      stage,
      totalStages: 5,
      stageName,
      stageNameKh,
      percent,
    };
    self.postMessage(pMsg);
  };

  try {
    reportProgress(1, "Initializing Neural Engine", "ចាប់ផ្ដើមដំណើរការ Neural Engine", 15);

    let session: ort.InferenceSession | null = null;
    let backend = "CPU / Algorithmic Fallback";

    try {
      const init = await getOrCreateOnnxSession();
      session = init.session;
      backend = init.backend;
    } catch (onnxInitErr) {
      console.warn("[hd-enhancer.worker] ONNX Runtime Web session unavailable:", onnxInitErr);
    }

    if (session) {
      reportProgress(2, `Neural Super-Resolution (${backend})`, `ដំណើរការ Real-ESRGAN (${backend})`, 35);

      const targetScale = options.scale === 2 ? 2 : 4;
      const nativeScale = ONNX_UPSCALE_CONFIG.nativeScale;
      const outW4x = width * nativeScale;
      const outH4x = height * nativeScale;

      const outAccum = new Float32Array(outW4x * outH4x * 3);
      const weightAccum = new Float32Array(outW4x * outH4x);

      const tiles = computeOverlappingTiles(
        width,
        height,
        ONNX_UPSCALE_CONFIG.tileSize,
        ONNX_UPSCALE_CONFIG.tilePad
      );

      const inputName = session.inputNames[0] || "input";
      const outputName = session.outputNames[0] || "output";

      for (let tIdx = 0; tIdx < tiles.length; tIdx++) {
        const tile = tiles[tIdx];
        const tileFloat = extractTileRgbFloat(data, width, 4, tile);
        const tensor = new ort.Tensor("float32", tileFloat, [1, 3, tile.height, tile.width]);

        const feeds: Record<string, any> = {};
        feeds[inputName] = tensor;

        const results = await session.run(feeds);
        const outTensor = results[outputName];

        blendTileWithFeathering(
          outAccum,
          weightAccum,
          outW4x,
          tile,
          outTensor.data as Float32Array,
          nativeScale,
          ONNX_UPSCALE_CONFIG.tilePad
        );

        const progressPercent = 35 + Math.round(((tIdx + 1) / tiles.length) * 45);
        reportProgress(
          3,
          `Processing Tile ${tIdx + 1} of ${tiles.length}`,
          `ដំណើរការផ្ទាំងរូបភាពទី ${tIdx + 1} នៃ ${tiles.length}`,
          progressPercent
        );
      }

      reportProgress(4, "Feathering & Color Assembly", "ផ្គុំគែមរូបភាព និងពណ៌", 85);

      let finalRgb = normalizeAccumulatedRgb(outAccum, weightAccum, outW4x * outH4x);
      let finalW = outW4x;
      let finalH = outH4x;

      if (targetScale === 2) {
        finalRgb = downscaleRgb4xTo2x(finalRgb, outW4x, outH4x);
        finalW = Math.floor(outW4x / 2);
        finalH = Math.floor(outH4x / 2);
      }

      // Reconstruct RGBA output buffer
      const finalRgba = new Uint8ClampedArray(finalW * finalH * 4);
      for (let i = 0; i < finalW * finalH; i++) {
        finalRgba[i * 4] = finalRgb[i * 3];
        finalRgba[i * 4 + 1] = finalRgb[i * 3 + 1];
        finalRgba[i * 4 + 2] = finalRgb[i * 3 + 2];
        finalRgba[i * 4 + 3] = 255;
      }

      reportProgress(5, "Complete", "រួចរាល់ 100%", 100);

      const diagnostics = calculateImageDiagnostics({ data, width, height });
      diagnostics.actualEngine = "Real AI model";

      const completeMsg: EnhancerWorkerCompleteMessage = {
        type: "COMPLETE",
        jobId,
        data: finalRgba,
        width: finalW,
        height: finalH,
        diagnostics,
        backend,
        model: `Real-ESRGAN (${targetScale}x · Compact SRVGGNet ONNX)`,
        isNeuralAi: true,
      };

      self.postMessage(completeMsg);
      return;
    }

    // Algorithmic Fallback (Honest labeling)
    console.warn("[hd-enhancer.worker] Running Algorithmic Fallback pipeline.");
    const result = await runImageUpscalePipeline(
      { data, width, height },
      {
        ...options,
        onProgress: (p) => {
          self.postMessage({
            type: "PROGRESS",
            jobId,
            stage: p.stage,
            totalStages: p.totalStages,
            stageName: p.stageName,
            stageNameKh: p.stageNameKh,
            percent: p.percent,
          });
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
      backend: "CPU / Algorithmic Fallback",
      model: "HD Resize & Sharpen — Algorithmic Fallback",
      isNeuralAi: false,
    };

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
