import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/remove-bg/route";
import { removeBackgroundRemote } from "../src/lib/bg-removal-client";

// Helper to create a 1x1 valid PNG buffer as Uint8Array
function createTinyPngBuffer(): Uint8Array {
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

function createTinyPngBlob(): Blob {
  return new Blob([createTinyPngBuffer().buffer as ArrayBuffer], { type: "image/png" });
}

describe("Alpha Matting End-to-End Vitest Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // 1. GET /api/remove-bg exposes alphaMattingSupported and directUrl when token is absent
  it("1. GET /api/remove-bg exposes alphaMattingSupported: true and directUrl safely", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://rembg-worker.example.com";
    delete process.env.BACKGROUND_REMOVAL_WORKER_TOKEN;

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.configured).toBe(true);
    expect(body.alphaMattingSupported).toBe(true);
    expect(body.directUrl).toBe("https://rembg-worker.example.com/remove");
    expect((body as any).token).toBeUndefined();
  });

  // 2. GET /api/remove-bg hides directUrl when token is configured
  it("2. GET /api/remove-bg conceals directUrl if private token is configured", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://private-cluster.ai";
    process.env.BACKGROUND_REMOVAL_WORKER_TOKEN = "secret-token-key-12345";

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.configured).toBe(true);
    expect(body.alphaMattingSupported).toBe(true);
    expect(body.directUrl).toBeNull();
    expect((body as any).token).toBeUndefined();
  });

  // 3. Backward Compatibility: Standard POST /api/remove-bg without refine
  it("3. standard POST /api/remove-bg preserves normal background removal behavior", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://rembg-worker.example.com/remove";

    let capturedUrl: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (url) => {
      capturedUrl = url.toString();
      return new Response(createTinyPngBlob(), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "X-Segmentation-Model": "isnet-general-use",
        },
      });
    });

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "sample.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", {
      method: "POST",
      body: fd,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-refinement-Mode")).toBe("standard");
    expect(res.headers.get("x-segmentation-model")).toBe("isnet-general-use");
    expect(capturedUrl).toBe("https://rembg-worker.example.com/remove");
  });

  // 4. Opt-in Alpha Matting: POST /api/remove-bg?refine=true&quality=fast
  it("4. POST /api/remove-bg?refine=true&quality=fast forwards query and returns matting headers", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://rembg-worker.example.com/remove";

    let capturedUrl: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (url) => {
      capturedUrl = url.toString();
      return new Response(createTinyPngBlob(), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "X-Segmentation-Model": "isnet-general-use",
          "X-Refinement-Mode": "alpha-matting",
          "X-Matting-Quality": "fast",
        },
      });
    });

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "portrait.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg?refine=true&quality=fast", {
      method: "POST",
      body: fd,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(capturedUrl).toContain("refine=true");
    expect(capturedUrl).toContain("quality=fast");
    expect(res.headers.get("x-refinement-mode")).toBe("alpha-matting");
    expect(res.headers.get("x-matting-quality")).toBe("fast");
  });

  // 5. Opt-in Alpha Matting: POST /api/remove-bg?refine=true&quality=balanced
  it("5. POST /api/remove-bg?refine=true&quality=balanced handles balanced matting profile", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://rembg-worker.example.com/remove";

    let capturedUrl: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (url) => {
      capturedUrl = url.toString();
      return new Response(createTinyPngBlob(), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "X-Segmentation-Model": "u2net",
          "X-Refinement-Mode": "alpha-matting",
          "X-Matting-Quality": "balanced",
        },
      });
    });

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "portrait.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg?refine=true&quality=balanced", {
      method: "POST",
      body: fd,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(capturedUrl).toContain("refine=true");
    expect(capturedUrl).toContain("quality=balanced");
    expect(res.headers.get("x-refinement-mode")).toBe("alpha-matting");
    expect(res.headers.get("x-matting-quality")).toBe("balanced");
  });

  // 6. Opt-in Alpha Matting: POST /api/remove-bg?refine=true&quality=quality
  it("6. POST /api/remove-bg?refine=true&quality=quality handles high quality matting profile", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://rembg-worker.example.com/remove";

    let capturedUrl: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (url) => {
      capturedUrl = url.toString();
      return new Response(createTinyPngBlob(), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "X-Segmentation-Model": "isnet-general-use",
          "X-Refinement-Mode": "alpha-matting",
          "X-Matting-Quality": "quality",
        },
      });
    });

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "portrait.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg?refine=true&quality=quality", {
      method: "POST",
      body: fd,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(capturedUrl).toContain("refine=true");
    expect(capturedUrl).toContain("quality=quality");
    expect(res.headers.get("x-refinement-mode")).toBe("alpha-matting");
    expect(res.headers.get("x-matting-quality")).toBe("quality");
  });

  // 7. Invalid quality param gracefully defaults to balanced or fast without error
  it("7. invalid quality param gracefully falls back without 400 error", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://rembg-worker.example.com/remove";

    let capturedUrl: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (url) => {
      capturedUrl = url.toString();
      return new Response(createTinyPngBlob(), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    });

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "portrait.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg?refine=true&quality=super_extreme", {
      method: "POST",
      body: fd,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    // Upstream receives valid fallback
    expect(capturedUrl).toContain("refine=true");
  });

  // 8. Error handling: Malformed MIME type rejected with 415
  it("8. rejects SVG/XML payload with 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://rembg-worker.example.com/remove";

    const fd = new FormData();
    fd.append("image", new Blob(["<svg></svg>"], { type: "image/svg+xml" }), "vector.svg");
    const req = new NextRequest("http://localhost:3000/api/remove-bg?refine=true", {
      method: "POST",
      body: fd,
    });

    const res = await POST(req);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  // 9. Error handling: Oversized payload rejected with 413
  it("9. rejects oversized payload with 413 IMAGE_TOO_LARGE", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://rembg-worker.example.com/remove";
    process.env.BACKGROUND_REMOVAL_MAX_UPLOAD_BYTES = "1024"; // 1KB limit

    const fd = new FormData();
    fd.append("image", new Blob([new ArrayBuffer(2048)], { type: "image/png" }), "large.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg?refine=true", {
      method: "POST",
      body: fd,
    });

    const res = await POST(req);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("IMAGE_TOO_LARGE");
  });

  // 10. Upstream 504 Gateway Timeout handling
  it("10. handles worker gateway timeout with 504 WORKER_TIMEOUT", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://rembg-worker.example.com/remove";
    process.env.BACKGROUND_REMOVAL_TIMEOUT_MS = "50";

    vi.spyOn(globalThis, "fetch").mockImplementationOnce((_url, init) => {
      return new Promise((_, reject) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            const err = new Error("Gateway timeout");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "photo.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg?refine=true&quality=quality", {
      method: "POST",
      body: fd,
    });

    const res = await POST(req);
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("WORKER_TIMEOUT");
  });
});
