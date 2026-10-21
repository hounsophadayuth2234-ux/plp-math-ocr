/**
 * Feature 3 — Real AI Image Super-Resolution Client
 * Connects the Image Upscaler UI directly to the Real-ESRGAN 4x FastAPI backend.
 * Replaces fake client-side sharpening hacks with authentic neural super-resolution.
 */

import {
  calculateImageDiagnostics,
  UpscaleOptions,
  UpscaleResult,
  ImageDiagnostics,
  UpscaleScale,
} from "./image-upscale-engine";

export * from "./image-upscale-engine";

export async function upscaleImageStudio(
  imageSource: File | Blob,
  options: UpscaleOptions
): Promise<UpscaleResult> {
  const startTime = performance.now();

  // 1. Decode image locally to obtain truthful original dimensions & initial diagnostics
  const imgUrl = URL.createObjectURL(imageSource);
  const img = new Image();

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Unable to decode input image."));
    img.src = imgUrl;
  });

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  // Initial local diagnostic calculation
  let diagnostics: ImageDiagnostics;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(srcW, 512);
    canvas.height = Math.min(srcH, 512);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const fallbackDiag = (): ImageDiagnostics => ({
      width: srcW,
      height: srcH,
      megapixels: +(srcW * srcH / 1_000_000).toFixed(2),
      laplacianVariance: 100,
      sharpnessScore: 50,
      noiseLevelScore: 20,
      noiseCategory: "Low",
      noiseCategoryKh: "កម្រិតទាប",
      dynamicRange: 75,
      skinToneRatio: 0,
      midToneRatio: 0.5,
      isDocumentLikely: false,
      isSmoothObjectLikely: false,
      isTinyImage: srcW < 300 || srcH < 300,
      is8xEligible: srcW <= 250 && srcH <= 250,
      isUltraReconstructionRecommended: false,
      recommendedPreset: "general",
      recommendationReason: "General AI Super-Resolution",
      recommendationReasonKh: "Real-ESRGAN AI Super-Resolution",
      actualEngine: "Real AI model",
    });

    if (ctx) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      diagnostics = calculateImageDiagnostics(imgData);
    } else {
      diagnostics = fallbackDiag();
    }
  } catch {
    diagnostics = {
      width: srcW,
      height: srcH,
      megapixels: +(srcW * srcH / 1_000_000).toFixed(2),
      laplacianVariance: 100,
      sharpnessScore: 50,
      noiseLevelScore: 20,
      noiseCategory: "Low",
      noiseCategoryKh: "កម្រិតទាប",
      dynamicRange: 75,
      skinToneRatio: 0,
      midToneRatio: 0.5,
      isDocumentLikely: false,
      isSmoothObjectLikely: false,
      isTinyImage: srcW < 300 || srcH < 300,
      is8xEligible: srcW <= 250 && srcH <= 250,
      isUltraReconstructionRecommended: false,
      recommendedPreset: "general",
      recommendationReason: "General AI Super-Resolution",
      recommendationReasonKh: "Real-ESRGAN AI Super-Resolution",
      actualEngine: "Real AI model",
    };
  } finally {
    URL.revokeObjectURL(imgUrl);
  }

  // Stage 1: Smart Input Validation
  options.onProgress?.({
    stage: 1,
    totalStages: 5,
    stageName: "Smart Image Diagnostics",
    stageNameKh: "វិភាគកម្រិតគុណភាពរូបភាព",
    percent: 20,
  });

  // Stage 2: Dispatching to Real-ESRGAN Backend
  options.onProgress?.({
    stage: 2,
    totalStages: 5,
    stageName: "Preparing AI Inference Payload",
    stageNameKh: "រៀបចំទិន្នន័យបញ្ជូនទៅ Real-ESRGAN AI",
    percent: 40,
  });

  // 2. Prepare FormData payload
  const formData = new FormData();
  if (imageSource instanceof File) {
    formData.append("image", imageSource, imageSource.name);
  } else {
    formData.append("image", imageSource, "input-image.png");
  }
  formData.append("scale", "4");

  // Determine backend endpoint
  const endpoint =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_HF_UPSCALE_URL) ||
    "/api/upscale";

  // Stage 3: Neural Inference
  options.onProgress?.({
    stage: 3,
    totalStages: 5,
    stageName: "Real-ESRGAN 4X Super-Resolution",
    stageNameKh: "ដំណើរការ Real-ESRGAN AI Super-Resolution (4X)",
    percent: 65,
  });

  // 3. Dispatch to FastAPI / Next.js backend
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "image/png, application/json",
      "x-raw-response": "true",
    },
    body: formData,
    signal: options.signal,
  });

  if (!res.ok) {
    let errMessage = "ការធ្វើឱ្យរូបភាពច្បាស់មិនបានសម្រេច។ សូមសាកល្បងម្តងទៀត។";
    try {
      const errJson = await res.json();
      if (errJson.error) {
        errMessage = errJson.error;
      }
    } catch {
      // Fallback message
    }
    throw new Error(errMessage);
  }

  // Stage 4: Postprocessing & Output Assembly
  options.onProgress?.({
    stage: 4,
    totalStages: 5,
    stageName: "Postprocessing & PNG Assembly",
    stageNameKh: "រៀបចំរូបភាពច្បាស់គុណភាពខ្ពស់ PNG",
    percent: 90,
  });

  // Read response headers for truthful resolution & model metadata
  const factor = parseInt(res.headers.get("X-Upscale-Factor") || "4", 10);
  const procW = parseInt(res.headers.get("X-Processed-Width") || String(srcW), 10);
  const procH = parseInt(res.headers.get("X-Processed-Height") || String(srcH), 10);
  const wasDownscaled =
    res.headers.get("X-Was-Downscaled") === "true" ||
    procW < srcW ||
    procH < srcH;

  const headerOutW = parseInt(res.headers.get("X-Output-Width") || "0", 10);
  const headerOutH = parseInt(res.headers.get("X-Output-Height") || "0", 10);
  const outW = headerOutW || procW * factor;
  const outH = headerOutH || procH * factor;

  const contentType = res.headers.get("content-type") || "";
  let blob: Blob;

  if (contentType.includes("application/json")) {
    const json = await res.json();
    if (json.outputUrl?.startsWith("data:")) {
      const dataUriParts = json.outputUrl.split(",");
      const mime = dataUriParts[0].match(/:(.*?);/)?.[1] || "image/png";
      const bstr = atob(dataUriParts[1]);
      let n = bstr.length;
      const u8arr = new Uint8ClampedArray(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      blob = new Blob([u8arr], { type: mime });
    } else {
      const fetched = await fetch(json.outputUrl);
      blob = await fetched.blob();
    }
  } else {
    blob = await res.blob();
  }

  const outputUrl = URL.createObjectURL(blob);
  const elapsedMs = Math.round(performance.now() - startTime);

  // Stage 5: Complete
  options.onProgress?.({
    stage: 5,
    totalStages: 5,
    stageName: "Complete",
    stageNameKh: "រួចរាល់ 100%",
    percent: 100,
  });

  diagnostics.actualEngine = "Real AI model";

  return {
    outputUrl,
    blob,
    srcWidth: srcW,
    srcHeight: srcH,
    outputWidth: outW,
    outputHeight: outH,
    scale: (factor as UpscaleScale) || 4,
    requestedScale: 4,
    isFallback: wasDownscaled,
    fallbackReason: wasDownscaled
      ? `រូបដើមធំជាង 1200px ត្រូវបានសម្រួលទំហំសុវត្ថិភាព CPU មុនពេលដំណើរការ Real-ESRGAN (Input capped at 1200px for CPU safety)`
      : undefined,
    diagnostics,
    elapsedMs,
    label: "Local worker result",
    model: "Real-ESRGAN (4x · Compact SRVGGNet)",
    engine: "Real AI model",
    jobId: options.jobId,
  };
}
