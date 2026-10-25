import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getUpscale, POST as postUpscale } from "@/app/api/upscale/route";
import { GET as getRemoveBg, POST as postRemoveBg } from "@/app/api/remove-bg/route";
import { ActivityTracker } from "@/lib/activity-tracker";
import sharp from "sharp";

// Helper to create a 32x32 valid PNG buffer
async function createSamplePng(width = 32, height = 32, color = { r: 255, g: 255, b: 255, alpha: 1 }) {
  return await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

describe("Hybrid Architecture: Local On-Device + RunPod Ready (Module 02 & Module 03)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("Module 03: 4x HD Upscaler (GET /api/upscale & POST /api/upscale)", () => {
    it("1. GET /api/upscale reports Local Engine when RunPod is not configured", async () => {
      delete process.env.RUNPOD_API_KEY;
      delete process.env.RUNPOD_UPSCALE_ENDPOINT;
      delete process.env.UPSCALER_WORKER_URL;
      delete process.env.REPLICATE_API_TOKEN;

      const res = await getUpscale();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.configured).toBe(true);
      expect(data.engine).toBe("local");
      expect(data.isLocal).toBe(true);
      expect(data.badgeLabel).toContain("⚡ Local Engine");
      expect(data.badgeLabel).toContain("ដំណើរការលើម៉ាស៊ីនផ្ទាល់ - ឥតគិតថ្លៃ");
    });

    it("2. GET /api/upscale reports RunPod Cloud GPU when RUNPOD_API_KEY and ENDPOINT are present", async () => {
      process.env.RUNPOD_API_KEY = "rpa_test_key_12345";
      process.env.RUNPOD_UPSCALE_ENDPOINT = "https://api.runpod.ai/v2/test-endpoint/runsync";

      const res = await getUpscale();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.engine).toBe("runpod");
      expect(data.hasRunPod).toBe(true);
      expect(data.badgeLabel).toContain("☁️ RunPod Cloud GPU");
    });

    it("3. POST /api/upscale executes Local High-Precision Upscaler (4x) with sharp when cloud is unconfigured", async () => {
      delete process.env.RUNPOD_API_KEY;
      delete process.env.RUNPOD_UPSCALE_ENDPOINT;
      delete process.env.UPSCALER_WORKER_URL;
      delete process.env.REPLICATE_API_TOKEN;

      const sampleBytes = await createSamplePng(40, 40);
      const fd = new FormData();
      fd.append("image", new Blob([sampleBytes], { type: "image/png" }), "math-equation.png");
      fd.append("scale", "4");

      const req = new NextRequest("http://localhost:3000/api/upscale", {
        method: "POST",
        body: fd,
        headers: {
          "x-raw-response": "true",
          Accept: "image/png",
        },
      });

      const res = await postUpscale(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(res.headers.get("x-upscale-factor")).toBe("4");
      expect(res.headers.get("x-processed-width")).toBe("40");
      expect(res.headers.get("x-output-width")).toBe("160");
      expect(res.headers.get("x-processing-source")).toBe("Local Engine");

      const outBuffer = Buffer.from(await res.arrayBuffer());
      const outMeta = await sharp(outBuffer).metadata();
      expect(outMeta.width).toBe(160);
      expect(outMeta.height).toBe(160);
    });

    it("4. POST /api/upscale routes to RunPod Serverless endpoint when RUNPOD_API_KEY is configured", async () => {
      process.env.RUNPOD_API_KEY = "rpa_secret_key_888";
      process.env.RUNPOD_UPSCALE_ENDPOINT = "https://api.runpod.ai/v2/upscale-worker/runsync";

      const mockUpscaledBytes = await createSamplePng(80, 80);
      const mockBase64 = mockUpscaledBytes.toString("base64");

      vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (url, init) => {
        expect(String(url)).toContain("api.runpod.ai");
        expect((init?.headers as Record<string, string>)?.["Authorization"]).toBe("Bearer rpa_secret_key_888");
        return new Response(
          JSON.stringify({
            status: "COMPLETED",
            output: {
              output_image_base64: mockBase64,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });

      const sampleBytes = await createSamplePng(20, 20);
      const fd = new FormData();
      fd.append("image", new Blob([sampleBytes], { type: "image/png" }), "test-runpod.png");
      fd.append("scale", "4");

      const req = new NextRequest("http://localhost:3000/api/upscale", {
        method: "POST",
        body: fd,
        headers: {
          "x-raw-response": "true",
        },
      });

      const res = await postUpscale(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("x-processing-source")).toBe("RunPod Cloud GPU");
    });
  });

  describe("Module 02: Background Removal (GET /api/remove-bg & RunPod Mode)", () => {
    it("5. GET /api/remove-bg reports Local Engine badge when unconfigured", async () => {
      delete process.env.RUNPOD_API_KEY;
      delete process.env.RUNPOD_REMOVE_BG_ENDPOINT;
      delete process.env.BACKGROUND_REMOVAL_WORKER_URL;
      delete process.env.REMBG_SPACE_URL;
      delete process.env.HF_SPACE_URL;

      const res = await getRemoveBg();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.configured).toBe(false);
      expect(data.engine).toBe("local");
      expect(data.badgeText).toContain("⚡ Local Engine");
      expect(data.badgeText).toContain("ដំណើរការលើម៉ាស៊ីនផ្ទាល់ - ឥតគិតថ្លៃ");
    });

    it("6. GET /api/remove-bg reports RunPod Cloud GPU when RUNPOD_REMOVE_BG_ENDPOINT is present", async () => {
      process.env.RUNPOD_API_KEY = "rpa_key_rembg";
      process.env.RUNPOD_REMOVE_BG_ENDPOINT = "https://api.runpod.ai/v2/rembg-worker/runsync";

      const res = await getRemoveBg();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.configured).toBe(true);
      expect(data.engine).toBe("runpod");
      expect(data.badgeText).toContain("☁️ RunPod Cloud GPU");
    });

    it("7. POST /api/remove-bg routes to RunPod Serverless when RUNPOD_REMOVE_BG_ENDPOINT is configured", async () => {
      process.env.RUNPOD_API_KEY = "rpa_test_rembg";
      process.env.RUNPOD_REMOVE_BG_ENDPOINT = "https://api.runpod.ai/v2/rembg-worker/runsync";

      const mockCutoutBytes = await createSamplePng(30, 30, { r: 0, g: 0, b: 0, alpha: 0 });
      const mockBase64 = mockCutoutBytes.toString("base64");

      vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (url, init) => {
        expect(String(url)).toContain("api.runpod.ai");
        expect((init?.headers as Record<string, string>)?.["Authorization"]).toBe("Bearer rpa_test_rembg");
        return new Response(
          JSON.stringify({
            status: "COMPLETED",
            output: {
              output_image_base64: mockBase64,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });

      const sampleBytes = await createSamplePng(30, 30);
      const fd = new FormData();
      fd.append("image", new Blob([sampleBytes], { type: "image/png" }), "portrait.png");

      const req = new NextRequest("http://localhost:3000/api/remove-bg", {
        method: "POST",
        body: fd,
      });

      const res = await postRemoveBg(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("x-processing-source")).toBe("RunPod Cloud GPU");
      expect(res.headers.get("x-segmentation-model")).toContain("RunPod Serverless");
    });
  });

  describe("Activity Tracking Verification", () => {
    it("8. Successfully records activity for Module 02 and Module 03 operations", async () => {
      const initialOverview = await ActivityTracker.getActivityOverview();
      const initialCount = initialOverview.totalActivities;

      // Record Module 02 activity
      await ActivityTracker.recordActivity({
        userId: "test-user-1",
        username: "tester",
        displayName: "Test User",
        role: "USER",
        module: "02_canvas_cutout",
        action: "remove_background",
        title: "profile-photo.png",
        details: { engine: "local_on_device", dimensions: "640x480" },
      });

      // Record Module 03 activity
      await ActivityTracker.recordActivity({
        userId: "test-user-1",
        username: "tester",
        displayName: "Test User",
        role: "USER",
        module: "03_hd_upscale",
        action: "upscale_image",
        title: "math-problem.png",
        details: { scale: 4, engine: "local_sharp_lanczos3", dimensions: "1280x960" },
      });

      const updatedOverview = await ActivityTracker.getActivityOverview();
      expect(updatedOverview.totalActivities).toBeGreaterThanOrEqual(initialCount + 2);

      const recent = updatedOverview.recentActivities;
      const mod02Record = recent.find((r) => r.module === "02_canvas_cutout");
      const mod03Record = recent.find((r) => r.module === "03_hd_upscale");

      expect(mod02Record).toBeDefined();
      expect(mod02Record?.action).toBe("remove_background");
      expect(mod03Record).toBeDefined();
      expect(mod03Record?.action).toBe("upscale_image");
    });
  });
});
