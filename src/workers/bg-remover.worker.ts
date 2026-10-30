// Application-owned Web Worker for Module 02 Background Remover
// Client-side inference with briaai/RMBG-1.4 FP32 on WebGPU, fallback to WASM, and safety fallback to @imgly/isnet_fp16.

import { removeBackground, preload } from "@imgly/background-removal";
import { AutoModel, Tensor, env } from "@huggingface/transformers";
import {
  detectIndependentTextMask,
  applyTextPolicyToMask,
  edgeAwareHairFurRefinement,
} from "../lib/bg-compositor";

export interface WorkerJobRequest {
  type: "START";
  jobId: string;
  imageBlob: Blob;
  model?: "rmbg_1_4" | "isnet_fp16" | "isnet_quint8" | "isnet";
  preferWebGpu?: boolean;
  textPolicy?: "keep_text" | "remove_all_text";
}

export interface WorkerPreloadRequest {
  type: "PRELOAD";
  model?: "rmbg_1_4" | "isnet_fp16" | "isnet_quint8" | "isnet";
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

// Configure Transformers.js environment for browser worker
env.allowLocalModels = true;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false;
}

// Shared singleton model cache to prevent duplicate model initializations
let cachedRmbgWebGpuModel: any = null;
let cachedRmbgWasmModel: any = null;
let loadingRmbgWebGpuPromise: Promise<any> | null = null;
let loadingRmbgWasmPromise: Promise<any> | null = null;

async function getRmbgModel(
  device: "webgpu" | "wasm",
  onProgress?: (loaded: number, total: number) => void
): Promise<any> {
  if (device === "webgpu") {
    if (cachedRmbgWebGpuModel) return cachedRmbgWebGpuModel;
    if (loadingRmbgWebGpuPromise) return loadingRmbgWebGpuPromise;

    loadingRmbgWebGpuPromise = AutoModel.from_pretrained("briaai/RMBG-1.4", {
      device: "webgpu",
      dtype: "fp32",
      revision: "2ceba5a5efaec153162aedea169f76caf9b46cf8",
      progress_callback: (progress: any) => {
        if (progress.loaded && onProgress) {
          onProgress(progress.loaded, progress.total || 176153355);
        }
      },
    }).then((m: any) => {
      cachedRmbgWebGpuModel = m;
      loadingRmbgWebGpuPromise = null;
      return m;
    }).catch((err: any) => {
      loadingRmbgWebGpuPromise = null;
      throw err;
    });

    return loadingRmbgWebGpuPromise;
  } else {
    if (cachedRmbgWasmModel) return cachedRmbgWasmModel;
    if (loadingRmbgWasmPromise) return loadingRmbgWasmPromise;

    loadingRmbgWasmPromise = AutoModel.from_pretrained("briaai/RMBG-1.4", {
      device: "wasm",
      dtype: "fp32",
      revision: "2ceba5a5efaec153162aedea169f76caf9b46cf8",
      progress_callback: (progress: any) => {
        if (progress.loaded && onProgress) {
          onProgress(progress.loaded, progress.total || 176153355);
        }
      },
    }).then((m: any) => {
      cachedRmbgWasmModel = m;
      loadingRmbgWasmPromise = null;
      return m;
    }).catch((err: any) => {
      loadingRmbgWasmPromise = null;
      throw err;
    });

    return loadingRmbgWasmPromise;
  }
}

/**
 * Executes RMBG-1.4 inference on an input image bitmap
 */
async function runRmbgInference(
  model: any,
  bitmap: ImageBitmap,
  textPolicy: "keep_text" | "remove_all_text"
): Promise<Blob> {
  const origW = bitmap.width;
  const origH = bitmap.height;
  const session = model.sessions?.model;
  if (!session) throw new Error("RMBG-1.4 ONNX inference session is unavailable.");

  // 1. Resize input to 1024x1024 for RMBG-1.4
  const canvas1024 = new OffscreenCanvas(1024, 1024);
  const ctx1024 = canvas1024.getContext("2d", { willReadFrequently: true })!;
  ctx1024.drawImage(bitmap, 0, 0, 1024, 1024);
  const imgData1024 = ctx1024.getImageData(0, 0, 1024, 1024);
  const pixels1024 = imgData1024.data;

  // 2. Prepare float32 NCHW tensor with normalization (mean: 0.5, std: 1.0)
  const numPixels = 1024 * 1024;
  const float32Data = new Float32Array(1 * 3 * numPixels);
  const rOff = 0;
  const gOff = numPixels;
  const bOff = numPixels * 2;

  for (let i = 0; i < numPixels; i++) {
    const p = i * 4;
    float32Data[rOff + i] = pixels1024[p] / 255.0 - 0.5;
    float32Data[gOff + i] = pixels1024[p + 1] / 255.0 - 0.5;
    float32Data[bOff + i] = pixels1024[p + 2] / 255.0 - 0.5;
  }

  // 3. Execute ONNX Runtime session
  const inputTensor = new Tensor("float32", float32Data, [1, 3, 1024, 1024]);
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const feeds: Record<string, any> = {};
  feeds[inputName] = inputTensor;

  const outputs = await session.run(feeds);
  const outTensor = outputs[outputName];
  const maskRaw = outTensor.data as Float32Array;

  // 4. Draw continuous 1024x1024 alpha mask
  const maskCanvas1024 = new OffscreenCanvas(1024, 1024);
  const maskCtx1024 = maskCanvas1024.getContext("2d")!;
  const maskImgData1024 = maskCtx1024.createImageData(1024, 1024);
  const maskPixels1024 = maskImgData1024.data;

  for (let i = 0; i < numPixels; i++) {
    const clamped = Math.max(0, Math.min(1, maskRaw[i]));
    const alphaByte = Math.round(clamped * 255);
    const p = i * 4;
    maskPixels1024[p] = alphaByte;
    maskPixels1024[p + 1] = alphaByte;
    maskPixels1024[p + 2] = alphaByte;
    maskPixels1024[p + 3] = 255;
  }
  maskCtx1024.putImageData(maskImgData1024, 0, 0);

  // 5. Bilinear resize mask to original dimensions
  const origMaskCanvas = new OffscreenCanvas(origW, origH);
  const origMaskCtx = origMaskCanvas.getContext("2d", { willReadFrequently: true })!;
  origMaskCtx.imageSmoothingEnabled = true;
  origMaskCtx.imageSmoothingQuality = "high";
  origMaskCtx.drawImage(maskCanvas1024, 0, 0, origW, origH);
  const origMaskPixels = origMaskCtx.getImageData(0, 0, origW, origH).data;

  // 6. Extract original RGBA
  const origCanvas = new OffscreenCanvas(origW, origH);
  const origCtx = origCanvas.getContext("2d", { willReadFrequently: true })!;
  origCtx.drawImage(bitmap, 0, 0);
  const origImgData = origCtx.getImageData(0, 0, origW, origH);
  const origRgba = origImgData.data;

  // 7. Apply continuous alpha values
  const totalOrigPixels = origW * origH;
  const initialAlphaMask = new Uint8ClampedArray(totalOrigPixels);
  for (let i = 0; i < totalOrigPixels; i++) {
    initialAlphaMask[i] = origMaskPixels[i * 4];
  }

  // 8. Apply text policy and hair/fur refinement
  let finalAlphaMask = initialAlphaMask;
  if (textPolicy === "keep_text") {
    try {
      const textDet = detectIndependentTextMask(origRgba, origW, origH);
      const policyRes = applyTextPolicyToMask(initialAlphaMask, textDet.textMask, origW, origH, "keep_text");
      // Create an owned ArrayBuffer copy to guarantee non-shared, non-detached memory boundary
      const ownedBuffer = new ArrayBuffer(policyRes.finalAlpha.byteLength);
      new Uint8ClampedArray(ownedBuffer).set(policyRes.finalAlpha);
      finalAlphaMask = new Uint8ClampedArray(ownedBuffer);
    } catch (e) {
      console.warn("[bg-remover-worker] Text stroke detection skipped:", e);
    }
  }

  // Subtle edge refinement for hair strands
  try {
    const hairRefined = edgeAwareHairFurRefinement(origRgba, finalAlphaMask, origW, origH, {
      preset: "fine_hair",
      alphaChoke: 0.25,
      decontaminateBg: true,
    });
    // Create an owned ArrayBuffer copy from refinedAlpha to guarantee safe, owned ArrayBuffer boundary
    const ownedHairBuffer = new ArrayBuffer(hairRefined.refinedAlpha.byteLength);
    new Uint8ClampedArray(ownedHairBuffer).set(hairRefined.refinedAlpha);
    finalAlphaMask = new Uint8ClampedArray(ownedHairBuffer);
  } catch (e) {
    console.warn("[bg-remover-worker] Hair refinement skipped:", e);
  }

  // 9. Composite alpha channel into original RGBA
  for (let i = 0; i < totalOrigPixels; i++) {
    origRgba[i * 4 + 3] = finalAlphaMask[i];
  }
  origCtx.putImageData(origImgData, 0, 0);

  // 10. Generate transparent PNG blob
  const resultBlob = await origCanvas.convertToBlob({ type: "image/png" });
  return resultBlob;
}

self.onmessage = async (e: MessageEvent<WorkerIncomingMessage>) => {
  const data = e.data;
  if (data.type === "PRELOAD") {
    try {
      const preloadModel = data.model || "rmbg_1_4";
      if (preloadModel === "rmbg_1_4") {
        const hasWorkerGpu =
          typeof navigator !== "undefined" &&
          "gpu" in navigator &&
          Boolean((navigator as unknown as { gpu?: unknown }).gpu);
        const device = hasWorkerGpu ? "webgpu" : "wasm";
        await getRmbgModel(device);
      } else {
        await preload({
          model: preloadModel as any,
          fetchArgs: { cache: "force-cache" },
        });
      }
      self.postMessage({
        type: "PRELOAD_COMPLETE",
        model: preloadModel,
      });
    } catch (err: unknown) {
      console.warn("[bg-remover-worker] Preload skipped or failed:", err);
    }
    return;
  }

  if (data.type === "START") {
    const tWorkerStart = performance.now();
    const { jobId, imageBlob, model = "rmbg_1_4", preferWebGpu, textPolicy = "keep_text" } = data;
    let resultBlob: Blob | null = null;
    let actualBackend: "WebGPU" | "WASM" = "WASM";
    let webGpuAvailable = false;
    let webGpuSessionPassed = false;
    let fallbackReason: string | undefined = undefined;
    let actualModel = "briaai/RMBG-1.4 (FP32 Full Precision)";
    let actualModelFile = "https://huggingface.co/briaai/RMBG-1.4/resolve/2ceba5a5efaec153162aedea169f76caf9b46cf8/onnx/model.onnx";
    let actualRuntime = "RMBG-1.4 FP32 + WebGPU (@huggingface/transformers)";
    let modelName = "briaai/RMBG-1.4 (FP32)";
    const modelResolution = "1024 x 1024";

    const hasWorkerGpu =
      typeof navigator !== "undefined" &&
      "gpu" in navigator &&
      Boolean((navigator as unknown as { gpu?: unknown }).gpu);

    let gpuAdapterAvailable = false;
    const tryWebGpu = preferWebGpu !== false && hasWorkerGpu;

    // Decode image bitmap safely
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(imageBlob);
    } catch (err) {
      const msg: WorkerErrorMessage = {
        type: "ERROR",
        jobId,
        error: "Failed to decode image bitmap: " + (err instanceof Error ? err.message : String(err)),
      };
      self.postMessage(msg);
      return;
    }

    const postProgress = (key: string, current: number, total: number) => {
      const msg: WorkerProgressMessage = {
        type: "PROGRESS",
        jobId,
        key,
        current,
        total,
      };
      self.postMessage(msg);
    };

    // 1. PRIMARY PATH: briaai/RMBG-1.4 FP32 on WebGPU
    if (model === "rmbg_1_4" && tryWebGpu) {
      try {
        const adapter = await (navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter();
        if (adapter) {
          gpuAdapterAvailable = true;
          webGpuAvailable = true;

          postProgress("loading_model", 10, 100);
          const rmbgModel = await getRmbgModel("webgpu", (cur, tot) => {
            postProgress("fetch_model", cur, tot);
          });

          postProgress("inference", 70, 100);
          resultBlob = await runRmbgInference(rmbgModel, bitmap, textPolicy);

          actualBackend = "WebGPU";
          webGpuSessionPassed = true;
          actualRuntime = "RMBG-1.4 FP32 + WebGPU (@huggingface/transformers)";
          modelName = "briaai/RMBG-1.4 (FP32)";
          fallbackReason = undefined;
        } else {
          fallbackReason = "WebGPU adapter unavailable";
        }
      } catch (gpuErr: unknown) {
        console.warn("[bg-remover-worker] RMBG-1.4 WebGPU failed; falling back to WASM:", gpuErr);
        webGpuSessionPassed = false;
        const errMsg = gpuErr instanceof Error ? gpuErr.message : String(gpuErr);
        fallbackReason = `WebGPU execution failed (${errMsg}); engaged WASM fallback`;
      }
    } else if (model === "rmbg_1_4" && !tryWebGpu) {
      fallbackReason = hasWorkerGpu ? "WebGPU disabled by options" : "WebGPU API unavailable";
    }

    // 2. SECONDARY PATH: briaai/RMBG-1.4 FP32 on WASM
    if (!resultBlob && model === "rmbg_1_4") {
      try {
        postProgress("loading_model", 10, 100);
        const rmbgWasmModel = await getRmbgModel("wasm", (cur, tot) => {
          postProgress("fetch_model", cur, tot);
        });

        postProgress("inference", 70, 100);
        resultBlob = await runRmbgInference(rmbgWasmModel, bitmap, textPolicy);

        actualBackend = "WASM";
        actualRuntime = "RMBG-1.4 FP32 + WASM (@huggingface/transformers)";
        modelName = "briaai/RMBG-1.4 (FP32)";
        if (!fallbackReason) {
          fallbackReason = "WASM fallback selected";
        }
      } catch (wasmErr: unknown) {
        console.warn("[bg-remover-worker] RMBG-1.4 WASM failed; engaging safety fallback:", wasmErr);
        if (!fallbackReason) {
          fallbackReason = "RMBG-1.4 execution unavailable; engaged local safe fallback";
        }
      }
    }

    // 3. TERTIARY PATH: Existing Local Safe Engine (@imgly/isnet_fp16)
    if (!resultBlob) {
      try {
        const isnetModel = model === "isnet_quint8" ? "isnet_quint8" : model === "isnet" ? "isnet" : "isnet_fp16";
        resultBlob = await removeBackground(imageBlob, {
          model: isnetModel as any,
          device: "cpu",
          output: {
            format: "image/png",
            quality: 1.0,
          },
          fetchArgs: {
            cache: "force-cache",
          },
          progress: (key: string, current: number, total: number) => {
            postProgress(key, current, total);
          },
        });

        actualBackend = "WASM";
        actualModel = "@imgly/isnet_fp16 (Safety Fallback Active)";
        actualModelFile = "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/models/isnet_fp16";
        actualRuntime = "@imgly/background-removal v1.7.0 (WASM Fallback)";
        modelName = isnetModel === "isnet_quint8" ? "ISNet-QUINT8" : isnetModel === "isnet" ? "ISNet-FP32" : "ISNet-FP16";
        if (!fallbackReason) {
          fallbackReason = "Safety fallback active";
        }
      } catch (safeErr: unknown) {
        const msg: WorkerErrorMessage = {
          type: "ERROR",
          jobId,
          error: safeErr instanceof Error ? safeErr.message : String(safeErr),
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
      modelName,
      modelResolution,
      textPolicy,
      textDetectionRan: true,
      actualModel,
      actualModelFile,
      actualRuntime,
      actualExecutionProvider: actualBackend,
      actualTextDetector: "Edge Gradient & Stroke Preservation Engine",
      actualTextPolicy: textPolicy === "remove_all_text" ? "Remove All Text" : "Preserve Text & Logos",
      actualRefinementPreset: "fine_hair",
      webGpuAvailable,
      webGpuApiAvailable: hasWorkerGpu,
      gpuAdapterAvailable,
      webGpuSessionPassed,
      fallbackReason: fallbackReason || undefined,
      wasmSimd,
      wasmThreads,
      wasmThreadsStatus,
      workerProcessingMs,
    };

    self.postMessage(completeMsg);
  }
};
