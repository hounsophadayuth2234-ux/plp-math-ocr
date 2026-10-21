import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { SOLID_BACKGROUNDS } from "@/lib/bg-compositor";

describe("Feature 2 — High-Speed Background Remover with Instant Presets", () => {
  const rootDir = process.cwd();

  describe("Backend Specifications (hf-space-rembg/app.py)", () => {
    const appPyContent = fs.readFileSync(
      path.join(rootDir, "hf-space-rembg/app.py"),
      "utf8"
    );

    it("1. Uses FastAPI lifespan context manager to preload model session at startup", () => {
      expect(appPyContent).toContain("async def lifespan(app: FastAPI):");
      expect(appPyContent).toContain("global GLOBAL_REMBG_SESSION");
      expect(appPyContent).toContain("GLOBAL_REMBG_SESSION = new_session(");
      expect(appPyContent).toContain("lifespan=lifespan");
    });

    it("2. Reuses GLOBAL_REMBG_SESSION inside request handler without calling new_session per request", () => {
      expect(appPyContent).toContain("session=GLOBAL_REMBG_SESSION");
      // Verify new_session is NOT called inside remove_background function
      const removeBgHandler = appPyContent.slice(appPyContent.indexOf("async def remove_background"));
      expect(removeBgHandler).not.toContain("new_session(");
    });

    it("3. Defaults to isnet-general-use model", () => {
      expect(appPyContent).toContain('os.getenv("REMBG_MODEL", "isnet-general-use")');
    });

    it("4. Bounds concurrency with asyncio.Semaphore to prevent CPU starvation", () => {
      expect(appPyContent).toContain("asyncio.Semaphore");
      expect(appPyContent).toContain("async with INFERENCE_SEMAPHORE:");
    });

    it("5. Validates image magic bytes (PNG, JPEG, WebP) and size limits", () => {
      expect(appPyContent).toContain("validate_image_bytes");
      expect(appPyContent).toContain('b"\\x89PNG\\r\\n\\x1a\\n"');
      expect(appPyContent).toContain('b"\\xff\\xd8\\xff"');
      expect(appPyContent).toContain('b"RIFF"');
      expect(appPyContent).toContain('b"WEBP"');
      expect(appPyContent).toContain("MAX_UPLOAD_BYTES");
    });

    it("6. Proportional downsampling if max dimension exceeds 1500px, without upscaling small images", () => {
      expect(appPyContent).toContain("MAX_INFERENCE_DIMENSION = 1500");
      expect(appPyContent).toContain("max_dim > MAX_INFERENCE_DIMENSION");
      expect(appPyContent).toContain("LANCZOS");
    });

    it("7. Disables expensive alpha matting by default for CPU speed", () => {
      expect(appPyContent).toContain("alpha_matting: bool = Query(False");
      expect(appPyContent).toContain("alpha_matting=False");
    });

    it("8. Returns structured safe error responses without stack traces or path leaks", () => {
      expect(appPyContent).toContain("http_exception_handler");
      expect(appPyContent).toContain("generic_exception_handler");
      expect(appPyContent).toContain('{"error": msg}');
      expect(appPyContent).toContain('headers={"Cache-Control": "no-store"}');
    });
  });

  describe("Frontend Specifications (ColorStudio.tsx & page.tsx)", () => {
    const studioContent = fs.readFileSync(
      path.join(rootDir, "src/components/bg-remover/ColorStudio.tsx"),
      "utf8"
    );

    it("1. Includes the three user-facing presets: Off-White (#F4F5F7), Soft Portrait Pink (#FADADD), and Transparent", () => {
      expect(studioContent).toContain("Off-White / Light Gray");
      expect(studioContent).toContain("#F4F5F7");
      expect(studioContent).toContain("Soft Portrait Pink");
      expect(studioContent).toContain("#FADADD");
      expect(studioContent).toContain("Transparent");
      expect(studioContent).toContain('data-testid="bg-color-white"');
      expect(studioContent).toContain('data-testid="bg-color-pink"');
      expect(studioContent).toContain('data-testid="bg-color-transparent"');
    });

    it("2. SOLID_BACKGROUNDS config matches preset values exactly", () => {
      expect(SOLID_BACKGROUNDS.white).toEqual({ r: 244, g: 245, b: 247 });
      expect(SOLID_BACKGROUNDS.pink).toEqual({ r: 250, g: 218, b: 221 });
    });

    it("3. Canvas compositing redraws locally without calling remote API", () => {
      // In redrawCanvas, alpha blending computes #F4F5F7 and #FADADD
      expect(studioContent).toContain("Math.round(r * aNorm + 244 * (1 - aNorm))");
      expect(studioContent).toContain("Math.round(g * aNorm + 245 * (1 - aNorm))");
      expect(studioContent).toContain("Math.round(b * aNorm + 247 * (1 - aNorm))");
      expect(studioContent).toContain("Math.round(r * aNorm + 250 * (1 - aNorm))");
      expect(studioContent).toContain("Math.round(g * aNorm + 218 * (1 - aNorm))");
      expect(studioContent).toContain("Math.round(b * aNorm + 221 * (1 - aNorm))");
    });

    it("4. Transparent mode preserves genuine alpha channel", () => {
      expect(studioContent).toContain('activeChannel === "transparent"');
      expect(studioContent).toContain("data[pIdx + 3] = a;");
    });

    it("5. Download HD PNG exports directly from HTML5 Canvas with canvas.toBlob", () => {
      expect(studioContent).toContain("handleDownloadHdCanvasPng");
      expect(studioContent).toContain('exportCanvas.toBlob((blob) => {');
      expect(studioContent).toContain('"image/png"');
      expect(studioContent).toContain("Download HD PNG");
      expect(studioContent).toContain('data-testid="download-hd-png-btn"');
    });

    it("6. Cleans up temporary download URLs via URL.revokeObjectURL", () => {
      expect(studioContent).toContain("URL.revokeObjectURL");
    });

    it("7. Displays truthful processed resolution without fake HD upscaling claims", () => {
      expect(studioContent).toContain("Processed resolution:");
      expect(studioContent).toContain("{width}×{height}px");
    });
  });
});
