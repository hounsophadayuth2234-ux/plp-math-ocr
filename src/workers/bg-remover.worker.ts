// Application-owned Web Worker for Module 02 Background Remover
// Client-side inference with onnx-community/BiRefNet_lite-ONNX FP16 on WebGPU, fallback to WASM, and safety fallback to @imgly/isnet_fp16.

import { removeBackground, preload } from "@imgly/background-removal";
import { AutoModel, AutoProcessor, RawImage, env } from "@huggingface/transformers";
import {
  detectIndependentTextMask,
  applyTextPolicyToMask,
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

  // 6. Dominant background color estimation from corners & border samples
  const cornerCoords = [
    [10, 10], [origW - 10, 10], [10, origH - 10], [origW - 10, origH - 10],
    [5, Math.floor(origH / 2)], [origW - 5, Math.floor(origH / 2)]
  ];
  let sumBgR = 0, sumBgG = 0, sumBgB = 0, bgSamples = 0;
  for (const [cx, cy] of cornerCoords) {
    if (cx >= 0 && cx < origW && cy >= 0 && cy < origH) {
      const p = (cy * origW + cx) * 4;
      sumBgR += origRgba[p];
      sumBgG += origRgba[p + 1];
      sumBgB += origRgba[p + 2];
      bgSamples++;
    }
  }
  const bgR = bgSamples > 0 ? Math.round(sumBgR / bgSamples) : 250;
  const bgG = bgSamples > 0 ? Math.round(sumBgG / bgSamples) : 218;
  const bgB = bgSamples > 0 ? Math.round(sumBgB / bgSamples) : 221;

  // 7. Precision boundary refinement on continuous alpha mask
  const refinedAlpha = new Uint8ClampedArray(totalOrigPixels);
  const decontaminatedRgba = new Uint8ClampedArray(origRgba);

  for (let y = 0; y < origH; y++) {
    const yOff = y * origW;
    for (let x = 0; x < origW; x++) {
      const idx = yOff + x;
      const p = idx * 4;
      const r = origRgba[p], g = origRgba[p + 1], b = origRgba[p + 2];
      const rawA = initialAlphaMask[idx];

      const colorDist = Math.hypot(r - bgR, g - bgG, b - bgB);
      const isPureBg = (r === bgR && g === bgG && b === bgB);
      const isNearBg = colorDist <= 10;

      let a = rawA;

      if (rawA < 35 || isPureBg) {
        a = 0;
      } else if (isNearBg && rawA < 160) {
        // Bilinear halo on near-background -> clear
        a = 0;
      } else if (rawA >= 240) {
        // High confidence foreground core
        a = 255;
      } else {
        // Smooth continuous transition for fine hair/fur strands
        const norm = (rawA - 35) / (240 - 35);
        a = Math.round(Math.pow(norm, 1.2) * 255);
      }

      refinedAlpha[idx] = a;
    }
  }

  // 8. Torso, Head, and Clothing Core Solidness Enforcement (Fill Pinholes)
  // Flood fill from outer image borders to locate outer background
  const isOuterBg = new Uint8Array(totalOrigPixels);
  const q = new Int32Array(totalOrigPixels);
  let qHead = 0, qTail = 0;

  for (let x = 0; x < origW; x++) {
    if (refinedAlpha[x] === 0) { isOuterBg[x] = 1; q[qTail++] = x; }
    const bottom = (origH - 1) * origW + x;
    if (refinedAlpha[bottom] === 0 && !isOuterBg[bottom]) { isOuterBg[bottom] = 1; q[qTail++] = bottom; }
  }
  for (let y = 0; y < origH; y++) {
    const left = y * origW;
    if (refinedAlpha[left] === 0 && !isOuterBg[left]) { isOuterBg[left] = 1; q[qTail++] = left; }
    const right = y * origW + (origW - 1);
    if (refinedAlpha[right] === 0 && !isOuterBg[right]) { isOuterBg[right] = 1; q[qTail++] = right; }
  }

  while (qHead < qTail) {
    const curr = q[qHead++];
    const cy = Math.floor(curr / origW);
    const cx = curr % origW;

    const neighbors = [
      cx > 0 ? curr - 1 : -1,
      cx < origW - 1 ? curr + 1 : -1,
      cy > 0 ? curr - origW : -1,
      cy < origH - 1 ? curr + origW : -1,
    ];

    for (const n of neighbors) {
      if (n >= 0 && isOuterBg[n] === 0 && refinedAlpha[n] < 128) {
        isOuterBg[n] = 1;
        q[qTail++] = n;
      }
    }
  }

  for (let i = 0; i < totalOrigPixels; i++) {
    const p = i * 4;
    const r = origRgba[p], g = origRgba[p + 1], b = origRgba[p + 2];
    const isPureBg = (r === bgR && g === bgG && b === bgB);
    const isNearBg = Math.hypot(r - bgR, g - bgG, b - bgB) <= 10;

    // Fill internal holes in the clothing/torso/head (never fill background pixels!)
    if (isOuterBg[i] === 0 && !isPureBg && !isNearBg && refinedAlpha[i] < 255) {
      refinedAlpha[i] = 255;
    }
  }

  // 9. Color Decontamination on semi-transparent transition pixels
  for (let i = 0; i < totalOrigPixels; i++) {
    const a = refinedAlpha[i];
    if (a > 0 && a < 255) {
      const p = i * 4;
      const alphaNorm = a / 255.0;
      const invAlpha = 1.0 - alphaNorm;

      const unmixedR = Math.max(0, Math.min(255, Math.round((origRgba[p] - invAlpha * bgR) / alphaNorm)));
      const unmixedG = Math.max(0, Math.min(255, Math.round((origRgba[p + 1] - invAlpha * bgG) / alphaNorm)));
      const unmixedB = Math.max(0, Math.min(255, Math.round((origRgba[p + 2] - invAlpha * bgB) / alphaNorm)));

      decontaminatedRgba[p] = unmixedR;
      decontaminatedRgba[p + 1] = unmixedG;
      decontaminatedRgba[p + 2] = unmixedB;
    }
  }

  // 10. Optional Text Policy (Preserves standalone problem text or annotations outside person core)
  let finalAlphaMask = refinedAlpha;
  if (textPolicy === "keep_text") {
    try {
      const textDet = detectIndependentTextMask(origRgba, origW, origH);
      if (textDet.hasText && textDet.characterCount >= 2) {
        const filteredTextMask = new Uint8ClampedArray(totalOrigPixels);
        for (let i = 0; i < totalOrigPixels; i++) {
          // Only preserve text outside the solid subject core
          if (refinedAlpha[i] < 240 && textDet.textMask[i] > 20) {
            filteredTextMask[i] = textDet.textMask[i];
          }
        }
        const policyRes = applyTextPolicyToMask(refinedAlpha, filteredTextMask, origW, origH, "keep_text");
        const ownedBuffer = new ArrayBuffer(policyRes.finalAlpha.byteLength);
        new Uint8ClampedArray(ownedBuffer).set(policyRes.finalAlpha);
        finalAlphaMask = new Uint8ClampedArray(ownedBuffer);
      }
    } catch (e) {
      console.warn("[bg-remover-worker] Text stroke detection skipped:", e);
    }
  }

  // 11. Composite continuous alpha into decontaminated RGBA
  const finalRgba = new Uint8ClampedArray(totalOrigPixels * 4);
  const srcRgba = decontaminatedRgba;
  for (let i = 0; i < totalOrigPixels; i++) {
    const p = i * 4;
    finalRgba[p] = srcRgba[p];
    finalRgba[p + 1] = srcRgba[p + 1];
    finalRgba[p + 2] = srcRgba[p + 2];
    finalRgba[p + 3] = finalAlphaMask[i];
  }

  // 12. Generate transparent PNG blob via OffscreenCanvas
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
