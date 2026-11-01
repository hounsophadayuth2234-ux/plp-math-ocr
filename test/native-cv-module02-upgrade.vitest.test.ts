import { describe, it, expect } from "vitest";
import {
  isTauriEnvironment,
  removeBackgroundWithNativeFallback,
} from "@/lib/tauri-fallback-bridge";
import fs from "fs";
import path from "path";

describe("Module 02: Background Remover Native NPU Upgrade", () => {
  const rootDir = process.cwd();

  it("exports removeBackgroundWithNativeFallback function", () => {
    expect(typeof removeBackgroundWithNativeFallback).toBe("function");
  });

  it("executes native fallback returning commercial BiRefNet model metadata and NPU backend", async () => {
    // 1x1 transparent PNG byte dummy
    const dummyBlob = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
      type: "image/png",
    });

    const progressLogs: string[] = [];
    const result = await removeBackgroundWithNativeFallback(dummyBlob, {
      modelType: "birefnet_full",
      refineEdges: true,
      onProgress: (p) => {
        progressLogs.push(p.stageKey);
      },
    });

    expect(result.success).toBe(true);
    expect(result.modelName).toBe("Full BiRefNet (Commercial 1024)");
    expect(result.backendUsed).toContain("Qualcomm Hexagon NPU (HTP v79)");
    expect(result.npuInferenceMs).toBeGreaterThan(0);
    expect(result.npuInferenceMs).toBeLessThan(100);
    expect(result.totalMs).toBeLessThan(200);
    expect(result.transparentBlob).toBeDefined();
    expect(result.alphaMaskBuffer).toBeDefined();
    expect(progressLogs).toContain("preparing");
    expect(progressLogs).toContain("segmenting");
  });

  it("executes native fallback with RMBG-1.4 commercial model when requested", async () => {
    const dummyBlob = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
      type: "image/png",
    });

    const result = await removeBackgroundWithNativeFallback(dummyBlob, {
      modelType: "rmbg_1_4",
      refineEdges: true,
    });

    expect(result.success).toBe(true);
    expect(result.modelName).toBe("RMBG-1.4 (Commercial 1024)");
    expect(result.backendUsed).toContain("Qualcomm Hexagon NPU (HTP v79)");
  });

  it("verifies Native CV bridge files exist in android-offline-spike", () => {
    const ktBridge = path.join(rootDir, "android-offline-spike", "service", "OnnxCvNativeBridge.kt");
    const cppBridge = path.join(rootDir, "android-offline-spike", "service", "OnnxCvNativeBridge.cpp");
    const modelBroker = path.join(rootDir, "android-offline-spike", "service", "ModelBroker.kt");
    const inferenceService = path.join(rootDir, "android-offline-spike", "service", "InferenceService.kt");

    expect(fs.existsSync(ktBridge)).toBe(true);
    expect(fs.existsSync(cppBridge)).toBe(true);
    expect(fs.existsSync(modelBroker)).toBe(true);
    expect(fs.existsSync(inferenceService)).toBe(true);

    const ktContent = fs.readFileSync(ktBridge, "utf-8");
    expect(ktContent).toContain("OnnxCvNativeBridge");
    expect(ktContent).toContain("removeBackground");
    expect(ktContent).toContain("HTP_NPU");

    const cppContent = fs.readFileSync(cppBridge, "utf-8");
    expect(cppContent).toContain("Java_com_plp_math_service_OnnxCvNativeBridge_loadModel");
    expect(cppContent).toContain("Java_com_plp_math_service_OnnxCvNativeBridge_removeBackground");
    expect(cppContent).toContain("Full BiRefNet");

    const brokerContent = fs.readFileSync(modelBroker, "utf-8");
    expect(brokerContent).toContain("loadCvModel");
    expect(brokerContent).toContain("removeBackgroundNative");

    const serviceContent = fs.readFileSync(inferenceService, "utf-8");
    expect(serviceContent).toContain("REMOVE_BACKGROUND_NATIVE");
  });
});

