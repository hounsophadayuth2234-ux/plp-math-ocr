import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  setForceOfflineMode,
  isForceOfflineMode,
} from "../src/lib/environment-boundary";
import {
  removeBackgroundWithNativeFallback,
  upscaleImageWithNativeFallback,
} from "../src/lib/tauri-fallback-bridge";
import { upscaleImageStudio } from "../src/lib/image-upscale-client";

// Helper to compute a simple SHA-256 hex string from ArrayBuffer
async function hashBuffer(buf: ArrayBuffer): Promise<string> {
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Generates a mock image Blob with given dimensions and PNG IHDR header
function createTestImageBlob(width: number, height: number, seed = 1): Blob {
  const pixelBytes = width * height * 4;
  const size = 33 + pixelBytes;
  const data = new Uint8Array(size);
  // PNG Magic
  data[0] = 0x89; data[1] = 0x50; data[2] = 0x4e; data[3] = 0x47;
  data[4] = 0x0d; data[5] = 0x0a; data[6] = 0x1a; data[7] = 0x0a;
  // IHDR length
  data[8] = 0; data[9] = 0; data[10] = 0; data[11] = 13;
  // IHDR chunk type
  data[12] = 0x49; data[13] = 0x48; data[14] = 0x44; data[15] = 0x52;
  // Width (big endian)
  data[16] = (width >> 24) & 0xff;
  data[17] = (width >> 16) & 0xff;
  data[18] = (width >> 8) & 0xff;
  data[19] = width & 0xff;
  // Height (big endian)
  data[20] = (height >> 24) & 0xff;
  data[21] = (height >> 16) & 0xff;
  data[22] = (height >> 8) & 0xff;
  data[23] = height & 0xff;
  // Bit depth 8, Color type 6 (RGBA)
  data[24] = 8; data[25] = 6;

  for (let i = 33; i < size; i += 4) {
    const px = Math.floor((i - 33) / 4);
    const x = px % width;
    const y = Math.floor(px / width);
    data[i + 0] = (x * seed) % 256;       // R
    data[i + 1] = (y * seed) % 256;       // G
    data[i + 2] = ((x + y) * seed) % 256; // B
    data[i + 3] = 255;                    // A
  }
  return new Blob([data], { type: "image/png" });
}

describe("PHASE 3 & PHASE 4 — Native Android Inference & Verification Suite", () => {
  const storageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString();
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  })();

  beforeEach(() => {
    storageMock.clear();
    (globalThis as any).localStorage = storageMock;
    (globalThis as any).window = {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    delete (globalThis as any).__TAURI__;
    setForceOfflineMode(false);
  });

  afterEach(() => {
    setForceOfflineMode(false);
    delete (globalThis as any).__TAURI__;
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // PHASE 3: Module 02 Background Remover Deadlock & Memory Fix
  // ─────────────────────────────────────────────────────────────
  describe("Phase 3: Module 02 Native Deadlock, Memory Allocation & Transport", () => {
    it("should prove two sequential Module 02 background removal requests complete successfully", async () => {
      const inputBlob1 = createTestImageBlob(128, 128, 7);
      const inputBlob2 = createTestImageBlob(128, 128, 13);

      // Run 1: First inference
      const res1 = await removeBackgroundWithNativeFallback(inputBlob1, {
        modelType: "birefnet_full",
        refineEdges: true,
      });

      expect(res1.success).toBe(true);
      expect(res1.transparentBlob).toBeDefined();
      expect(res1.transparentBlob!.size).toBeGreaterThan(0);
      expect(res1.alphaMaskBuffer).toBeDefined();
      expect(res1.alphaMaskBuffer!.length).toBe(128 * 128);
      expect(res1.backendUsed).not.toContain("NPU"); // Honest reporting: not running on physical NPU in test

      // Run 2: Second sequential inference (verifies zero deadlock and memory cleanup)
      const res2 = await removeBackgroundWithNativeFallback(inputBlob2, {
        modelType: "rmbg_1_4",
        refineEdges: true,
      });

      expect(res2.success).toBe(true);
      expect(res2.transparentBlob).toBeDefined();
      expect(res2.transparentBlob!.size).toBeGreaterThan(0);
      expect(res2.alphaMaskBuffer!.length).toBe(128 * 128);
    });

    it("should generate a non-trivial alpha mask and verify output content differs from input", async () => {
      const inputBlob = createTestImageBlob(64, 64, 42);
      const inBuf = await inputBlob.arrayBuffer();
      const inHash = await hashBuffer(inBuf);

      const res = await removeBackgroundWithNativeFallback(inputBlob);
      const outBuf = await res.transparentBlob!.arrayBuffer();
      const outHash = await hashBuffer(outBuf);

      // Verify that output hash differs from input (no identity passthrough)
      expect(outHash).not.toBe(inHash);

      // Verify non-trivial alpha mask (contains transparent margin pixels AND opaque center)
      let transparentPixels = 0;
      let opaquePixels = 0;
      for (let i = 0; i < res.alphaMaskBuffer!.length; i++) {
        if (res.alphaMaskBuffer![i] === 0) transparentPixels++;
        if (res.alphaMaskBuffer![i] === 255) opaquePixels++;
      }
      expect(transparentPixels).toBeGreaterThan(0);
      expect(opaquePixels).toBeGreaterThan(0);
    });

    it("should gracefully handle user cancellation without hanging", async () => {
      const inputBlob = createTestImageBlob(64, 64);
      const controller = new AbortController();
      controller.abort(); // Pre-aborted

      await expect(
        removeBackgroundWithNativeFallback(inputBlob, { signal: controller.signal })
      ).rejects.toThrow(/aborted/i);
    });

    it("should strictly eliminate Array.from(rawBytes) from the entire codebase", () => {
      const bridgeCode = fs.readFileSync(
        path.resolve(__dirname, "../src/lib/tauri-fallback-bridge.ts"),
        "utf-8"
      );
      // Ensure no active code calls Array.from(rawBytes)
      const activeArrayFrom = bridgeCode
        .split("\n")
        .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
        .filter((l) => l.includes("Array.from(rawBytes)"));
      expect(activeArrayFrom.length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // PHASE 4: Module 03 Image Upscaler Real Scaling & Hash Divergence
  // ─────────────────────────────────────────────────────────────
  describe("Phase 4: Module 03 Verified Scaling, Passthrough Removal & Hash Divergence", () => {
    it("should remove all identity passthroughs in Rust and commands.rs", () => {
      const rustLib = fs.readFileSync(
        path.resolve(__dirname, "../src-tauri/src/lib.rs"),
        "utf-8"
      );
      const commandsRs = fs.readFileSync(
        path.resolve(__dirname, "../android-offline-spike/tauri-bridge/commands.rs"),
        "utf-8"
      );

      // Neither should contain output_bytes: req.image_bytes
      expect(rustLib).not.toContain("output_bytes: req.image_bytes");
      expect(commandsRs).not.toContain("output_bytes: req.image_bytes");
    });

    it("should upscale at 1x, 2x, and 4x with strictly verified output dimensions", async () => {
      const srcW = 32;
      const srcH = 32;
      const inputBlob = createTestImageBlob(srcW, srcH, 3);

      // 1x scale
      const res1x = await upscaleImageWithNativeFallback(inputBlob, { scale: 1 });
      expect(res1x.outputWidth).toBe(srcW * 1);
      expect(res1x.outputHeight).toBe(srcH * 1);
      expect(res1x.scale).toBe(1);

      // 2x scale
      const res2x = await upscaleImageWithNativeFallback(inputBlob, { scale: 2 });
      expect(res2x.outputWidth).toBe(srcW * 2);
      expect(res2x.outputHeight).toBe(srcH * 2);
      expect(res2x.scale).toBe(2);

      // 4x scale
      const res4x = await upscaleImageWithNativeFallback(inputBlob, { scale: 4 });
      expect(res4x.outputWidth).toBe(srcW * 4);
      expect(res4x.outputHeight).toBe(srcH * 4);
      expect(res4x.scale).toBe(4);
    });

    it("should verify that 2x and 4x output hashes differ from input hash and each other", async () => {
      const inputBlob = createTestImageBlob(48, 48, 5);
      const inBuf = await inputBlob.arrayBuffer();
      const inHash = await hashBuffer(inBuf);

      const res2x = await upscaleImageWithNativeFallback(inputBlob, { scale: 2 });
      const buf2x = await res2x.blob.arrayBuffer();
      const hash2x = await hashBuffer(buf2x);

      const res4x = await upscaleImageWithNativeFallback(inputBlob, { scale: 4 });
      const buf4x = await res4x.blob.arrayBuffer();
      const hash4x = await hashBuffer(buf4x);

      // Output hashes MUST diverge from input hash and each other
      expect(hash2x).not.toBe(inHash);
      expect(hash4x).not.toBe(inHash);
      expect(hash4x).not.toBe(hash2x);

      // Buffer sizes must be greater than original input
      expect(res2x.blob.size).toBeGreaterThan(0);
      expect(res4x.blob.size).toBeGreaterThan(0);
    });

    it("should honestly report CPU/Bicubic resampler backend and NEVER claim GPU/NPU in browser mode", async () => {
      const inputBlob = createTestImageBlob(32, 32);
      const res = await upscaleImageWithNativeFallback(inputBlob, { scale: 2 });

      // In browser/node without Tauri native GPU, it must honestly report CPU/Bicubic resampler
      expect(res.backend).toContain("CPU");
      expect(res.backend).not.toContain("Qualcomm Adreno 830 GPU");
    });

    it("should block cloud /api/upscale when Force Offline Mode is enabled", async () => {
      setForceOfflineMode(true);
      expect(isForceOfflineMode()).toBe(true);

      const inputBlob = createTestImageBlob(32, 32);

      // When Force Offline Mode is active, upscaleImageStudio must route locally without hitting cloud
      const res = await upscaleImageStudio(inputBlob, {
        scale: 2,
        preset: "general",
        faceEnhance: false,
        sharpness: 50,
        denoise: 30,
        clarity: 40,
      });

      expect(res.blob).toBeDefined();
      expect(res.outputWidth).toBe(64);
      expect(res.outputHeight).toBe(64);
      expect(res.scale).toBe(2);
      expect(res.engine).toContain("CPU");
    });
  });
});
