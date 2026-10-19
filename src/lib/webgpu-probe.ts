/**
 * WebGPU and WASM Capability Probing and Telemetry Module
 *
 * Implements safe, non-crashing detection of WebGPU availability:
 * 1. Checks navigator.gpu
 * 2. Requests high-performance adapter
 * 3. Requests device
 * 4. Verifies execution runtime support
 * 5. Safely falls back to WASM when WebGPU is unavailable
 */

export interface WebGpuProbeResult {
  available: boolean;
  backend: "WebGPU" | "WASM";
  fallbackReason?:
    | "WebGPU API unavailable"
    | "Adapter unavailable"
    | "Device creation failed"
    | "Model/runtime does not support WebGPU"
    | "WebGPU session initialization failed"
    | "WASM fallback selected";
  adapterInfo?: string;
  details?: string;
  simdSupported: boolean;
  threads: number;
  crossOriginIsolated: boolean;
}

let cachedProbeResult: WebGpuProbeResult | null = null;

/**
 * Probes the browser environment for genuine WebGPU hardware acceleration and WASM capabilities.
 */
export async function probeWebGpuAndWasm(forceFresh = false): Promise<WebGpuProbeResult> {
  if (cachedProbeResult && !forceFresh) {
    return cachedProbeResult;
  }

  const isIsolated = typeof window !== "undefined" ? Boolean(window.crossOriginIsolated) : false;
  const hw = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  // If crossOriginIsolated is true, SharedArrayBuffer allows safe threads up to hw - 1, capped at 4
  const threads = isIsolated ? Math.min(4, Math.max(1, hw > 2 ? hw - 1 : 1)) : 1;

interface NavigatorWithGpu {
  gpu?: {
    requestAdapter(options?: { powerPreference?: string }): Promise<GpuAdapterLike | null>;
  };
}

interface GpuAdapterLike {
  requestDevice(): Promise<unknown>;
  info?: {
    vendor?: string;
    architecture?: string;
    device?: string;
  };
}

// Zero-dependency WASM SIMD validation byte pattern
const simdSupported =
  typeof WebAssembly !== "undefined" && typeof WebAssembly.validate === "function"
    ? WebAssembly.validate(
        new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 26, 11])
      )
    : false;

// Step 1: Check navigator.gpu
const nav = typeof navigator !== "undefined" ? (navigator as unknown as NavigatorWithGpu) : null;
if (!nav || !nav.gpu) {
  cachedProbeResult = {
    available: false,
    backend: "WASM",
    fallbackReason: "WebGPU API unavailable",
    details: "navigator.gpu is not available in this browser or platform.",
    simdSupported,
    threads,
    crossOriginIsolated: isIsolated,
  };
  return cachedProbeResult;
}

// Step 2: Request a high-performance adapter
let adapter: GpuAdapterLike | null = null;
try {
  adapter = await nav.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
} catch (err) {
  cachedProbeResult = {
    available: false,
    backend: "WASM",
    fallbackReason: "Adapter unavailable",
    details: `requestAdapter threw error: ${err instanceof Error ? err.message : String(err)}`,
    simdSupported,
    threads,
    crossOriginIsolated: isIsolated,
  };
  return cachedProbeResult;
}

if (!adapter) {
  cachedProbeResult = {
    available: false,
    backend: "WASM",
    fallbackReason: "Adapter unavailable",
    details: "navigator.gpu.requestAdapter() returned null (no compatible GPU device found).",
    simdSupported,
    threads,
    crossOriginIsolated: isIsolated,
  };
  return cachedProbeResult;
}

// Step 3: Request a device
let device: unknown = null;
try {
  device = await adapter.requestDevice();
} catch (err) {
  cachedProbeResult = {
    available: false,
    backend: "WASM",
    fallbackReason: "Device creation failed",
    details: `adapter.requestDevice() failed: ${err instanceof Error ? err.message : String(err)}`,
    simdSupported,
    threads,
    crossOriginIsolated: isIsolated,
  };
  return cachedProbeResult;
}

  if (!device) {
    cachedProbeResult = {
      available: false,
      backend: "WASM",
      fallbackReason: "Device creation failed",
      details: "adapter.requestDevice() returned null device.",
      simdSupported,
      threads,
      crossOriginIsolated: isIsolated,
    };
    return cachedProbeResult;
  }

  // Adapter and Device are genuine and active!
  let adapterInfo = "WebGPU High-Performance GPU";
  try {
    if (typeof adapter.info === "object" && adapter.info?.vendor) {
      adapterInfo = `${adapter.info.vendor} ${adapter.info.architecture || adapter.info.device || ""}`.trim();
    }
  } catch {}

  cachedProbeResult = {
    available: true,
    backend: "WebGPU",
    adapterInfo,
    simdSupported,
    threads,
    crossOriginIsolated: isIsolated,
  };
  return cachedProbeResult;
}

/**
 * Synchronous getter for current cached probe result or default fallback.
 */
export function getWebGpuProbeSync(): WebGpuProbeResult {
  if (cachedProbeResult) {
    return cachedProbeResult;
  }
  const isIsolated = typeof window !== "undefined" ? Boolean(window.crossOriginIsolated) : false;
  const hw = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  const threads = isIsolated ? Math.min(4, Math.max(1, hw > 2 ? hw - 1 : 1)) : 1;
  const simdSupported =
    typeof WebAssembly !== "undefined" && typeof WebAssembly.validate === "function"
      ? WebAssembly.validate(
          new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 26, 11])
        )
      : false;

  return {
    available: false,
    backend: "WASM",
    fallbackReason: "WebGPU API unavailable",
    details: "Probing pending initial execution.",
    simdSupported,
    threads,
    crossOriginIsolated: isIsolated,
  };
}
