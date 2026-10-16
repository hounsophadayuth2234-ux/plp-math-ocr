import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/remove-bg/route";

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

describe("POST and GET /api/remove-bg - Vitest Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // 1. Missing worker URL -> 422 NOT_CONFIGURED
  it("1. returns 422 NOT_CONFIGURED when worker URL is missing", async () => {
    delete process.env.BACKGROUND_REMOVAL_WORKER_URL;
    delete process.env.REMBG_SPACE_URL;
    delete process.env.HF_SPACE_URL;

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("NOT_CONFIGURED");
    expect(body.error).toContain("Remote Worker is not configured");
  });

  // 2. Invalid worker URL protocol -> 422 INVALID_CONFIGURATION
  it("2. returns 422 INVALID_CONFIGURATION when URL protocol is not http/https", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "ftp://worker.internal/remove";

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("INVALID_CONFIGURATION");
    expect(body.error).toContain("Only HTTP and HTTPS are permitted");
  });

  // 3. Malformed worker URL -> 422 INVALID_CONFIGURATION
  it("3. returns 422 INVALID_CONFIGURATION when URL format is malformed", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = ":::not-a-valid-url:::";

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("INVALID_CONFIGURATION");
  });

  // 4. Missing image field in multipart form -> 400 IMAGE_REQUIRED
  it("4. returns 400 IMAGE_REQUIRED when form has no image field", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://127.0.0.1:40000";

    const emptyFd = new FormData();
    emptyFd.append("other_field", "value");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: emptyFd });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("IMAGE_REQUIRED");
  });

  // 5. Empty image file (0 bytes) -> 400 IMAGE_REQUIRED
  it("5. returns 400 IMAGE_REQUIRED when image is 0 bytes", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://127.0.0.1:40000";

    const fd = new FormData();
    fd.append("image", new Blob([], { type: "image/png" }), "empty.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("IMAGE_REQUIRED");
    expect(body.error).toContain("0 bytes");
  });

  // 6. Unsupported mime type: text/plain -> 415 UNSUPPORTED_MEDIA_TYPE
  it("6. returns 415 UNSUPPORTED_MEDIA_TYPE for text/plain", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://127.0.0.1:40000";

    const fd = new FormData();
    fd.append("image", new Blob(["not an image"], { type: "text/plain" }), "test.txt");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(body.error).toContain("text/plain");
  });

  // 7. Unsupported mime type: image/gif -> 415 UNSUPPORTED_MEDIA_TYPE
  it("7. returns 415 UNSUPPORTED_MEDIA_TYPE for image/gif", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://127.0.0.1:40000";

    const fd = new FormData();
    fd.append("image", new Blob([new TextEncoder().encode("GIF89a").buffer as ArrayBuffer], { type: "image/gif" }), "anim.gif");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  // 8. File exceeding maxUploadBytes -> 413 IMAGE_TOO_LARGE
  it("8. returns 413 IMAGE_TOO_LARGE when file exceeds max upload limit", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://127.0.0.1:40000";
    process.env.BACKGROUND_REMOVAL_MAX_UPLOAD_BYTES = "512"; // 512 bytes limit

    const fd = new FormData();
    fd.append("image", new Blob([new ArrayBuffer(1024)], { type: "image/png" }), "large.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("IMAGE_TOO_LARGE");
    expect(body.error).toContain("exceeds maximum allowed limit");
  });

  // 9. Worker returns 401 Unauthorized -> 502 WORKER_FAILED
  it("9. returns 502 WORKER_FAILED when worker responds with 401", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://mock-worker.test/api/remove";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("WORKER_FAILED");
    expect(body.error).toContain("401");
  });

  // 10. Worker returns 403 Forbidden -> 502 WORKER_FAILED
  it("10. returns 502 WORKER_FAILED when worker responds with 403", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://mock-worker.test/api/remove";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    );

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("WORKER_FAILED");
    expect(body.error).toContain("403");
  });

  // 11. Worker returns 500 Internal Server Error -> 502 WORKER_FAILED
  it("11. returns 502 WORKER_FAILED when worker responds with 500", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://mock-worker.test/api/remove";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      })
    );

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("WORKER_FAILED");
    expect(body.error).toContain("500");
  });

  // 12. Worker timeout -> 504 WORKER_TIMEOUT
  it("12. returns 504 WORKER_TIMEOUT when worker request aborts due to timeout", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://mock-worker.test/api/remove";
    process.env.BACKGROUND_REMOVAL_TIMEOUT_MS = "100"; // 100ms timeout

    vi.spyOn(globalThis, "fetch").mockImplementationOnce((_url, init) => {
      return new Promise((_, reject) => {
        // Listen to abort signal
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("WORKER_TIMEOUT");
    expect(body.error).toContain("timed out after 100ms");
  });

  // 13. Worker unreachable / network error -> 502 WORKER_UNREACHABLE
  it("13. returns 502 WORKER_UNREACHABLE on network connection error", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://mock-worker.test/api/remove";

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new TypeError("fetch failed: ECONNREFUSED")
    );

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("WORKER_UNREACHABLE");
    expect(body.error).toContain("unreachable or offline");
  });

  // 14. Worker returns invalid content-type (e.g. application/json or text/html) -> 502 INVALID_WORKER_RESPONSE
  it("14. returns 502 INVALID_WORKER_RESPONSE when worker returns non-image content-type", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://mock-worker.test/api/remove";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "processing_failed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("INVALID_WORKER_RESPONSE");
    expect(body.error).toContain("invalid content-type");
  });

  // 15. Worker returns empty body -> 502 EMPTY_WORKER_RESPONSE
  it("15. returns 502 EMPTY_WORKER_RESPONSE when worker returns 0 bytes body", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://mock-worker.test/api/remove";

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new ArrayBuffer(0), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      })
    );

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("EMPTY_WORKER_RESPONSE");
  });

  // 16. Worker returns valid PNG image -> 200 with headers and raw buffer
  it("16. returns 200 with Content-Type: image/png, Cache-Control, and X-Headers on success", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://mock-worker.test/api/remove";
    const pngBlob = createTinyPngBlob();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(pngBlob, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      })
    );

    const fd = new FormData();
    fd.append("image", pngBlob, "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-processing-source")).toBe("Remote Worker");
    expect(res.headers.get("x-request-id")).toBeDefined();

    const resBuffer = Buffer.from(await res.arrayBuffer());
    expect(resBuffer.length).toBe(createTinyPngBuffer().length);
    expect(resBuffer[0]).toBe(0x89);
    expect(resBuffer[1]).toBe(0x50); // 'P'
    expect(resBuffer[2]).toBe(0x4e); // 'N'
    expect(resBuffer[3]).toBe(0x47); // 'G'
  });

  // 17. Authorization Bearer header forwarded correctly when token is set
  it("17. forwards Authorization Bearer header when BACKGROUND_REMOVAL_WORKER_TOKEN is set", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://mock-worker.test/api/remove";
    process.env.BACKGROUND_REMOVAL_WORKER_TOKEN = "secret-token-xyz-123";

    let interceptedHeaders: Headers | Record<string, string> | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      interceptedHeaders = init?.headers as any;
      return new Response(createTinyPngBlob(), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    });

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(interceptedHeaders).toBeDefined();
    expect((interceptedHeaders as Record<string, string>)["Authorization"]).toBe("Bearer secret-token-xyz-123");
  });

  // 18. Authorization header omitted when token is not set
  it("18. omits Authorization header when token is not set", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://mock-worker.test/api/remove";
    delete process.env.BACKGROUND_REMOVAL_WORKER_TOKEN;
    delete process.env.HF_SPACE_TOKEN;
    delete process.env.HUGGINGFACE_API_KEY;

    let interceptedHeaders: Record<string, string> | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      interceptedHeaders = init?.headers as any;
      return new Response(createTinyPngBlob(), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    });

    const fd = new FormData();
    fd.append("image", createTinyPngBlob(), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(interceptedHeaders?.["Authorization"]).toBeUndefined();
  });

  // 19. GET /api/remove-bg status and configuration safety
  it("19. GET /api/remove-bg returns safe configuration and never leaks secrets", async () => {
    // A: When not configured
    delete process.env.BACKGROUND_REMOVAL_WORKER_URL;
    delete process.env.REMBG_SPACE_URL;
    delete process.env.HF_SPACE_URL;

    const resUnconfigured = await GET();
    expect(resUnconfigured.status).toBe(200);
    const bodyUnconf = await resUnconfigured.json();
    expect(bodyUnconf.configured).toBe(false);
    expect((bodyUnconf as any).url).toBeUndefined();
    expect((bodyUnconf as any).token).toBeUndefined();

    // B: When configured with custom values
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "https://private-cluster.ai/remove-bg";
    process.env.BACKGROUND_REMOVAL_WORKER_TOKEN = "super-secret-production-token";
    process.env.BACKGROUND_REMOVAL_TIMEOUT_MS = "45000";
    process.env.BACKGROUND_REMOVAL_MAX_UPLOAD_BYTES = "16777216"; // 16 MB

    const resConfigured = await GET();
    expect(resConfigured.status).toBe(200);
    expect(resConfigured.headers.get("cache-control")).toContain("no-store");

    const bodyConf = await resConfigured.json();
    expect(bodyConf.configured).toBe(true);
    expect(bodyConf.timeoutMs).toBe(45000);
    expect(bodyConf.maxUploadBytes).toBe(16777216);

    // SECURITY VERIFICATION: Absolute guarantee that URL and Token are NEVER in response
    const jsonString = JSON.stringify(bodyConf);
    expect(jsonString).not.toContain("https://private-cluster.ai");
    expect(jsonString).not.toContain("super-secret-production-token");
    expect((bodyConf as any).url).toBeUndefined();
    expect((bodyConf as any).token).toBeUndefined();
  });
});
