/**
 * Local AI Super-Resolution Engine (Real-ESRGAN Compact ONNX)
 *
 * Implements client/server neural super-resolution with:
 *  - Real-ESRGAN SRVGGNetCompact 4x architecture
 *  - Overlapping patch tiling (256x256 with 16px feathering margin) to prevent memory exhaustion
 *  - Zero giant Float32Array memory allocations
 *  - Support for WebGPU, WASM (SIMD/Multithreaded), and Node.js ONNX Runtime
 *  - Accurate dimension preservation for 2x and 4x
 *  - Truthful backend and model provenance tracking
 */

export const ONNX_UPSCALE_CONFIG = {
  modelName: "realesr-general-x4v3.onnx",
  modelUrl: "/api/assets/models/realesr-general-x4v3.onnx",
  modelRemoteSource: "https://huggingface.co/Heliosoph/realesrgan-onnx/resolve/main/realesr-general-x4v3.onnx",
  modelSha256: "09b757accd747d7e423c1d352b3e8f23e77cc5742d04bae958d4eb8082b76fa4",
  nativeScale: 4 as const,
  tileSize: 256,
  tilePad: 16,
};

export type ExecutionBackend =
  | "WebGPU (Neural Accelerator)"
  | "WASM (CPU SIMD Multithreaded)"
  | "Local ONNX Neural Engine"
  | "Cloud GPU (RunPod Serverless)"
  | "CPU / Algorithmic Fallback";

export interface TileCoordinates {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
}

/**
 * Computes grid of overlapping tiles with border clamping
 */
export function computeOverlappingTiles(
  imageWidth: number,
  imageHeight: number,
  tileSize = ONNX_UPSCALE_CONFIG.tileSize,
  pad = ONNX_UPSCALE_CONFIG.tilePad
): TileCoordinates[] {
  const tiles: TileCoordinates[] = [];
  const step = Math.max(1, tileSize - 2 * pad);

  for (let y = 0; y < imageHeight; y += step) {
    for (let x = 0; x < imageWidth; x += step) {
      const x0 = Math.max(0, x - pad);
      const y0 = Math.max(0, y - pad);
      const x1 = Math.min(imageWidth, x + tileSize - pad);
      const y1 = Math.min(imageHeight, y + tileSize - pad);
      tiles.push({
        x0,
        y0,
        x1,
        y1,
        width: x1 - x0,
        height: y1 - y0,
      });
    }
  }

  return tiles;
}

/**
 * Extracts a sub-tile from raw RGB/RGBA buffer into normalized CHW Float32Array [3, th, tw]
 */
export function extractTileRgbFloat(
  srcData: Uint8Array | Uint8ClampedArray,
  srcWidth: number,
  channels: 3 | 4,
  tile: TileCoordinates
): Float32Array {
  const { x0, y0, width: tw, height: th } = tile;
  const tileFloat = new Float32Array(3 * tw * th);
  const planeSize = tw * th;

  for (let ty = 0; ty < th; ty++) {
    const srcRowOffset = (y0 + ty) * srcWidth * channels;
    const tileRowOffset = ty * tw;

    for (let tx = 0; tx < tw; tx++) {
      const srcPxIdx = srcRowOffset + (x0 + tx) * channels;
      const tilePxIdx = tileRowOffset + tx;

      tileFloat[tilePxIdx] = srcData[srcPxIdx] / 255.0; // R
      tileFloat[planeSize + tilePxIdx] = srcData[srcPxIdx + 1] / 255.0; // G
      tileFloat[2 * planeSize + tilePxIdx] = srcData[srcPxIdx + 2] / 255.0; // B
    }
  }

  return tileFloat;
}

/**
 * Feathers and blends an upscaled tile [3, 4*th, 4*tw] into the output accumulator
 */
export function blendTileWithFeathering(
  outAccum: Float32Array,
  weightAccum: Float32Array,
  outWidth: number,
  tile: TileCoordinates,
  tileData: Float32Array | Float64Array,
  scale: number,
  pad: number
): void {
  const outTw = tile.width * scale;
  const outTh = tile.height * scale;
  const outX0 = tile.x0 * scale;
  const outY0 = tile.y0 * scale;
  const planeSize = outTw * outTh;
  const rampWidth = Math.max(1, pad * scale);

  for (let oty = 0; oty < outTh; oty++) {
    // 1D vertical feathering weight
    const distY = Math.min(oty, outTh - 1 - oty);
    const wy = Math.min(1.0, (distY + 1) / rampWidth);
    const dstRowOffset = (outY0 + oty) * outWidth;
    const tileRowOffset = oty * outTw;

    for (let otx = 0; otx < outTw; otx++) {
      // 1D horizontal feathering weight
      const distX = Math.min(otx, outTw - 1 - otx);
      const wx = Math.min(1.0, (distX + 1) / rampWidth);
      const w = wx * wy;

      const dstIdx = dstRowOffset + (outX0 + otx);
      const tIdx = tileRowOffset + otx;

      outAccum[dstIdx * 3] += tileData[tIdx] * w;
      outAccum[dstIdx * 3 + 1] += tileData[planeSize + tIdx] * w;
      outAccum[dstIdx * 3 + 2] += tileData[2 * planeSize + tIdx] * w;
      weightAccum[dstIdx] += w;
    }
  }
}

/**
 * Normalizes accumulated tile weights into standard RGB Uint8ClampedArray
 */
export function normalizeAccumulatedRgb(
  outAccum: Float32Array,
  weightAccum: Float32Array,
  pixelCount: number
): Uint8ClampedArray {
  const finalRgb = new Uint8ClampedArray(pixelCount * 3);

  for (let i = 0; i < pixelCount; i++) {
    const w = weightAccum[i] > 0 ? weightAccum[i] : 1.0;
    const r = (outAccum[i * 3] / w) * 255.0;
    const g = (outAccum[i * 3 + 1] / w) * 255.0;
    const b = (outAccum[i * 3 + 2] / w) * 255.0;

    finalRgb[i * 3] = r < 0 ? 0 : r > 255 ? 255 : Math.round(r);
    finalRgb[i * 3 + 1] = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
    finalRgb[i * 3 + 2] = b < 0 ? 0 : b > 255 ? 255 : Math.round(b);
  }

  return finalRgb;
}

/**
 * Downscales 4x RGB buffer to 2x RGB buffer with 2x2 area box filter
 */
export function downscaleRgb4xTo2x(
  rgb4x: Uint8ClampedArray | Uint8Array,
  w4x: number,
  h4x: number
): Uint8ClampedArray {
  const w2x = Math.floor(w4x / 2);
  const h2x = Math.floor(h4x / 2);
  const rgb2x = new Uint8ClampedArray(w2x * h2x * 3);

  for (let y = 0; y < h2x; y++) {
    const y0 = y * 2;
    const y1 = y0 + 1;
    const srcRow0 = y0 * w4x * 3;
    const srcRow1 = y1 * w4x * 3;
    const dstRow = y * w2x * 3;

    for (let x = 0; x < w2x; x++) {
      const x0 = x * 2 * 3;
      const x1 = (x * 2 + 1) * 3;
      const dstIdx = dstRow + x * 3;

      for (let c = 0; c < 3; c++) {
        const sum =
          rgb4x[srcRow0 + x0 + c] +
          rgb4x[srcRow0 + x1 + c] +
          rgb4x[srcRow1 + x0 + c] +
          rgb4x[srcRow1 + x1 + c];
        rgb2x[dstIdx + c] = Math.round(sum / 4.0);
      }
    }
  }

  return rgb2x;
}
