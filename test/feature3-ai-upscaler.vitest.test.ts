import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

describe("Feature 3 — Real AI Image Super-Resolution (Real-ESRGAN Compact ONNX)", () => {
  const rootDir = process.cwd();

  describe("Backend Specifications (hf-space-rembg/app.py & Dockerfile)", () => {
    const appPyContent = fs.readFileSync(
      path.join(rootDir, "hf-space-rembg/app.py"),
      "utf8"
    );
    const dockerfileContent = fs.readFileSync(
      path.join(rootDir, "hf-space-rembg/Dockerfile"),
      "utf8"
    );

    it("1. Preloads upscaler model once during application startup lifespan", () => {
      expect(appPyContent).toContain("async def lifespan(app: FastAPI):");
      expect(appPyContent).toContain("GLOBAL_UPSCALE_SESSION");
      expect(appPyContent).toContain("GLOBAL_REMBG_SESSION");
      expect(appPyContent).toContain("ort.InferenceSession(");
      expect(appPyContent).toContain("lifespan=lifespan");
    });

    it("2. Model is not initialized inside request handlers", () => {
      const upscaleHandler = appPyContent.slice(
        appPyContent.indexOf("async def upscale_image")
      );
      expect(upscaleHandler).not.toContain("ort.InferenceSession(");
      expect(upscaleHandler).toContain("GLOBAL_UPSCALE_SESSION.run(");
    });

    it("3. Exposes POST /api/upscale endpoint", () => {
      expect(appPyContent).toContain('@app.post("/api/upscale")');
      expect(appPyContent).toContain("async def upscale_image");
    });

    it("4. Configures 4x Real-ESRGAN model with safe checksum & source URL", () => {
      expect(appPyContent).toContain("realesr-general-x4v3");
      expect(appPyContent).toContain("UPSCALE_FACTOR = 4");
      expect(appPyContent).toContain("09b757accd747d7e423c1d352b3e8f23e77cc5742d04bae958d4eb8082b76fa4");
    });

    it("5. Bounded concurrency protects CPU memory with asyncio.Semaphore(1)", () => {
      expect(appPyContent).toContain("MAX_UPSCALE_CONCURRENT_REQUESTS = 1");
      expect(appPyContent).toContain("UPSCALE_SEMAPHORE = asyncio.Semaphore(MAX_UPSCALE_CONCURRENT_REQUESTS)");
      expect(appPyContent).toContain("async with UPSCALE_SEMAPHORE:");
    });

    it("6. Caps large images proportionally at 1200px and does not enlarge small images", () => {
      expect(appPyContent).toContain("MAX_UPSCALE_INPUT_DIMENSION = 1200");
      expect(appPyContent).toContain("max_dim > MAX_UPSCALE_INPUT_DIMENSION");
      expect(appPyContent).toContain("proc_w, proc_h = src_w, src_h");
      expect(appPyContent).toContain("was_downscaled = False");
    });

    it("7. Validates image magic bytes (PNG, JPEG, WebP) and size limits", () => {
      expect(appPyContent).toContain("validate_image_bytes(input_bytes)");
      expect(appPyContent).toContain("MAX_UPLOAD_BYTES");
      expect(appPyContent).toContain('b"\\x89PNG\\r\\n\\x1a\\n"');
    });

    it("8. Preserves alpha channel transparency for RGBA images", () => {
      expect(appPyContent).toContain('has_alpha = proc_img.mode in ("RGBA", "LA")');
      expect(appPyContent).toContain('final_img = Image.merge("RGBA", (*upscaled_rgb.split(), upscaled_alpha))');
    });

    it("9. Returns raw image/png response with truthful metadata headers", () => {
      expect(appPyContent).toContain('media_type="image/png"');
      expect(appPyContent).toContain('"X-Upscale-Factor": str(UPSCALE_FACTOR)');
      expect(appPyContent).toContain('"X-Processed-Width"');
      expect(appPyContent).toContain('"X-Output-Width"');
      expect(appPyContent).toContain('"X-Was-Downscaled"');
    });

    it("10. Health check endpoint reports both rembg and upscaler readiness", () => {
      expect(appPyContent).toContain('@app.get("/health")');
      expect(appPyContent).toContain('"upscaler_loaded": GLOBAL_UPSCALE_SESSION is not None');
      expect(appPyContent).toContain('"model_loaded": GLOBAL_REMBG_SESSION is not None');
      expect(appPyContent).toContain('"upscale_factor": UPSCALE_FACTOR');
    });

    it("11. Preserves existing Background Remover endpoints without breaking changes", () => {
      expect(appPyContent).toContain('@app.post("/api/remove")');
      expect(appPyContent).toContain('@app.post("/api/remove-bg")');
      expect(appPyContent).toContain("session=GLOBAL_REMBG_SESSION");
    });

    it("12. Dockerfile pre-bakes Real-ESRGAN model and rembg model into image", () => {
      expect(dockerfileContent).toContain("new_session('isnet-general-use')");
      expect(dockerfileContent).toContain("realesr-general-x4v3.onnx");
      expect(dockerfileContent).toContain("09b757accd747d7e423c1d352b3e8f23e77cc5742d04bae958d4eb8082b76fa4");
      expect(dockerfileContent).toContain('CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]');
    });

    it("13. Safe error responses mask tracebacks and return structured Khmer/English message", () => {
      expect(appPyContent).toContain("ការធ្វើឱ្យរូបភាពច្បាស់មិនបានសម្រេច។ សូមសាកល្បងម្តងទៀត។");
      expect(appPyContent).not.toContain("traceback.format_exc()");
    });
  });

  describe("Frontend Client Specifications (src/lib/image-upscale-client.ts & page.tsx)", () => {
    const clientContent = fs.readFileSync(
      path.join(rootDir, "src/lib/image-upscale-client.ts"),
      "utf8"
    );
    const pageContent = fs.readFileSync(
      path.join(rootDir, "src/app/image-upscaler/page.tsx"),
      "utf8"
    );

    it("1. Dispatches image upload to POST /api/upscale without fake canvas sharpening", () => {
      expect(clientContent).toContain('"/api/upscale"');
      expect(clientContent).toContain('method: "POST"');
      expect(clientContent).toContain('Accept: "image/png, application/json"');
      expect(clientContent).not.toContain("executeInWorker");
    });

    it("2. Client worker file has been removed", () => {
      const workerExists = fs.existsSync(
        path.join(rootDir, "src/workers/image-upscale.worker.ts")
      );
      expect(workerExists).toBe(false);
    });

    it("3. Accepts raw image/png response and converts to Blob & Object URL", () => {
      expect(clientContent).toContain("await res.blob()");
      expect(clientContent).toContain("URL.createObjectURL(blob)");
    });

    it("4. Returns truthful 4x model metadata and downscale notification", () => {
      expect(clientContent).toContain('model: "Real-ESRGAN (4x · Compact SRVGGNet)"');
      expect(clientContent).toContain('scale: (factor as UpscaleScale) || 4');
      expect(clientContent).toContain("wasDownscaled");
    });

    it("5. Supports cancellation with AbortController", () => {
      expect(clientContent).toContain("signal: options.signal");
      expect(pageContent).toContain("activeAbortControllerRef.current = abortController");
      expect(pageContent).toContain("handleCancel");
    });

    it("6. Prevents duplicate submissions and disables controls during loading", () => {
      expect(pageContent).toContain("if (!imageFile || isLoading) return;");
      expect(pageContent).toContain("disabled={isLoading}");
    });

    it("7. Download exports actual AI output blob safely", () => {
      expect(pageContent).toContain("let downloadBlob = result.blob;");
      expect(pageContent).toContain('sanitizedBase || "plp-ai-upscaled"');
      expect(pageContent).toContain('data-testid="upscale-download-btn"');
    });

    it("8. Preserves BeforeAfterSlider comparison UI shell", () => {
      expect(pageContent).toContain("<BeforeAfterSlider");
      expect(pageContent).toContain("beforeSrc={previewUrl}");
      expect(pageContent).toContain("afterSrc={result.outputUrl}");
    });

    it("9. Moving comparison slider does not trigger network requests", () => {
      const sliderContent = fs.readFileSync(
        path.join(rootDir, "src/components/image-upscaler/BeforeAfterSlider.tsx"),
        "utf8"
      );
      expect(sliderContent).not.toContain("fetch(");
      expect(sliderContent).not.toContain("upscaleImageStudio");
    });

    it("10. Revokes temporary Object URLs on unmount & new file selection", () => {
      expect(pageContent).toContain("urlRegistryRef.current.revokeAll()");
    });
  });
});
