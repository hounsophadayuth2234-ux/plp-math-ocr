import assert from "node:assert";
import http from "node:http";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { GET, POST } from "../src/app/api/remove-bg/route.ts";

// Helper to create 1x1 valid PNG buffer
function createTinyPngBuffer() {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, // IEND
    0x42, 0x60, 0x82,
  ]);
}

test("API Route: POST & GET /api/remove-bg", async (t) => {
  const origEnv = { ...process.env };

  t.afterEach(() => {
    // Restore environment variables after each subtest
    process.env = { ...origEnv };
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Missing worker configuration (422 NOT_CONFIGURED)
  // ─────────────────────────────────────────────────────────────
  await t.test("1. Missing worker configuration returns 422 NOT_CONFIGURED", async () => {
    delete process.env.BACKGROUND_REMOVAL_WORKER_URL;
    delete process.env.REMBG_SPACE_URL;
    delete process.env.HF_SPACE_URL;

    const fd = new FormData();
    fd.append("image", new Blob([createTinyPngBuffer()], { type: "image/png" }), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    assert.strictEqual(res.status, 422);

    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.code, "NOT_CONFIGURED");
    assert.match(body.error, /Remote Worker is not configured/);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Invalid configuration / protocol (422 INVALID_CONFIGURATION)
  // ─────────────────────────────────────────────────────────────
  await t.test("2. Invalid worker URL protocol returns 422 INVALID_CONFIGURATION", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "ftp://malicious-host.com/remove";

    const fd = new FormData();
    fd.append("image", new Blob([createTinyPngBuffer()], { type: "image/png" }), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    assert.strictEqual(res.status, 422);

    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.code, "INVALID_CONFIGURATION");
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Missing image field or empty file (400 IMAGE_REQUIRED)
  // ─────────────────────────────────────────────────────────────
  await t.test("3. Missing image or 0-byte file returns 400 IMAGE_REQUIRED", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://127.0.0.1:40000";

    // No field
    const emptyFd = new FormData();
    const reqNoField = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: emptyFd });
    const resNoField = await POST(reqNoField);
    assert.strictEqual(resNoField.status, 400);
    const bodyNoField = await resNoField.json();
    assert.strictEqual(bodyNoField.code, "IMAGE_REQUIRED");

    // 0-byte file
    const zeroFd = new FormData();
    zeroFd.append("image", new Blob([], { type: "image/png" }), "empty.png");
    const reqZero = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: zeroFd });
    const resZero = await POST(reqZero);
    assert.strictEqual(resZero.status, 400);
    const bodyZero = await resZero.json();
    assert.strictEqual(bodyZero.code, "IMAGE_REQUIRED");
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Invalid file type (415 UNSUPPORTED_MEDIA_TYPE)
  // ─────────────────────────────────────────────────────────────
  await t.test("4. Invalid media type returns 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://127.0.0.1:40000";

    const fd = new FormData();
    fd.append("image", new Blob(["not an image"], { type: "text/plain" }), "test.txt");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    assert.strictEqual(res.status, 415);

    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.code, "UNSUPPORTED_MEDIA_TYPE");
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Oversized file (413 IMAGE_TOO_LARGE)
  // ─────────────────────────────────────────────────────────────
  await t.test("5. Oversized file returns 413 IMAGE_TOO_LARGE", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = "http://127.0.0.1:40000";
    process.env.BACKGROUND_REMOVAL_MAX_UPLOAD_BYTES = "1024"; // 1 KB limit for testing

    const largeBuf = Buffer.alloc(2048);
    const fd = new FormData();
    fd.append("image", new Blob([largeBuf], { type: "image/png" }), "large.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    assert.strictEqual(res.status, 413);

    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.code, "IMAGE_TOO_LARGE");
  });

  // ─────────────────────────────────────────────────────────────
  // Mock Worker Tests (6 to 10)
  // ─────────────────────────────────────────────────────────────
  let mockServer;
  let mockPort = 0;
  let mockHandler = () => {};

  await new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      mockHandler(req, res);
    });
    mockServer.listen(0, "127.0.0.1", () => {
      mockPort = mockServer.address().port;
      resolve();
    });
  });

  t.after(() => {
    mockServer.close();
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Worker timeout (504 WORKER_TIMEOUT)
  // ─────────────────────────────────────────────────────────────
  await t.test("6. Worker timeout returns 504 WORKER_TIMEOUT", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = `http://127.0.0.1:${mockPort}`;
    process.env.BACKGROUND_REMOVAL_TIMEOUT_MS = "100"; // 100ms timeout for test

    mockHandler = (req, res) => {
      // Delay response longer than timeout
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(createTinyPngBuffer());
      }, 500);
    };

    const fd = new FormData();
    fd.append("image", new Blob([createTinyPngBuffer()], { type: "image/png" }), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    assert.strictEqual(res.status, 504);

    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.code, "WORKER_TIMEOUT");
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Worker 500 response (502 WORKER_FAILED)
  // ─────────────────────────────────────────────────────────────
  await t.test("7. Worker 500 response returns 502 WORKER_FAILED", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = `http://127.0.0.1:${mockPort}`;
    process.env.BACKGROUND_REMOVAL_TIMEOUT_MS = "5000";

    mockHandler = (req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal PyTorch CUDA Out Of Memory");
    };

    const fd = new FormData();
    fd.append("image", new Blob([createTinyPngBuffer()], { type: "image/png" }), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    assert.strictEqual(res.status, 502);

    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.code, "WORKER_FAILED");
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Worker JSON response instead of image (502 INVALID_WORKER_RESPONSE)
  // ─────────────────────────────────────────────────────────────
  await t.test("8. Worker JSON response returns 502 INVALID_WORKER_RESPONSE", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = `http://127.0.0.1:${mockPort}`;
    process.env.BACKGROUND_REMOVAL_TIMEOUT_MS = "5000";

    mockHandler = (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Hello from space" }));
    };

    const fd = new FormData();
    fd.append("image", new Blob([createTinyPngBuffer()], { type: "image/png" }), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    assert.strictEqual(res.status, 502);

    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.code, "INVALID_WORKER_RESPONSE");
  });

  // ─────────────────────────────────────────────────────────────
  // 9. Empty worker response (502 EMPTY_WORKER_RESPONSE)
  // ─────────────────────────────────────────────────────────────
  await t.test("9. Empty worker response returns 502 EMPTY_WORKER_RESPONSE", async () => {
    process.env.BACKGROUND_REMOVAL_WORKER_URL = `http://127.0.0.1:${mockPort}`;
    process.env.BACKGROUND_REMOVAL_TIMEOUT_MS = "5000";

    mockHandler = (req, res) => {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(); // 0 bytes
    };

    const fd = new FormData();
    fd.append("image", new Blob([createTinyPngBuffer()], { type: "image/png" }), "test.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    assert.strictEqual(res.status, 502);

    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.code, "EMPTY_WORKER_RESPONSE");
  });

  // ─────────────────────────────────────────────────────────────
  // 10. Successful PNG response with required headers & Bearer Token Security
  // ─────────────────────────────────────────────────────────────
  await t.test("10. Successful PNG response delivers required headers and verifies token security", async () => {
    const SECRET_TOKEN = "super_secret_worker_bearer_token_xyz_987";
    process.env.BACKGROUND_REMOVAL_WORKER_URL = `http://127.0.0.1:${mockPort}`;
    process.env.BACKGROUND_REMOVAL_WORKER_TOKEN = SECRET_TOKEN;
    process.env.BACKGROUND_REMOVAL_TIMEOUT_MS = "5000";

    let workerReceivedAuth = null;
    mockHandler = (req, res) => {
      workerReceivedAuth = req.headers["authorization"];
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(createTinyPngBuffer());
    };

    const fd = new FormData();
    fd.append("image", new Blob([createTinyPngBuffer()], { type: "image/png" }), "math_problem.png");
    const req = new NextRequest("http://localhost:3000/api/remove-bg", { method: "POST", body: fd });

    const res = await POST(req);
    assert.strictEqual(res.status, 200);

    // Verify headers
    assert.strictEqual(res.headers.get("Content-Type"), "image/png");
    assert.strictEqual(res.headers.get("Cache-Control"), "no-store, private");
    assert.strictEqual(res.headers.get("X-Processing-Source"), "Remote Worker");
    assert.ok(res.headers.get("X-Segmentation-Model"), "Must have X-Segmentation-Model");
    assert.ok(res.headers.get("X-Request-ID"), "Must have X-Request-ID");

    // Verify token was forwarded server-side to the worker
    assert.strictEqual(workerReceivedAuth, `Bearer ${SECRET_TOKEN}`);

    // Verify security: SECRET_TOKEN must NEVER be leaked in client response headers or body
    for (const [key, val] of res.headers.entries()) {
      assert.ok(!val.includes(SECRET_TOKEN), `Header ${key} must not contain secret token`);
    }

    const outputBytes = await res.arrayBuffer();
    assert.strictEqual(outputBytes.byteLength, createTinyPngBuffer().byteLength);
  });

  // ─────────────────────────────────────────────────────────────
  // 11. GET /api/remove-bg returns status without exposing secrets
  // ─────────────────────────────────────────────────────────────
  await t.test("11. GET /api/remove-bg returns configured state without exposing URL or token", async () => {
    const SECRET_TOKEN = "confidential_token_abc";
    process.env.BACKGROUND_REMOVAL_WORKER_URL = `https://private-cluster.internal/remove`;
    process.env.BACKGROUND_REMOVAL_WORKER_TOKEN = SECRET_TOKEN;

    const res = await GET();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("Cache-Control"), "no-store, private");

    const data = await res.json();
    assert.strictEqual(data.configured, true);
    assert.strictEqual(typeof data.maxUploadBytes, "number");
    assert.strictEqual(typeof data.timeoutMs, "number");

    // Security assertions: Neither URL nor token is exposed
    assert.strictEqual(data.url, undefined, "URL must not be returned");
    assert.strictEqual(data.token, undefined, "Token must not be returned");
    const rawString = JSON.stringify(data);
    assert.ok(!rawString.includes(SECRET_TOKEN), "JSON must not contain secret token");
    assert.ok(!rawString.includes("private-cluster"), "JSON must not contain worker URL");
  });
});
