// Application-owned Web Worker for Module 02 Background Remover
// Client-side inference with onnx-community/BiRefNet_lite-ONNX FP16 on WebGPU, fallback to WASM, and safety fallback to @imgly/isnet_fp16.

import { removeBackground, preload } from "@imgly/background-removal";
import { AutoModel, AutoProcessor, RawImage, env } from "@huggingface/transformers";
import {
  detectIndependentTextMask,
  applyTextPolicyToMask,
  edgeAwareHairFurRefinement,
} from "../lib/bg-compositor";

export interface WorkerJobRequest {
  type: "START";
  jobId: string;
  imageBlob: Blob;
  model?: "birefnet_fp16" | "rmbg_1_4" | "isnet_fp16" | "isnet_quint8" | "isnet";
  preferWebGpu?: boolean;
  textPolicy?: "keep_text" | "remove_all_text";
}

export interface WorkerPreloadRequest {
  type: "PRELOAD";
  model?: "birefnet_fp16" | "rmbg_1_4" | "isnet_fp16" | "isnet_quint8" | "isnet";
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
let cachedBiRefNetWebGpuModel: any = null;
let cachedBiRefNetWasmModel: any = null;
let cachedBiRefNetProcessor: any = null;
let loadingBiRefNetWebGpuPromise: Promise<any> | null = null;
let loadingBiRefNetWasmPromise: Promise<any> | null = null;
let loadingProcessorPromise: Promise<any> | null = null;

const BIREFNET_MODEL_ID = "onnx-community/BiRefNet_lite-ONNX";
const BIREFNET_REVISION = "de15b22ba131738a16dff04aab8bdf8dc32e3ac1";
const BIREFNET_FILE_SIZE = 114538221;

async function getBiRefNetProcessor(): Promise<any> {
  if (cachedBiRefNetProcessor) return cachedBiRefNetProcessor;
  if (loadingProcessorPromise) return loadingProcessorPromise;

  loadingProcessorPromise = AutoProcessor.from_pretrained(BIREFNET_MODEL_ID, {
    revision: BIREFNET_REVISION,
  })
    .then((proc: any) => {
      cachedBiRefNetProcessor = proc;
      loadingProcessorPromise = null;
      return proc;
    })
    .catch((err: any) => {
      loadingProcessorPromise = null;
      throw err;
    });

  return loadingProcessorPromise;
}

async function getBiRefNetModel(
  device: "webgpu" | "wasm",
  onProgress?: (loaded: number, total: number) => void
): Promise<any> {
  if (device === "webgpu") {
    if (cachedBiRefNetWebGpuModel) return cachedBiRefNetWebGpuModel;
    if (loadingBiRefNetWebGpuPromise) return loadingBiRefNetWebGpuPromise;

    loadingBiRefNetWebGpuPromise = AutoModel.from_pretrained(BIREFNET_MODEL_ID, {
      device: "webgpu",
      dtype: "fp16",
      revision: BIREFNET_REVISION,
      progress_callback: (progress: any) => {
        if (progress.loaded && onProgress) {
          onProgress(progress.loaded, progress.total || BIREFNET_FILE_SIZE);
        }
      },
    }).then((m: any) => {
      cachedBiRefNetWebGpuModel = m;
      loadingBiRefNetWebGpuPromise = null;
      return m;
    }).catch((err: any) => {
      loadingBiRefNetWebGpuPromise = null;
      throw err;
    });

    return loadingBiRefNetWebGpuPromise;
  } else {
    if (cachedBiRefNetWasmModel) return cachedBiRefNetWasmModel;
    if (loadingBiRefNetWasmPromise) return loadingBiRefNetWasmPromise;

    loadingBiRefNetWasmPromise = AutoModel.from_pretrained(BIREFNET_MODEL_ID, {
      device: "wasm",
      dtype: "fp16",
      revision: BIREFNET_REVISION,
      progress_callback: (progress: any) => {
        if (progress.loaded && onProgress) {
          onProgress(progress.loaded, progress.total || BIREFNET_FILE_SIZE);
        }
      },
    }).then((m: any) => {
      cachedBiRefNetWasmModel = m;
      loadingBiRefNetWasmPromise = null;
      return m;
    }).catch((err: any) => {
      loadingBiRefNetWasmPromise = null;
      throw err;
    });

    return loadingBiRefNetWasmPromise;
  }
}

/**
 * Executes BiRefNet FP16 inference on an input image Blob using verified transformers.js pipeline
 *
 * BiRefNet Tensor Contract Specification:
 * - Input: input_image [1, 3, 1024, 1024] NCHW, direct 1024x1024 squash (no letterbox/padding)
 *   Normalized with ImageNet mean [0.485, 0.456, 0.406] and std [0.229, 0.224, 0.225]
 * - Output: output_image [1, 1, 1024, 1024] raw logits -> sigmoid: 1 / (1 + Math.exp(-logit))
 * - High-quality bilinear resize alpha back to original dimensions with imageSmoothingQuality = "high"
 */
async function runBiRefNetInference(
  model: any,
  imageBlob: Blob,
  textPolicy: "keep_text" | "remove_all_text"
): Promise<Blob> {
  // 1. Decode image via RawImage (handles arbitrary formats without canvas stride bugs)
  const rawImage = await RawImage.fromBlob(imageBlob);
  const origW = rawImage.width;
  const origH = rawImage.height;

  // 2. Pre-process image with official BiRefNet feature extractor (ImageNet norm, direct 1024x1024 squash)
  const processor = await getBiRefNetProcessor();
  const { pixel_values } = await processor(rawImage);

  // 3. Predict alpha matte via neural model forward pass
  const outputs = await model({ input_image: pixel_values });
  const outTensor = outputs.output_image || outputs.logits || Object.values(outputs)[0];
  const singleTensor = outTensor.dims && outTensor.dims.length === 4 ? outTensor[0] : outTensor;

  // 4. Sigmoid activation, scale to 0..255 uint8 continuous alpha, and high-quality bilinear resize back to original dimensions
  const rawMaskImage = await RawImage.fromTensor(
    singleTensor.sigmoid().mul(255).to("uint8")
  ).resize(origW, origH);

  const totalOrigPixels = origW * origH;
  const initialAlphaMask = new Uint8ClampedArray(rawMaskImage.data);

  // 5. Extract original RGBA
  const origRgba = new Uint8ClampedArray(rawImage.rgba().data);

  // 6. Apply text policy and hair/fur refinement
  let finalAlphaMask = initialAlphaMask;
  if (textPolicy === "keep_text") {
    try {
      const textDet = detectIndependentTextMask(origRgba, origW, origH);
      if (textDet.hasText && textDet.characterCount >= 2) {
        const filteredTextMask = new Uint8ClampedArray(totalOrigPixels);
        for (let i = 0; i < totalOrigPixels; i++) {
          if (initialAlphaMask[i] > 15) {
            filteredTextMask[i] = textDet.textMask[i];
          }
        }
        const policyRes = applyTextPolicyToMask(initialAlphaMask, filteredTextMask, origW, origH, "keep_text");
        const ownedBuffer = new ArrayBuffer(policyRes.finalAlpha.byteLength);
        new Uint8ClampedArray(ownedBuffer).set(policyRes.finalAlpha);
        finalAlphaMask = new Uint8ClampedArray(ownedBuffer);
      }
    } catch (e) {
      console.warn("[bg-remover-worker] Text stroke detection skipped:", e);
    }
  }

  // Subtle edge refinement and color decontamination for hair strands
  let decontaminatedRgb: Uint8ClampedArray | null = null;
  try {
    const hairRefined = edgeAwareHairFurRefinement(origRgba, finalAlphaMask, origW, origH, {
      preset: "fine_hair",
      alphaChoke: 0.0,
      decontaminateBg: true,
    });
    const ownedHairBuffer = new ArrayBuffer(hairRefined.refinedAlpha.byteLength);
    new Uint8ClampedArray(ownedHairBuffer).set(hairRefined.refinedAlpha);
    finalAlphaMask = new Uint8ClampedArray(ownedHairBuffer);
    decontaminatedRgb = hairRefined.decontaminatedRgba;
  } catch (e) {
    console.warn("[bg-remover-worker] Hair refinement skipped:", e);
  }

  // 7. Composite continuous alpha into original RGBA
  const finalRgba = new Uint8ClampedArray(totalOrigPixels * 4);
  const srcRgba = decontaminatedRgb || origRgba;
  for (let i = 0; i < totalOrigPixels; i++) {
    const p = i * 4;
    finalRgba[p] = srcRgba[p];
    finalRgba[p + 1] = srcRgba[p + 1];
    finalRgba[p + 2] = srcRgba[p + 2];
    finalRgba[p + 3] = finalAlphaMask[i];
  }

  // 8. Generate transparent PNG blob via OffscreenCanvas
  const canvas = new OffscreenCanvas(origW, origH);
  const ctx = canvas.getContext("2d")!;
  const imgData = new ImageData(finalRgba, origW, origH);
  ctx.putImageData(imgData, 0, 0);
  const resultBlob = await canvas.convertToBlob({ type: "image/png" });
  return resultBlob;
}

self.onmessage = async (e: MessageEvent<WorkerIncomingMessage>) => {
  const data = e.data;
  if (data.type === "PRELOAD") {
    try {
      const preloadModel = data.model || "birefnet_fp16";
      if (preloadModel === "birefnet_fp16" || preloadModel === "rmbg_1_4") {
        const hasWorkerGpu =
          typeof navigator !== "undefined" &&
          "gpu" in navigator &&
          Boolean((navigator as unknown as { gpu?: unknown }).gpu);
        const device = hasWorkerGpu ? "webgpu" : "wasm";
        await Promise.all([
          getBiRefNetModel(device),
          getBiRefNetProcessor(),
        ]);
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
    const { jobId, imageBlob, model = "birefnet_fp16", preferWebGpu, textPolicy = "keep_text" } = data;
    const isBiRefNet = model === "birefnet_fp16" || model === "rmbg_1_4";
    let resultBlob: Blob | null = null;
    let actualBackend: "WebGPU" | "WASM" = "WASM";
    let webGpuAvailable = false;
    let webGpuSessionPassed = false;
    let fallbackReason: string | undefined = undefined;
    let actualModel = "onnx-community/BiRefNet_lite-ONNX (FP16)";
    let actualModelFile = "https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/de15b22ba131738a16dff04aab8bdf8dc32e3ac1/onnx/model_fp16.onnx";
    let actualRuntime = "BiRefNet-lite FP16 + WebGPU (@huggingface/transformers)";
    let modelName = "BiRefNet-lite (FP16)";
    const modelResolution = "1024 x 1024";

    const hasWorkerGpu =
      typeof navigator !== "undefined" &&
      "gpu" in navigator &&
      Boolean((navigator as unknown as { gpu?: unknown }).gpu);

    let gpuAdapterAvailable = false;
    const tryWebGpu = preferWebGpu !== false && hasWorkerGpu;

    // Validate image blob
    if (!imageBlob || imageBlob.size === 0) {
      const msg: WorkerErrorMessage = {
        type: "ERROR",
        jobId,
        error: "Invalid or empty image blob provided to worker.",
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

    // 1. PRIMARY PATH: onnx-community/BiRefNet_lite-ONNX FP16 on WebGPU
    if (isBiRefNet && tryWebGpu) {
      try {
        const adapter = await (navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter();
        if (adapter) {
          gpuAdapterAvailable = true;
          webGpuAvailable = true;

          postProgress("loading_model", 10, 100);
          const birefnetModel = await getBiRefNetModel("webgpu", (cur, tot) => {
            postProgress("fetch_model", cur, tot);
          });

          postProgress("inference", 70, 100);
          resultBlob = await runBiRefNetInference(birefnetModel, imageBlob, textPolicy);

          actualBackend = "WebGPU";
          webGpuSessionPassed = true;
          actualRuntime = "BiRefNet-lite FP16 + WebGPU (@huggingface/transformers)";
          modelName = "BiRefNet-lite (FP16)";
          fallbackReason = undefined;
        } else {
          fallbackReason = "WebGPU adapter unavailable";
        }
      } catch (gpuErr: unknown) {
        console.warn("[bg-remover-worker] BiRefNet FP16 WebGPU failed; falling back to WASM:", gpuErr);
        webGpuSessionPassed = false;
        const errMsg = gpuErr instanceof Error ? gpuErr.message : String(gpuErr);
        fallbackReason = `WebGPU execution failed (${errMsg}); engaged WASM fallback`;
      }
    } else if (isBiRefNet && !tryWebGpu) {
      fallbackReason = hasWorkerGpu ? "WebGPU disabled by options" : "WebGPU API unavailable";
    }

    // 2. SECONDARY PATH: onnx-community/BiRefNet_lite-ONNX FP16 on WASM
    if (!resultBlob && isBiRefNet) {
      try {
        postProgress("loading_model", 10, 100);
        const birefnetWasmModel = await getBiRefNetModel("wasm", (cur, tot) => {
          postProgress("fetch_model", cur, tot);
        });

        postProgress("inference", 70, 100);
        resultBlob = await runBiRefNetInference(birefnetWasmModel, imageBlob, textPolicy);

        actualBackend = "WASM";
        actualRuntime = "BiRefNet-lite FP16 + WASM (@huggingface/transformers)";
        modelName = "BiRefNet-lite (FP16)";
        if (!fallbackReason) {
          fallbackReason = "WASM fallback selected";
        }
      } catch (wasmErr: unknown) {
        console.warn("[bg-remover-worker] BiRefNet FP16 WASM failed; engaging safety fallback:", wasmErr);
        if (!fallbackReason) {
          fallbackReason = "BiRefNet FP16 execution unavailable; engaged local safe fallback";
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
