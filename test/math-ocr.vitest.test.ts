import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getSettings, POST as postSettings } from "../src/app/api/settings/route";
import { POST as postMathOcr } from "../src/app/api/math-ocr/route";

function createValidPngBuffer(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT
    0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05,
    0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00,
    0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, // IEND
    0x60, 0x82,
  ]);
}

function createPngBlob(): Blob {
  return new Blob([createValidPngBuffer().buffer as ArrayBuffer], { type: "image/png" });
}

describe("Math OCR API & Settings Security - Vitest Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("GET /api/settings - Masking and Exposure Prevention", () => {
    it("masks secrets without exposing prefix or suffix characters", async () => {
      process.env.GEMINI_API_KEY = "AIzaSySuperSecretKey1234567890";
      process.env.REPLICATE_API_TOKEN = "r8_VerySecretToken1234567890";

      const res = await getSettings();
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.geminiKeySet).toBe(true);
      expect(data.geminiMasked).toBe("••••••••");
      expect(data.geminiMasked).not.toContain("AIza");
      expect(data.geminiMasked).not.toContain("7890");

      expect(data.replicateTokenSet).toBe(true);
      expect(data.replicateMasked).toBe("••••••••");
      expect(data.replicateMasked).not.toContain("r8_");
      expect(data.replicateMasked).not.toContain("7890");
    });
  });

  describe("POST /api/settings - Production Protection", () => {
    it("returns 403 Forbidden when running in production environment", async () => {
      process.env.VERCEL = "1";

      const req = new NextRequest("http://localhost:3000/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geminiKey: "new-gemini-key" }),
      });

      const res = await postSettings(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.isProduction).toBe(true);
      expect(data.error).toContain("Production");
    });
  });

  describe("POST /api/math-ocr - Input Validation & Payload Limits", () => {
    it("rejects empty or whitespace-only input with HTTP 400 INVALID_INPUT", async () => {
      const fd = new FormData();
      fd.append("rawText", "   \t\n   ");

      const req = new NextRequest("http://localhost:3000/api/math-ocr", {
        method: "POST",
        body: fd,
      });

      const res = await postMathOcr(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("INVALID_INPUT");
      expect(data.error).toContain("Invalid Input");
    });

    it("rejects payload exceeding 4.5 MB with HTTP 413 PAYLOAD_TOO_LARGE", async () => {
      // 5 MB buffer
      const largeBuffer = new Uint8Array(5 * 1024 * 1024);
      largeBuffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature
      const largeBlob = new Blob([largeBuffer], { type: "image/png" });

      const fd = new FormData();
      fd.append("image", largeBlob, "large.png");

      const req = new NextRequest("http://localhost:3000/api/math-ocr", {
        method: "POST",
        body: fd,
      });

      const res = await postMathOcr(req);
      expect(res.status).toBe(413);
      const data = await res.json();
      expect(data.code).toBe("PAYLOAD_TOO_LARGE");
      expect(data.error).toContain("Payload Too Large");
    });

    it("rejects non-image bytes (e.g. text/exe pretending to be png) with HTTP 415 UNSUPPORTED_MEDIA_TYPE", async () => {
      const fakeBlob = new Blob(["This is not a real image file, just text bytes"], { type: "image/png" });

      const fd = new FormData();
      fd.append("image", fakeBlob, "fake.png");

      const req = new NextRequest("http://localhost:3000/api/math-ocr", {
        method: "POST",
        body: fd,
      });

      const res = await postMathOcr(req);
      expect(res.status).toBe(415);
      const data = await res.json();
      expect(data.code).toBe("UNSUPPORTED_MEDIA_TYPE");
      expect(data.error).toContain("Unsupported Media Type");
    });

    it("rejects requests when GEMINI_API_KEY is not configured with HTTP 503 PROVIDER_NOT_CONFIGURED", async () => {
      delete process.env.GEMINI_API_KEY;

      const fd = new FormData();
      fd.append("rawText", "x^2 + 5x + 6 = 0");

      const req = new NextRequest("http://localhost:3000/api/math-ocr", {
        method: "POST",
        body: fd,
      });

      const res = await postMathOcr(req);
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.code).toBe("PROVIDER_NOT_CONFIGURED");
      expect(data.error).toContain("Gemini API Key");
    });
  });
});
