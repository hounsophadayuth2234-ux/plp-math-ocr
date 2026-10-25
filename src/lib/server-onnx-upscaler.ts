import fs from "fs";
import path from "path";
import sharp from "sharp";
import {
  ONNX_UPSCALE_CONFIG,
  computeOverlappingTiles,
  extractTileRgbFloat,
  blendTileWithFeathering,
  normalizeAccumulatedRgb,
  downscaleRgb4xTo2x,
} from "./onnx-super-resolution";

// In-memory persistent session cache
let globalOnnxSession: any = null;
let globalOrtNode: any = null;
let sessionInitPromise: Promise<any> | null = null;

export async function getServerOnnxSession() {
  if (globalOnnxSession) return globalOnnxSession;
  if (sessionInitPromise) return sessionInitPromise;

  sessionInitPromise = (async () => {
    const modelPath = path.join(
      process.cwd(),
      "public",
      "models",
      ONNX_UPSCALE_CONFIG.modelName
    );

    if (!fs.existsSync(modelPath)) {
      throw new Error(`ONNX model file not found at ${modelPath}`);
    }

    // Dynamic import to avoid SSR bundling issues in Edge/client
    const ort = await import("onnxruntime-node");
    globalOrtNode = ort.default || ort;

    const sessionOptions: any = {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
      intraOpNumThreads: 2,
    };

    const session = await globalOrtNode.InferenceSession.create(
      modelPath,
      sessionOptions
    );
    globalOnnxSession = session;
    console.log(
      `[ServerOnnxUpscaler] Real-ESRGAN ONNX session initialized successfully with model: ${ONNX_UPSCALE_CONFIG.modelName}`
    );
    return session;
  })();

  try {
    return await sessionInitPromise;
  } catch (err) {
    sessionInitPromise = null;
    throw err;
  }
}

export interface ServerUpscaleResult {
  outputBuffer: Buffer;
  srcWidth: number;
  srcHeight: number;
  outputWidth: number;
  outputHeight: number;
  scale: 2 | 4;
  model: string;
  backend: string;
  elapsedMs: number;
  isAiInference: boolean;
}

/**
 * Executes authentic Real-ESRGAN neural super-resolution on server
 */
export async function runServerOnnxSuperResolution(
  inputBuffer: Buffer,
  requestedScale: 2 | 4 = 4
): Promise<ServerUpscaleResult> {
  const t0 = performance.now();
  const session = await getServerOnnxSession();
  const ort = globalOrtNode;

  // Read metadata and raw pixels
  const image = sharp(inputBuffer);
  const meta = await image.metadata();
  const srcW = meta.width;
  const srcH = meta.height;

  if (!srcW || !srcH) {
    throw new Error("Unable to determine input image dimensions.");
  }

  const hasAlpha = Boolean(meta.hasAlpha);
  const { data: rawPixels } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = hasAlpha ? 4 : 3;

  // Extract separate alpha channel if needed
  let rawAlpha: Uint8Array | null = null;
  if (hasAlpha) {
    rawAlpha = new Uint8Array(srcW * srcH);
    for (let i = 0; i < srcW * srcH; i++) {
      rawAlpha[i] = rawPixels[i * 4 + 3];
    }
  }

  // Target 4x native dimensions
  const outW4x = srcW * ONNX_UPSCALE_CONFIG.nativeScale;
  const outH4x = srcH * ONNX_UPSCALE_CONFIG.nativeScale;

  // Accumulator buffers for tiled inference
  const outAccum = new Float32Array(outW4x * outH4x * 3);
  const weightAccum = new Float32Array(outW4x * outH4x);

  const tiles = computeOverlappingTiles(
    srcW,
    srcH,
    ONNX_UPSCALE_CONFIG.tileSize,
    ONNX_UPSCALE_CONFIG.tilePad
  );

  const inputName = session.inputNames[0] || "input";

  for (const tile of tiles) {
    const tileFloat = extractTileRgbFloat(rawPixels, srcW, channels as 3 | 4, tile);
    const tensor = new ort.Tensor("float32", tileFloat, [
      1,
      3,
      tile.height,
      tile.width,
    ]);

    const feeds: Record<string, any> = {};
    feeds[inputName] = tensor;

    const results = await session.run(feeds);
    const outputName = session.outputNames[0] || "output";
    const outTensor = results[outputName];

    blendTileWithFeathering(
      outAccum,
      weightAccum,
      outW4x,
      tile,
      outTensor.data as Float32Array,
      ONNX_UPSCALE_CONFIG.nativeScale,
      ONNX_UPSCALE_CONFIG.tilePad
    );
  }

  let finalRgb = normalizeAccumulatedRgb(outAccum, weightAccum, outW4x * outH4x);
  let finalW = outW4x;
  let finalH = outH4x;

  // If 2x requested, downscale 4x neural output to 2x using 2x2 box filter
  if (requestedScale === 2) {
    finalRgb = downscaleRgb4xTo2x(finalRgb, outW4x, outH4x);
    finalW = Math.floor(outW4x / 2);
    finalH = Math.floor(outH4x / 2);
  }

  let outputBuffer: Buffer;

  if (hasAlpha && rawAlpha) {
    // Upscale alpha channel with Lanczos-3 to match final dimensions
    const upscaledAlpha = await sharp(rawAlpha, {
      raw: { width: srcW, height: srcH, channels: 1 },
    })
      .resize(finalW, finalH, { kernel: "lanczos3" })
      .raw()
      .toBuffer();

    // Interleave RGB + Alpha into RGBA
    const finalRgba = new Uint8ClampedArray(finalW * finalH * 4);
    for (let i = 0; i < finalW * finalH; i++) {
      finalRgba[i * 4] = finalRgb[i * 3];
      finalRgba[i * 4 + 1] = finalRgb[i * 3 + 1];
      finalRgba[i * 4 + 2] = finalRgb[i * 3 + 2];
      finalRgba[i * 4 + 3] = upscaledAlpha[i];
    }

    outputBuffer = await sharp(finalRgba, {
      raw: { width: finalW, height: finalH, channels: 4 },
    })
      .png({ compressionLevel: 6 })
      .toBuffer();
  } else {
    outputBuffer = await sharp(finalRgb, {
      raw: { width: finalW, height: finalH, channels: 3 },
    })
      .png({ compressionLevel: 6 })
      .toBuffer();
  }

  const elapsedMs = Math.round(performance.now() - t0);

  return {
    outputBuffer,
    srcWidth: srcW,
    srcHeight: srcH,
    outputWidth: finalW,
    outputHeight: finalH,
    scale: requestedScale,
    model: `Real-ESRGAN (${requestedScale}x · Compact SRVGGNet ONNX)`,
    backend: "Local ONNX Neural Engine",
    elapsedMs,
    isAiInference: true,
  };
}
